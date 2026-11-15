import { z } from "zod";
import { OrderStatus } from "@prisma/client";

/**
 * Схема валидации оформления заказа из корзины
 */
export const CheckoutDtoSchema = z.object({
  customerName: z
    .string()
    .trim()
    .min(2, { message: "Имя покупателя должно содержать не менее 2 символов" })
    .max(255, { message: "Имя покупателя не может превышать 255 символов" })
    .optional(),
  customerEmail: z
    .string()
    .trim()
    .email({ message: "Некорректный формат email адреса" })
    .max(255, { message: "Email не может превышать 255 символов" })
    .optional(),
  customerPhone: z
    .string()
    .trim()
    .max(50, { message: "Телефон не может превышать 50 символов" })
    .optional()
    .nullable(),
});

export type CheckoutDto = z.infer<typeof CheckoutDtoSchema>;

/**
 * Схема параметров фильтрации и пагинации заказов в админке
 */
export const OrderQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
  status: z.nativeEnum(OrderStatus).optional(),
  customerEmail: z.string().trim().optional(),
});

export type OrderQueryDto = z.infer<typeof OrderQuerySchema>;
