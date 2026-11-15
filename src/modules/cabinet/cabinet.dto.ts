import { z } from "zod";
import { FileType } from "@prisma/client";

export const DownloadUrlDtoSchema = z.object({
  versionNumber: z
    .number()
    .int("Номер версии должен быть целым числом")
    .positive("Номер версии должен быть положительным числом")
    .optional(),
  fileType: z.nativeEnum(FileType).optional(),
});

export type DownloadUrlDto = z.infer<typeof DownloadUrlDtoSchema>;

export const EntitlementIdParamSchema = z.object({
  entitlementId: z.string().uuid("Идентификатор права должен быть валидным UUID"),
});

export const InstructionIdParamSchema = z.object({
  instructionId: z.string().uuid("Идентификатор инструкции должен быть валидным UUID"),
});

export interface LibraryItemResponse {
  entitlementId: string;
  variantId: string;
  status: string;
  productTitle: string;
  size: string;
  height: string;
  format: string;
  coverUrl: string | null;
  instructionId: string | null;
  currentVersion: number | null;
  changelog: string | null;
  downloadCount: number;
}
