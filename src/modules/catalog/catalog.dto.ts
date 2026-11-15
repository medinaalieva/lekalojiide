import { z } from "zod";
import { DifficultyLevel } from "@prisma/client";

// =============================================================================
// Категории
// =============================================================================

export const CreateCategorySchema = z.object({
  title: z
    .string()
    .trim()
    .min(2, { message: "Название категории должно содержать не менее 2 символов" })
    .max(150, { message: "Название категории не может превышать 150 символов" }),
  slug: z
    .string()
    .trim()
    .min(2, { message: "Слаг должен содержать не менее 2 символов" })
    .max(150, { message: "Слаг не может превышать 150 символов" })
    .optional(),
  description: z.string().trim().optional().nullable(),
  parentId: z.string().uuid({ message: "Некорректный ID родительской категории" }).optional().nullable(),
  displayOrder: z.number().int().optional().default(0),
  isActive: z.boolean().optional().default(true),
});

export type CreateCategoryDto = z.infer<typeof CreateCategorySchema>;

export const UpdateCategorySchema = CreateCategorySchema.partial();
export type UpdateCategoryDto = z.infer<typeof UpdateCategorySchema>;

// =============================================================================
// Товары (Выкройки)
// =============================================================================

export const CreateProductSchema = z.object({
  title: z
    .string()
    .trim()
    .min(2, { message: "Название должно содержать не менее 2 символов" })
    .max(255, { message: "Название не может превышать 255 символов" }),
  slug: z
    .string()
    .trim()
    .min(2, { message: "Слаг должен содержать не менее 2 символов" })
    .max(255, { message: "Слаг не может превышать 255 символов" })
    .optional(),
  categoryId: z.string().uuid({ message: "Некорректный ID категории" }),
  description: z
    .string()
    .trim()
    .min(5, { message: "Описание должно содержать не менее 5 символов" }),
  shortDescription: z.string().trim().optional().nullable(),
  basePrice: z
    .number()
    .nonnegative({ message: "Цена не может быть отрицательной" }),
  difficultyLevel: z
    .nativeEnum(DifficultyLevel)
    .optional()
    .default(DifficultyLevel.INTERMEDIATE),
  fabricDetails: z.any().optional().nullable(),
  isActive: z.boolean().optional().default(true),
});

export type CreateProductDto = z.infer<typeof CreateProductSchema>;

export const UpdateProductSchema = CreateProductSchema.partial();
export type UpdateProductDto = z.infer<typeof UpdateProductSchema>;

// =============================================================================
// Фильтры и пагинация каталога
// =============================================================================

export const CatalogQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().min(1).max(50).optional().default(12),
  categorySlug: z.string().trim().optional(),
  categoryId: z.string().uuid().optional(),
  sizes: z.string().trim().optional(), // разделитель запятая: "42,44,46"
  heights: z.string().trim().optional(), // разделитель запятая: "164,170"
  formats: z.string().trim().optional(), // разделитель запятая: "A4,PLOTTER_900"
  difficulty: z.string().trim().optional(), // разделитель запятая
  search: z.string().trim().optional(),
  sort: z
    .enum(["newest", "price_asc", "price_desc", "title_asc"])
    .optional()
    .default("newest"),
});

export type CatalogQueryDto = z.infer<typeof CatalogQuerySchema>;

// =============================================================================
// Варианты выкроек (Matrix Batch Generator)
// =============================================================================

export const BatchVariantsSchema = z.object({
  sizeIds: z
    .array(z.string().uuid({ message: "Некорректный ID размера" }))
    .min(1, { message: "Укажите хотя бы один размер" }),
  heightIds: z
    .array(z.string().uuid({ message: "Некорректный ID роста" }))
    .min(1, { message: "Укажите хотя бы один рост" }),
  formatIds: z
    .array(z.string().uuid({ message: "Некорректный ID формата" }))
    .min(1, { message: "Укажите хотя бы один формат" }),
  priceOverride: z.number().nonnegative().optional().nullable(),
  skuPrefix: z.string().trim().max(30).optional(),
});

export type BatchVariantsDto = z.infer<typeof BatchVariantsSchema>;

// =============================================================================
// Изображения товара
// =============================================================================

export const AddProductImageSchema = z.object({
  imageUrl: z.string().url({ message: "Некорректный URL изображения" }),
  altText: z.string().trim().max(255).optional().nullable(),
  displayOrder: z.number().int().optional().default(0),
  isCover: z.boolean().optional().default(false),
});

export type AddProductImageDto = z.infer<typeof AddProductImageSchema>;
