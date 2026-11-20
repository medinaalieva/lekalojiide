"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "../../components/ui/Button";
import { AlertCircle, ArrowLeft, CheckCircle2, Mail } from "lucide-react";
import { api } from "../../lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (cooldown > 0) {
      timer = setTimeout(() => setCooldown((prev) => prev - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [cooldown]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      await api.post("/api/v1/auth/forgot-password", { email: email.trim().toLowerCase() });
      setIsSubmitted(true);
      setCooldown(60);
    } catch (err: any) {
      setError(
        err.message || "Не удалось отправить запрос. Пожалуйста, попробуйте позже."
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0 || isLoading) return;
    setError(null);
    setIsLoading(true);

    try {
      await api.post("/api/v1/auth/forgot-password", { email: email.trim().toLowerCase() });
      setCooldown(60);
    } catch (err: any) {
      setError(
        err.message || "Не удалось отправить повторный запрос. Пожалуйста, попробуйте позже."
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-atelier-surface min-h-[80vh] flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full bg-white p-8 border border-atelier-border rounded-sm shadow-sm space-y-6">
        <div className="text-center">
          <span className="text-[10px] uppercase tracking-[0.25em] text-brand-700 font-semibold">
            Безопасность
          </span>
          <h1 className="font-serif text-3xl font-bold text-brand-950 mt-1">
            Восстановление пароля
          </h1>
          <p className="text-xs text-atelier-muted mt-2">
            {!isSubmitted
              ? "Введите ваш email. Мы отправим одноразовую ссылку для смены пароля."
              : "Инструкции по смене пароля отправлены"}
          </p>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-sm flex items-start space-x-2 text-xs text-red-800">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {!isSubmitted ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-atelier-charcoal mb-1">
                Email аккаунта *
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-atelier-muted absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full pl-9 pr-3 py-2 text-sm border border-atelier-border rounded-sm focus:outline-none focus:border-brand-500"
                />
              </div>
            </div>

            <Button
              type="submit"
              size="lg"
              className="w-full text-sm mt-2 min-h-[44px]"
              isLoading={isLoading}
              disabled={isLoading}
            >
              Отправить ссылку
            </Button>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-sm flex items-start space-x-3 text-xs text-emerald-900">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-emerald-950 mb-1">
                  Запрос успешно отправлен!
                </p>
                <p className="leading-relaxed">
                  Если аккаунт с адресом <span className="font-medium underline">{email}</span> существует в системе, на него направлено письмо со ссылкой для восстановления пароля.
                </p>
                <p className="mt-2 text-emerald-800">
                  Ссылка действительна в течение <strong>15 минут</strong>.
                </p>
              </div>
            </div>

            <div className="text-center pt-2">
              <button
                type="button"
                onClick={handleResend}
                disabled={cooldown > 0 || isLoading}
                className={`text-xs font-medium min-h-[44px] px-4 py-2 border rounded-sm transition-colors ${
                  cooldown > 0 || isLoading
                    ? "text-atelier-muted border-atelier-border cursor-not-allowed bg-gray-50"
                    : "text-brand-800 border-brand-300 hover:bg-brand-50"
                }`}
              >
                {cooldown > 0
                  ? `Отправить повторно через ${cooldown} сек`
                  : "Отправить письмо повторно"}
              </button>
            </div>
          </div>
        )}

        <div className="pt-4 border-t border-atelier-border flex items-center justify-center space-x-1 text-xs text-atelier-muted">
          <ArrowLeft className="w-3.5 h-3.5 mr-1" />
          <span>Вспомнили пароль?</span>
          <Link
            href="/login"
            className="text-brand-800 hover:text-brand-950 font-semibold underline ml-1"
          >
            Войти в аккаунт
          </Link>
        </div>
      </div>
    </div>
  );
}
