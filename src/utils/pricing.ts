import { Prisma } from "@prisma/client";

export interface PricingInput {
  basePrice: Prisma.Decimal | number | string;
  discountPrice?: Prisma.Decimal | number | string | null;
  discountFrom?: Date | string | null;
  discountUntil?: Date | string | null;
  bundlePrice?: Prisma.Decimal | number | string | null;
}

export type DiscountStatus = "PLANNED" | "ACTIVE" | "EXPIRED" | "NONE";

export interface PricingResult {
  currentPrice: number;
  originalPrice: number;
  isDiscountActive: boolean;
  discountPercent: number | null;
  discountFrom: string | null;
  discountUntil: string | null;
  discountStatus: DiscountStatus;
  isBundle: boolean;
}

/**
 * Серверный расчёт актуальной цены товара с учётом скидки и срока её действия,
 * а также цены комплекта «Все размеры».
 */
export function calculateEffectivePrice(
  product: PricingInput,
  options: {
    isBundleVariant?: boolean;
    priceOverride?: Prisma.Decimal | number | string | null;
  } = {},
  currentDate?: Date
): PricingResult {
  const originalBasePrice = Number(product.basePrice);
  const now = currentDate || new Date();

  // 1. Если задан явный priceOverride для варианта (должен быть > 0)
  if (options.priceOverride !== null && options.priceOverride !== undefined) {
    const overridePrice = Number(options.priceOverride);
    if (!isNaN(overridePrice) && overridePrice > 0) {
      return {
        currentPrice: overridePrice,
        originalPrice: originalBasePrice,
        isDiscountActive: false,
        discountPercent: null,
        discountFrom: null,
        discountUntil: null,
        discountStatus: "NONE",
        isBundle: Boolean(options.isBundleVariant),
      };
    }
  }

  // 2. Если выбран комплект ALL
  if (options.isBundleVariant) {
    const bPrice =
      product.bundlePrice !== null && product.bundlePrice !== undefined
        ? Number(product.bundlePrice)
        : originalBasePrice;
    return {
      currentPrice: bPrice,
      originalPrice: bPrice,
      isDiscountActive: false,
      discountPercent: null,
      discountFrom: null,
      discountUntil: null,
      discountStatus: "NONE",
      isBundle: true,
    };
  }

  // 3. Обычный размер со скидкой или без
  let isDiscountActive = false;
  let currentPrice = originalBasePrice;
  let discountPercent: number | null = null;
  let discountFromIso: string | null = null;
  let discountUntilIso: string | null = null;
  let discountStatus: DiscountStatus = "NONE";

  if (product.discountPrice !== null && product.discountPrice !== undefined) {
    const dPrice = Number(product.discountPrice);

    let fromDate: Date | null = null;
    if (product.discountFrom) {
      fromDate = new Date(product.discountFrom);
      discountFromIso = fromDate.toISOString();
    }

    let untilDate: Date | null = null;
    if (product.discountUntil) {
      untilDate = new Date(product.discountUntil);
      discountUntilIso = untilDate.toISOString();
    }

    // Проверка корректности диапазона дат: discountFrom не может быть позже discountUntil
    const isDateRangeValid = !(fromDate && untilDate && fromDate.getTime() > untilDate.getTime());

    // Проверка валидности цены: положительное число, строго меньше базовой цены
    const isPriceValid = !isNaN(dPrice) && dPrice > 0 && dPrice < originalBasePrice;

    if (isDateRangeValid && isPriceValid) {
      const nowTime = now.getTime();
      const isStarted = !fromDate || nowTime >= fromDate.getTime();
      const isExpired = Boolean(untilDate && nowTime >= untilDate.getTime());

      if (isExpired) {
        discountStatus = "EXPIRED";
      } else if (!isStarted) {
        discountStatus = "PLANNED";
      } else {
        discountStatus = "ACTIVE";
        isDiscountActive = true;
        currentPrice = dPrice;
        discountPercent = Math.max(1, Math.round(((originalBasePrice - dPrice) / originalBasePrice) * 100));
      }
    }
  }

  return {
    currentPrice,
    originalPrice: originalBasePrice,
    isDiscountActive,
    discountPercent,
    discountFrom: discountFromIso,
    discountUntil: discountUntilIso,
    discountStatus,
    isBundle: false,
  };
}
