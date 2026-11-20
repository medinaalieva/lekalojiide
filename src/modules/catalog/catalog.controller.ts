import {
  Controller,
  Get,
  Query,
  Param,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { CatalogService } from "./catalog.service";
import { CatalogQuerySchema } from "./catalog.dto";
import { UnprocessableEntityError } from "../../utils/errors";

@Controller("catalog")
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  /**
   * GET /api/v1/catalog/categories
   * Дерево опубликованных категорий выкроек
   */
  @Get("categories")
  @HttpCode(HttpStatus.OK)
  async getCategories() {
    const data = await this.catalogService.getCategories(false);
    return {
      success: true,
      data,
      meta: { timestamp: new Date().toISOString() },
    };
  }

  /**
   * GET /api/v1/catalog/filters
   * Справочник доступных фильтров (размеры, ростовки, форматы, сложность)
   */
  @Get("filters")
  @HttpCode(HttpStatus.OK)
  async getFilters() {
    const data = await this.catalogService.getFilters();
    return {
      success: true,
      data,
      meta: { timestamp: new Date().toISOString() },
    };
  }

  /**
   * GET /api/v1/catalog/products
   * Список опубликованных выкроек с пагинацией, фильтрами и поиском
   */
  @Get("products")
  @HttpCode(HttpStatus.OK)
  async getProducts(@Query() rawQuery: unknown) {
    const parseRes = CatalogQuerySchema.safeParse(rawQuery);
    if (!parseRes.success) {
      throw new UnprocessableEntityError(
        "VALIDATION_ERROR",
        "Некорректные параметры фильтрации каталога",
        parseRes.error.format()
      );
    }

    const result = await this.catalogService.getProducts(parseRes.data, true);

    return {
      success: true,
      data: result.items,
      pagination: result.meta,
      meta: { timestamp: new Date().toISOString() },
    };
  }

  /**
   * GET /api/v1/catalog/products/:slug
   * Полная карточка опубликованной выкройки
   */
  @Get("products/:slug")
  @HttpCode(HttpStatus.OK)
  async getProductBySlug(@Param("slug") slug: string) {
    const data = await this.catalogService.getProductBySlug(slug, true);
    return {
      success: true,
      data,
      meta: { timestamp: new Date().toISOString() },
    };
  }

  /**
   * GET /api/v1/catalog/products/:id/variants
   * Доступные варианты выкройки
   */
  @Get("products/:id/variants")
  @HttpCode(HttpStatus.OK)
  async getProductVariants(@Param("id") id: string) {
    const data = await this.catalogService.getProductVariants(id, true);
    return {
      success: true,
      data,
      meta: { timestamp: new Date().toISOString() },
    };
  }

  /**
   * GET /api/v1/catalog/homepage
   * Конфигурация динамических блоков главной страницы витрины
   */
  @Get("homepage")
  @HttpCode(HttpStatus.OK)
  async getHomepage() {
    const data = await this.catalogService.getHomepageConfig(true);
    return {
      success: true,
      data,
      meta: { timestamp: new Date().toISOString() },
    };
  }
}
