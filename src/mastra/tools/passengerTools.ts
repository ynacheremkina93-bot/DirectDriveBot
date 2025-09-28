import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { db, passengers, orders, driverOffers, priceNegotiations, drivers } from "../server/storage";
import { eq, desc } from "drizzle-orm";

// Инструмент регистрации пассажира
export const registerPassengerTool = createTool({
  id: "register-passenger",
  description: "Регистрирует нового пассажира в системе",
  inputSchema: z.object({
    telegramId: z.string().describe("Telegram ID пользователя"),
    firstName: z.string().describe("Имя пассажира"),
    phoneNumber: z.string().describe("Номер телефона пассажира"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    passengerId: z.number().optional(),
    message: z.string(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    const { telegramId, firstName, phoneNumber } = context;
    
    logger?.info('🔧 [RegisterPassenger] Начинается регистрация пассажира', {
      telegramId, firstName, phoneNumber
    });
    
    try {
      // Проверяем, существует ли уже такой пассажир
      const existingPassenger = await db.select().from(passengers)
        .where(eq(passengers.telegramId, telegramId));
      
      if (existingPassenger.length > 0) {
        logger?.info('📝 [RegisterPassenger] Пассажир уже зарегистрирован', {
          passengerId: existingPassenger[0].id
        });
        
        return {
          success: true,
          passengerId: existingPassenger[0].id,
          message: `Добро пожаловать обратно, ${firstName}! Вы уже зарегистрированы в системе.`
        };
      }
      
      // Создаем нового пассажира
      const newPassenger = await db.insert(passengers)
        .values({
          telegramId,
          firstName,
          phoneNumber,
        })
        .returning();
      
      logger?.info('✅ [RegisterPassenger] Пассажир успешно зарегистрирован', {
        passengerId: newPassenger[0].id
      });
      
      return {
        success: true,
        passengerId: newPassenger[0].id,
        message: `Добро пожаловать в нашу систему такси, ${firstName}! Вы можете начать заказывать поездки.`
      };
      
    } catch (error) {
      logger?.error('❌ [RegisterPassenger] Ошибка регистрации', { error });
      return {
        success: false,
        message: "Произошла ошибка при регистрации. Пожалуйста, попробуйте еще раз."
      };
    }
  },
});

// Инструмент создания заказа
export const createOrderTool = createTool({
  id: "create-order",
  description: "Создает новый заказ такси",
  inputSchema: z.object({
    telegramId: z.string().describe("Telegram ID пассажира"),
    fromAddress: z.string().describe("Адрес отправления"),
    toAddress: z.string().describe("Адрес назначения"),
    suggestedPrice: z.number().describe("Предлагаемая цена"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    orderId: z.number().optional(),
    message: z.string(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    const { telegramId, fromAddress, toAddress, suggestedPrice } = context;
    
    logger?.info('🔧 [CreateOrder] Создание заказа', {
      telegramId, fromAddress, toAddress, suggestedPrice
    });
    
    try {
      // Находим пассажира
      const passenger = await db.select().from(passengers)
        .where(eq(passengers.telegramId, telegramId));
      
      if (passenger.length === 0) {
        return {
          success: false,
          message: "Пассажир не найден. Сначала пройдите регистрацию."
        };
      }
      
      // Создаем заказ
      const newOrder = await db.insert(orders)
        .values({
          passengerId: passenger[0].id,
          fromAddress,
          toAddress,
          suggestedPrice: suggestedPrice.toString(),
        })
        .returning();
      
      logger?.info('✅ [CreateOrder] Заказ успешно создан', {
        orderId: newOrder[0].id
      });
      
      return {
        success: true,
        orderId: newOrder[0].id,
        message: `Заказ создан! Маршрут: ${fromAddress} → ${toAddress}. Предлагаемая цена: ${suggestedPrice} руб. Ожидаем предложения от водителей.`
      };
      
    } catch (error) {
      logger?.error('❌ [CreateOrder] Ошибка создания заказа', { error });
      return {
        success: false,
        message: "Произошла ошибка при создании заказа. Пожалуйста, попробуйте еще раз."
      };
    }
  },
});

// Инструмент получения предложений по заказу
export const getOrderOffersTool = createTool({
  id: "get-order-offers",
  description: "Получает предложения водителей по заказу",
  inputSchema: z.object({
    orderId: z.number().describe("ID заказа"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    offers: z.array(z.object({
      offerId: z.number(),
      driverName: z.string(),
      rating: z.string(),
      price: z.string(),
      message: z.string().optional(),
    })),
    message: z.string(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    const { orderId } = context;
    
    logger?.info('🔧 [GetOrderOffers] Получение предложений', { orderId });
    
    try {
      // Получаем предложения с информацией о водителях
      const offers = await db.select({
        offerId: driverOffers.id,
        offeredPrice: driverOffers.offeredPrice,
        message: driverOffers.message,
        driverName: drivers.firstName,
        rating: drivers.rating,
      })
      .from(driverOffers)
      .leftJoin(drivers, eq(driverOffers.driverId, drivers.id))
      .where(eq(driverOffers.orderId, orderId));
      
      logger?.info('📝 [GetOrderOffers] Найдено предложений', {
        count: offers.length
      });
      
      const formattedOffers = offers.map(offer => ({
        offerId: offer.offerId,
        driverName: offer.driverName || "Неизвестный водитель",
        rating: offer.rating || "5.00",
        price: offer.offeredPrice || "0",
        message: offer.message || undefined,
      }));
      
      return {
        success: true,
        offers: formattedOffers,
        message: offers.length > 0 
          ? `Получено ${offers.length} предложений от водителей`
          : "Пока нет предложений от водителей. Ожидайте..."
      };
      
    } catch (error) {
      logger?.error('❌ [GetOrderOffers] Ошибка получения предложений', { error });
      return {
        success: false,
        offers: [],
        message: "Произошла ошибка при получении предложений."
      };
    }
  },
});

// Инструмент принятия предложения
export const acceptOfferTool = createTool({
  id: "accept-offer",
  description: "Принимает предложение водителя",
  inputSchema: z.object({
    offerId: z.number().describe("ID предложения"),
    orderId: z.number().describe("ID заказа"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
    driverInfo: z.object({
      name: z.string(),
      phone: z.string(),
      rating: z.string(),
      car: z.string(),
    }).optional(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    const { offerId, orderId } = context;
    
    logger?.info('🔧 [AcceptOffer] Принятие предложения', { offerId, orderId });
    
    try {
      // Получаем информацию о предложении и водителе
      const offer = await db.select()
        .from(driverOffers)
        .leftJoin(drivers, eq(driverOffers.driverId, drivers.id))
        .where(eq(driverOffers.id, offerId));
      
      if (offer.length === 0) {
        return {
          success: false,
          message: "Предложение не найдено."
        };
      }
      
      const driverData = offer[0].drivers;
      const offerData = offer[0].driver_offers;
      
      // Обновляем статус заказа
      await db.update(orders)
        .set({
          status: "accepted",
          acceptedDriverId: offerData.driverId,
          finalPrice: offerData.offeredPrice,
        })
        .where(eq(orders.id, orderId));
      
      // Обновляем статус предложения
      await db.update(driverOffers)
        .set({ status: "accepted" })
        .where(eq(driverOffers.id, offerId));
      
      logger?.info('✅ [AcceptOffer] Предложение принято', {
        offerId, driverId: offerData.driverId
      });
      
      const carInfo = driverData?.carModel 
        ? `${driverData.carModel} (${driverData.carColor || 'неизвестный цвет'})`
        : "Информация об автомобиле недоступна";
      
      return {
        success: true,
        message: "Предложение принято! Водитель получил уведомление и скоро с вами свяжется.",
        driverInfo: {
          name: driverData?.firstName || "Неизвестный",
          phone: driverData?.phoneNumber || "Не указан",
          rating: driverData?.rating || "5.00",
          car: carInfo,
        }
      };
      
    } catch (error) {
      logger?.error('❌ [AcceptOffer] Ошибка принятия предложения', { error });
      return {
        success: false,
        message: "Произошла ошибка при принятии предложения."
      };
    }
  },
});

// Инструмент создания встречного предложения
export const makeCounterOfferTool = createTool({
  id: "make-counter-offer",
  description: "Создает встречное предложение по цене",
  inputSchema: z.object({
    orderId: z.number().describe("ID заказа"),
    telegramId: z.string().describe("Telegram ID пассажира"),
    driverId: z.number().describe("ID водителя"),
    counterPrice: z.number().describe("Встречная цена"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    const { orderId, telegramId, driverId, counterPrice } = context;
    
    logger?.info('🔧 [MakeCounterOffer] Создание встречного предложения', {
      orderId, telegramId, driverId, counterPrice
    });
    
    try {
      // Находим пассажира
      const passenger = await db.select().from(passengers)
        .where(eq(passengers.telegramId, telegramId));
      
      if (passenger.length === 0) {
        return {
          success: false,
          message: "Пассажир не найден."
        };
      }
      
      // Создаем переговоры
      await db.insert(priceNegotiations)
        .values({
          orderId,
          fromUserId: passenger[0].id,
          fromUserType: "passenger",
          toUserId: driverId,
          toUserType: "driver",
          proposedPrice: counterPrice.toString(),
        });
      
      logger?.info('✅ [MakeCounterOffer] Встречное предложение создано');
      
      return {
        success: true,
        message: `Встречное предложение ${counterPrice} руб. отправлено водителю. Ожидайте ответ.`
      };
      
    } catch (error) {
      logger?.error('❌ [MakeCounterOffer] Ошибка создания встречного предложения', { error });
      return {
        success: false,
        message: "Произошла ошибка при создании встречного предложения."
      };
    }
  },
});