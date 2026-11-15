import { Injectable, Optional } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { PrismaService } from "../../lib/prisma.service";
import { prisma as defaultPrisma } from "../../lib/prisma";
import { AddToCartDto, UpdateCartItemDto } from "./cart.dto";
import {
  NotFoundError,
  BadRequestError,
  ConflictError,
} from "../../utils/errors";

export interface CartResponseItem {
  id: string;
  variantId: string;
  productId: string;
  title: string;
  slug: string;
  coverImage: string | null;
  sku: string;
  size: { id: string; code: string; label: string };
  height: { id: string; code: string; label: string };
  format: { id: string; code: string; label: string };
  price: number;
  currency: string;
  isAvailable: boolean;
  createdAt: string;
}

export interface CartResponse {
  id: string;
  items: CartResponseItem[];
  totalItems: number;
  totalAmount: number;
  currency: string;
  updatedAt: string;
}

@Injectable()
export class CartService {
  private prisma: PrismaClient;

  constructor(
    @Optional() prismaService?: PrismaService,
    @Optional() customPrisma?: PrismaClient
  ) {
    if (customPrisma) {
      this.prisma = customPrisma;
    } else if (prismaService?.client) {
      this.prisma = prismaService.client;
    } else {
      this.prisma = defaultPrisma;
    }
  }

  /**
   * Получение или ленивое создание корзины пользователя в БД
   */
  async getOrCreateRawCart(userId: string) {
    let cart = await this.prisma.cart.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    if (!cart) {
      cart = await this.prisma.cart.create({
        data: {
          userId,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 дней
        },
      });
    }

    return cart;
  }

  /**
   * Форматирование корзины с серверным расчётом цен и актуальной суммы в сомах (KGS)
   */
  private formatCart(cart: any): CartResponse {
    let total = 0;
    const items: CartResponseItem[] = (cart.items || []).map((item: any) => {
      const v = item.variant;
      const product = v.product;
      const price =
        v.priceOverride !== null ? Number(v.priceOverride) : Number(product.basePrice);
      total += price;

      const coverImage =
        product.images?.find((img: any) => img.isCover)?.imageUrl ||
        product.images?.[0]?.imageUrl ||
        null;

      return {
        id: item.id,
        variantId: v.id,
        productId: product.id,
        title: product.title,
        slug: product.slug,
        coverImage,
        sku: v.sku,
        size: { id: v.size.id, code: v.size.code, label: v.size.label },
        height: { id: v.height.id, code: v.height.code, label: v.height.label },
        format: { id: v.format.id, code: v.format.code, label: v.format.label },
        price,
        currency: "KGS",
        isAvailable: Boolean(v.isActive && product.isActive),
        createdAt: item.createdAt.toISOString(),
      };
    });

    const roundedTotal = Math.round(total * 100) / 100;

    return {
      id: cart.id,
      items,
      totalItems: items.length,
      totalAmount: roundedTotal,
      currency: "KGS",
      updatedAt: cart.updatedAt ? cart.updatedAt.toISOString() : new Date().toISOString(),
    };
  }

  /**
   * Получение текущей корзины пользователя с позициями и пересчётом стоимости
   */
  async getUserCart(userId: string): Promise<CartResponse> {
    const rawCart = await this.getOrCreateRawCart(userId);

    const cart = await this.prisma.cart.findUnique({
      where: { id: rawCart.id },
      include: {
        items: {
          include: {
            variant: {
              include: {
                product: {
                  include: {
                    images: {
                      orderBy: [{ isCover: "desc" }, { displayOrder: "asc" }],
                    },
                  },
                },
                size: true,
                height: true,
                format: true,
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    return this.formatCart(cart);
  }

  /**
   * Добавление варианта выкройки в корзину
   */
  async addItem(userId: string, dto: AddToCartDto): Promise<CartResponse> {
    // 1. Проверяем существование варианта
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: dto.variantId },
      include: { product: true },
    });

    if (!variant) {
      throw new NotFoundError("VARIANT_NOT_FOUND", "Выбранный вариант выкройки не найден");
    }

    // 2. Проверяем активность товара (выкройки)
    if (!variant.product.isActive) {
      throw new BadRequestError("PRODUCT_INACTIVE", "Выкройка снята с публикации и недоступна для покупки");
    }

    // 3. Проверяем активность самого варианта
    if (!variant.isActive) {
      throw new BadRequestError("VARIANT_INACTIVE", "Выбранный вариант выкройки недоступен для заказа");
    }

    // 4. Проверяем принадлежность варианта указанной выкройке (если productId передан)
    if (dto.productId && variant.productId !== dto.productId) {
      throw new BadRequestError("VARIANT_MISMATCH", "Вариант не принадлежит указанной выкройке");
    }

    // 5. Получаем или создаем корзину пользователя
    const rawCart = await this.getOrCreateRawCart(userId);

    // 6. Проверяем, не добавлен ли уже этот вариант в корзину
    const existingItem = await this.prisma.cartItem.findUnique({
      where: {
        cartId_productVariantId: {
          cartId: rawCart.id,
          productVariantId: variant.id,
        },
      },
    });

    if (existingItem) {
      throw new ConflictError("VARIANT_ALREADY_IN_CART", "Выбранный вариант выкройки уже добавлен в корзину");
    }

    // 7. Добавляем позицию в корзину
    await this.prisma.cartItem.create({
      data: {
        cartId: rawCart.id,
        productVariantId: variant.id,
      },
    });

    await this.prisma.cart.update({
      where: { id: rawCart.id },
      data: { updatedAt: new Date() },
    });

    return this.getUserCart(userId);
  }

  /**
   * Изменение выбранного варианта в существующей позиции корзины
   */
  async updateItemVariant(
    userId: string,
    itemId: string,
    dto: UpdateCartItemDto
  ): Promise<CartResponse> {
    const rawCart = await this.getOrCreateRawCart(userId);

    // 1. Ищем существующую позицию в корзине пользователя
    const cartItem = await this.prisma.cartItem.findFirst({
      where: {
        id: itemId,
        cartId: rawCart.id,
      },
      include: {
        variant: true,
      },
    });

    if (!cartItem) {
      throw new NotFoundError("CART_ITEM_NOT_FOUND", "Позиция не найдена в вашей корзине");
    }

    // Если вариант тот же самый, ничего не меняем
    if (cartItem.productVariantId === dto.newVariantId) {
      return this.getUserCart(userId);
    }

    // 2. Ищем новый вариант
    const newVariant = await this.prisma.productVariant.findUnique({
      where: { id: dto.newVariantId },
      include: { product: true },
    });

    if (!newVariant) {
      throw new NotFoundError("VARIANT_NOT_FOUND", "Новый вариант выкройки не найден");
    }

    if (!newVariant.product.isActive) {
      throw new BadRequestError("PRODUCT_INACTIVE", "Выкройка снята с публикации");
    }

    if (!newVariant.isActive) {
      throw new BadRequestError("VARIANT_INACTIVE", "Выбранный вариант выкройки недоступен");
    }

    // Вариант должен принадлежать той же выкройке
    if (newVariant.productId !== cartItem.variant.productId) {
      throw new BadRequestError("VARIANT_MISMATCH", "Новый вариант принадлежит другой выкройке");
    }

    // 3. Проверяем, нет ли уже такого варианта в корзине
    const existingOther = await this.prisma.cartItem.findUnique({
      where: {
        cartId_productVariantId: {
          cartId: rawCart.id,
          productVariantId: dto.newVariantId,
        },
      },
    });

    if (existingOther && existingOther.id !== itemId) {
      throw new ConflictError("VARIANT_ALREADY_IN_CART", "Выбранный вариант выкройки уже есть в корзине");
    }

    // 4. Обновляем позицию
    await this.prisma.cartItem.update({
      where: { id: itemId },
      data: { productVariantId: dto.newVariantId },
    });

    await this.prisma.cart.update({
      where: { id: rawCart.id },
      data: { updatedAt: new Date() },
    });

    return this.getUserCart(userId);
  }

  /**
   * Удаление позиции из корзины
   */
  async removeItem(userId: string, itemId: string): Promise<CartResponse> {
    const rawCart = await this.getOrCreateRawCart(userId);

    const cartItem = await this.prisma.cartItem.findFirst({
      where: {
        id: itemId,
        cartId: rawCart.id,
      },
    });

    if (!cartItem) {
      throw new NotFoundError("CART_ITEM_NOT_FOUND", "Позиция не найдена в вашей корзине");
    }

    await this.prisma.cartItem.delete({
      where: { id: itemId },
    });

    await this.prisma.cart.update({
      where: { id: rawCart.id },
      data: { updatedAt: new Date() },
    });

    return this.getUserCart(userId);
  }

  /**
   * Полная очистка корзины текущего пользователя
   */
  async clearCart(userId: string): Promise<CartResponse> {
    const rawCart = await this.getOrCreateRawCart(userId);

    await this.prisma.cartItem.deleteMany({
      where: { cartId: rawCart.id },
    });

    await this.prisma.cart.update({
      where: { id: rawCart.id },
      data: { updatedAt: new Date() },
    });

    return this.getUserCart(userId);
  }
}
