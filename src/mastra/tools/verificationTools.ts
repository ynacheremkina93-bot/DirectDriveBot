import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { db, drivers, driverDocuments } from "../server/storage";
import { eq, and } from "drizzle-orm";

// Инструмент загрузки документа
export const uploadDocumentTool = createTool({
  id: "upload-document",
  description: "Загружает документ водителя для верификации",
  inputSchema: z.object({
    telegramId: z.string().describe("Telegram ID водителя"),
    documentType: z.enum(["license", "vehicle_registration", "insurance"]).describe("Тип документа"),
    documentData: z.object({
      number: z.string().describe("Номер документа"),
      issuedBy: z.string().describe("Кем выдан"),
      issueDate: z.string().describe("Дата выдачи"),
      expiryDate: z.string().optional().describe("Дата окончания действия"),
      additionalInfo: z.string().optional().describe("Дополнительная информация"),
    }).describe("Данные документа"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
    documentId: z.number().optional(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    const { telegramId, documentType, documentData } = context;
    
    logger?.info('🔧 [UploadDocument] Загрузка документа', {
      telegramId, documentType
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
      
      // Проверяем, не загружен ли уже документ этого типа
      const existingDoc = await db.select().from(driverDocuments)
        .where(and(
          eq(driverDocuments.driverId, driver[0].id),
          eq(driverDocuments.documentType, documentType)
        ));
      
      if (existingDoc.length > 0) {
        // Обновляем существующий документ
        await db.update(driverDocuments)
          .set({
            documentData: documentData,
            status: "pending",
            rejectionReason: null,
            updatedAt: new Date(),
          })
          .where(eq(driverDocuments.id, existingDoc[0].id));
        
        logger?.info('📝 [UploadDocument] Документ обновлен', {
          documentId: existingDoc[0].id
        });
        
        return {
          success: true,
          documentId: existingDoc[0].id,
          message: getDocumentTypeMessage(documentType) + " обновлен и отправлен на проверку."
        };
      } else {
        // Создаем новый документ
        const newDoc = await db.insert(driverDocuments)
          .values({
            driverId: driver[0].id,
            documentType,
            documentData: documentData,
            status: "pending",
          })
          .returning();
        
        logger?.info('✅ [UploadDocument] Документ загружен', {
          documentId: newDoc[0].id
        });
        
        return {
          success: true,
          documentId: newDoc[0].id,
          message: getDocumentTypeMessage(documentType) + " загружен и отправлен на проверку. Результат будет известен в течение 24 часов."
        };
      }
      
    } catch (error) {
      logger?.error('❌ [UploadDocument] Ошибка загрузки документа', { error });
      return {
        success: false,
        message: "Произошла ошибка при загрузке документа."
      };
    }
  },
});

// Инструмент проверки статуса верификации
export const checkVerificationStatusTool = createTool({
  id: "check-verification-status",
  description: "Проверяет статус верификации документов водителя",
  inputSchema: z.object({
    telegramId: z.string().describe("Telegram ID водителя"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    isVerified: z.boolean().optional(),
    documents: z.array(z.object({
      type: z.string(),
      status: z.string(),
      rejectionReason: z.string().optional(),
    })).optional(),
    message: z.string(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    const { telegramId } = context;
    
    logger?.info('🔧 [CheckVerificationStatus] Проверка статуса верификации', {
      telegramId
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
      
      // Получаем все документы водителя
      const documents = await db.select().from(driverDocuments)
        .where(eq(driverDocuments.driverId, driver[0].id));
      
      const documentStatuses = documents.map(doc => ({
        type: getDocumentTypeMessage(doc.documentType),
        status: getStatusMessage(doc.status),
        rejectionReason: doc.rejectionReason || undefined,
      }));
      
      // Проверяем общий статус верификации
      const requiredDocs = ["license", "vehicle_registration"];
      const approvedDocs = documents.filter(doc => doc.status === "approved");
      const hasAllRequiredApproved = requiredDocs.every(type => 
        approvedDocs.some(doc => doc.documentType === type)
      );
      
      const isVerified = hasAllRequiredApproved && Boolean(driver[0].isVerified);
      
      let message = `Статус верификации: ${isVerified ? 'Подтвержден' : 'Не подтвержден'}\\n\\n`;
      
      if (documentStatuses.length === 0) {
        message += "Документы не загружены. Загрузите водительское удостоверение и документы на автомобиль.";
      } else {
        message += "Статус документов:\\n" + 
          documentStatuses.map(doc => 
            `• ${doc.type}: ${doc.status}${doc.rejectionReason ? ` (${doc.rejectionReason})` : ''}`
          ).join('\\n');
      }
      
      return {
        success: true,
        isVerified,
        documents: documentStatuses,
        message
      };
      
    } catch (error) {
      logger?.error('❌ [CheckVerificationStatus] Ошибка проверки статуса', { error });
      return {
        success: false,
        message: "Произошла ошибка при проверке статуса."
      };
    }
  },
});

// Инструмент (для администраторов) одобрения/отклонения документов
export const processDocumentVerificationTool = createTool({
  id: "process-document-verification",
  description: "Обрабатывает верификацию документа (одобряет или отклоняет)",
  inputSchema: z.object({
    documentId: z.number().describe("ID документа"),
    approve: z.boolean().describe("Одобрить (true) или отклонить (false)"),
    rejectionReason: z.string().optional().describe("Причина отклонения"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    const { documentId, approve, rejectionReason } = context;
    
    logger?.info('🔧 [ProcessDocumentVerification] Обработка верификации', {
      documentId, approve, rejectionReason
    });
    
    try {
      const newStatus = approve ? "approved" : "rejected";
      
      // Обновляем статус документа
      await db.update(driverDocuments)
        .set({
          status: newStatus,
          rejectionReason: approve ? null : (rejectionReason || null),
          updatedAt: new Date(),
        })
        .where(eq(driverDocuments.id, documentId));
      
      // Получаем информацию о документе и водителе
      const document = await db.select()
        .from(driverDocuments)
        .where(eq(driverDocuments.id, documentId));
      
      if (document.length > 0) {
        // Проверяем, можно ли теперь верифицировать водителя
        await checkAndUpdateDriverVerification(document[0].driverId);
      }
      
      logger?.info('✅ [ProcessDocumentVerification] Верификация обработана');
      
      return {
        success: true,
        message: `Документ ${approve ? 'одобрен' : 'отклонен'}.`
      };
      
    } catch (error) {
      logger?.error('❌ [ProcessDocumentVerification] Ошибка обработки', { error });
      return {
        success: false,
        message: "Произошла ошибка при обработке верификации."
      };
    }
  },
});

// Вспомогательные функции

function getDocumentTypeMessage(type: string): string {
  switch (type) {
    case "license": return "Водительское удостоверение";
    case "vehicle_registration": return "Документ на автомобиль";
    case "insurance": return "Страховка";
    default: return "Документ";
  }
}

function getStatusMessage(status: string): string {
  switch (status) {
    case "pending": return "На рассмотрении";
    case "approved": return "Одобрен";
    case "rejected": return "Отклонен";
    default: return "Неизвестно";
  }
}

async function checkAndUpdateDriverVerification(driverId: number) {
  try {
    // Получаем все документы водителя
    const documents = await db.select().from(driverDocuments)
      .where(eq(driverDocuments.driverId, driverId));
    
    // Проверяем, одобрены ли все обязательные документы
    const requiredDocs = ["license", "vehicle_registration"];
    const approvedDocs = documents.filter(doc => doc.status === "approved");
    const hasAllRequiredApproved = requiredDocs.every(type => 
      approvedDocs.some(doc => doc.documentType === type)
    );
    
    // Обновляем статус верификации водителя
    await db.update(drivers)
      .set({
        isVerified: hasAllRequiredApproved,
        licenseStatus: hasAllRequiredApproved ? "approved" : "pending",
        vehicleStatus: hasAllRequiredApproved ? "approved" : "pending",
      })
      .where(eq(drivers.id, driverId));
    
  } catch (error) {
    console.error('Ошибка обновления статуса верификации:', error);
  }
}