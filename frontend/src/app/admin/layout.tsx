"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "../../lib/auth-context";
import {
  LayoutDashboard,
  Package,
  FolderTree,
  ShoppingCart,
  Users,
  CreditCard,
  ArrowLeft,
  ShieldAlert,
  Lock,
  Ruler,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { Button } from "../../components/ui/Button";

const ADMIN_NAV_ITEMS = [
  { href: "/admin", label: "Обзор", icon: LayoutDashboard },
  { href: "/admin/homepage", label: "Главная страница", icon: Sparkles },
  { href: "/admin/products", label: "Выкройки", icon: Package },
  { href: "/admin/categories", label: "Категории", icon: FolderTree },
  { href: "/admin/sizes", label: "Размеры", icon: Ruler },
  { href: "/admin/dictionaries", label: "Справочники", icon: SlidersHorizontal },
  { href: "/admin/orders", label: "Заказы", icon: ShoppingCart },
  { href: "/admin/users", label: "Пользователи", icon: Users },
  { href: "/admin/payments", label: "Платежи", icon: CreditCard },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isLoading } = useAuth();
  const pathname = usePathname();

  if (isLoading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center space-y-4 bg-atelier-surface">
        <div className="w-10 h-10 border-4 border-brand-200 border-t-brand-900 rounded-full animate-spin" />
        <p className="text-xs uppercase tracking-widest text-atelier-muted">
          Проверка прав доступа...
        </p>
      </div>
    );
  }

  if (!user || user.role !== "ADMIN") {
    return (
      <div className="min-h-[75vh] flex items-center justify-center p-4 bg-atelier-surface">
        <div className="max-w-md w-full bg-white border border-atelier-border rounded-sm p-8 text-center space-y-6 shadow-sm">
          <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto">
            <ShieldAlert className="w-8 h-8 stroke-[1.5]" />
          </div>
          <div className="space-y-2">
            <h1 className="font-serif text-2xl font-bold text-brand-950">
              Доступ ограничен
            </h1>
            <p className="text-xs text-atelier-muted leading-relaxed">
              Этот раздел предназначен только для администраторов LEKALO ZHIIDE.
              Ваш текущий аккаунт не обладает правами администратора.
            </p>
          </div>
          <div className="pt-2 flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/" className="w-full sm:w-auto">
              <Button variant="outline" className="w-full text-xs">
                <ArrowLeft className="w-4 h-4 mr-2" /> На витрину
              </Button>
            </Link>
            {!user && (
              <Link href="/login?redirect=/admin" className="w-full sm:w-auto">
                <Button className="w-full text-xs">
                  <Lock className="w-4 h-4 mr-2" /> Войти как администратор
                </Button>
              </Link>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-atelier-surface flex flex-col">
      {/* Top Admin Bar */}
      <header className="bg-brand-950 text-white border-b border-brand-900 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center space-x-3">
              <Link href="/admin" className="flex items-center space-x-2">
                <span className="font-serif text-lg tracking-[0.15em] font-bold uppercase text-white">
                  Lekalo Zhiide
                </span>
                <span className="text-[10px] tracking-widest uppercase bg-brand-800 text-brand-200 px-2 py-0.5 rounded font-mono">
                  Admin
                </span>
              </Link>
            </div>

            <div className="flex items-center space-x-4 text-xs">
              <span className="hidden sm:inline-block text-brand-300">
                Администратор:{" "}
                <span className="text-white font-medium">{user.email}</span>
              </span>
              <Link
                href="/"
                className="inline-flex items-center min-h-[44px] px-2.5 space-x-1 text-brand-300 hover:text-white transition-colors uppercase tracking-wider text-[11px]"
              >
                <ArrowLeft className="w-3.5 h-3.5 mr-1" />
                <span>На витрину</span>
              </Link>
            </div>
          </div>
        </div>

        {/* Admin Navigation Tabs */}
        <div className="bg-brand-900/60 border-t border-brand-900/80">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <nav className="flex space-x-1 sm:space-x-4 overflow-x-auto py-1 scrollbar-none">
              {ADMIN_NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive =
                  item.href === "/admin"
                    ? pathname === "/admin"
                    : pathname.startsWith(item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`inline-flex items-center min-h-[44px] sm:min-h-0 space-x-2 px-3 py-2 text-xs uppercase tracking-wider rounded-sm transition-colors whitespace-nowrap ${
                      isActive
                        ? "bg-white text-brand-950 font-semibold shadow-sm"
                        : "text-brand-200 hover:text-white hover:bg-brand-800/60"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>
      </header>

      {/* Main Admin Page Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
