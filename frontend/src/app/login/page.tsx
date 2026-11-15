"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../../lib/auth-context";
import { Button } from "../../components/ui/Button";
import { AlertCircle, Lock, Mail } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      await login(email, password);
      router.push("/cabinet");
    } catch (err: any) {
      setError(
        err.message || "Неверный логин или пароль. Пожалуйста, проверьте данные."
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
            Личный кабинет
          </span>
          <h1 className="font-serif text-3xl font-bold text-brand-950 mt-1">
            Вход в аккаунт
          </h1>
          <p className="text-xs text-atelier-muted mt-2">
            Войдите для доступа к купленным выкройкам и оформлению заказов
          </p>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-sm flex items-start space-x-2 text-xs text-red-800">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
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
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="w-full pl-9 pr-3 py-2 text-sm border border-atelier-border rounded-sm focus:outline-none focus:border-brand-500"
              />
            </div>
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
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Минимум 8 символов"
                className="w-full pl-9 pr-3 py-2 text-sm border border-atelier-border rounded-sm focus:outline-none focus:border-brand-500"
              />
            </div>
          </div>

          <Button
            type="submit"
            size="lg"
            className="w-full text-sm mt-2"
            isLoading={isLoading}
            disabled={isLoading}
          >
            Войти
          </Button>
        </form>

        <div className="pt-4 border-t border-atelier-border text-center text-xs text-atelier-muted">
          Нет аккаунта?{" "}
          <Link
            href="/register"
            className="text-brand-800 hover:text-brand-950 font-semibold underline"
          >
            Зарегистрироваться
          </Link>
        </div>
      </div>
    </div>
  );
}
