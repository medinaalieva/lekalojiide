"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "../../lib/auth-context";
import { Button } from "../../components/ui/Button";
import { AlertCircle, Lock, Mail, User, Phone } from "lucide-react";

function getSafeRedirectUrl(param: string | null): string {
  if (!param) return "/cabinet";
  if (
    param.startsWith("/") &&
    !param.startsWith("//") &&
    !param.includes("\\") &&
    !param.includes("://")
  ) {
    return param;
  }
  return "/cabinet";
}

export default function RegisterPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { register } = useAuth();

  const redirectParam = searchParams.get("redirect");
  const targetRedirect = getSafeRedirectUrl(redirectParam);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    const trimmedEmail = email.trim().toLowerCase();

    // 1. Клиентская валидация формата email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      setFieldErrors({ email: "Некорректный формат email" });
      setError("Пожалуйста, укажите корректный email (например, name@example.com)");
      return;
    }

    // 2. Клиентская валидация длины пароля
    if (password.length < 8) {
      setFieldErrors({ password: "Пароль должен содержать не менее 8 символов" });
      setError("Пароль должен содержать не менее 8 символов");
      return;
    }

    // 3. Клиентская валидация сложности пароля
    const passwordComplexityRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/;
    if (!passwordComplexityRegex.test(password)) {
      setFieldErrors({
        password:
          "Пароль должен содержать как минимум одну заглавную букву (A-Z), одну строчную букву (a-z) и одну цифру (0-9)",
      });
      setError(
        "Пароль должен содержать как минимум одну заглавную букву, одну строчную букву и одну цифру"
      );
      return;
    }

    setIsLoading(true);

    try {
      await register({
        email: trimmedEmail,
        password,
        firstName: firstName.trim() || undefined,
        lastName: lastName.trim() || undefined,
        phone: phone.trim() || undefined,
      });
      router.push(targetRedirect);
    } catch (err: any) {
      const newFieldErrors: Record<string, string> = {};

      // Разбор ошибок валидации Zod из backend API (err.details)
      if (err?.details && typeof err.details === "object") {
        for (const [key, val] of Object.entries(err.details)) {
          if (
            key !== "_errors" &&
            val &&
            typeof val === "object" &&
            Array.isArray((val as any)._errors) &&
            (val as any)._errors.length > 0
          ) {
            newFieldErrors[key] = (val as any)._errors[0];
          }
        }
      }

      // Обработка конфликта уникальности email (409 Conflict)
      if (err?.code === "EMAIL_ALREADY_EXISTS" || err?.status === 409) {
        newFieldErrors.email = "Пользователь с таким email уже зарегистрирован";
      }

      setFieldErrors(newFieldErrors);

      // Формирование понятного сообщения пользователю
      if (newFieldErrors.email) {
        setError(newFieldErrors.email);
      } else if (newFieldErrors.password) {
        setError(newFieldErrors.password);
      } else {
        setError(
          err.message ||
            "Ошибка при регистрации. Проверьте корректность введенных данных."
        );
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-atelier-surface min-h-[85vh] flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full bg-white p-8 border border-atelier-border rounded-sm shadow-sm space-y-6">
        <div className="text-center">
          <span className="text-[10px] uppercase tracking-[0.25em] text-brand-700 font-semibold">
            Регистрация
          </span>
          <h1 className="font-serif text-3xl font-bold text-brand-950 mt-1">
            Создать аккаунт
          </h1>
          <p className="text-xs text-atelier-muted mt-2">
            Зарегистрируйтесь для бессрочного доступа к купленным цифровым выкройкам
          </p>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-sm flex items-start space-x-2 text-xs text-red-800">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-atelier-charcoal mb-1">
                Имя
              </label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Айпери"
                className="w-full px-3 py-2 text-sm border border-atelier-border rounded-sm focus:outline-none focus:border-brand-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-atelier-charcoal mb-1">
                Фамилия
              </label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Асанова"
                className="w-full px-3 py-2 text-sm border border-atelier-border rounded-sm focus:outline-none focus:border-brand-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-atelier-charcoal mb-1">
              Email *
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-atelier-muted absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: "" }));
                }}
                placeholder="name@example.com"
                className={`w-full pl-9 pr-3 py-2 text-sm border rounded-sm focus:outline-none ${
                  fieldErrors.email
                    ? "border-red-500 bg-red-50/20 focus:border-red-500"
                    : "border-atelier-border focus:border-brand-500"
                }`}
              />
            </div>
            {fieldErrors.email && (
              <p className="text-xs text-red-600 mt-1 font-medium">{fieldErrors.email}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-atelier-charcoal mb-1">
              Телефон
            </label>
            <div className="relative">
              <Phone className="w-4 h-4 text-atelier-muted absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="tel"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  if (fieldErrors.phone) setFieldErrors((prev) => ({ ...prev, phone: "" }));
                }}
                placeholder="+996 555 000000"
                className={`w-full pl-9 pr-3 py-2 text-sm border rounded-sm focus:outline-none ${
                  fieldErrors.phone
                    ? "border-red-500 bg-red-50/20 focus:border-red-500"
                    : "border-atelier-border focus:border-brand-500"
                }`}
              />
            </div>
            {fieldErrors.phone && (
              <p className="text-xs text-red-600 mt-1 font-medium">{fieldErrors.phone}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-atelier-charcoal mb-1">
              Пароль *
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-atelier-muted absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (fieldErrors.password) setFieldErrors((prev) => ({ ...prev, password: "" }));
                }}
                placeholder="Минимум 8 символов (A-Z, a-z, 0-9)"
                className={`w-full pl-9 pr-3 py-2 text-sm border rounded-sm focus:outline-none ${
                  fieldErrors.password
                    ? "border-red-500 bg-red-50/20 focus:border-red-500"
                    : "border-atelier-border focus:border-brand-500"
                }`}
              />
            </div>
            {fieldErrors.password ? (
              <p className="text-xs text-red-600 mt-1 font-medium">{fieldErrors.password}</p>
            ) : (
              <p className="text-[11px] text-atelier-muted mt-1">
                Минимум 8 знаков: заглавная буква (A-Z), строчная буква (a-z) и цифра (0-9)
              </p>
            )}
          </div>

          <Button
            type="submit"
            size="lg"
            className="w-full text-sm mt-2 min-h-[44px]"
            isLoading={isLoading}
            disabled={isLoading}
          >
            Зарегистрироваться
          </Button>
        </form>

        <div className="pt-4 border-t border-atelier-border text-center text-xs text-atelier-muted">
          Уже есть аккаунт?{" "}
          <Link
            href={
              redirectParam
                ? `/login?redirect=${encodeURIComponent(redirectParam)}`
                : "/login"
            }
            className="text-brand-800 hover:text-brand-950 font-semibold underline"
          >
            Войти
          </Link>
        </div>
      </div>
    </div>
  );
}
