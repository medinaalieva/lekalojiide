import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Req,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { FastifyRequest } from "fastify";
import { CartService } from "./cart.service";
import { AddToCartSchema, UpdateCartItemSchema } from "./cart.dto";
import { extractAuthUser } from "../auth/auth.guard";
import { UnprocessableEntityError, ForbiddenError } from "../../utils/errors";
import { isAllowedOrigin } from "../../config/http.config";

@Controller("cart")
export class CartController {
  constructor(private readonly cartService: CartService) {}

  /**
   * Проверка Origin для защиты от CSRF при мутирующих запросах корзины
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
   * GET /api/v1/cart
   * Получение текущей корзины авторизованного покупателя
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  async getCart(@Req() req: FastifyRequest) {
    const user = extractAuthUser(req.headers.authorization);
    const data = await this.cartService.getUserCart(user.sub);

    return {
      success: true,
      data,
      meta: { timestamp: new Date().toISOString() },
    };
  }

  /**
   * POST /api/v1/cart/items
   * Добавление варианта выкройки в корзину
   */
  @Post("items")
  @HttpCode(HttpStatus.CREATED)
  async addItem(@Body() body: unknown, @Req() req: FastifyRequest) {
    this.checkOrigin(req);
    const user = extractAuthUser(req.headers.authorization);

    const parseRes = AddToCartSchema.safeParse(body);
    if (!parseRes.success) {
      throw new UnprocessableEntityError(
        "VALIDATION_ERROR",
        "Ошибка валидации данных для добавления в корзину",
        parseRes.error.format()
      );
    }

    const data = await this.cartService.addItem(user.sub, parseRes.data);
    return {
      success: true,
      data,
      meta: { timestamp: new Date().toISOString() },
    };
  }

  /**
   * PUT /api/v1/cart/items/:id
   * Изменение выбранного варианта в корзине (например, смена размера или формата)
   */
  @Put("items/:id")
  @HttpCode(HttpStatus.OK)
  async updateItemVariant(
    @Param("id") itemId: string,
    @Body() body: unknown,
    @Req() req: FastifyRequest
  ) {
    this.checkOrigin(req);
    const user = extractAuthUser(req.headers.authorization);

    const parseRes = UpdateCartItemSchema.safeParse(body);
    if (!parseRes.success) {
      throw new UnprocessableEntityError(
        "VALIDATION_ERROR",
        "Ошибка валидации данных изменения варианта",
        parseRes.error.format()
      );
    }

    const data = await this.cartService.updateItemVariant(user.sub, itemId, parseRes.data);
    return {
      success: true,
      data,
      meta: { timestamp: new Date().toISOString() },
    };
  }

  /**
   * DELETE /api/v1/cart/items/:id
   * Удаление позиции из корзины
   */
  @Delete("items/:id")
  @HttpCode(HttpStatus.OK)
  async removeItem(@Param("id") itemId: string, @Req() req: FastifyRequest) {
    this.checkOrigin(req);
    const user = extractAuthUser(req.headers.authorization);

    const data = await this.cartService.removeItem(user.sub, itemId);
    return {
      success: true,
      data,
      meta: { timestamp: new Date().toISOString() },
    };
  }

  /**
   * DELETE /api/v1/cart
   * Полная очистка корзины покупателя
   */
  @Delete()
  @HttpCode(HttpStatus.OK)
  async clearCart(@Req() req: FastifyRequest) {
    this.checkOrigin(req);
    const user = extractAuthUser(req.headers.authorization);

    const data = await this.cartService.clearCart(user.sub);
    return {
      success: true,
      data,
      meta: { timestamp: new Date().toISOString() },
    };
  }
}
