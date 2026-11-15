import {
  Controller,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Req,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { FastifyRequest } from "fastify";
import { Role } from "@prisma/client";
import { CatalogService } from "./catalog.service";
import {
  CreateCategorySchema,
  UpdateCategorySchema,
  CreateProductSchema,
  UpdateProductSchema,
  BatchVariantsSchema,
  AddProductImageSchema,
} from "./catalog.dto";
import { extractAuthUser, checkRolePermissions } from "../auth/auth.guard";
import { UnprocessableEntityError, ForbiddenError } from "../../utils/errors";
import { isAllowedOrigin } from "../../config/http.config";

@Controller("admin")
export class CatalogAdminController {
  constructor(private readonly catalogService: CatalogService) {}

  /**
   * Проверка Origin для защиты от CSRF при мутирующих административных запросах
   */
  private checkOrigin(req: FastifyRequest): void {
    const origin = req.headers["origin"] as string | undefined;
    if (origin && !isAllowedOrigin(origin)) {
      throw new ForbiddenError(
        "CSRF_FORBIDDEN",
        `Запрос с источника '${origin}' заблокирован политикой CORS/CSRF`
      );
    }
  }

  /**
   * Проверка прав администратора / контент-менеджера
   */
  private authenticateAdmin(req: FastifyRequest) {
    this.checkOrigin(req);
    const user = extractAuthUser(req.headers.authorization);
    checkRolePermissions(user.role, [Role.ADMIN, Role.CONTENT_MANAGER]);
    return user;
  }

  // ===========================================================================
  // КАТЕГОРИИ (ADMIN)
  // ===========================================================================

  /**
   * POST /api/v1/admin/categories
   * Создание новой категории
   */
  @Post("categories")
  @HttpCode(HttpStatus.CREATED)
  async createCategory(@Body() body: unknown, @Req() req: FastifyRequest) {
    this.authenticateAdmin(req);

    const parseRes = CreateCategorySchema.safeParse(body);
    if (!parseRes.success) {
      throw new UnprocessableEntityError(
        "VALIDATION_ERROR",
        "Ошибка валидации данных категории",
        parseRes.error.format()
      );
    }

    const data = await this.catalogService.createCategory(parseRes.data);
    return {
      success: true,
      data,
      meta: { timestamp: new Date().toISOString() },
    };
  }

  /**
   * PUT /api/v1/admin/categories/:id
   * Редактирование категории
   */
  @Put("categories/:id")
  @HttpCode(HttpStatus.OK)
  async updateCategory(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() req: FastifyRequest
  ) {
    this.authenticateAdmin(req);

    const parseRes = UpdateCategorySchema.safeParse(body);
    if (!parseRes.success) {
      throw new UnprocessableEntityError(
        "VALIDATION_ERROR",
        "Ошибка валидации данных обновления категории",
        parseRes.error.format()
      );
    }

    const data = await this.catalogService.updateCategory(id, parseRes.data);
    return {
      success: true,
      data,
      meta: { timestamp: new Date().toISOString() },
    };
  }

  // ===========================================================================
  // ВЫКРОЙКИ (ADMIN)
  // ===========================================================================

  /**
   * POST /api/v1/admin/products
   * Создание новой карточки выкройки
   */
  @Post("products")
  @HttpCode(HttpStatus.CREATED)
  async createProduct(@Body() body: unknown, @Req() req: FastifyRequest) {
    this.authenticateAdmin(req);

    const parseRes = CreateProductSchema.safeParse(body);
    if (!parseRes.success) {
      throw new UnprocessableEntityError(
        "VALIDATION_ERROR",
        "Ошибка валидации данных выкройки",
        parseRes.error.format()
      );
    }

    const data = await this.catalogService.createProduct(parseRes.data);
    return {
      success: true,
      data: {
        ...data,
        basePrice: Number(data.basePrice),
      },
      meta: { timestamp: new Date().toISOString() },
    };
  }

  /**
   * PUT /api/v1/admin/products/:id
   * Редактирование выкройки
   */
  @Put("products/:id")
  @HttpCode(HttpStatus.OK)
  async updateProduct(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() req: FastifyRequest
  ) {
    this.authenticateAdmin(req);

    const parseRes = UpdateProductSchema.safeParse(body);
    if (!parseRes.success) {
      throw new UnprocessableEntityError(
        "VALIDATION_ERROR",
        "Ошибка валидации данных обновления выкройки",
        parseRes.error.format()
      );
    }

    const data = await this.catalogService.updateProduct(id, parseRes.data);
    return {
      success: true,
      data: {
        ...data,
        basePrice: Number(data.basePrice),
      },
      meta: { timestamp: new Date().toISOString() },
    };
  }

  /**
   * PATCH /api/v1/admin/products/:id/status
   * Публикация / снятие с публикации выкройки
   */
  @Patch("products/:id/status")
  @HttpCode(HttpStatus.OK)
  async toggleProductStatus(
    @Param("id") id: string,
    @Body() body: any,
    @Req() req: FastifyRequest
  ) {
    this.authenticateAdmin(req);

    const isActive = Boolean(body?.isActive);
    const data = await this.catalogService.toggleProductStatus(id, isActive);

    return {
      success: true,
      data: {
        id: data.id,
        title: data.title,
        isActive: data.isActive,
      },
      meta: { timestamp: new Date().toISOString() },
    };
  }

  // ===========================================================================
  // МАТРИЦА ВАРИАНТОВ (ADMIN)
  // ===========================================================================

  /**
   * POST /api/v1/admin/products/:id/variants/batch
   * Матричный генератор вариантов (размеры x ростовки x форматы)
   */
  @Post("products/:id/variants/batch")
  @HttpCode(HttpStatus.CREATED)
  async batchGenerateVariants(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() req: FastifyRequest
  ) {
    this.authenticateAdmin(req);

    const parseRes = BatchVariantsSchema.safeParse(body);
    if (!parseRes.success) {
      throw new UnprocessableEntityError(
        "VALIDATION_ERROR",
        "Некорректные параметры генерации матрицы вариантов",
        parseRes.error.format()
      );
    }

    const data = await this.catalogService.batchGenerateVariants(id, parseRes.data);
    return {
      success: true,
      data,
      meta: { timestamp: new Date().toISOString() },
    };
  }

  // ===========================================================================
  // МЕДИА / ИЗОБРАЖЕНИЯ (ADMIN)
  // ===========================================================================

  /**
   * POST /api/v1/admin/products/:id/images
   * Добавление фото в галерею выкройки
   */
  @Post("products/:id/images")
  @HttpCode(HttpStatus.CREATED)
  async addProductImage(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() req: FastifyRequest
  ) {
    this.authenticateAdmin(req);

    const parseRes = AddProductImageSchema.safeParse(body);
    if (!parseRes.success) {
      throw new UnprocessableEntityError(
        "VALIDATION_ERROR",
        "Ошибка валидации данных изображения",
        parseRes.error.format()
      );
    }

    const data = await this.catalogService.addProductImage(id, parseRes.data);
    return {
      success: true,
      data,
      meta: { timestamp: new Date().toISOString() },
    };
  }

  /**
   * DELETE /api/v1/admin/products/:id/images/:imageId
   * Удаление фото из галереи выкройки
   */
  @Delete("products/:id/images/:imageId")
  @HttpCode(HttpStatus.OK)
  async deleteProductImage(
    @Param("id") id: string,
    @Param("imageId") imageId: string,
    @Req() req: FastifyRequest
  ) {
    this.authenticateAdmin(req);

    const data = await this.catalogService.deleteProductImage(id, imageId);
    return {
      success: true,
      data,
      meta: { timestamp: new Date().toISOString() },
    };
  }
}
