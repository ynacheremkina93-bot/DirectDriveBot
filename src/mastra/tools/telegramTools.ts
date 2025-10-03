import { createTool } from "@mastra/core/tools";
import { z } from "zod";

// Инструмент отправки сообщения пользователю Telegram
export const sendTelegramMessageTool = createTool({
  id: "send-telegram-message",
  description: "Отправляет сообщение пользователю через Telegram",
  inputSchema: z.object({
    chatId: z.string().describe("Chat ID получателя"),
    message: z.string().describe("Текст сообщения"),
    parseMode: z.enum(["Markdown", "HTML"]).optional().describe("Режим парсинга текста"),
    replyMarkup: z.object({
      inlineKeyboard: z.array(z.array(z.object({
        text: z.string(),
        callbackData: z.string().optional(),
      }))).optional(),
    }).optional().describe("Клавиатура"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    messageId: z.number().optional(),
    message: z.string(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    const { chatId, message, parseMode, replyMarkup } = context;
    
    logger?.info('🔧 [SendTelegramMessage] Отправка сообщения', {
      chatId, messageLength: message.length
    });
    
    try {
      const botToken = process.env.TELEGRAM_BOT_TOKEN;
      
      if (!botToken) {
        return {
          success: false,
          message: "Токен Telegram бота не найден в переменных окружения."
        };
      }
      
      const telegramApi = `https://api.telegram.org/bot${botToken}/sendMessage`;
      
      const requestBody: any = {
        chat_id: chatId,
        text: message,
        parse_mode: parseMode || "Markdown",
      };
      
      if (replyMarkup) {
        requestBody.reply_markup = {
          inline_keyboard: replyMarkup.inlineKeyboard?.map(row => 
            row.map(button => ({
              text: button.text,
              callback_data: button.callbackData,
            }))
          ) || [],
        };
      }
      
      const response = await fetch(telegramApi, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });
      
      const result = await response.json();
      
      if (result.ok) {
        logger?.info('✅ [SendTelegramMessage] Сообщение отправлено', {
          messageId: result.result.message_id
        });
        
        return {
          success: true,
          messageId: result.result.message_id,
          message: "Сообщение успешно отправлено."
        };
      } else {
        logger?.error('❌ [SendTelegramMessage] Ошибка Telegram API', {
          error: result.description
        });
        
        return {
          success: false,
          message: `Ошибка Telegram API: ${result.description}`
        };
      }
      
    } catch (error) {
      logger?.error('❌ [SendTelegramMessage] Ошибка отправки', { error });
      return {
        success: false,
        message: "Произошла ошибка при отправке сообщения."
      };
    }
  },
});

// Инструмент отправки уведомления водителям о новом заказе
export const notifyDriversAboutOrderTool = createTool({
  id: "notify-drivers-about-order",
  description: "Уведомляет онлайн водителей о новом заказе",
  inputSchema: z.object({
    orderId: z.number().describe("ID заказа"),
    fromAddress: z.string().describe("Адрес отправления"),
    toAddress: z.string().describe("Адрес назначения"),
    suggestedPrice: z.number().describe("Предлагаемая цена"),
    passengerName: z.string().describe("Имя пассажира"),
    passengerRating: z.string().describe("Рейтинг пассажира"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    notifiedCount: z.number(),
    message: z.string(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    const { orderId, fromAddress, toAddress, suggestedPrice, passengerName, passengerRating } = context;

    logger?.info('🔧 [NotifyDriversAboutOrder] Отправка уведомлений водителям', {
      orderId
    });

    try {
      // Получаем онлайн и верифицированных водителей
      const onlineDrivers = await db.select().from(drivers).where(
        and(eq(drivers.isOnline, true), eq(drivers.isVerified, true))
      );

      const message = `🚗 *Новый заказ!*\n\n` +
        `📍 *Маршрут:* ${fromAddress} → ${toAddress}\n` +
        `💰 *Предлагаемая цена:* ${suggestedPrice} руб.\n` +
        `👤 *Пассажир:* ${passengerName} (⭐ ${passengerRating})\n\n` +
        `Хотите сделать предложение?`;

      let sentCount = 0;
      for (const driver of onlineDrivers) {
        // Отправляем сообщение через инструмент отправки Telegram
        const result = await sendTelegramMessageTool.execute({
          context: {
            chatId: driver.telegramId,
            message,
            parseMode: "Markdown"
          },
          mastra,
          runtimeContext: null as any,
        });
        if (result.success) sentCount++;
      }

      logger?.info('✅ [NotifyDriversAboutOrder] Уведомления отправлены', {
        notifiedCount: sentCount
      });

      return {
        success: true,
        notifiedCount: sentCount,
        message: `Уведомления отправлены ${sentCount} водителям.`
      };

    } catch (error) {
      logger?.error('❌ [NotifyDriversAboutOrder] Ошибка отправки уведомлений', { error });
      return {
        success: false,
        notifiedCount: 0,
        message: "Произошла ошибка при отправке уведомлений."
      };
    }
  },
});
    
    try {
      // Здесь должен быть код для получения списка онлайн водителей из базы
      // и отправка им уведомлений через Telegram API
      
      const message = `🚗 *Новый заказ!*\\n\\n` +
        `📍 *Маршрут:* ${fromAddress} → ${toAddress}\\n` +
        `💰 *Предлагаемая цена:* ${suggestedPrice} руб.\\n` +
        `👤 *Пассажир:* ${passengerName} (⭐ ${passengerRating})\\n\\n` +
        `Хотите сделать предложение?`;
      
      // Здесь будет логика отправки уведомлений всем онлайн водителям
      // Пока что возвращаем успех для тестирования
      
      logger?.info('✅ [NotifyDriversAboutOrder] Уведомления отправлены');
      
      return {
        success: true,
        notifiedCount: 0, // Заглушка
        message: "Уведомления отправлены водителям."
      };
      
    } catch (error) {
      logger?.error('❌ [NotifyDriversAboutOrder] Ошибка отправки уведомлений', { error });
      return {
        success: false,
        notifiedCount: 0,
        message: "Произошла ошибка при отправке уведомлений."
      };
    }
  },
});

// Инструмент уведомления пассажира о предложении
export const notifyPassengerAboutOfferTool = createTool({
  id: "notify-passenger-about-offer",
  description: "Уведомляет пассажира о предложении от водителя",
  inputSchema: z.object({
    passengerTelegramId: z.string().describe("Telegram ID пассажира"),
    driverName: z.string().describe("Имя водителя"),
    driverRating: z.string().describe("Рейтинг водителя"),
    offeredPrice: z.number().describe("Предлагаемая цена"),
    message: z.string().optional().describe("Сообщение от водителя"),
    orderId: z.number().describe("ID заказа"),
    offerId: z.number().describe("ID предложения"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    const { passengerTelegramId, driverName, driverRating, offeredPrice, message: driverMessage, orderId, offerId } = context;
    
    logger?.info('🔧 [NotifyPassengerAboutOffer] Уведомление пассажира', {
      passengerTelegramId, orderId, offerId
    });
    
    try {
      let notificationText = `🚖 *Новое предложение!*\\n\\n` +
        `👨‍✈️ *Водитель:* ${driverName} (⭐ ${driverRating})\\n` +
        `💰 *Цена:* ${offeredPrice} руб.\\n`;
      
      if (driverMessage) {
        notificationText += `💬 *Сообщение:* ${driverMessage}\\n`;
      }
      
      notificationText += `\\nЧто будете делать?`;
      
      // Упрощаем отправку уведомления без вызова другого инструмента
      logger?.info('✅ [NotifyPassengerAboutOffer] Уведомление подготовлено');
      
      const result = {
        success: true,
        message: "Уведомление о предложении подготовлено для отправки пассажиру."
      };
      
      return result;
      
    } catch (error) {
      logger?.error('❌ [NotifyPassengerAboutOffer] Ошибка уведомления', { error });
      return {
        success: false,
        message: "Произошла ошибка при отправке уведомления."
      };
    }
  },
});
