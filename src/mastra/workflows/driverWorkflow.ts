import { createWorkflow, createStep } from "../inngest";
import { z } from "zod";
import { driverAgent } from "../agents/driverAgent";
import { sendTelegramMessageTool } from "../tools/telegramTools";

// Шаг 1: Использование агента водителя
const useDriverAgentStep = createStep({
  id: "use-driver-agent",
  description: "Обрабатывает сообщение водителя через агента",
  inputSchema: z.object({
    message: z.string().describe("Сообщение от водителя"),
    threadId: z.string().describe("ID потока для памяти агента"),
    chatId: z.string().describe("Chat ID водителя"),
  }),
  outputSchema: z.object({
    response: z.string().describe("Ответ агента"),
    chatId: z.string().describe("Chat ID водителя"),
  }),
  execute: async ({ inputData, mastra }) => {
    const logger = mastra?.getLogger();
    const { message, threadId, chatId } = inputData;
    
    logger?.info('🔧 [DriverWorkflow] Обработка сообщения водителя', {
      messageLength: message.length,
      threadId
    });
    
    try {
      const { text } = await driverAgent.generate([
        { role: "user", content: message }
      ], {
        resourceId: "driver-bot",
        threadId,
        maxSteps: 5,
      });
      
      logger?.info('✅ [DriverWorkflow] Ответ агента получен');
      
      return {
        response: text,
        chatId
      };
      
    } catch (error) {
      logger?.error('❌ [DriverWorkflow] Ошибка агента', { error });
      return {
        response: "Произошла ошибка при обработке вашего запроса. Пожалуйста, попробуйте еще раз.",
        chatId
      };
    }
  }
});

// Шаг 2: Отправка ответа водителю
const sendReplyToDriverStep = createStep({
  id: "send-reply-to-driver",
  description: "Отправляет ответ агента водителю в Telegram",
  inputSchema: z.object({
    response: z.string().describe("Ответ агента"),
    chatId: z.string().describe("Chat ID водителя"),
  }),
  outputSchema: z.object({
    sent: z.boolean().describe("Статус отправки"),
    messageId: z.number().optional().describe("ID отправленного сообщения"),
  }),
  execute: async ({ inputData, mastra }) => {
    const logger = mastra?.getLogger();
    const { response, chatId } = inputData;
    
    logger?.info('🔧 [DriverWorkflow] Отправка ответа водителю', {
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
        logger?.info('✅ [DriverWorkflow] Ответ отправлен', {
          messageId: result.messageId
        });
        
        return {
          sent: true,
          messageId: result.messageId,
        };
      } else {
        logger?.error('❌ [DriverWorkflow] Ошибка отправки', {
          error: result.message
        });
        
        return {
          sent: false,
        };
      }
      
    } catch (error) {
      logger?.error('❌ [DriverWorkflow] Ошибка отправки ответа', { error });
      return {
        sent: false,
      };
    }
  }
});

// Создание workflow для водительского бота
export const driverWorkflow = createWorkflow({
  id: "driver-workflow",
  description: "Обрабатывает сообщения водителей через агента и отправляет ответы",
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
  .then(useDriverAgentStep)
  .then(sendReplyToDriverStep)
  .commit();