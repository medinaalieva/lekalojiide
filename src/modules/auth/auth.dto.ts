import { z } from "zod";
import { Role, User } from "@prisma/client";

export const RegisterDtoSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email({ message: "Некорректный формат email" })
    .max(255),
  password: z
    .string()
    .min(8, { message: "Пароль должен содержать не менее 8 символов" })
    .max(100, { message: "Пароль не должен превышать 100 символов" })
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
      message: "Пароль должен содержать как минимум одну заглавную букву, одну строчную букву и одну цифру",
    }),
  firstName: z.string().trim().max(100).optional(),
  lastName: z.string().trim().max(100).optional(),
  phone: z.string().trim().max(50).optional(),
});

export type RegisterDto = z.infer<typeof RegisterDtoSchema>;

export const LoginDtoSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email({ message: "Некорректный формат email" }),
  password: z.string().min(1, { message: "Введите пароль" }),
});

export type LoginDto = z.infer<typeof LoginDtoSchema>;

export const ForgotPasswordDtoSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email({ message: "Некорректный формат email" })
    .max(255),
});

export type ForgotPasswordDto = z.infer<typeof ForgotPasswordDtoSchema>;

export const ResetPasswordDtoSchema = z
  .object({
    token: z
      .string()
      .trim()
      .min(32, { message: "Некорректный формат токена восстановления" })
      .max(128),
    password: z
      .string()
      .min(8, { message: "Пароль должен содержать не менее 8 символов" })
      .max(100, { message: "Пароль не должен превышать 100 символов" })
      .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
        message:
          "Пароль должен содержать как минимум одну заглавную букву, одну строчную букву и одну цифру",
      })
      .optional(),
    newPassword: z
      .string()
      .min(8, { message: "Пароль должен содержать не менее 8 символов" })
      .max(100, { message: "Пароль не должен превышать 100 символов" })
      .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
        message:
          "Пароль должен содержать как минимум одну заглавную букву, одну строчную букву и одну цифру",
      })
      .optional(),
  })
  .refine((data) => Boolean(data.password || data.newPassword), {
    message: "Необходимо указать новый пароль",
    path: ["password"],
  });

export type ResetPasswordDto = z.infer<typeof ResetPasswordDtoSchema>;

/**
 * Публичное представление пользователя без утечки passwordHash
 */
export interface SafeUser {
  id: string;
  email: string;
  role: Role;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  isEmailVerified: boolean;
  isActive: boolean;
  createdAt: Date;
}

/**
 * Санитизация пользователя: исключение конфиденциальных полей
 */
export function sanitizeUser(user: User): SafeUser {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    isEmailVerified: user.isEmailVerified,
    isActive: user.isActive,
    createdAt: user.createdAt,
  };
}
