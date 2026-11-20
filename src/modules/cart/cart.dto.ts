import { z } from "zod";

/**
 * Схема валидации добавления товара/варианта в корзину
 */
export const AddToCartSchema = z
  .object({
    variantId: z.string().uuid({ message: "Некорректный ID варианта выкройки" }).optional(),
    productVariantId: z.string().uuid({ message: "Некорректный ID варианта выкройки" }).optional(),
    productId: z.string().uuid({ message: "Некорректный ID выкройки" }).optional(),
  })
  .refine((data) => Boolean(data.variantId || data.productVariantId), {
    message: "Необходимо указать variantId или productVariantId",
  })
  .transform((data) => ({
    variantId: (data.variantId || data.productVariantId)!,
    productId: data.productId,
  }));

export type AddToCartDto = z.infer<typeof AddToCartSchema>;

/**
 * Схема валидации изменения выбранного варианта в корзине
 */
export const UpdateCartItemSchema = z.object({
  newVariantId: z.string().uuid({ message: "Некорректный ID нового варианта выкройки (ожидается UUID)" }),
});

export type UpdateCartItemDto = z.infer<typeof UpdateCartItemSchema>;
