import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Req,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { FastifyRequest } from "fastify";
import { CabinetService } from "./cabinet.service";
import { extractAuthUser } from "../auth/auth.guard";
import {
  DownloadUrlDtoSchema,
  EntitlementIdParamSchema,
  InstructionIdParamSchema,
} from "./cabinet.dto";
import { UnprocessableEntityError } from "../../utils/errors";

@Controller("cabinet")
export class CabinetController {
  constructor(private readonly cabinetService: CabinetService) {}

  /**
   * GET /api/v1/cabinet/library
   * Получение списка купленных выкроек текущего авторизованного пользователя
   */
  @Get("library")
  @HttpCode(HttpStatus.OK)
  async getLibrary(@Req() req: FastifyRequest) {
    const user = extractAuthUser(req.headers.authorization);
    const data = await this.cabinetService.getLibrary(user);

    return {
      success: true,
      data,
      meta: { timestamp: new Date().toISOString() },
    };
  }

  /**
   * POST /api/v1/cabinet/files/:entitlementId/download-url
   * Получение временной подписанной ссылки на скачивание выкройки
   */
  @Post("files/:entitlementId/download-url")
  @HttpCode(HttpStatus.OK)
  async getDownloadUrl(
    @Param("entitlementId") entitlementId: string,
    @Body() body: unknown,
    @Req() req: FastifyRequest
  ) {
    const user = extractAuthUser(req.headers.authorization);

    // Валидация идентификатора права
    const paramRes = EntitlementIdParamSchema.safeParse({ entitlementId });
    if (!paramRes.success) {
      throw new UnprocessableEntityError(
        "INVALID_ENTITLEMENT_ID",
        "Некорректный формат идентификатора права",
        paramRes.error.issues
      );
    }

    // Валидация тела запроса (опциональный номер версии)
    const bodyRes = DownloadUrlDtoSchema.safeParse(body || {});
    if (!bodyRes.success) {
      throw new UnprocessableEntityError(
        "INVALID_DOWNLOAD_PARAMS",
        "Некорректные параметры запроса на скачивание",
        bodyRes.error.issues
      );
    }

    const clientMeta = {
      ip: (req.headers["x-forwarded-for"] as string) || req.ip || undefined,
      userAgent: (req.headers["user-agent"] as string) || undefined,
    };

    const data = await this.cabinetService.getDownloadUrl(
      user,
      paramRes.data.entitlementId,
      bodyRes.data,
      clientMeta
    );

    return {
      success: true,
      data,
      meta: { timestamp: new Date().toISOString() },
    };
  }

  /**
   * GET /api/v1/cabinet/instructions/:instructionId/download-url
   * Получение временной ссылки на скачивание инструкции по пошиву модели
   */
  @Get("instructions/:instructionId/download-url")
  @HttpCode(HttpStatus.OK)
  async getInstructionDownloadUrl(
    @Param("instructionId") instructionId: string,
    @Req() req: FastifyRequest
  ) {
    const user = extractAuthUser(req.headers.authorization);

    const paramRes = InstructionIdParamSchema.safeParse({ instructionId });
    if (!paramRes.success) {
      throw new UnprocessableEntityError(
        "INVALID_INSTRUCTION_ID",
        "Некорректный формат идентификатора инструкции",
        paramRes.error.issues
      );
    }

    const data = await this.cabinetService.getInstructionDownloadUrl(
      user,
      paramRes.data.instructionId
    );

    return {
      success: true,
      data,
      meta: { timestamp: new Date().toISOString() },
    };
  }
}
