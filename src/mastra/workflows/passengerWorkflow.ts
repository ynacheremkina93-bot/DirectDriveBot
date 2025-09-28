import { createWorkflow, createStep } from "../inngest";
import { z } from "zod";
import { passengerAgent } from "../agents/passengerAgent";
import { sendTelegramMessageTool } from "../tools/telegramTools";

// Шаг 1: Использование агента пассажира
const usePassengerAgentStep = createStep({
  id: "use-passenger-agent",
  description: "Обрабатывает сообщение пассажира через агента",
  inputSchema: z.object({
    message: z.string().describe("Сообщение от пассажира"),
    threadId: z.string().describe("ID потока для памяти агента"),
    chatId: z.string().describe("Chat ID пассажира"),
  }),
  outputSchema: z.object({
    response: z.string().describe("Ответ агента"),
    chatId: z.string().describe("Chat ID пассажира"),
  }),
  execute: async ({ inputData, mastra }) => {
    const logger = mastra?.getLogger();
    const { message, threadId, chatId } = inputData;
    
    logger?.info('🔧 [PassengerWorkflow] Обработка сообщения пассажира', {
      messageLength: message.length,
      threadId
    });
    
    try {
      const { text } = await passengerAgent.generate([
        { role: "user", content: message }
      ], {
        resourceId: "passenger-bot",
        threadId,
        maxSteps: 5,
      });
      
      logger?.info('✅ [PassengerWorkflow] Ответ агента получен');
      
      return {
        response: text,
        chatId
      };
      
    } catch (error) {
      logger?.error('❌ [PassengerWorkflow] Ошибка агента', { error });
      return {
        response: "Произошла ошибка при обработке вашего запроса. Пожалуйста, попробуйте еще раз.",
        chatId
      };
    }
  }
});

// Шаг 2: Отправка ответа пассажиру
const sendReplyToPassengerStep = createStep({
  id: "send-reply-to-passenger",
  description: "Отправляет ответ агента пассажиру в Telegram",
  inputSchema: z.object({
    response: z.string().describe("Ответ агента"),
    chatId: z.string().describe("Chat ID пассажира"),
  }),
  outputSchema: z.object({
    sent: z.boolean().describe("Статус отправки"),
    messageId: z.number().optional().describe("ID отправленного сообщения"),
  }),
  execute: async ({ inputData, mastra }) => {
    const logger = mastra?.getLogger();
    const { response, chatId } = inputData;
    
    logger?.info('🔧 [PassengerWorkflow] Отправка ответа пассажиру', {
      chatId,
      responseLength: response.length
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
        logger?.info('✅ [PassengerWorkflow] Ответ отправлен', {
          messageId: result.messageId
        });
        
        return {
          sent: true,
          messageId: result.messageId,
        };
      } else {
        logger?.error('❌ [PassengerWorkflow] Ошибка отправки', {
          error: result.message
        });
        
        return {
          sent: false,
        };
      }
      
    } catch (error) {
      logger?.error('❌ [PassengerWorkflow] Ошибка отправки ответа', { error });
      return {
        sent: false,
      };
    }
  }
});

// Создание workflow для пассажирского бота
export const passengerWorkflow = createWorkflow({
  id: "passenger-workflow",
  description: "Обрабатывает сообщения пассажиров через агента и отправляет ответы",
  inputSchema: z.object({
    message: z.string(),
    threadId: z.string(),
    chatId: z.string(),
  }),
  outputSchema: z.object({
    sent: z.boolean(),
    messageId: z.number().optional(),
  }),
})
  .then(usePassengerAgentStep)
  .then(sendReplyToPassengerStep)
  .commit();