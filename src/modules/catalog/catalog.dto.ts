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
  parentId: z
    .preprocess(
      (v) => (v === "" || v === undefined ? null : v),
      z.string().uuid({ message: "Некорректный ID родительской категории" }).nullable()
    )
    .optional(),
  displayOrder: z
    .preprocess(
      (v) => (v === "" || v === null || v === undefined ? 0 : Number(v)),
      z.number().int()
    )
    .optional()
    .default(0),
  isActive: z.boolean().optional().default(true),
});

export type CreateCategoryDto = z.infer<typeof CreateCategorySchema>;

export const UpdateCategorySchema = z.object({
  title: z
    .string()
    .trim()
    .min(2, { message: "Название категории должно содержать не менее 2 символов" })
    .max(150, { message: "Название категории не может превышать 150 символов" })
    .optional(),
  slug: z
    .string()
    .trim()
    .min(2, { message: "Слаг должен содержать не менее 2 символов" })
    .max(150, { message: "Слаг не может превышать 150 символов" })
    .optional(),
  description: z.string().trim().optional().nullable(),
  parentId: z
    .preprocess(
      (v) => (v === "" || v === undefined ? null : v),
      z.string().uuid({ message: "Некорректный ID родительской категории" }).nullable()
    )
    .optional(),
  displayOrder: z
    .preprocess(
      (v) => (v === "" || v === null || v === undefined ? undefined : Number(v)),
      z.number().int().optional()
    )
    .optional(),
  isActive: z.boolean().optional(),
});
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
  bundlePrice: z
    .number()
    .nonnegative({ message: "Цена комплекта не может быть отрицательной" })
    .optional()
    .nullable(),
  hasBundleOption: z.boolean().optional().default(true),
  discountPrice: z
    .number()
    .positive({ message: "Акционная цена должна быть больше нуля" })
    .optional()
    .nullable(),
  discountFrom: z.string().datetime().or(z.date()).optional().nullable(),
  discountUntil: z.string().datetime().or(z.date()).optional().nullable(),
  isNew: z.boolean().optional().default(false),
  isBestseller: z.boolean().optional().default(false),
  isPopular: z.boolean().optional().default(false),
  technicalDrawingUrl: z.string().url().or(z.string().length(0)).optional().nullable(),
  videoUrl: z.string().url().or(z.string().length(0)).optional().nullable(),
  difficultyLevel: z
    .nativeEnum(DifficultyLevel)
    .optional()
    .default(DifficultyLevel.INTERMEDIATE),
  fabricDetails: z.any().optional().nullable(),
  isActive: z.boolean().optional().default(true),
})
.refine(
  (data) => {
    if (data.discountFrom && data.discountUntil) {
      return new Date(data.discountFrom).getTime() <= new Date(data.discountUntil).getTime();
    }
    return true;
  },
  {
    message: "Дата начала скидки (discountFrom) не может быть позже даты окончания (discountUntil)",
    path: ["discountFrom"],
  }
)
.refine(
  (data) => {
    if (data.discountPrice !== null && data.discountPrice !== undefined) {
      return data.discountPrice < data.basePrice;
    }
    return true;
  },
  {
    message: "Скидочная цена должна быть строго меньше базовой цены",
    path: ["discountPrice"],
  }
);

export type CreateProductDto = z.infer<typeof CreateProductSchema>;

export const UpdateProductSchema = z
  .object({
    categoryId: z.string().uuid({ message: "Некорректный ID категории" }).optional(),
    title: z.string().trim().min(2, { message: "Название должно содержать не менее 2 символов" }).optional(),
    slug: z.string().trim().optional(),
    description: z.string().trim().min(5, { message: "Описание должно содержать не менее 5 символов" }).optional(),
    shortDescription: z.string().trim().optional().nullable(),
    basePrice: z.number().positive({ message: "Цена должна быть больше нуля" }).optional(),
    bundlePrice: z.number().positive({ message: "Цена комплекта должна быть больше нуля" }).optional().nullable(),
    hasBundleOption: z.boolean().optional(),
    discountPrice: z.number().positive({ message: "Акционная цена должна быть больше нуля" }).optional().nullable(),
    discountFrom: z.string().datetime().or(z.date()).optional().nullable(),
    discountUntil: z.string().datetime().or(z.date()).optional().nullable(),
    isNew: z.boolean().optional(),
    isBestseller: z.boolean().optional(),
    isPopular: z.boolean().optional(),
    technicalDrawingUrl: z.string().url().or(z.string().length(0)).optional().nullable(),
    videoUrl: z.string().url().or(z.string().length(0)).optional().nullable(),
    difficultyLevel: z.nativeEnum(DifficultyLevel).optional(),
    fabricDetails: z.any().optional().nullable(),
    isActive: z.boolean().optional(),
  })
  .refine(
    (data) => {
      if (data.discountFrom && data.discountUntil) {
        return new Date(data.discountFrom).getTime() <= new Date(data.discountUntil).getTime();
      }
      return true;
    },
    {
      message: "Дата начала скидки (discountFrom) не может быть позже даты окончания (discountUntil)",
      path: ["discountFrom"],
    }
  )
  .refine(
    (data) => {
      if (
        data.discountPrice !== null &&
        data.discountPrice !== undefined &&
        data.basePrice !== undefined
      ) {
        return data.discountPrice < data.basePrice;
      }
      return true;
    },
    {
      message: "Скидочная цена должна быть строго меньше базовой цены",
      path: ["discountPrice"],
    }
  );

export type UpdateProductDto = z.infer<typeof UpdateProductSchema>;

export const UpdateProductDiscountSchema = z
  .object({
    discountPrice: z.number().positive({ message: "Акционная цена должна быть больше 0" }).nullable(),
    discountFrom: z.string().datetime().or(z.date()).optional().nullable(),
    discountUntil: z.string().datetime().or(z.date()).optional().nullable(),
  })
  .refine(
    (data) => {
      if (data.discountFrom && data.discountUntil) {
        return new Date(data.discountFrom).getTime() <= new Date(data.discountUntil).getTime();
      }
      return true;
    },
    {
      message: "Дата начала скидки (discountFrom) не может быть позже даты окончания (discountUntil)",
      path: ["discountFrom"],
    }
  );

export type UpdateProductDiscountDto = z.infer<typeof UpdateProductDiscountSchema>;

// =============================================================================
// Фильтры и пагинация каталога
// =============================================================================

export const CatalogQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(12),
  categorySlug: z.string().trim().optional(),
  category: z.string().trim().optional(),
  categoryId: z.string().uuid().optional(),
  sizes: z.string().trim().optional(), // разделитель запятая: "42,44,46"
  size: z.string().trim().optional(),
  heights: z.string().trim().optional(), // разделитель запятая: "164,170"
  height: z.string().trim().optional(),
  formats: z.string().trim().optional(), // разделитель запятая: "A4,PLOTTER_900"
  format: z.string().trim().optional(),
  difficulty: z.string().trim().optional(), // разделитель запятая
  search: z.string().trim().optional(),
  sort: z
    .enum(["newest", "price_asc", "price_desc", "title_asc"])
    .optional()
    .default("newest"),
  sortBy: z.string().optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
  isNew: z
    .preprocess((val) => (val === "true" || val === true ? true : val === "false" || val === false ? false : undefined), z.boolean())
    .optional(),
  isBestseller: z
    .preprocess((val) => (val === "true" || val === true ? true : val === "false" || val === false ? false : undefined), z.boolean())
    .optional(),
  isPopular: z
    .preprocess((val) => (val === "true" || val === true ? true : val === "false" || val === false ? false : undefined), z.boolean())
    .optional(),
  hasDiscount: z
    .preprocess((val) => (val === "true" || val === true ? true : val === "false" || val === false ? false : undefined), z.boolean())
    .optional(),
});

export type CatalogQueryDto = z.infer<typeof CatalogQuerySchema>;

// =============================================================================
// Варианты выкроек (Matrix Batch Generator & Pricing)
// =============================================================================

export const BatchVariantsSchema = z
  .object({
    sizeIds: z.array(z.string()).optional(),
    sizes: z.array(z.string()).optional(),
    heightIds: z.array(z.string()).optional(),
    heights: z.array(z.string()).optional(),
    formatIds: z.array(z.string()).optional(),
    formats: z.array(z.string()).optional(),
    priceOverride: z.number().positive({ message: "Цена должна быть больше нуля" }).optional().nullable(),
    formatPrices: z.record(z.string(), z.number().positive({ message: "Цена формата должна быть больше нуля" }).nullable()).optional(),
    skuPrefix: z.string().trim().max(30).optional(),
    includeBundle: z.boolean().optional(),
  })
  .refine(
    (data) =>
      Boolean((data.sizeIds && data.sizeIds.length > 0) || (data.sizes && data.sizes.length > 0)) &&
      Boolean((data.heightIds && data.heightIds.length > 0) || (data.heights && data.heights.length > 0)) &&
      Boolean((data.formatIds && data.formatIds.length > 0) || (data.formats && data.formats.length > 0)),
    {
      message: "Необходимо указать хотя бы один размер, ростовку и формат",
    }
  );

export type BatchVariantsDto = z.infer<typeof BatchVariantsSchema>;

export const UpdateVariantPriceSchema = z
  .object({
    price: z.number().positive({ message: "Цена должна быть больше нуля" }).nullable().optional(),
    priceOverride: z.number().positive({ message: "Цена должна быть больше нуля" }).nullable().optional(),
  })
  .refine(
    (data) => data.price !== undefined || data.priceOverride !== undefined,
    {
      message: "Необходимо передать поле 'price' или 'priceOverride' (положительное число или null для сброса)",
    }
  );

export type UpdateVariantPriceDto = z.infer<typeof UpdateVariantPriceSchema>;

export const UpdateFormatPricesSchema = z
  .object({
    formatId: z.string().uuid({ message: "Некорректный UUID формата" }).optional(),
    formatCode: z.string().trim().min(1, { message: "Код формата не может быть пустым" }).optional(),
    price: z.number().positive({ message: "Цена должна быть больше нуля" }).nullable(),
  })
  .refine((data) => Boolean(data.formatId || data.formatCode), {
    message: "Необходимо указать formatId или formatCode",
  });

export type UpdateFormatPricesDto = z.infer<typeof UpdateFormatPricesSchema>;

// =============================================================================
// Изображения товара
// =============================================================================

export const AddProductImageSchema = z.object({
  imageUrl: z.string().min(1, { message: "URL изображения обязателен" }).max(1000, { message: "URL изображения не должен превышать 1000 символов" }),
  altText: z.string().trim().max(255).optional().nullable(),
  displayOrder: z.number().int().optional().default(0),
  isCover: z.boolean().optional().default(false),
});

export type AddProductImageDto = z.infer<typeof AddProductImageSchema>;

// =============================================================================
// Справочник размеров (Admin CRUD)
// =============================================================================

export const CreateSizeSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, { message: "Код размера не может быть пустым" })
    .max(30, { message: "Код размера не может превышать 30 символов" }),
  label: z
    .string()
    .trim()
    .min(1, { message: "Название размера не может быть пустым" })
    .max(100, { message: "Название размера не может превышать 100 символов" }),
  displayOrder: z.number().int().optional().default(0),
});

export type CreateSizeDto = z.infer<typeof CreateSizeSchema>;

export const UpdateSizeSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, { message: "Код размера не может быть пустым" })
    .max(30, { message: "Код размера не может превышать 30 символов" })
    .optional(),
  label: z
    .string()
    .trim()
    .min(1, { message: "Название размера не может быть пустым" })
    .max(100, { message: "Название размера не может превышать 100 символов" })
    .optional(),
  displayOrder: z.number().int().optional(),
});

export type UpdateSizeDto = z.infer<typeof UpdateSizeSchema>;

export const SizeIdParamSchema = z.object({
  id: z.string().uuid({ message: "Некорректный UUID идентификатор размера" }),
});

// =============================================================================
// Справочник ростовок (Heights Dictionaries)
// =============================================================================

export const CreateHeightSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(1, { message: "Код ростовки не может быть пустым" })
      .max(30, { message: "Код ростовки не может превышать 30 символов" }),
    label: z
      .string()
      .trim()
      .min(1, { message: "Название ростовки не может быть пустым" })
      .max(100, { message: "Название ростовки не может превышать 100 символов" }),
    minHeight: z
      .number()
      .int({ message: "Нижняя граница роста должна быть целым числом" })
      .positive({ message: "Нижняя граница роста должна быть положительным числом" })
      .optional()
      .nullable(),
    maxHeight: z
      .number()
      .int({ message: "Верхняя граница роста должна быть целым числом" })
      .positive({ message: "Верхняя граница роста должна быть положительным числом" })
      .optional()
      .nullable(),
    displayOrder: z.number().int().optional().default(0),
    isActive: z.boolean().optional().default(true),
  })
  .refine(
    (data) => {
      if (data.minHeight != null && data.maxHeight != null) {
        return data.minHeight <= data.maxHeight;
      }
      return true;
    },
    {
      message: "Нижняя граница роста не может превышать верхнюю границу",
      path: ["minHeight"],
    }
  );

export type CreateHeightDto = z.infer<typeof CreateHeightSchema>;

export const UpdateHeightSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(1, { message: "Код ростовки не может быть пустым" })
      .max(30, { message: "Код ростовки не может превышать 30 символов" })
      .optional(),
    label: z
      .string()
      .trim()
      .min(1, { message: "Название ростовки не может быть пустым" })
      .max(100, { message: "Название ростовки не может превышать 100 символов" })
      .optional(),
    minHeight: z
      .number()
      .int({ message: "Нижняя граница роста должна быть целым числом" })
      .positive({ message: "Нижняя граница роста должна быть положительным числом" })
      .optional()
      .nullable(),
    maxHeight: z
      .number()
      .int({ message: "Верхняя граница роста должна быть целым числом" })
      .positive({ message: "Верхняя граница роста должна быть положительным числом" })
      .optional()
      .nullable(),
    displayOrder: z.number().int().optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    (data) => {
      if (data.minHeight != null && data.maxHeight != null) {
        return data.minHeight <= data.maxHeight;
      }
      return true;
    },
    {
      message: "Нижняя граница роста не может превышать верхнюю границу",
      path: ["minHeight"],
    }
  );

export type UpdateHeightDto = z.infer<typeof UpdateHeightSchema>;

export const HeightIdParamSchema = z.object({
  id: z.string().uuid({ message: "Некорректный UUID идентификатор ростовки" }),
});

// =============================================================================
// Справочник форматов выкроек (Formats Dictionaries)
// =============================================================================

export const CreateFormatSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, { message: "Код формата не может быть пустым" })
    .max(30, { message: "Код формата не может превышать 30 символов" }),
  label: z
    .string()
    .trim()
    .min(1, { message: "Название формата не может быть пустым" })
    .max(100, { message: "Название формата не может превышать 100 символов" }),
  description: z.string().trim().optional().nullable(),
  maxPrintWidth: z
    .number()
    .int({ message: "Максимальная ширина печати должна быть целым числом" })
    .positive({ message: "Максимальная ширина печати должна быть положительным числом" })
    .optional()
    .nullable(),
  displayOrder: z.number().int().optional().default(0),
  isActive: z.boolean().optional().default(true),
});

export type CreateFormatDto = z.infer<typeof CreateFormatSchema>;

export const UpdateFormatSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, { message: "Код формата не может быть пустым" })
    .max(30, { message: "Код формата не может превышать 30 символов" })
    .optional(),
  label: z
    .string()
    .trim()
    .min(1, { message: "Название формата не может быть пустым" })
    .max(100, { message: "Название формата не может превышать 100 символов" })
    .optional(),
  description: z.string().trim().optional().nullable(),
  maxPrintWidth: z
    .number()
    .int({ message: "Максимальная ширина печати должна быть целым числом" })
    .positive({ message: "Максимальная ширина печати должна быть положительным числом" })
    .optional()
    .nullable(),
  displayOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

export type UpdateFormatDto = z.infer<typeof UpdateFormatSchema>;

export const FormatIdParamSchema = z.object({
  id: z.string().uuid({ message: "Некорректный UUID идентификатор формата" }),
});

export const ToggleActiveSchema = z.object({
  isActive: z.boolean().optional(),
});

// =============================================================================
// 10. Управление главной страницей (Homepage Config)
// =============================================================================

export const HeroFeaturedConfigSchema = z.object({
  isEnabled: z.boolean().default(true),
  productId: z.string().uuid({ message: "Некорректный UUID товара" }).nullable().optional(),
  badge: z.string().trim().max(100).nullable().optional(),
  title: z.string().trim().max(255).nullable().optional(),
  subtitle: z.string().trim().max(255).nullable().optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  imageUrl: z.string().trim().nullable().optional(),
  buttonText: z.string().trim().max(100).nullable().optional(),
  buttonLink: z.string().trim().max(500).nullable().optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
});
export type HeroFeaturedConfigDto = z.infer<typeof HeroFeaturedConfigSchema>;

export const UpdateHomepageBlockSchema = z.object({
  data: z.record(z.string(), z.any()).optional(),
}).passthrough();
export type UpdateHomepageBlockDto = z.infer<typeof UpdateHomepageBlockSchema>;

