"use client";

import React, { useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "../../components/ui/Button";
import { AlertCircle, CheckCircle2, Lock, ArrowLeft, KeyRound } from "lucide-react";
import { api } from "../../lib/api";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  // Password validation checks
  const hasMinLength = password.length >= 8;
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasDigit = /[0-9]/.test(password);
  const isPasswordValid = hasMinLength && hasUpperCase && hasLowerCase && hasDigit;
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0;

  if (!token) {
    return (
      <div className="space-y-6 text-center">
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-sm text-xs text-amber-900 flex items-start space-x-3">
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-left">
            <p className="font-semibold text-amber-950 mb-1">
              Ссылка недействительна
            </p>
            <p className="leading-relaxed">
              В адресе страницы отсутствует защитный токен сброса пароля. Возможно, вы перешли по неполной ссылке из письма.
            </p>
          </div>
        </div>

        <Link
          href="/forgot-password"
          className="inline-flex items-center justify-center w-full px-4 py-2 min-h-[44px] bg-brand-800 text-white text-xs font-semibold uppercase tracking-wider rounded-sm hover:bg-brand-900 transition-colors"
        >
          Запросить новую ссылку
        </Link>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!isPasswordValid) {
      setError(
        "Пароль должен содержать минимум 8 символов, включая заглавную букву, строчную букву и цифру."
      );
      return;
    }

    if (!passwordsMatch) {
      setError("Введённые пароли не совпадают.");
      return;
    }

    setIsLoading(true);

    try {
      await api.post("/api/v1/auth/reset-password", {
        token,
        newPassword: password,
      });
      setIsSuccess(true);
    } catch (err: any) {
      const msg =
        err.message ||
        "Не удалось сбросить пароль. Возможно, срок действия ссылки истёк.";
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="space-y-6">
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-sm flex items-start space-x-3 text-xs text-emerald-900">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-emerald-950 mb-1">
              Пароль успешно изменён!
            </p>
            <p className="leading-relaxed">
              Ваш новый пароль установлен. Все активные сессии на других устройствах были завершены в целях безопасности.
            </p>
          </div>
        </div>

        <Link
          href="/login"
          className="inline-flex items-center justify-center w-full px-4 py-2 min-h-[44px] bg-brand-800 text-white text-xs font-semibold uppercase tracking-wider rounded-sm hover:bg-brand-900 transition-colors"
        >
          Войти с новым паролем
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-sm flex items-start space-x-2 text-xs text-red-800">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span>{error}</span>
            {error.includes("истёк") || error.includes("использован") || error.includes("не найден") ? (
              <div>
                <Link
                  href="/forgot-password"
                  className="font-semibold underline text-red-900 hover:text-red-950"
                >
                  Запросить новую ссылку
                </Link>
              </div>
            ) : null}
          </div>
        </div>
      )}

      <div>
        <label className="block text-xs font-semibold uppercase tracking-wider text-atelier-charcoal mb-1">
          Новый пароль *
        </label>
        <div className="relative">
          <Lock className="w-4 h-4 text-atelier-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Минимум 8 символов"
            className="w-full pl-9 pr-3 py-2 text-sm border border-atelier-border rounded-sm focus:outline-none focus:border-brand-500"
          />
        </div>
        <div className="mt-1.5 flex flex-wrap gap-2 text-[11px] text-atelier-muted">
          <span className={hasMinLength ? "text-emerald-700 font-medium" : ""}>
            {hasMinLength ? "✓" : "○"} от 8 символов
          </span>
          <span className={hasUpperCase ? "text-emerald-700 font-medium" : ""}>
            {hasUpperCase ? "✓" : "○"} заглавная
          </span>
          <span className={hasLowerCase ? "text-emerald-700 font-medium" : ""}>
            {hasLowerCase ? "✓" : "○"} строчная
          </span>
          <span className={hasDigit ? "text-emerald-700 font-medium" : ""}>
            {hasDigit ? "✓" : "○"} цифра
          </span>
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold uppercase tracking-wider text-atelier-charcoal mb-1">
          Повторите новый пароль *
        </label>
        <div className="relative">
          <KeyRound className="w-4 h-4 text-atelier-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Повторите новый пароль"
            className="w-full pl-9 pr-3 py-2 text-sm border border-atelier-border rounded-sm focus:outline-none focus:border-brand-500"
          />
        </div>
        {confirmPassword.length > 0 && (
          <p
            className={`mt-1 text-[11px] ${
              passwordsMatch ? "text-emerald-700 font-medium" : "text-red-600"
            }`}
          >
            {passwordsMatch ? "✓ Пароли совпадают" : "✗ Пароли не совпадают"}
          </p>
        )}
      </div>

      <Button
        type="submit"
        size="lg"
        className="w-full text-sm mt-2 min-h-[44px]"
        isLoading={isLoading}
        disabled={isLoading || !isPasswordValid || !passwordsMatch}
      >
        Установить новый пароль
      </Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="bg-atelier-surface min-h-[80vh] flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full bg-white p-8 border border-atelier-border rounded-sm shadow-sm space-y-6">
        <div className="text-center">
          <span className="text-[10px] uppercase tracking-[0.25em] text-brand-700 font-semibold">
            Безопасность
          </span>
          <h1 className="font-serif text-3xl font-bold text-brand-950 mt-1">
            Новый пароль
          </h1>
          <p className="text-xs text-atelier-muted mt-2">
            Придумайте новый надёжный пароль для вашего аккаунта
          </p>
        </div>

        <Suspense
          fallback={
            <div className="text-center py-8 text-xs text-atelier-muted">
              Загрузка формы...
            </div>
          }
        >
          <ResetPasswordForm />
        </Suspense>

        <div className="pt-4 border-t border-atelier-border flex items-center justify-center space-x-1 text-xs text-atelier-muted">
          <ArrowLeft className="w-3.5 h-3.5 mr-1" />
          <Link
            href="/login"
            className="text-brand-800 hover:text-brand-950 font-semibold underline"
          >
            Вернуться к странице входа
          </Link>
        </div>
      </div>
    </div>
  );
}
