import { Injectable, Optional } from "@nestjs/common";
import { PrismaClient, OrderStatus, Role, Prisma } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { PrismaService } from "../../lib/prisma.service";
import { prisma as defaultPrisma } from "../../lib/prisma";
import { AccessTokenPayload } from "../../utils/jwt";
import { CheckoutDto, OrderQueryDto } from "./orders.dto";
import { calculateEffectivePrice } from "../../utils/pricing";
import {
  NotFoundError,
  BadRequestError,
  ForbiddenError,
  UnprocessableEntityError,
} from "../../utils/errors";
import { assertPatternAvailable } from "../../utils/pattern-availability";

export interface OrderItemResponse {
  id: string;
  variantId: string;
  priceAtPurchase: number;
  productSnapshot: any;
  createdAt: string;
}

export interface OrderDetailResponse {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  totalAmount: number;
  currency: string;
  customerEmail: string;
  customerName: string;
  customerPhone: string | null;
  itemsCount: number;
  items: OrderItemResponse[];
  user?: { id: string; email: string; firstName: string | null; lastName: string | null } | null;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class OrdersService {
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
   * Оформление заказа из корзины авторизованного покупателя с транзакционной гарантией целостности
   */
  async checkout(user: AccessTokenPayload, dto: CheckoutDto) {
    return await this.prisma.$transaction(
      async (tx) => {
      // 1. Получаем корзину покупателя вместе с позициями, вариантами и товарами
      const cart = await tx.cart.findFirst({
        where: { userId: user.sub },
        include: {
          items: {
            include: {
              variant: {
                include: {
                  product: true,
                  size: true,
                  height: true,
                  format: true,
                  digitalFiles: {
                    where: { isActive: true },
                    include: {
                      currentVersion: true,
                      versions: true,
                    },
                  },
                },
              },
            },
            orderBy: { createdAt: "asc" },
          },
        },
      });

      if (!cart || cart.items.length === 0) {
        throw new UnprocessableEntityError("CART_EMPTY", "Невозможно оформить заказ с пустой корзиной");
      }

      // 2. Повторная проверка активности всех товаров, вариантов и наличия готовых PDF-выкроек в корзине
      for (const item of cart.items) {
        if (!item.variant.product.isActive) {
          throw new BadRequestError(
            "PRODUCT_INACTIVE",
            `Выкройка «${item.variant.product.title}» снята с продажи и недоступна для оформления`
          );
        }
        if (!item.variant.isActive) {
          throw new BadRequestError(
            "VARIANT_INACTIVE",
            `Вариант «${item.variant.sku}» для выкройки «${item.variant.product.title}» недоступен для заказа`
          );
        }
        // Защита: проверяем наличие действующего производственного PDF-лекала
        let childVariants: any[] | undefined = undefined;
        if (item.variant.size?.code === "ALL") {
          childVariants = await tx.productVariant.findMany({
            where: {
              productId: item.variant.productId,
              heightId: item.variant.heightId,
              formatId: item.variant.formatId,
              isActive: true,
              size: { code: { not: "ALL" } },
            },
            include: {
              digitalFiles: {
                where: { isActive: true },
                include: {
                  currentVersion: true,
                  versions: true,
                },
              },
            },
          });
        }

        assertPatternAvailable(item.variant, undefined, childVariants);
      }

      // 3. Данные покупателя из профиля или переданного DTO
      const userProfile = await tx.user.findUnique({
        where: { id: user.sub },
      });

      const customerEmail = dto.customerEmail || userProfile?.email || user.email;
      const fullName = [userProfile?.firstName, userProfile?.lastName].filter(Boolean).join(" ");
      const customerName = dto.customerName || (fullName.length > 0 ? fullName : "Покупатель");
      const customerPhone = dto.customerPhone !== undefined ? dto.customerPhone : userProfile?.phone || null;

      // 4. Серверный расчёт цен позиций и итоговой стоимости в KGS
      let total = 0;
      const orderItemsData = cart.items.map((item) => {
        const v = item.variant;
        const isBundleVariant = v.size.code === "ALL";
        const pricing = calculateEffectivePrice(
          {
            basePrice: v.product.basePrice,
            discountPrice: v.product.discountPrice,
            discountFrom: v.product.discountFrom,
            discountUntil: v.product.discountUntil,
            bundlePrice: v.product.bundlePrice,
          },
          { isBundleVariant, priceOverride: v.priceOverride }
        );
        const price = pricing.currentPrice;
        total += price;

        const productSnapshot = {
          productId: v.product.id,
          title: v.product.title,
          slug: v.product.slug,
          sku: v.sku,
          difficultyLevel: v.product.difficultyLevel,
          size: { id: v.size.id, code: v.size.code, label: v.size.label },
          height: { id: v.height.id, code: v.height.code, label: v.height.label },
          format: { id: v.format.id, code: v.format.code, label: v.format.label },
          price,
          originalPrice: pricing.originalPrice,
          isDiscountActive: pricing.isDiscountActive,
          isBundle: pricing.isBundle,
          currency: "KGS",
        };

        return {
          productVariantId: v.id,
          priceAtPurchase: new Prisma.Decimal(price),
          productSnapshot,
        };
      });

      const roundedTotal = Math.round(total * 100) / 100;

      // 5. Генерация уникального номера заказа
      const year = new Date().getFullYear();
      const hex = randomBytes(4).toString("hex").toUpperCase();
      const orderNumber = `LZ-${year}-${hex}`;

      // 6. Создание заказа и его позиций
      const order = await tx.order.create({
        data: {
          orderNumber,
          userId: user.sub,
          customerEmail,
          customerName,
          customerPhone,
          totalAmount: new Prisma.Decimal(roundedTotal),
          currency: "KGS",
          status: OrderStatus.PENDING,
          items: {
            create: orderItemsData,
          },
        },
        include: {
          items: true,
        },
      });

      // 7. Очистка корзины покупателя только после успешного создания заказа
      await tx.cartItem.deleteMany({
        where: { cartId: cart.id },
      });

      await tx.cart.update({
        where: { id: cart.id },
        data: { updatedAt: new Date() },
      });

      // 8. Возврат данных созданного заказа
      return {
        orderId: order.id,
        orderNumber: order.orderNumber,
        totalAmount: roundedTotal,
        currency: order.currency,
        status: order.status,
        customerEmail: order.customerEmail,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        itemsCount: order.items.length,
        createdAt: order.createdAt.toISOString(),
      };
    },
    { maxWait: 15000, timeout: 25000 });
  }

  /**
   * Получение списка заказов текущего покупателя
   */
  async getUserOrders(userId: string): Promise<OrderDetailResponse[]> {
    const orders = await this.prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: {
        items: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    return orders.map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      totalAmount: Number(order.totalAmount),
      currency: order.currency,
      customerEmail: order.customerEmail,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      itemsCount: order.items.length,
      items: order.items.map((item) => ({
        id: item.id,
        variantId: item.productVariantId,
        priceAtPurchase: Number(item.priceAtPurchase),
        productSnapshot: item.productSnapshot,
        createdAt: item.createdAt.toISOString(),
      })),
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
    }));
  }

  /**
   * Получение подробной информации о конкретном заказе с проверкой принадлежности
   */
  async getOrderById(user: AccessTokenPayload, orderId: string): Promise<OrderDetailResponse> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!order) {
      throw new NotFoundError("ORDER_NOT_FOUND", "Заказ не найден");
    }

    // Проверка принадлежности заказа: только владелец или персонал (ADMIN, CONTENT_MANAGER)
    const isStaff = user.role === Role.ADMIN || user.role === Role.CONTENT_MANAGER;
    if (order.userId !== user.sub && !isStaff) {
      throw new ForbiddenError("FORBIDDEN", "Доступ к чужому заказу запрещен");
    }

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      totalAmount: Number(order.totalAmount),
      currency: order.currency,
      customerEmail: order.customerEmail,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      itemsCount: order.items.length,
      items: order.items.map((item) => ({
        id: item.id,
        variantId: item.productVariantId,
        priceAtPurchase: Number(item.priceAtPurchase),
        productSnapshot: item.productSnapshot,
        createdAt: item.createdAt.toISOString(),
      })),
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
    };
  }

  /**
   * Административный просмотр списка всех заказов с фильтрацией и пагинацией
   */
  async getAdminOrders(query: OrderQueryDto) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(50, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.OrderWhereInput = {};
    if (query.status) {
      where.status = query.status;
    }
    if (query.customerEmail) {
      where.customerEmail = {
        contains: query.customerEmail.trim(),
        mode: "insensitive",
      };
    }

    const [totalItems, orders] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          items: true,
          user: {
            select: { id: true, email: true, firstName: true, lastName: true },
          },
        },
      }),
    ]);

    return {
      items: orders.map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        totalAmount: Number(order.totalAmount),
        currency: order.currency,
        customerEmail: order.customerEmail,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        itemsCount: order.items.length,
        user: order.user,
        createdAt: order.createdAt.toISOString(),
        updatedAt: order.updatedAt.toISOString(),
      })),
      meta: {
        page,
        limit,
        totalItems,
        totalPages: Math.ceil(totalItems / limit),
      },
    };
  }

  /**
   * Административный просмотр детальной информации о любом заказе
   */
  async getAdminOrderById(orderId: string): Promise<OrderDetailResponse> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: {
          orderBy: { createdAt: "asc" },
        },
        user: {
          select: { id: true, email: true, firstName: true, lastName: true, phone: true },
        },
      },
    });

    if (!order) {
      throw new NotFoundError("ORDER_NOT_FOUND", "Заказ не найден");
    }

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      totalAmount: Number(order.totalAmount),
      currency: order.currency,
      customerEmail: order.customerEmail,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      itemsCount: order.items.length,
      user: order.user,
      items: order.items.map((item) => ({
        id: item.id,
        variantId: item.productVariantId,
        priceAtPurchase: Number(item.priceAtPurchase),
        productSnapshot: item.productSnapshot,
        createdAt: item.createdAt.toISOString(),
      })),
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
    };
  }
}
