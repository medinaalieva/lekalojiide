import {
  Controller,
  Get,
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
  UpdateProductDiscountSchema,
  BatchVariantsSchema,
  UpdateVariantPriceSchema,
  UpdateFormatPricesSchema,
  AddProductImageSchema,
  CreateSizeSchema,
  UpdateSizeSchema,
  SizeIdParamSchema,
  CreateHeightSchema,
  UpdateHeightSchema,
  HeightIdParamSchema,
  CreateFormatSchema,
  UpdateFormatSchema,
  FormatIdParamSchema,
  ToggleActiveSchema,
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
        bundlePrice: data.bundlePrice ? Number(data.bundlePrice) : null,
        discountPrice: data.discountPrice ? Number(data.discountPrice) : null,
        discountFrom: data.discountFrom ? data.discountFrom.toISOString() : null,
        discountUntil: data.discountUntil ? data.discountUntil.toISOString() : null,
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
        bundlePrice: data.bundlePrice ? Number(data.bundlePrice) : null,
        discountPrice: data.discountPrice ? Number(data.discountPrice) : null,
        discountFrom: data.discountFrom ? data.discountFrom.toISOString() : null,
        discountUntil: data.discountUntil ? data.discountUntil.toISOString() : null,
      },
      meta: { timestamp: new Date().toISOString() },
    };
  }

  /**
   * PATCH /api/v1/admin/products/:id/discount
   * Быстрое обновление / планирование / отмена скидки на выкройку
   */
  @Patch("products/:id/discount")
  @HttpCode(HttpStatus.OK)
  async updateProductDiscount(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() req: FastifyRequest
  ) {
    this.authenticateAdmin(req);

    const parseRes = UpdateProductDiscountSchema.safeParse(body);
    if (!parseRes.success) {
      throw new UnprocessableEntityError(
        "VALIDATION_ERROR",
        "Ошибка валидации параметров скидки",
        parseRes.error.format()
      );
    }

    const data = await this.catalogService.updateProductDiscount(id, parseRes.data);
    return {
      success: true,
      data: {
        ...data,
        basePrice: Number(data.basePrice),
        bundlePrice: data.bundlePrice ? Number(data.bundlePrice) : null,
        discountPrice: data.discountPrice ? Number(data.discountPrice) : null,
        discountFrom: data.discountFrom ? data.discountFrom.toISOString() : null,
        discountUntil: data.discountUntil ? data.discountUntil.toISOString() : null,
      },
      meta: { timestamp: new Date().toISOString() },
    };
  }

  /**
   * GET /api/v1/admin/products/:id
   * Получение полной карточки выкройки для админки
   */
  @Get("products/:id")
  @HttpCode(HttpStatus.OK)
  async getProductById(@Param("id") id: string, @Req() req: FastifyRequest) {
    this.authenticateAdmin(req);
    const data = await this.catalogService.getProductById(id);
    return {
      success: true,
      data,
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

  /**
   * PATCH /api/v1/admin/products/:productId/variants/:variantId/price
   * Установка индивидуальной цены варианта (или сброс к базовой при null)
   */
  @Patch("products/:productId/variants/:variantId/price")
  @HttpCode(HttpStatus.OK)
  async updateVariantPrice(
    @Param("productId") productId: string,
    @Param("variantId") variantId: string,
    @Body() body: unknown,
    @Req() req: FastifyRequest
  ) {
    this.authenticateAdmin(req);
    this.checkOrigin(req);

    const parseRes = UpdateVariantPriceSchema.safeParse(body);
    if (!parseRes.success) {
      throw new UnprocessableEntityError(
        "VALIDATION_ERROR",
        "Ошибка валидации цены варианта",
        parseRes.error.format()
      );
    }

    const price = parseRes.data.price !== undefined ? parseRes.data.price : (parseRes.data.priceOverride ?? null);
    const data = await this.catalogService.updateVariantPrice(productId, variantId, price);

    return {
      success: true,
      data,
      meta: { timestamp: new Date().toISOString() },
    };
  }

  /**
   * PATCH /api/v1/admin/products/:productId/variants/prices-by-format
   * Массовая установка цены для всех вариантов указанного формата
   */
  @Patch("products/:productId/variants/prices-by-format")
  @HttpCode(HttpStatus.OK)
  async updateFormatPrices(
    @Param("productId") productId: string,
    @Body() body: unknown,
    @Req() req: FastifyRequest
  ) {
    this.authenticateAdmin(req);
    this.checkOrigin(req);

    const parseRes = UpdateFormatPricesSchema.safeParse(body);
    if (!parseRes.success) {
      throw new UnprocessableEntityError(
        "VALIDATION_ERROR",
        "Ошибка валидации цен для формата",
        parseRes.error.format()
      );
    }

    const data = await this.catalogService.updateFormatPrices(productId, parseRes.data);

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

  // ===========================================================================
  // СПРАВОЧНИК РАЗМЕРОВ (ADMIN CRUD)
  // ===========================================================================

  /**
   * GET /api/v1/admin/sizes
   * Получение списка всех размеров со счётчиком использования
   */
  @Get("sizes")
  @HttpCode(HttpStatus.OK)
  async getAllSizes(@Req() req: FastifyRequest) {
    this.authenticateAdmin(req);

    const data = await this.catalogService.getAllSizes();
    return {
      success: true,
      data,
      meta: { timestamp: new Date().toISOString() },
    };
  }

  /**
   * GET /api/v1/admin/sizes/:id
   * Получение детальной информации о размере
   */
  @Get("sizes/:id")
  @HttpCode(HttpStatus.OK)
  async getSizeById(@Param("id") id: string, @Req() req: FastifyRequest) {
    this.authenticateAdmin(req);

    const parseParam = SizeIdParamSchema.safeParse({ id });
    if (!parseParam.success) {
      throw new UnprocessableEntityError("VALIDATION_ERROR", "Некорректный ID размера");
    }

    const data = await this.catalogService.getSizeById(parseParam.data.id);
    return {
      success: true,
      data,
      meta: { timestamp: new Date().toISOString() },
    };
  }

  /**
   * POST /api/v1/admin/sizes
   * Добавление нового размера
   */
  @Post("sizes")
  @HttpCode(HttpStatus.CREATED)
  async createSize(@Body() body: unknown, @Req() req: FastifyRequest) {
    this.authenticateAdmin(req);

    const parseRes = CreateSizeSchema.safeParse(body);
    if (!parseRes.success) {
      throw new UnprocessableEntityError(
        "VALIDATION_ERROR",
        "Ошибка валидации данных размера",
        parseRes.error.format()
      );
    }

    const data = await this.catalogService.createSize(parseRes.data);
    return {
      success: true,
      data,
      meta: { timestamp: new Date().toISOString() },
    };
  }

  /**
   * PUT /api/v1/admin/sizes/:id
   * Редактирование размера
   */
  @Put("sizes/:id")
  @HttpCode(HttpStatus.OK)
  async updateSize(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() req: FastifyRequest
  ) {
    this.authenticateAdmin(req);

    const parseParam = SizeIdParamSchema.safeParse({ id });
    if (!parseParam.success) {
      throw new UnprocessableEntityError("VALIDATION_ERROR", "Некорректный ID размера");
    }

    const parseRes = UpdateSizeSchema.safeParse(body);
    if (!parseRes.success) {
      throw new UnprocessableEntityError(
        "VALIDATION_ERROR",
        "Ошибка валидации данных обновления размера",
        parseRes.error.format()
      );
    }

    const data = await this.catalogService.updateSize(parseParam.data.id, parseRes.data);
    return {
      success: true,
      data,
      meta: { timestamp: new Date().toISOString() },
    };
  }

  /**
   * DELETE /api/v1/admin/sizes/:id
   * Безопасное удаление размера
   */
  @Delete("sizes/:id")
  @HttpCode(HttpStatus.OK)
  async deleteSize(@Param("id") id: string, @Req() req: FastifyRequest) {
    this.authenticateAdmin(req);

    const parseParam = SizeIdParamSchema.safeParse({ id });
    if (!parseParam.success) {
      throw new UnprocessableEntityError("VALIDATION_ERROR", "Некорректный ID размера");
    }

    const data = await this.catalogService.deleteSize(parseParam.data.id);
    return {
      success: true,
      data,
      meta: { timestamp: new Date().toISOString() },
    };
  }

  // ===========================================================================
  // СПРАВОЧНИК: РОСТОВКИ (HEIGHTS)
  // ===========================================================================

  /**
   * GET /api/v1/admin/heights
   * Получение списка всех ростовок со счётчиком вариантов
   */
  @Get("heights")
  @HttpCode(HttpStatus.OK)
  async getAllHeights(@Req() req: FastifyRequest) {
    this.authenticateAdmin(req);

    const data = await this.catalogService.getAllHeights(true);
    return {
      success: true,
      data,
      meta: { timestamp: new Date().toISOString() },
    };
  }

  /**
   * GET /api/v1/admin/heights/:id
   * Получение детальной информации о ростовке
   */
  @Get("heights/:id")
  @HttpCode(HttpStatus.OK)
  async getHeightById(@Param("id") id: string, @Req() req: FastifyRequest) {
    this.authenticateAdmin(req);

    const parseParam = HeightIdParamSchema.safeParse({ id });
    if (!parseParam.success) {
      throw new UnprocessableEntityError("VALIDATION_ERROR", "Некорректный ID ростовки");
    }

    const data = await this.catalogService.getHeightById(parseParam.data.id);
    return {
      success: true,
      data,
      meta: { timestamp: new Date().toISOString() },
    };
  }

  /**
   * POST /api/v1/admin/heights
   * Добавление новой ростовки
   */
  @Post("heights")
  @HttpCode(HttpStatus.CREATED)
  async createHeight(@Body() body: unknown, @Req() req: FastifyRequest) {
    this.authenticateAdmin(req);
    this.checkOrigin(req);

    const parseRes = CreateHeightSchema.safeParse(body);
    if (!parseRes.success) {
      throw new UnprocessableEntityError(
        "VALIDATION_ERROR",
        "Ошибка валидации данных ростовки",
        parseRes.error.format()
      );
    }

    const data = await this.catalogService.createHeight(parseRes.data);
    return {
      success: true,
      data,
      meta: { timestamp: new Date().toISOString() },
    };
  }

  /**
   * PUT /api/v1/admin/heights/:id
   * Редактирование ростовки
   */
  @Put("heights/:id")
  @HttpCode(HttpStatus.OK)
  async updateHeight(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() req: FastifyRequest
  ) {
    this.authenticateAdmin(req);
    this.checkOrigin(req);

    const parseParam = HeightIdParamSchema.safeParse({ id });
    if (!parseParam.success) {
      throw new UnprocessableEntityError("VALIDATION_ERROR", "Некорректный ID ростовки");
    }

    const parseRes = UpdateHeightSchema.safeParse(body);
    if (!parseRes.success) {
      throw new UnprocessableEntityError(
        "VALIDATION_ERROR",
        "Ошибка валидации данных обновления ростовки",
        parseRes.error.format()
      );
    }

    const data = await this.catalogService.updateHeight(parseParam.data.id, parseRes.data);
    return {
      success: true,
      data,
      meta: { timestamp: new Date().toISOString() },
    };
  }

  /**
   * PATCH /api/v1/admin/heights/:id/toggle-active
   * Переключение активности ростовки
   */
  @Patch("heights/:id/toggle-active")
  @HttpCode(HttpStatus.OK)
  async toggleHeightActive(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() req: FastifyRequest
  ) {
    this.authenticateAdmin(req);
    this.checkOrigin(req);

    const parseParam = HeightIdParamSchema.safeParse({ id });
    if (!parseParam.success) {
      throw new UnprocessableEntityError("VALIDATION_ERROR", "Некорректный ID ростовки");
    }

    const parseBody = ToggleActiveSchema.safeParse(body || {});
    const explicitActive = parseBody.success ? parseBody.data.isActive : undefined;

    const data = await this.catalogService.toggleHeightActive(parseParam.data.id, explicitActive);
    return {
      success: true,
      data,
      meta: { timestamp: new Date().toISOString() },
    };
  }

  /**
   * DELETE /api/v1/admin/heights/:id
   * Безопасное удаление ростовки (если не используется)
   */
  @Delete("heights/:id")
  @HttpCode(HttpStatus.OK)
  async deleteHeight(@Param("id") id: string, @Req() req: FastifyRequest) {
    this.authenticateAdmin(req);
    this.checkOrigin(req);

    const parseParam = HeightIdParamSchema.safeParse({ id });
    if (!parseParam.success) {
      throw new UnprocessableEntityError("VALIDATION_ERROR", "Некорректный ID ростовки");
    }

    const data = await this.catalogService.deleteHeight(parseParam.data.id);
    return {
      success: true,
      data,
      meta: { timestamp: new Date().toISOString() },
    };
  }

  // ===========================================================================
  // СПРАВОЧНИК: ФОРМАТЫ ВЫКРОЕК (FORMATS)
  // ===========================================================================

  /**
   * GET /api/v1/admin/formats
   * Получение списка всех форматов выкроек со счётчиками
   */
  @Get("formats")
  @HttpCode(HttpStatus.OK)
  async getAllFormats(@Req() req: FastifyRequest) {
    this.authenticateAdmin(req);

    const data = await this.catalogService.getAllFormats(true);
    return {
      success: true,
      data,
      meta: { timestamp: new Date().toISOString() },
    };
  }

  /**
   * GET /api/v1/admin/formats/:id
   * Получение детальной информации о формате
   */
  @Get("formats/:id")
  @HttpCode(HttpStatus.OK)
  async getFormatById(@Param("id") id: string, @Req() req: FastifyRequest) {
    this.authenticateAdmin(req);

    const parseParam = FormatIdParamSchema.safeParse({ id });
    if (!parseParam.success) {
      throw new UnprocessableEntityError("VALIDATION_ERROR", "Некорректный ID формата");
    }

    const data = await this.catalogService.getFormatById(parseParam.data.id);
    return {
      success: true,
      data,
      meta: { timestamp: new Date().toISOString() },
    };
  }

  /**
   * POST /api/v1/admin/formats
   * Добавление нового формата выкроек
   */
  @Post("formats")
  @HttpCode(HttpStatus.CREATED)
  async createFormat(@Body() body: unknown, @Req() req: FastifyRequest) {
    this.authenticateAdmin(req);
    this.checkOrigin(req);

    const parseRes = CreateFormatSchema.safeParse(body);
    if (!parseRes.success) {
      throw new UnprocessableEntityError(
        "VALIDATION_ERROR",
        "Ошибка валидации данных формата",
        parseRes.error.format()
      );
    }

    const data = await this.catalogService.createFormat(parseRes.data);
    return {
      success: true,
      data,
      meta: { timestamp: new Date().toISOString() },
    };
  }

  /**
   * PUT /api/v1/admin/formats/:id
   * Редактирование формата выкроек
   */
  @Put("formats/:id")
  @HttpCode(HttpStatus.OK)
  async updateFormat(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() req: FastifyRequest
  ) {
    this.authenticateAdmin(req);
    this.checkOrigin(req);

    const parseParam = FormatIdParamSchema.safeParse({ id });
    if (!parseParam.success) {
      throw new UnprocessableEntityError("VALIDATION_ERROR", "Некорректный ID формата");
    }

    const parseRes = UpdateFormatSchema.safeParse(body);
    if (!parseRes.success) {
      throw new UnprocessableEntityError(
        "VALIDATION_ERROR",
        "Ошибка валидации данных обновления формата",
        parseRes.error.format()
      );
    }

    const data = await this.catalogService.updateFormat(parseParam.data.id, parseRes.data);
    return {
      success: true,
      data,
      meta: { timestamp: new Date().toISOString() },
    };
  }

  /**
   * PATCH /api/v1/admin/formats/:id/toggle-active
   * Переключение активности формата выкроек
   */
  @Patch("formats/:id/toggle-active")
  @HttpCode(HttpStatus.OK)
  async toggleFormatActive(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() req: FastifyRequest
  ) {
    this.authenticateAdmin(req);
    this.checkOrigin(req);

    const parseParam = FormatIdParamSchema.safeParse({ id });
    if (!parseParam.success) {
      throw new UnprocessableEntityError("VALIDATION_ERROR", "Некорректный ID формата");
    }

    const parseBody = ToggleActiveSchema.safeParse(body || {});
    const explicitActive = parseBody.success ? parseBody.data.isActive : undefined;

    const data = await this.catalogService.toggleFormatActive(parseParam.data.id, explicitActive);
    return {
      success: true,
      data,
      meta: { timestamp: new Date().toISOString() },
    };
  }

  /**
   * DELETE /api/v1/admin/formats/:id
   * Безопасное удаление формата (если не используется)
   */
  @Delete("formats/:id")
  @HttpCode(HttpStatus.OK)
  async deleteFormat(@Param("id") id: string, @Req() req: FastifyRequest) {
    this.authenticateAdmin(req);
    this.checkOrigin(req);

    const parseParam = FormatIdParamSchema.safeParse({ id });
    if (!parseParam.success) {
      throw new UnprocessableEntityError("VALIDATION_ERROR", "Некорректный ID формата");
    }

    const data = await this.catalogService.deleteFormat(parseParam.data.id);
    return {
      success: true,
      data,
      meta: { timestamp: new Date().toISOString() },
    };
  }
}
