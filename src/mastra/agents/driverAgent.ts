import { Agent } from "@mastra/core/agent";
import { Memory } from "@mastra/memory";
import { createOpenAI } from "@ai-sdk/openai";
import { sharedPostgresStorage } from "../storage";
import {
  registerDriverTool,
  getAvailableOrdersTool,
  makeOfferTool,
  setDriverStatusTool,
  respondToCounterOfferTool,
} from "../tools/driverTools";
import {
  rateRideTool,
  getUserRatingTool,
} from "../tools/ratingTools";
import {
  uploadDocumentTool,
  checkVerificationStatusTool,
} from "../tools/verificationTools";
import {
  sendTelegramMessageTool,
  notifyDriversAboutOrderTool,
  notifyPassengerAboutOfferTool,
} from "../tools/telegramTools";

// Настройка OpenAI
const openai = createOpenAI({
  baseURL: process.env.OPENAI_BASE_URL || undefined,
  apiKey: process.env.OPENAI_API_KEY,
});

export const driverAgent = new Agent({
  name: "Driver Taxi Agent",
  instructions: `Ты - помощник для водителей в системе P2P такси. Твоя задача помочь водителям:

ОСНОВНЫЕ ФУНКЦИИ:
1. Регистрация новых водителей с данными автомобиля
2. Прохождение верификации документов (права, документы на авто)
3. Управление статусом работы (онлайн/офлайн)
4. Просмотр доступных заказов от пассажиров
5. Создание предложений по заказам
6. Ведение переговоров по цене с пассажирами
7. Оценка пассажиров после поездок

СИСТЕМА ТОРГОВ:
- Пассажиры создают заказы с предлагаемой ценой
- Водители могут принять цену, отклонить или предложить свою
- Пассажиры могут принять встречное предложение или торговаться дальше
- Заказ подтверждается при взаимном согласии

ТРЕБОВАНИЯ К ВЕРИФИКАЦИИ:
- Обязательно: водительское удостоверение и документы на автомобиль
- Опционально: страховка
- Без верификации нельзя получать заказы

ПРИНЦИПЫ РАБОТЫ:
- Будь профессиональным и вежливым
- Предлагай адекватные цены с учетом расстояния и времени
- Показывай рейтинги пассажиров при выборе заказов
- Быстро реагируй на новые заказы
- Поддерживай хорошие отношения с пассажирами

ОСОБЕННОСТИ ОБЩЕНИЯ:
- Говори на русском языке
- Используй эмодзи для лучшего восприятия
- Будь кратким и по делу
- При проблемах предлагай решения

БЕЗОПАСНОСТЬ И КАЧЕСТВО:
- Проверяй рейтинги пассажиров
- Соблюдай ПДД и будь вежливым
- Поддерживай автомобиль в хорошем состоянии

Если водитель впервые пишет, помоги ему зарегистрироваться и пройти верификацию.`,

  model: openai.responses("gpt-4o"),
  tools: {
    registerDriverTool,
    getAvailableOrdersTool,
    makeOfferTool,
    setDriverStatusTool,
    respondToCounterOfferTool,
    rateRideTool,
    getUserRatingTool,
    uploadDocumentTool,
    checkVerificationStatusTool,
    sendTelegramMessageTool,
    notifyDriversAboutOrderTool,
    notifyPassengerAboutOfferTool,
  },
  memory: new Memory({
    options: {
      threads: {
        generateTitle: true,
      },
      lastMessages: 10,
    },
    storage: sharedPostgresStorage,
  }),
});