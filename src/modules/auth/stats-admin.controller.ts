import {
  Controller,
  Get,
  Req,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { FastifyRequest } from "fastify";
import { Role, PrismaClient, OrderStatus } from "@prisma/client";
import { extractAuthUser, checkRolePermissions } from "./auth.guard";
import { ForbiddenError } from "../../utils/errors";
import { isAllowedOrigin } from "../../config/http.config";
import { PrismaService } from "../../lib/prisma.service";

/**
 * Административный HTTP-контроллер ключевых показателей и статистики магазина
 */
@Controller("admin/stats")
export class StatsAdminController {
  private prisma: PrismaClient;

  constructor(prismaService: PrismaService) {
    this.prisma = prismaService.client;
  }

  private authenticateStaff(req: FastifyRequest) {
    const origin = req.headers["origin"] as string | undefined;
    if (origin && !isAllowedOrigin(origin)) {
      throw new ForbiddenError(
        "CSRF_FORBIDDEN",
        `Запрос с источника '${origin}' заблокирован политикой CORS/CSRF`
      );
    }
    const user = extractAuthUser(req.headers.authorization);
    checkRolePermissions(user.role, [Role.ADMIN, Role.CONTENT_MANAGER]);
    return user;
  }

  /**
   * GET /api/v1/admin/stats
   * Сводные аналитические метрики для главной страницы панели управления
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  async getDashboardStats(@Req() req: FastifyRequest) {
    this.authenticateStaff(req);

    const [
      totalProducts,
      publishedProducts,
      draftProducts,
      totalCategories,
      totalOrders,
      paidOrders,
      pendingOrders,
      totalUsers,
      recentOrders,
      recentUsers,
      revenueAggregate,
    ] = await Promise.all([
      this.prisma.product.count(),
      this.prisma.product.count({ where: { isActive: true } }),
      this.prisma.product.count({ where: { isActive: false } }),
      this.prisma.category.count(),
      this.prisma.order.count(),
      this.prisma.order.count({ where: { status: OrderStatus.PAID } }),
      this.prisma.order.count({ where: { status: OrderStatus.PENDING } }),
      this.prisma.user.count(),
      this.prisma.order.findMany({
        take: 5,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          orderNumber: true,
          customerEmail: true,
          totalAmount: true,
          currency: true,
          status: true,
          createdAt: true,
          _count: { select: { items: true } },
        },
      }),
      this.prisma.user.findMany({
        take: 5,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          email: true,
          role: true,
          firstName: true,
          lastName: true,
          isActive: true,
          createdAt: true,
        },
      }),
      this.prisma.order.aggregate({
        where: { status: OrderStatus.PAID },
        _sum: { totalAmount: true },
      }),
    ]);

    const totalRevenue = Number(revenueAggregate._sum.totalAmount || 0);

    return {
      success: true,
      data: {
        products: {
          total: totalProducts,
          published: publishedProducts,
          draft: draftProducts,
        },
        categories: {
          total: totalCategories,
        },
        orders: {
          total: totalOrders,
          paid: paidOrders,
          pending: pendingOrders,
        },
        revenue: {
          totalAmount: totalRevenue,
          currency: "KGS",
        },
        users: {
          total: totalUsers,
        },
        recentOrders,
        recentUsers,
      },
      meta: { timestamp: new Date().toISOString() },
    };
  }
}
