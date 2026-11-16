import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  Query,
  Req,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { FastifyRequest } from "fastify";
import { Role, PrismaClient } from "@prisma/client";
import { extractAuthUser, checkRolePermissions } from "./auth.guard";
import {
  ForbiddenError,
  NotFoundError,
  UnprocessableEntityError,
} from "../../utils/errors";
import { isAllowedOrigin } from "../../config/http.config";
import { PrismaService } from "../../lib/prisma.service";
import { z } from "zod";

const UserQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  role: z.nativeEnum(Role).optional(),
  isActive: z.enum(["true", "false"]).optional(),
});

const UpdateRoleSchema = z.object({
  role: z.nativeEnum(Role),
});

const UpdateStatusSchema = z.object({
  isActive: z.boolean(),
});

/**
 * Административный HTTP-контроллер управления пользователями.
 * Доступ строго ограничен ролью ADMIN.
 */
@Controller("admin/users")
export class UsersAdminController {
  private prisma: PrismaClient;

  constructor(prismaService: PrismaService) {
    this.prisma = prismaService.client;
  }

  private authenticateAdmin(req: FastifyRequest) {
    const origin = req.headers["origin"] as string | undefined;
    if (origin && !isAllowedOrigin(origin)) {
      throw new ForbiddenError(
        "CSRF_FORBIDDEN",
        `Запрос с источника '${origin}' заблокирован политикой CORS/CSRF`
      );
    }
    const user = extractAuthUser(req.headers.authorization);
    checkRolePermissions(user.role, [Role.ADMIN]);
    return user;
  }

  /**
   * GET /api/v1/admin/users
   * Список пользователей с пагинацией и поиском
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  async getUsers(@Req() req: FastifyRequest) {
    this.authenticateAdmin(req);

    const parseRes = UserQuerySchema.safeParse(req.query);
    if (!parseRes.success) {
      throw new UnprocessableEntityError(
        "VALIDATION_ERROR",
        "Некорректные параметры запроса списка пользователей",
        parseRes.error.format()
      );
    }

    const { page, limit, search, role, isActive } = parseRes.data;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (role) {
      where.role = role;
    }

    if (isActive !== undefined) {
      where.isActive = isActive === "true";
    }

    if (search && search.trim()) {
      const q = search.trim();
      where.OR = [
        { email: { contains: q, mode: "insensitive" } },
        { firstName: { contains: q, mode: "insensitive" } },
        { lastName: { contains: q, mode: "insensitive" } },
        { phone: { contains: q, mode: "insensitive" } },
      ];
    }

    const [total, users] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          email: true,
          role: true,
          firstName: true,
          lastName: true,
          phone: true,
          isEmailVerified: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              orders: true,
              entitlements: true,
            },
          },
        },
      }),
    ]);

    return {
      success: true,
      data: {
        users,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
      meta: { timestamp: new Date().toISOString() },
    };
  }

  /**
   * GET /api/v1/admin/users/:id
   * Детальная информация о пользователе
   */
  @Get(":id")
  @HttpCode(HttpStatus.OK)
  async getUserById(@Param("id") id: string, @Req() req: FastifyRequest) {
    this.authenticateAdmin(req);

    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        role: true,
        firstName: true,
        lastName: true,
        phone: true,
        isEmailVerified: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            orders: true,
            entitlements: true,
            sessions: true,
          },
        },
        orders: {
          take: 5,
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            orderNumber: true,
            totalAmount: true,
            currency: true,
            status: true,
            createdAt: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundError("USER_NOT_FOUND", "Пользователь не найден");
    }

    return {
      success: true,
      data: user,
      meta: { timestamp: new Date().toISOString() },
    };
  }

  /**
   * PATCH /api/v1/admin/users/:id/role
   * Назначение роли пользователю (CUSTOMER, CONTENT_MANAGER, ADMIN)
   */
  @Patch(":id/role")
  @HttpCode(HttpStatus.OK)
  async updateUserRole(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() req: FastifyRequest
  ) {
    const currentAdmin = this.authenticateAdmin(req);

    const parseRes = UpdateRoleSchema.safeParse(body);
    if (!parseRes.success) {
      throw new UnprocessableEntityError(
        "VALIDATION_ERROR",
        "Некорректная роль пользователя",
        parseRes.error.format()
      );
    }

    const targetUser = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!targetUser) {
      throw new NotFoundError("USER_NOT_FOUND", "Пользователь не найден");
    }

    // Защита: администратор не может понизить сам себя, если он единственный
    if (currentAdmin.sub === id && parseRes.data.role !== Role.ADMIN) {
      const adminCount = await this.prisma.user.count({
        where: { role: Role.ADMIN, isActive: true },
      });
      if (adminCount <= 1) {
        throw new ForbiddenError(
          "CANNOT_DEMOTE_SOLE_ADMIN",
          "Нельзя понизить роль единственного администратора системы"
        );
      }
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: { role: parseRes.data.role },
      select: {
        id: true,
        email: true,
        role: true,
        firstName: true,
        lastName: true,
        isActive: true,
        updatedAt: true,
      },
    });

    return {
      success: true,
      data: updated,
      meta: { timestamp: new Date().toISOString() },
    };
  }

  /**
   * PATCH /api/v1/admin/users/:id/status
   * Блокировка или активация аккаунта пользователя
   */
  @Patch(":id/status")
  @HttpCode(HttpStatus.OK)
  async updateUserStatus(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() req: FastifyRequest
  ) {
    const currentAdmin = this.authenticateAdmin(req);

    const parseRes = UpdateStatusSchema.safeParse(body);
    if (!parseRes.success) {
      throw new UnprocessableEntityError(
        "VALIDATION_ERROR",
        "Некорректный статус активности",
        parseRes.error.format()
      );
    }

    if (currentAdmin.sub === id && !parseRes.data.isActive) {
      throw new ForbiddenError(
        "CANNOT_DEACTIVATE_SELF",
        "Администратор не может заблокировать собственный аккаунт"
      );
    }

    const targetUser = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!targetUser) {
      throw new NotFoundError("USER_NOT_FOUND", "Пользователь не найден");
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: { isActive: parseRes.data.isActive },
      select: {
        id: true,
        email: true,
        role: true,
        firstName: true,
        lastName: true,
        isActive: true,
        updatedAt: true,
      },
    });

    return {
      success: true,
      data: updated,
      meta: { timestamp: new Date().toISOString() },
    };
  }
}
