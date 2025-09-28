import { createWorkflow, createStep } from "../inngest";
import { z } from "zod";
import { passengerAgent } from "../agents/passengerAgent";
import { driverAgent } from "../agents/driverAgent";
import { sendTelegramMessageTool } from "../tools/telegramTools";
import { db, passengers, drivers } from "../server/storage";
import { eq } from "drizzle-orm";

// Шаг 1: Определение типа пользователя и использование соответствующего агента
const useAgentStep = createStep({
  id: "use-agent",
  description: "Определяет тип пользователя и обрабатывает сообщение через соответствующий агент",
  inputSchema: z.object({
    message: z.string().describe("Сообщение от пользователя"),
    threadId: z.string().describe("ID потока для памяти агента"),
    chatId: z.string().describe("Chat ID пользователя"),
    telegramId: z.string().describe("Telegram ID пользователя"),
  }),
  outputSchema: z.object({
    response: z.string().describe("Ответ агента"),
    chatId: z.string().describe("Chat ID пользователя"),
    userType: z.string().describe("Тип пользователя: passenger, driver, unknown"),
  }),
  execute: async ({ inputData, mastra }) => {
    const logger = mastra?.getLogger();
    const { message, threadId, chatId, telegramId } = inputData;
    
    logger?.info('🔧 [TaxiWorkflow] Определение типа пользователя', {
      telegramId, messageLength: message.length
    });
    
    try {
      let userType = "unknown";
      let selectedAgent = passengerAgent; // По умолчанию используем пассажирского агента
      
      // Проверяем, зарегистрирован ли пользователь как пассажир
      const passenger = await db.select().from(passengers)
        .where(eq(passengers.telegramId, telegramId));
      
      // Проверяем, зарегистрирован ли пользователь как водитель
      const driver = await db.select().from(drivers)
        .where(eq(drivers.telegramId, telegramId));
      
      if (passenger.length > 0 && driver.length > 0) {
        // Пользователь зарегистрирован и как пассажир, и как водитель
        // Определяем по контексту сообщения
        const lowerMessage = message.toLowerCase();
        if (lowerMessage.includes('заказ') || lowerMessage.includes('такси') || 
            lowerMessage.includes('ехать') || lowerMessage.includes('поездк')) {
          userType = "passenger";
          selectedAgent = passengerAgent;
        } else if (lowerMessage.includes('водит') || lowerMessage.includes('работ') || 
                   lowerMessage.includes('статус') || lowerMessage.includes('онлайн')) {
          userType = "driver";
          selectedAgent = driverAgent;
        } else {
          // По умолчанию пассажир, если контекст неясен
          userType = "passenger";
          selectedAgent = passengerAgent;
        }
      } else if (driver.length > 0) {
        userType = "driver";
        selectedAgent = driverAgent;
      } else if (passenger.length > 0) {
        userType = "passenger";
        selectedAgent = passengerAgent;
      } else {
        // Новый пользователь - определяем намерение по сообщению
        const lowerMessage = message.toLowerCase();
        if (lowerMessage.includes('водит') || lowerMessage.includes('работат') || 
            lowerMessage.includes('зарабат') || lowerMessage.includes('машин')) {
          userType = "driver";
          selectedAgent = driverAgent;
        } else {
          userType = "passenger";
          selectedAgent = passengerAgent;
        }
      }
      
      logger?.info('📝 [TaxiWorkflow] Тип пользователя определен', {
        userType, telegramId
      });
      
      // Генерируем ответ через выбранного агента
      const { text } = await selectedAgent.generate([
        { role: "user", content: message }
      ], {
        resourceId: `${userType}-bot`,
        threadId: `${userType}-${threadId}`,
        maxSteps: 5,
      });
      
      logger?.info('✅ [TaxiWorkflow] Ответ агента получен');
      
      return {
        response: text,
        chatId,
        userType,
      };
      
    } catch (error) {
      logger?.error('❌ [TaxiWorkflow] Ошибка обработки', { error });
      return {
        response: "Произошла ошибка при обработке вашего запроса. Пожалуйста, попробуйте еще раз.",
        chatId,
        userType: "unknown",
      };
    }
  }
});

// Шаг 2: Отправка ответа пользователю
const sendReplyStep = createStep({
  id: "send-reply",
  description: "Отправляет ответ агента пользователю в Telegram",
  inputSchema: z.object({
    response: z.string().describe("Ответ агента"),
    chatId: z.string().describe("Chat ID пользователя"),
    userType: z.string().describe("Тип пользователя"),
  }),
  outputSchema: z.object({
    sent: z.boolean().describe("Статус отправки"),
    messageId: z.number().optional().describe("ID отправленного сообщения"),
  }),
  execute: async ({ inputData, mastra }) => {
    const logger = mastra?.getLogger();
    const { response, chatId, userType } = inputData;
    
    logger?.info('🔧 [TaxiWorkflow] Отправка ответа пользователю', {
      chatId, userType, responseLength: response.length
    });
    
    try {
      const result = await sendTelegramMessageTool.execute({
        context: {
          chatId,
          message: response,
          parseMode: "Markdown",
        },
        mastra,
        runtimeContext: null as any,
      });
      
      if (result.success) {
        logger?.info('✅ [TaxiWorkflow] Ответ отправлен', {
          messageId: result.messageId, userType
        });
        
        return {
          sent: true,
          messageId: result.messageId,
        };
      } else {
        logger?.error('❌ [TaxiWorkflow] Ошибка отправки', {
          error: result.message
        });
        
        return {
          sent: false,
        };
      }
      
    } catch (error) {
      logger?.error('❌ [TaxiWorkflow] Ошибка отправки ответа', { error });
      return {
        sent: false,
      };
    }
  }
});

// Создание единого workflow для такси-бота
export const taxiWorkflow = createWorkflow({
  id: "taxi-workflow",
  description: "Обрабатывает сообщения пользователей, автоматически определяет тип (пассажир/водитель) и использует соответствующий агент",
  inputSchema: z.object({
    message: z.string(),
    threadId: z.string(),
    chatId: z.string(),
    telegramId: z.string(),
  }),
  outputSchema: z.object({
    sent: z.boolean(),
    messageId: z.number().optional(),
  }),
})
  .then(useAgentStep)
  .then(sendReplyStep)
  .commit();