import { pgTable, serial, text, timestamp, decimal, integer, boolean, jsonb } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// Пользователи (пассажиры)
export const passengers = pgTable("passengers", {
  id: serial("id").primaryKey(),
  telegramId: text("telegram_id").notNull().unique(),
  firstName: text("first_name").notNull(),
  phoneNumber: text("phone_number").notNull(),
  rating: decimal("rating", { precision: 3, scale: 2 }).default("5.00"),
  totalRides: integer("total_rides").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Водители
export const drivers = pgTable("drivers", {
  id: serial("id").primaryKey(),
  telegramId: text("telegram_id").notNull().unique(),
  firstName: text("first_name").notNull(),
  phoneNumber: text("phone_number").notNull(),
  rating: decimal("rating", { precision: 3, scale: 2 }).default("5.00"),
  totalRides: integer("total_rides").default(0),
  isOnline: boolean("is_online").default(false),
  isVerified: boolean("is_verified").default(false),
  // Данные автомобиля
  carModel: text("car_model"),
  carColor: text("car_color"),
  carNumber: text("car_number"),
  // Статус верификации документов
  licenseStatus: text("license_status").default("pending"), // pending, approved, rejected
  vehicleStatus: text("vehicle_status").default("pending"), // pending, approved, rejected
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Документы водителей
export const driverDocuments = pgTable("driver_documents", {
  id: serial("id").primaryKey(),
  driverId: integer("driver_id").notNull(),
  documentType: text("document_type").notNull(), // license, vehicle_registration, insurance
  documentData: jsonb("document_data"), // Данные документа
  status: text("status").default("pending"), // pending, approved, rejected
  rejectionReason: text("rejection_reason"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Заказы
export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  passengerId: integer("passenger_id").notNull(),
  fromAddress: text("from_address").notNull(),
  toAddress: text("to_address").notNull(),
  suggestedPrice: decimal("suggested_price", { precision: 8, scale: 2 }).notNull(),
  finalPrice: decimal("final_price", { precision: 8, scale: 2 }),
  status: text("status").default("pending"), // pending, negotiating, accepted, in_progress, completed, cancelled
  acceptedDriverId: integer("accepted_driver_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Предложения водителей
export const driverOffers = pgTable("driver_offers", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull(),
  driverId: integer("driver_id").notNull(),
  offeredPrice: decimal("offered_price", { precision: 8, scale: 2 }).notNull(),
  status: text("status").default("pending"), // pending, accepted, rejected, counter_offered
  message: text("message"), // Дополнительное сообщение от водителя
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Переговоры по цене
export const priceNegotiations = pgTable("price_negotiations", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull(),
  fromUserId: integer("from_user_id").notNull(),
  fromUserType: text("from_user_type").notNull(), // passenger, driver
  toUserId: integer("to_user_id").notNull(),
  toUserType: text("to_user_type").notNull(), // passenger, driver
  proposedPrice: decimal("proposed_price", { precision: 8, scale: 2 }).notNull(),
  status: text("status").default("pending"), // pending, accepted, rejected
  createdAt: timestamp("created_at").defaultNow(),
});

// Оценки и отзывы
export const ratings = pgTable("ratings", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull(),
  fromUserId: integer("from_user_id").notNull(),
  fromUserType: text("from_user_type").notNull(), // passenger, driver
  toUserId: integer("to_user_id").notNull(),
  toUserType: text("to_user_type").notNull(), // passenger, driver
  rating: integer("rating").notNull(), // 1-5 звезд
  comment: text("comment"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Связи между таблицами
export const passengersRelations = relations(passengers, ({ many }) => ({
  orders: many(orders),
  ratingsGiven: many(ratings, { relationName: "ratingsGiven" }),
  ratingsReceived: many(ratings, { relationName: "ratingsReceived" }),
}));

export const driversRelations = relations(drivers, ({ many, one }) => ({
  documents: many(driverDocuments),
  offers: many(driverOffers),
  acceptedOrders: many(orders),
  ratingsGiven: many(ratings, { relationName: "ratingsGiven" }),
  ratingsReceived: many(ratings, { relationName: "ratingsReceived" }),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  passenger: one(passengers, {
    fields: [orders.passengerId],
    references: [passengers.id],
  }),
  acceptedDriver: one(drivers, {
    fields: [orders.acceptedDriverId],
    references: [drivers.id],
  }),
  offers: many(driverOffers),
  negotiations: many(priceNegotiations),
  ratings: many(ratings),
}));

export const driverOffersRelations = relations(driverOffers, ({ one }) => ({
  order: one(orders, {
    fields: [driverOffers.orderId],
    references: [orders.id],
  }),
  driver: one(drivers, {
    fields: [driverOffers.driverId],
    references: [drivers.id],
  }),
}));

export const driverDocumentsRelations = relations(driverDocuments, ({ one }) => ({
  driver: one(drivers, {
    fields: [driverDocuments.driverId],
    references: [drivers.id],
  }),
}));

export const priceNegotiationsRelations = relations(priceNegotiations, ({ one }) => ({
  order: one(orders, {
    fields: [priceNegotiations.orderId],
    references: [orders.id],
  }),
}));

export const ratingsRelations = relations(ratings, ({ one }) => ({
  order: one(orders, {
    fields: [ratings.orderId],
    references: [orders.id],
  }),
}));