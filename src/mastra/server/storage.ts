import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../shared/schema";

// Создание подключения к базе данных
const connectionString = process.env.DATABASE_URL!;
const sql = postgres(connectionString);
export const db = drizzle(sql, { schema });

// Экспорт схемы для использования в других файлах
export * from "../shared/schema";