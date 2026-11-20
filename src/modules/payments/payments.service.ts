import { Injectable, Optional, Inject } from "@nestjs/common";
import { PrismaClient, OrderStatus, PaymentStatus, WebhookStatus, Role, EntitlementStatus } from "@prisma/client";
import * as crypto from "node:crypto";
import { PrismaService } from "../../lib/prisma.service";
import { prisma as defaultPrisma } from "../../lib/prisma";
import { AccessTokenPayload } from "../../utils/jwt";
import {
  IPaymentGateway,
  PAYMENT_GATEWAY,
} from "./interfaces/payment-gateway.interface";
import { MockPaymentGateway } from "./gateways/mock-payment.gateway";
import { AdminWebhookEventsQueryDto } from "./payments.dto";
import {
  NotFoundError,
  BadRequestError,
  ForbiddenError,
  UnauthorizedError,
} from "../../utils/errors";

export interface InitiatePaymentResponse {
  paymentId: string;
  paymentUrl: string;
  idempotencyKey: string;
  amount: number;
  currency: string;
  isNewAttempt: boolean;
}

export interface OrderPaymentStatusResponse {
  orderId: string;
  orderNumber: string;
  orderStatus: OrderStatus;
  totalAmount: number;
  currency: string;
  isPaid: boolean;
  payments: Array<{
    id: string;
    paymentGateway: string;
    status: PaymentStatus;
    amount: number;
    currency: string;
    createdAt: string;
    updatedAt: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class PaymentsService {
  private prisma: PrismaClient;
  private gateway: IPaymentGateway;

  constructor(
    @Optional() @Inject(PAYMENT_GATEWAY) gateway?: IPaymentGateway,
    @Optional() prismaService?: PrismaService,
    @Optional() customPrisma?: PrismaClient
  ) {
    this.gateway = gateway || new MockPaymentGateway();
    if (customPrisma) {
      this.prisma = customPrisma;
    } else if (prismaService?.client) {
      this.prisma = prismaService.client;
    } else {
      this.prisma = defaultPrisma;
    }
  }

  /**
   * Инициализация платёжной попытки для существующего заказа
   */
  async initiatePayment(
    user: AccessTokenPayload,
    orderId: string,
    isRetry = false
  ): Promise<InitiatePaymentResponse> {
    // 1. Поиск заказа и истории платежей
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        payments: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!order) {
      throw new NotFoundError("ORDER_NOT_FOUND", "Заказ не найден");
    }

    // 2. Проверка прав владения заказом
    const isStaff = user.role === Role.ADMIN || user.role === Role.CONTENT_MANAGER;
    if (order.userId !== user.sub && !isStaff) {
      throw new ForbiddenError("FORBIDDEN", "Доступ к чужому заказу запрещен");
    }

    // 3. Проверка статуса заказа
    if (order.status === OrderStatus.PAID) {
      throw new BadRequestError("ORDER_ALREADY_PAID", "Заказ уже успешно оплачен");
    }
    if (order.status === OrderStatus.CANCELLED) {
      throw new BadRequestError("ORDER_CANCELLED", "Нельзя оплатить отмененный заказ");
    }

    // 4. Проверка существующих платежей
    const succeededPayment = order.payments.find((p) => p.status === PaymentStatus.SUCCEEDED);
    if (succeededPayment) {
      throw new BadRequestError("ORDER_ALREADY_PAID", "Заказ уже успешно оплачен");
    }

    // Если это не повторная попытка (не retry), проверяем свежий PENDING-платеж (< 15 минут)
    // чтобы не плодить активные платёжные попытки без необходимости
    const recentPending = order.payments.find(
      (p) =>
        p.status === PaymentStatus.PENDING &&
        Date.now() - p.createdAt.getTime() < 15 * 60 * 1000
    );

    if (!isRetry && recentPending) {
      const paymentUrl = `https://mock-gateway.example.kg/pay/${recentPending.idempotencyKey}?order=${encodeURIComponent(
        order.orderNumber
      )}&amount=${Number(order.totalAmount)}&currency=${order.currency}`;

      return {
        paymentId: recentPending.id,
        paymentUrl,
        idempotencyKey: recentPending.idempotencyKey,
        amount: Number(order.totalAmount),
        currency: order.currency,
        isNewAttempt: false,
      };
    }

    // 5. Если это retry: аннулируем старые PENDING-платежи
    if (isRetry) {
      await this.prisma.payment.updateMany({
        where: {
          orderId: order.id,
          status: PaymentStatus.PENDING,
        },
        data: {
          status: PaymentStatus.CANCELED,
        },
      });
    }

    // 6. Формирование нового idempotencyKey и создание записи Payment
    const idempotencyKey = `pay_${order.id.slice(0, 8)}_${crypto.randomBytes(8).toString("hex")}`;

    const payment = await this.prisma.payment.create({
      data: {
        orderId: order.id,
        paymentGateway: this.gateway.gatewayName,
        idempotencyKey,
        amount: order.totalAmount, // Серверная сумма из заказа!
        currency: order.currency, // KGS
        status: PaymentStatus.PENDING,
      },
    });

    // 7. Инициализация в платёжном адаптере
    const gatewayResult = await this.gateway.initiatePayment({
      orderId: order.id,
      orderNumber: order.orderNumber,
      amount: Number(order.totalAmount),
      currency: order.currency,
      customerEmail: order.customerEmail,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      idempotencyKey,
    });

    // 8. Обновление внешнего ID транзакции
    const updated = await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        externalId: gatewayResult.externalId,
        gatewayPayload: gatewayResult.gatewayPayload,
      },
    });

    return {
      paymentId: updated.id,
      paymentUrl: gatewayResult.paymentUrl,
      idempotencyKey,
      amount: Number(order.totalAmount),
      currency: order.currency,
      isNewAttempt: true,
    };
  }

  /**
   * Повторная попытка оплаты (Payment Retry)
   */
  async retryPayment(
    user: AccessTokenPayload,
    orderId: string
  ): Promise<InitiatePaymentResponse> {
    return this.initiatePayment(user, orderId, true);
  }

  /**
   * Получение актуального статуса оплаты заказа покупателем (Customer Order Payment Status)
   */
  async getPaymentStatus(
    user: AccessTokenPayload,
    orderId: string
  ): Promise<OrderPaymentStatusResponse> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        payments: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!order) {
      throw new NotFoundError("ORDER_NOT_FOUND", "Заказ не найден");
    }

    const isStaff = user.role === Role.ADMIN || user.role === Role.CONTENT_MANAGER;
    if (order.userId !== user.sub && !isStaff) {
      throw new ForbiddenError("FORBIDDEN", "Доступ к чужому заказу запрещен");
    }

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      orderStatus: order.status,
      totalAmount: Number(order.totalAmount),
      currency: order.currency,
      isPaid: order.status === OrderStatus.PAID,
      payments: order.payments.map((p) => ({
        id: p.id,
        paymentGateway: p.paymentGateway,
        status: p.status,
        amount: Number(p.amount),
        currency: p.currency,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
      })),
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
    };
  }

  /**
   * Идемпотентная обработка входящего вебхука от эквайринга с транзакционной гарантией
   */
  async handleWebhook(
    gatewayName: string,
    headers: Record<string, any>,
    rawBody: unknown
  ) {
    // 1. Первичное протоколирование сырого вебхука в БД
    const webhookEvent = await this.prisma.paymentWebhookEvent.create({
      data: {
        paymentGateway: gatewayName,
        headers: (headers || {}) as any,
        rawPayload: (rawBody || {}) as any,
        status: WebhookStatus.RECEIVED,
      },
    });

    // 2. Проверка криптографической подписи вебхука
    const isSignatureValid = this.gateway.verifyWebhookSignature(headers, rawBody);
    if (!isSignatureValid) {
      await this.prisma.paymentWebhookEvent.update({
        where: { id: webhookEvent.id },
        data: {
          status: WebhookStatus.FAILED,
          errorMessage: "SIGNATURE_VERIFICATION_FAILED: Неверная цифровая подпись вебхука",
          processedAt: new Date(),
        },
      });

      throw new UnauthorizedError(
        "SIGNATURE_VERIFICATION_FAILED",
        "Цифровая подпись уведомления шлюза не прошла проверку подлинности"
      );
    }

    // 3. Разбор полезной нагрузки
    const parsed = this.gateway.parseWebhookPayload(rawBody);

    // 4. Атомарное обновление в рамках транзакции PostgreSQL
    return await this.prisma.$transaction(async (tx) => {
      // Ищем заказ
      const order = await tx.order.findUnique({
        where: { id: parsed.orderId },
        include: {
          payments: {
            orderBy: { createdAt: "desc" },
          },
          items: {
            include: {
              variant: {
                include: {
                  size: true,
                },
              },
            },
          },
        },
      });

      if (!order) {
        await tx.paymentWebhookEvent.update({
          where: { id: webhookEvent.id },
          data: {
            status: WebhookStatus.FAILED,
            errorMessage: `Заказ ${parsed.orderId} не найден в системе`,
            processedAt: new Date(),
          },
        });
        throw new NotFoundError("ORDER_NOT_FOUND", "Заказ, указанный в уведомлении, не найден");
      }

      // Ищем платёж (по paymentId, externalId или последний PENDING)
      let payment = null;
      if (parsed.paymentId) {
        payment = order.payments.find((p) => p.id === parsed.paymentId);
      } else if (parsed.idempotencyKey) {
        payment = order.payments.find((p) => p.idempotencyKey === parsed.idempotencyKey);
      } else if (parsed.externalId) {
        payment = order.payments.find((p) => p.externalId === parsed.externalId);
      }

      if (!payment) {
        payment =
          order.payments.find((p) => p.status === PaymentStatus.PENDING) ||
          order.payments[0];
      }

      if (!payment) {
        await tx.paymentWebhookEvent.update({
          where: { id: webhookEvent.id },
          data: {
            status: WebhookStatus.FAILED,
            errorMessage: `Платёжная запись для заказа ${order.id} не найдена`,
            processedAt: new Date(),
          },
        });
        throw new NotFoundError("PAYMENT_NOT_FOUND", "Платёжная запись не найдена");
      }

      // 5. Проверка соответствия суммы (с допустимой погрешностью 0.01 сом)
      if (Math.abs(Number(payment.amount) - Number(parsed.amount)) > 0.01) {
        await tx.paymentWebhookEvent.update({
          where: { id: webhookEvent.id },
          data: {
            status: WebhookStatus.FAILED,
            errorMessage: `AMOUNT_MISMATCH: Сумма в вебхуке (${parsed.amount}) не совпадает с суммой платежа (${payment.amount})`,
            paymentId: payment.id,
            processedAt: new Date(),
          },
        });
        throw new BadRequestError(
          "AMOUNT_MISMATCH",
          `Сумма в уведомлении (${parsed.amount}) не совпадает с суммой платежа (${payment.amount})`
        );
      }

      // 6. Проверка соответствия валюты (KGS)
      if (payment.currency !== parsed.currency) {
        await tx.paymentWebhookEvent.update({
          where: { id: webhookEvent.id },
          data: {
            status: WebhookStatus.FAILED,
            errorMessage: `CURRENCY_MISMATCH: Валюта в вебхуке (${parsed.currency}) не совпадает с валютой платежа (${payment.currency})`,
            paymentId: payment.id,
            processedAt: new Date(),
          },
        });
        throw new BadRequestError(
          "CURRENCY_MISMATCH",
          `Валюта в уведомлении (${parsed.currency}) не совпадает с валютой платежа (${payment.currency})`
        );
      }

      // 7. Проверка идемпотентности: если заказ уже PAID и платёж SUCCEEDED
      if (order.status === OrderStatus.PAID && payment.status === PaymentStatus.SUCCEEDED) {
        await tx.paymentWebhookEvent.update({
          where: { id: webhookEvent.id },
          data: {
            status: WebhookStatus.PROCESSED,
            paymentId: payment.id,
            processedAt: new Date(),
          },
        });
        return { received: true, idempotent: true };
      }

      // 8. Обновление статусов платежа и заказа
      if (parsed.status === PaymentStatus.SUCCEEDED) {
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: PaymentStatus.SUCCEEDED,
            externalId: parsed.externalId || payment.externalId,
            updatedAt: new Date(),
          },
        });

        await tx.order.update({
          where: { id: order.id },
          data: {
            status: OrderStatus.PAID,
            updatedAt: new Date(),
          },
        });

        // Атомарная выдача цифровых прав PurchaseEntitlement для каждой позиции заказа
        let targetUserId = order.userId;
        if (!targetUserId && order.customerEmail) {
          const userRecord = await tx.user.findUnique({
            where: { email: order.customerEmail },
          });
          if (userRecord) {
            targetUserId = userRecord.id;
          }
        }

        if (targetUserId && order.items && order.items.length > 0) {
          for (const item of order.items) {
            const variant = item.variant;
            const isBundle = variant?.size?.code === "ALL";

            if (isBundle) {
              // Комплект ALL: находим все размеры этого товара для выбранного роста и формата
              const childVariants = await tx.productVariant.findMany({
                where: {
                  productId: variant.productId,
                  heightId: variant.heightId,
                  formatId: variant.formatId,
                  isActive: true,
                  size: { code: { not: "ALL" } },
                },
              });

              for (const cVar of childVariants) {
                await tx.purchaseEntitlement.upsert({
                  where: {
                    user_variant_unique: {
                      userId: targetUserId,
                      variantId: cVar.id,
                    },
                  },
                  create: {
                    userId: targetUserId,
                    orderItemId: item.id,
                    variantId: cVar.id,
                    status: EntitlementStatus.ACTIVE,
                    downloadCount: 0,
                  },
                  update: {
                    status: EntitlementStatus.ACTIVE,
                    orderItemId: item.id,
                    updatedAt: new Date(),
                  },
                });
              }

              // Если для самого варианта ALL загружен отдельный производственный PDF
              const hasAllFile = await tx.digitalFile.findFirst({
                where: { variantId: variant.id, isActive: true },
              });
              if (hasAllFile) {
                await tx.purchaseEntitlement.upsert({
                  where: {
                    user_variant_unique: {
                      userId: targetUserId,
                      variantId: variant.id,
                    },
                  },
                  create: {
                    userId: targetUserId,
                    orderItemId: item.id,
                    variantId: variant.id,
                    status: EntitlementStatus.ACTIVE,
                    downloadCount: 0,
                  },
                  update: {
                    status: EntitlementStatus.ACTIVE,
                    orderItemId: item.id,
                    updatedAt: new Date(),
                  },
                });
              }
            } else {
              // Обычная покупка одного размера
              await tx.purchaseEntitlement.upsert({
                where: {
                  user_variant_unique: {
                    userId: targetUserId,
                    variantId: item.productVariantId,
                  },
                },
                create: {
                  userId: targetUserId,
                  orderItemId: item.id,
                  variantId: item.productVariantId,
                  status: EntitlementStatus.ACTIVE,
                  downloadCount: 0,
                },
                update: {
                  status: EntitlementStatus.ACTIVE,
                  orderItemId: item.id,
                  updatedAt: new Date(),
                },
              });
            }
          }
        }

        await tx.paymentWebhookEvent.update({
          where: { id: webhookEvent.id },
          data: {
            status: WebhookStatus.PROCESSED,
            paymentId: payment.id,
            processedAt: new Date(),
          },
        });

        return { received: true, orderId: order.id, status: OrderStatus.PAID };
      } else if (
        parsed.status === PaymentStatus.FAILED ||
        parsed.status === PaymentStatus.CANCELED
      ) {
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: parsed.status,
            externalId: parsed.externalId || payment.externalId,
            updatedAt: new Date(),
          },
        });

        await tx.paymentWebhookEvent.update({
          where: { id: webhookEvent.id },
          data: {
            status: WebhookStatus.PROCESSED,
            paymentId: payment.id,
            processedAt: new Date(),
          },
        });

        return { received: true, orderId: order.id, status: parsed.status };
      }

      await tx.paymentWebhookEvent.update({
        where: { id: webhookEvent.id },
        data: {
          status: WebhookStatus.IGNORED,
          paymentId: payment.id,
          processedAt: new Date(),
        },
      });

      return { received: true, status: "IGNORED" };
    },
    { maxWait: 15000, timeout: 25000 });
  }

  /**
   * Административный аудит входящих вебхуков (без утечки секретов и чувствительных данных)
   */
  async getAdminWebhookEvents(query: AdminWebhookEventsQueryDto) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(50, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.status) {
      where.status = query.status;
    }
    if (query.gateway) {
      where.paymentGateway = query.gateway.trim();
    }

    const [totalItems, events] = await Promise.all([
      this.prisma.paymentWebhookEvent.count({ where }),
      this.prisma.paymentWebhookEvent.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          paymentGateway: true,
          eventType: true,
          externalEventId: true,
          paymentId: true,
          status: true,
          errorMessage: true,
          retryCount: true,
          createdAt: true,
          processedAt: true,
        },
      }),
    ]);

    return {
      items: events.map((ev) => ({
        ...ev,
        createdAt: ev.createdAt.toISOString(),
        processedAt: ev.processedAt ? ev.processedAt.toISOString() : null,
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
   * Эмуляция ответа эквайринга в тестовом окружении с генерацией валидного подписанного вебхука
   */
  async simulatePaymentResult(
    user: AccessTokenPayload,
    orderId: string,
    targetStatus: "SUCCEEDED" | "FAILED" | "CANCELED"
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        payments: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!order) {
      throw new NotFoundError("ORDER_NOT_FOUND", "Заказ не найден");
    }

    const isStaff = user.role === Role.ADMIN || user.role === Role.CONTENT_MANAGER;
    if (order.userId !== user.sub && !isStaff) {
      throw new ForbiddenError("FORBIDDEN", "Доступ к чужому заказу запрещен");
    }

    const payment = order.payments[0];
    if (!payment) {
      throw new NotFoundError("PAYMENT_NOT_FOUND", "Платёжная запись не найдена");
    }

    if (order.status === OrderStatus.PAID && payment.status === PaymentStatus.SUCCEEDED) {
      return { success: true, message: "Заказ уже оплачен", status: PaymentStatus.SUCCEEDED };
    }

    // Формируем полезную нагрузку вебхука
    const payload = {
      orderId: order.id,
      orderNumber: order.orderNumber,
      paymentId: payment.id,
      externalId: payment.externalId || `mock_ext_${payment.idempotencyKey}`,
      idempotencyKey: payment.idempotencyKey,
      amount: Number(payment.amount),
      currency: payment.currency,
      status: targetStatus,
      timestamp: new Date().toISOString(),
    };

    // Генерируем эталонную HMAC-SHA256 подпись
    const signature = (this.gateway as MockPaymentGateway).generateSignature(payload);

    // Вызываем стандартный верифицированный обработчик вебхуков
    const result = await this.handleWebhook("mock", { "x-signature": signature }, payload);

    return {
      success: true,
      result,
      status: targetStatus,
    };
  }
}
