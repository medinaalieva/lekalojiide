import { z } from "zod";

/**
 * Схема валидации добавления товара/варианта в корзину
 */
export const AddToCartSchema = z.object({
  variantId: z.string().uuid({ message: "Некорректный ID варианта выкройки (ожидается UUID)" }),
  productId: z.string().uuid({ message: "Некорректный ID выкройки (ожидается UUID)" }).optional(),
});

export type AddToCartDto = z.infer<typeof AddToCartSchema>;

/**
 * Схема валидации изменения выбранного варианта в корзине
 */
export const UpdateCartItemSchema = z.object({
  newVariantId: z.string().uuid({ message: "Некорректный ID нового варианта выкройки (ожидается UUID)" }),
});

export type UpdateCartItemDto = z.infer<typeof UpdateCartItemSchema>;
