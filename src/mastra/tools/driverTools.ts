import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { db, drivers, orders, driverOffers, driverDocuments, priceNegotiations, passengers } from "../server/storage";
import { eq, and, desc } from "drizzle-orm";

// Инструмент регистрации водителя
export const registerDriverTool = createTool({
  id: "register-driver",
  description: "Регистрирует нового водителя в системе",
  inputSchema: z.object({
    telegramId: z.string().describe("Telegram ID пользователя"),
    firstName: z.string().describe("Имя водителя"),
    phoneNumber: z.string().describe("Номер телефона водителя"),
    carModel: z.string().describe("Модель автомобиля"),
    carColor: z.string().describe("Цвет автомобиля"),
    carNumber: z.string().describe("Номер автомобиля"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    driverId: z.number().optional(),
    message: z.string(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    const { telegramId, firstName, phoneNumber, carModel, carColor, carNumber } = context;
    
    logger?.info('🔧 [RegisterDriver] Начинается регистрация водителя', {
      telegramId, firstName, phoneNumber, carModel
    });
    
    try {
      // Проверяем, существует ли уже такой водитель
      const existingDriver = await db.select().from(drivers)
        .where(eq(drivers.telegramId, telegramId));
      
      if (existingDriver.length > 0) {
        logger?.info('📝 [RegisterDriver] Водитель уже зарегистрирован', {
          driverId: existingDriver[0].id
        });
        
        return {
          success: true,
          driverId: existingDriver[0].id,
          message: `Добро пожаловать обратно, ${firstName}! Вы уже зарегистрированы как водитель.`
        };
      }
      
      // Создаем нового водителя
      const newDriver = await db.insert(drivers)
        .values({
          telegramId,
          firstName,
          phoneNumber,
          carModel,
          carColor,
          carNumber,
          isVerified: false, // Требует верификации
        })
        .returning();
      
      logger?.info('✅ [RegisterDriver] Водитель успешно зарегистрирован', {
        driverId: newDriver[0].id
      });
      
      return {
        success: true,
        driverId: newDriver[0].id,
        message: `Добро пожаловать в нашу систему, ${firstName}! Для начала работы необходимо пройти верификацию документов. Пожалуйста, загрузите водительское удостоверение и документы на автомобиль.`
      };
      
    } catch (error) {
      logger?.error('❌ [RegisterDriver] Ошибка регистрации', { error });
      return {
        success: false,
        message: "Произошла ошибка при регистрации. Пожалуйста, попробуйте еще раз."
      };
    }
  },
});

// Инструмент получения доступных заказов
export const getAvailableOrdersTool = createTool({
  id: "get-available-orders",
  description: "Получает доступные заказы для водителя",
  inputSchema: z.object({
    telegramId: z.string().describe("Telegram ID водителя"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    orders: z.array(z.object({
      orderId: z.number(),
      fromAddress: z.string(),
      toAddress: z.string(),
      suggestedPrice: z.string(),
      passengerName: z.string(),
      passengerRating: z.string(),
      createdAt: z.string(),
    })),
    message: z.string(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    const { telegramId } = context;
    
    logger?.info('🔧 [GetAvailableOrders] Получение доступных заказов', { telegramId });
    
    try {
      // Проверяем статус водителя
      const driver = await db.select().from(drivers)
        .where(eq(drivers.telegramId, telegramId));
      
      if (driver.length === 0) {
        return {
          success: false,
          orders: [],
          message: "Водитель не найден. Сначала пройдите регистрацию."
        };
      }
      
      if (!driver[0].isVerified) {
        return {
          success: false,
          orders: [],
          message: "Для получения заказов необходимо пройти верификацию документов."
        };
      }
      
      if (!driver[0].isOnline) {
        return {
          success: false,
          orders: [],
          message: "Вы находитесь в статусе 'офлайн'. Включите режим 'онлайн' для получения заказов."
        };
      }
      
      // Получаем доступные заказы
      const availableOrders = await db.select({
        orderId: orders.id,
        fromAddress: orders.fromAddress,
        toAddress: orders.toAddress,
        suggestedPrice: orders.suggestedPrice,
        createdAt: orders.createdAt,
        passengerName: passengers.firstName,
        passengerRating: passengers.rating,
      })
      .from(orders)
      .leftJoin(passengers, eq(orders.passengerId, passengers.id))
      .where(eq(orders.status, "pending"))
      .orderBy(desc(orders.createdAt));
      
      logger?.info('📝 [GetAvailableOrders] Найдено заказов', {
        count: availableOrders.length
      });
      
      const formattedOrders = availableOrders.map(order => ({
        orderId: order.orderId,
        fromAddress: order.fromAddress,
        toAddress: order.toAddress,
        suggestedPrice: order.suggestedPrice || "0",
        passengerName: order.passengerName || "Неизвестный",
        passengerRating: order.passengerRating || "5.00",
        createdAt: order.createdAt?.toISOString() || new Date().toISOString(),
      }));
      
      return {
        success: true,
        orders: formattedOrders,
        message: availableOrders.length > 0 
          ? `Найдено ${availableOrders.length} доступных заказов`
          : "Пока нет доступных заказов. Проверьте позже."
      };
      
    } catch (error) {
      logger?.error('❌ [GetAvailableOrders] Ошибка получения заказов', { error });
      return {
        success: false,
        orders: [],
        message: "Произошла ошибка при получении заказов."
      };
    }
  },
});

// Инструмент создания предложения
export const makeOfferTool = createTool({
  id: "make-offer",
  description: "Создает предложение водителя по заказу",
  inputSchema: z.object({
    telegramId: z.string().describe("Telegram ID водителя"),
    orderId: z.number().describe("ID заказа"),
    offeredPrice: z.number().describe("Предлагаемая цена"),
    message: z.string().optional().describe("Дополнительное сообщение"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    const { telegramId, orderId, offeredPrice, message } = context;
    
    logger?.info('🔧 [MakeOffer] Создание предложения', {
      telegramId, orderId, offeredPrice, message
    });
    
    try {
      // Находим водителя
      const driver = await db.select().from(drivers)
        .where(eq(drivers.telegramId, telegramId));
      
      if (driver.length === 0) {
        return {
          success: false,
          message: "Водитель не найден."
        };
      }
      
      if (!driver[0].isVerified) {
        return {
          success: false,
          message: "Для создания предложений необходимо пройти верификацию."
        };
      }
      
      // Проверяем, не создавал ли водитель уже предложение
      const existingOffer = await db.select().from(driverOffers)
        .where(and(
          eq(driverOffers.orderId, orderId),
          eq(driverOffers.driverId, driver[0].id)
        ));
      
      if (existingOffer.length > 0) {
        return {
          success: false,
          message: "Вы уже сделали предложение по этому заказу."
        };
      }
      
      // Создаем предложение
      await db.insert(driverOffers)
        .values({
          orderId,
          driverId: driver[0].id,
          offeredPrice: offeredPrice.toString(),
          message: message || null,
        });
      
      logger?.info('✅ [MakeOffer] Предложение создано');
      
      return {
        success: true,
        message: `Предложение отправлено! Цена: ${offeredPrice} руб. Ожидайте ответ от пассажира.`
      };
      
    } catch (error) {
      logger?.error('❌ [MakeOffer] Ошибка создания предложения', { error });
      return {
        success: false,
        message: "Произошла ошибка при создании предложения."
      };
    }
  },
});

// Инструмент изменения статуса водителя
export const setDriverStatusTool = createTool({
  id: "set-driver-status",
  description: "Устанавливает статус работы водителя (онлайн/офлайн)",
  inputSchema: z.object({
    telegramId: z.string().describe("Telegram ID водителя"),
    isOnline: z.boolean().describe("Статус: true - онлайн, false - офлайн"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
    currentStatus: z.string().optional(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    const { telegramId, isOnline } = context;
    
    logger?.info('🔧 [SetDriverStatus] Изменение статуса', {
      telegramId, isOnline
    });
    
    try {
      // Находим водителя
      const driver = await db.select().from(drivers)
        .where(eq(drivers.telegramId, telegramId));
      
      if (driver.length === 0) {
        return {
          success: false,
          message: "Водитель не найден. Сначала пройдите регистрацию."
        };
      }
      
      // Обновляем статус
      await db.update(drivers)
        .set({ isOnline })
        .where(eq(drivers.telegramId, telegramId));
      
      const statusText = isOnline ? "онлайн" : "офлайн";
      
      logger?.info('✅ [SetDriverStatus] Статус обновлен', {
        driverId: driver[0].id, status: statusText
      });
      
      return {
        success: true,
        message: `Статус изменен на "${statusText}". ${isOnline ? 'Теперь вы можете получать заказы.' : 'Вы не будете получать новые заказы.'}`,
        currentStatus: statusText
      };
      
    } catch (error) {
      logger?.error('❌ [SetDriverStatus] Ошибка изменения статуса', { error });
      return {
        success: false,
        message: "Произошла ошибка при изменении статуса."
      };
    }
  },
});

// Инструмент ответа на встречное предложение
export const respondToCounterOfferTool = createTool({
  id: "respond-to-counter-offer",
  description: "Отвечает на встречное предложение пассажира",
  inputSchema: z.object({
    telegramId: z.string().describe("Telegram ID водителя"),
    negotiationId: z.number().describe("ID переговоров"),
    accept: z.boolean().describe("Принять (true) или отклонить (false)"),
    counterPrice: z.number().optional().describe("Новая встречная цена (если не принимает)"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    const { telegramId, negotiationId, accept, counterPrice } = context;
    
    logger?.info('🔧 [RespondToCounterOffer] Ответ на встречное предложение', {
      telegramId, negotiationId, accept, counterPrice
    });
    
    try {
      // Находим водителя
      const driver = await db.select().from(drivers)
        .where(eq(drivers.telegramId, telegramId));
      
      if (driver.length === 0) {
        return {
          success: false,
          message: "Водитель не найден."
        };
      }
      
      if (accept) {
        // Принимаем предложение
        await db.update(priceNegotiations)
          .set({ status: "accepted" })
          .where(eq(priceNegotiations.id, negotiationId));
        
        return {
          success: true,
          message: "Встречное предложение принято! Заказ подтвержден."
        };
      } else if (counterPrice) {
        // Делаем новое встречное предложение
        const negotiation = await db.select()
          .from(priceNegotiations)
          .where(eq(priceNegotiations.id, negotiationId));
        
        if (negotiation.length === 0) {
          return {
            success: false,
            message: "Переговоры не найдены."
          };
        }
        
        await db.insert(priceNegotiations)
          .values({
            orderId: negotiation[0].orderId,
            fromUserId: driver[0].id,
            fromUserType: "driver",
            toUserId: negotiation[0].fromUserId,
            toUserType: "passenger",
            proposedPrice: counterPrice.toString(),
          });
        
        return {
          success: true,
          message: `Новое встречное предложение ${counterPrice} руб. отправлено пассажиру.`
        };
      } else {
        // Отклоняем предложение
        await db.update(priceNegotiations)
          .set({ status: "rejected" })
          .where(eq(priceNegotiations.id, negotiationId));
        
        return {
          success: true,
          message: "Встречное предложение отклонено."
        };
      }
      
    } catch (error) {
      logger?.error('❌ [RespondToCounterOffer] Ошибка ответа', { error });
      return {
        success: false,
        message: "Произошла ошибка при обработке ответа."
      };
    }
  },
});