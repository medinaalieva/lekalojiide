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
