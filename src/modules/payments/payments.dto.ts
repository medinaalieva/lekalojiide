import { z } from "zod";
import { WebhookStatus } from "@prisma/client";

/**
 * Валидация UUID идентификатора заказа в URL-параметрах
 */
export const OrderIdParamSchema = z.object({
  id: z.string().uuid({ message: "Некорректный ID заказа (ожидается UUID)" }),
});

export type OrderIdParamDto = z.infer<typeof OrderIdParamSchema>;

/**
 * Валидация параметров пагинации и фильтрации журналов вебхуков в админке
 */
export const AdminWebhookEventsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
  status: z.nativeEnum(WebhookStatus).optional(),
  gateway: z.string().trim().optional(),
});

export type AdminWebhookEventsQueryDto = z.infer<typeof AdminWebhookEventsQuerySchema>;
