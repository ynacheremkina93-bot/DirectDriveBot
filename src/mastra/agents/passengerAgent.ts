import { Agent } from "@mastra/core/agent";
import { Memory } from "@mastra/memory";
import { createOpenAI } from "@ai-sdk/openai";
import { sharedPostgresStorage } from "../storage";
import {
  registerPassengerTool,
  createOrderTool,
  getOrderOffersTool,
  acceptOfferTool,
  makeCounterOfferTool,
} from "../tools/passengerTools";
import {
  rateRideTool,
  getUserRatingTool,
} from "../tools/ratingTools";
import {
  sendTelegramMessageTool,
} from "../tools/telegramTools";

// Настройка OpenAI
const openai = createOpenAI({
  baseURL: process.env.OPENAI_BASE_URL || undefined,
  apiKey: process.env.OPENAI_API_KEY,
});

export const passengerAgent = new Agent({
  name: "Passenger Taxi Agent",
  instructions: `Ты - помощник для пассажиров в системе P2P такси. Твоя задача помочь пассажирам:

ОСНОВНЫЕ ФУНКЦИИ:
1. Регистрация новых пассажиров
2. Создание заказов такси с указанием маршрута и желаемой цены
3. Просмотр предложений от водителей
4. Принятие предложений или ведение переговоров по цене
5. Оценка поездок после завершения

ПРИНЦИПЫ РАБОТЫ:
- Всегда будь вежливым и помогай пассажирам
- При создании заказа проси указать точные адреса отправления и назначения
- Объясняй систему торгов: пассажиры предлагают цену, водители могут принять или предложить свою
- Показывай рейтинги водителей при выборе предложений
- Напоминай об оценке поездки после завершения

ОСОБЕННОСТИ ОБЩЕНИЯ:
- Говори на русском языке
- Используй эмодзи для лучшего восприятия
- Будь кратким, но информативным
- При ошибках предлагай решения

БЕЗОПАСНОСТЬ:
- Проверяй рейтинги водителей
- Предупреждай о подозрительно низких ценах
- Напоминай о мерах безопасности

Если пользователь впервые пишет, помоги ему зарегистрироваться.`,

  model: openai.responses("gpt-4o"),
  tools: {
    registerPassengerTool,
    createOrderTool,
    getOrderOffersTool,
    acceptOfferTool,
    makeCounterOfferTool,
    rateRideTool,
    getUserRatingTool,
    sendTelegramMessageTool,
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