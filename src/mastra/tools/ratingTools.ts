import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { db, ratings, orders, passengers, drivers } from "../server/storage";
import { eq, and, avg } from "drizzle-orm";

// Инструмент оценки поездки
export const rateRideTool = createTool({
  id: "rate-ride",
  description: "Позволяет оценить поездку и оставить отзыв",
  inputSchema: z.object({
    telegramId: z.string().describe("Telegram ID пользователя"),
    orderId: z.number().describe("ID заказа"),
    userType: z.enum(["passenger", "driver"]).describe("Тип пользователя"),
    rating: z.number().min(1).max(5).describe("Оценка от 1 до 5 звезд"),
    comment: z.string().optional().describe("Комментарий к оценке"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    const { telegramId, orderId, userType, rating, comment } = context;
    
    logger?.info('🔧 [RateRide] Создание оценки', {
      telegramId, orderId, userType, rating
    });
    
    try {
      let fromUserId: number;
      let toUserId: number;
      
      // Получаем информацию о заказе
      const order = await db.select()
        .from(orders)
        .where(eq(orders.id, orderId));
      
      if (order.length === 0) {
        return {
          success: false,
          message: "Заказ не найден."
        };
      }
      
      const orderData = order[0];
      
      if (userType === "passenger") {
        // Находим пассажира
        const passenger = await db.select().from(passengers)
          .where(eq(passengers.telegramId, telegramId));
        
        if (passenger.length === 0 || passenger[0].id !== orderData.passengerId) {
          return {
            success: false,
            message: "Вы не являетесь пассажиром этого заказа."
          };
        }
        
        fromUserId = passenger[0].id;
        toUserId = orderData.acceptedDriverId!;
        
      } else {
        // Находим водителя
        const driver = await db.select().from(drivers)
          .where(eq(drivers.telegramId, telegramId));
        
        if (driver.length === 0 || driver[0].id !== orderData.acceptedDriverId) {
          return {
            success: false,
            message: "Вы не являетесь водителем этого заказа."
          };
        }
        
        fromUserId = driver[0].id;
        toUserId = orderData.passengerId;
      }
      
      // Проверяем, не оценивал ли пользователь уже эту поездку
      const existingRating = await db.select().from(ratings)
        .where(and(
          eq(ratings.orderId, orderId),
          eq(ratings.fromUserId, fromUserId)
        ));
      
      if (existingRating.length > 0) {
        return {
          success: false,
          message: "Вы уже оценили эту поездку."
        };
      }
      
      // Создаем оценку
      await db.insert(ratings)
        .values({
          orderId,
          fromUserId,
          fromUserType: userType,
          toUserId,
          toUserType: userType === "passenger" ? "driver" : "passenger",
          rating,
          comment: comment || null,
        });
      
      // Обновляем средний рейтинг пользователя
      await updateUserRating(toUserId, userType === "passenger" ? "driver" : "passenger");
      
      logger?.info('✅ [RateRide] Оценка создана');
      
      return {
        success: true,
        message: `Спасибо за оценку! Вы поставили ${rating} звезд.`
      };
      
    } catch (error) {
      logger?.error('❌ [RateRide] Ошибка создания оценки', { error });
      return {
        success: false,
        message: "Произошла ошибка при создании оценки."
      };
    }
  },
});

// Инструмент получения рейтинга пользователя
export const getUserRatingTool = createTool({
  id: "get-user-rating",
  description: "Получает рейтинг и отзывы о пользователе",
  inputSchema: z.object({
    userId: z.number().describe("ID пользователя"),
    userType: z.enum(["passenger", "driver"]).describe("Тип пользователя"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    rating: z.string().optional(),
    totalRatings: z.number().optional(),
    recentComments: z.array(z.string()).optional(),
    message: z.string(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    const { userId, userType } = context;
    
    logger?.info('🔧 [GetUserRating] Получение рейтинга', { userId, userType });
    
    try {
      // Получаем все оценки пользователя
      const userRatings = await db.select({
        rating: ratings.rating,
        comment: ratings.comment,
        createdAt: ratings.createdAt,
      })
      .from(ratings)
      .where(and(
        eq(ratings.toUserId, userId),
        eq(ratings.toUserType, userType)
      ))
      .orderBy(ratings.createdAt);
      
      if (userRatings.length === 0) {
        return {
          success: true,
          rating: "5.00",
          totalRatings: 0,
          recentComments: [],
          message: "Пока нет оценок."
        };
      }
      
      // Вычисляем средний рейтинг
      const avgRating = userRatings.reduce((sum, r) => sum + r.rating, 0) / userRatings.length;
      
      // Получаем последние комментарии
      const recentComments = userRatings
        .filter(r => r.comment)
        .slice(-5)
        .map(r => r.comment!)
        .reverse();
      
      return {
        success: true,
        rating: avgRating.toFixed(2),
        totalRatings: userRatings.length,
        recentComments,
        message: `Рейтинг: ${avgRating.toFixed(2)} (${userRatings.length} оценок)`
      };
      
    } catch (error) {
      logger?.error('❌ [GetUserRating] Ошибка получения рейтинга', { error });
      return {
        success: false,
        message: "Произошла ошибка при получении рейтинга."
      };
    }
  },
});

// Вспомогательная функция обновления рейтинга
async function updateUserRating(userId: number, userType: string) {
  try {
    // Получаем все оценки пользователя
    const userRatings = await db.select({
      rating: ratings.rating,
    })
    .from(ratings)
    .where(and(
      eq(ratings.toUserId, userId),
      eq(ratings.toUserType, userType)
    ));
    
    if (userRatings.length === 0) return;
    
    // Вычисляем средний рейтинг
    const avgRating = userRatings.reduce((sum, r) => sum + r.rating, 0) / userRatings.length;
    const totalRides = userRatings.length;
    
    // Обновляем рейтинг в таблице пользователя
    if (userType === "driver") {
      await db.update(drivers)
        .set({ 
          rating: avgRating.toFixed(2),
          totalRides: totalRides
        })
        .where(eq(drivers.id, userId));
    } else {
      await db.update(passengers)
        .set({ 
          rating: avgRating.toFixed(2),
          totalRides: totalRides
        })
        .where(eq(passengers.id, userId));
    }
  } catch (error) {
    console.error('Ошибка обновления рейтинга:', error);
  }
}