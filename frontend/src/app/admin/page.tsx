"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../../lib/api";
import { DashboardStats } from "../../types";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import {
  Package,
  ShoppingCart,
  Users,
  Coins,
  PlusCircle,
  FolderTree,
  ArrowRight,
  RefreshCw,
  AlertCircle,
  Eye,
} from "lucide-react";

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.get<{ success: boolean; data: DashboardStats }>(
        "/api/v1/admin/stats"
      );
      if (res.success && res.data) {
        setStats(res.data);
      }
    } catch (err: any) {
      setError(err?.message || "Не удалось загрузить статистику магазина");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-atelier-border pb-6">
        <div>
          <span className="text-[10px] uppercase tracking-[0.25em] text-brand-700 font-semibold">
            Панель управления
          </span>
          <h1 className="font-serif text-3xl font-bold text-brand-950 mt-1">
            Сводка и показатели
          </h1>
          <p className="text-xs text-atelier-muted mt-1">
            Оперативная статистика онлайн-ателье цифровых выкроек LEKALO ZHIIDE
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchStats}
            disabled={isLoading}
            className="text-xs"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 mr-1.5 ${isLoading ? "animate-spin" : ""}`}
            />
            Обновить
          </Button>

          <Link href="/admin/products/new">
            <Button size="sm" className="text-xs">
              <PlusCircle className="w-3.5 h-3.5 mr-1.5" />
              Добавить выкройку
            </Button>
          </Link>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-sm text-xs text-red-800 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
          <Button variant="outline" size="sm" onClick={fetchStats} className="text-xs">
            Повторить
          </Button>
        </div>
      )}

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Revenue */}
        <div className="bg-white p-6 border border-atelier-border rounded-sm shadow-sm space-y-2">
          <div className="flex items-center justify-between text-atelier-muted">
            <span className="text-xs font-semibold uppercase tracking-wider">
              Выручка (Оплачено)
            </span>
            <div className="p-2 bg-emerald-50 text-emerald-700 rounded-sm">
              <Coins className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-serif font-bold text-brand-950">
            {isLoading ? (
              <span className="text-sm font-normal text-atelier-muted">Загрузка...</span>
            ) : (
              `${(stats?.revenue.totalAmount || 0).toLocaleString("ru-RU")} KGS`
            )}
          </div>
          <p className="text-[11px] text-atelier-muted">
            По подтверждённым заказам
          </p>
        </div>

        {/* Card 2: Orders */}
        <div className="bg-white p-6 border border-atelier-border rounded-sm shadow-sm space-y-2">
          <div className="flex items-center justify-between text-atelier-muted">
            <span className="text-xs font-semibold uppercase tracking-wider">
              Всего заказов
            </span>
            <div className="p-2 bg-blue-50 text-blue-700 rounded-sm">
              <ShoppingCart className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-serif font-bold text-brand-950">
            {isLoading ? (
              <span className="text-sm font-normal text-atelier-muted">...</span>
            ) : (
              stats?.orders.total || 0
            )}
          </div>
          <div className="text-[11px] text-atelier-muted flex items-center space-x-2">
            <span className="text-emerald-700 font-medium">
              {stats?.orders.paid || 0} оплачено
            </span>
            <span>•</span>
            <span className="text-amber-700 font-medium">
              {stats?.orders.pending || 0} ожидает
            </span>
          </div>
        </div>

        {/* Card 3: Products */}
        <div className="bg-white p-6 border border-atelier-border rounded-sm shadow-sm space-y-2">
          <div className="flex items-center justify-between text-atelier-muted">
            <span className="text-xs font-semibold uppercase tracking-wider">
              Выкройки в каталоге
            </span>
            <div className="p-2 bg-brand-50 text-brand-700 rounded-sm">
              <Package className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-serif font-bold text-brand-950">
            {isLoading ? (
              <span className="text-sm font-normal text-atelier-muted">...</span>
            ) : (
              stats?.products.total || 0
            )}
          </div>
          <div className="text-[11px] text-atelier-muted flex items-center space-x-2">
            <span className="text-emerald-700 font-medium">
              {stats?.products.published || 0} опубликовано
            </span>
            <span>•</span>
            <span className="text-atelier-muted">
              {stats?.products.draft || 0} в черновиках
            </span>
          </div>
        </div>

        {/* Card 4: Users */}
        <div className="bg-white p-6 border border-atelier-border rounded-sm shadow-sm space-y-2">
          <div className="flex items-center justify-between text-atelier-muted">
            <span className="text-xs font-semibold uppercase tracking-wider">
              Пользователи
            </span>
            <div className="p-2 bg-purple-50 text-purple-700 rounded-sm">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-serif font-bold text-brand-950">
            {isLoading ? (
              <span className="text-sm font-normal text-atelier-muted">...</span>
            ) : (
              stats?.users.total || 0
            )}
          </div>
          <p className="text-[11px] text-atelier-muted">
            Зарегистрированных покупателей
          </p>
        </div>
      </div>

      {/* Quick Action Navigation Buttons */}
      <div className="bg-white p-6 border border-atelier-border rounded-sm shadow-sm">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-brand-950 mb-4">
          Быстрый переход к разделам
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Link
            href="/admin/products"
            className="p-3 border border-atelier-border rounded-sm hover:border-brand-900 hover:bg-brand-50/50 transition-colors flex items-center justify-between group"
          >
            <div className="flex items-center space-x-2 text-xs font-medium text-brand-950">
              <Package className="w-4 h-4 text-brand-700" />
              <span>Каталог выкроек</span>
            </div>
            <ArrowRight className="w-3.5 h-3.5 text-atelier-muted group-hover:translate-x-1 transition-transform" />
          </Link>

          <Link
            href="/admin/categories"
            className="p-3 border border-atelier-border rounded-sm hover:border-brand-900 hover:bg-brand-50/50 transition-colors flex items-center justify-between group"
          >
            <div className="flex items-center space-x-2 text-xs font-medium text-brand-950">
              <FolderTree className="w-4 h-4 text-brand-700" />
              <span>Категории</span>
            </div>
            <ArrowRight className="w-3.5 h-3.5 text-atelier-muted group-hover:translate-x-1 transition-transform" />
          </Link>

          <Link
            href="/admin/orders"
            className="p-3 border border-atelier-border rounded-sm hover:border-brand-900 hover:bg-brand-50/50 transition-colors flex items-center justify-between group"
          >
            <div className="flex items-center space-x-2 text-xs font-medium text-brand-950">
              <ShoppingCart className="w-4 h-4 text-brand-700" />
              <span>Заказы клиентов</span>
            </div>
            <ArrowRight className="w-3.5 h-3.5 text-atelier-muted group-hover:translate-x-1 transition-transform" />
          </Link>

          <Link
            href="/admin/users"
            className="p-3 border border-atelier-border rounded-sm hover:border-brand-900 hover:bg-brand-50/50 transition-colors flex items-center justify-between group"
          >
            <div className="flex items-center space-x-2 text-xs font-medium text-brand-950">
              <Users className="w-4 h-4 text-brand-700" />
              <span>Пользователи</span>
            </div>
            <ArrowRight className="w-3.5 h-3.5 text-atelier-muted group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>
      </div>

      {/* Two Column Section: Recent Orders & Recent Users */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Recent Orders */}
        <div className="bg-white border border-atelier-border rounded-sm shadow-sm overflow-hidden flex flex-col">
          <div className="p-4 border-b border-atelier-border flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-brand-950">
              Последние заказы
            </h2>
            <Link
              href="/admin/orders"
              className="text-[11px] text-brand-700 hover:text-brand-950 font-medium uppercase tracking-wider"
            >
              Все заказы →
            </Link>
          </div>

          <div className="flex-1 overflow-x-auto">
            {isLoading ? (
              <div className="p-8 text-center text-xs text-atelier-muted">
                Загрузка данных...
              </div>
            ) : !stats?.recentOrders?.length ? (
              <div className="p-8 text-center text-xs text-atelier-muted">
                Заказов пока нет
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="bg-atelier-surface text-atelier-muted uppercase tracking-wider text-[10px] border-b border-atelier-border">
                  <tr>
                    <th className="py-2.5 px-4">№ Заказа</th>
                    <th className="py-2.5 px-4">Покупатель</th>
                    <th className="py-2.5 px-4">Сумма</th>
                    <th className="py-2.5 px-4">Статус</th>
                    <th className="py-2.5 px-4 text-right">Действие</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-atelier-border">
                  {stats.recentOrders.map((o) => (
                    <tr key={o.id} className="hover:bg-atelier-subtle transition-colors">
                      <td className="py-3 px-4 font-mono font-medium text-brand-950">
                        {o.orderNumber}
                      </td>
                      <td className="py-3 px-4 text-atelier-charcoal max-w-[150px] truncate">
                        {o.customerEmail}
                      </td>
                      <td className="py-3 px-4 font-semibold text-brand-950">
                        {Number(o.totalAmount).toLocaleString("ru-RU")} KGS
                      </td>
                      <td className="py-3 px-4">
                        <Badge
                          variant={
                            o.status === "PAID"
                              ? "success"
                              : o.status === "PENDING"
                              ? "warning"
                              : "neutral"
                          }
                        >
                          {o.status === "PAID"
                            ? "Оплачен"
                            : o.status === "PENDING"
                            ? "В ожидании"
                            : o.status}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Link href={`/admin/orders/${o.id}`}>
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
                            <Eye className="w-3.5 h-3.5" />
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Recent Users */}
        <div className="bg-white border border-atelier-border rounded-sm shadow-sm overflow-hidden flex flex-col">
          <div className="p-4 border-b border-atelier-border flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-brand-950">
              Новые пользователи
            </h2>
            <Link
              href="/admin/users"
              className="text-[11px] text-brand-700 hover:text-brand-950 font-medium uppercase tracking-wider"
            >
              Все пользователи →
            </Link>
          </div>

          <div className="flex-1 overflow-x-auto">
            {isLoading ? (
              <div className="p-8 text-center text-xs text-atelier-muted">
                Загрузка данных...
              </div>
            ) : !stats?.recentUsers?.length ? (
              <div className="p-8 text-center text-xs text-atelier-muted">
                Пользователей пока нет
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="bg-atelier-surface text-atelier-muted uppercase tracking-wider text-[10px] border-b border-atelier-border">
                  <tr>
                    <th className="py-2.5 px-4">Email</th>
                    <th className="py-2.5 px-4">Имя</th>
                    <th className="py-2.5 px-4">Роль</th>
                    <th className="py-2.5 px-4">Статус</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-atelier-border">
                  {stats.recentUsers.map((u) => (
                    <tr key={u.id} className="hover:bg-atelier-subtle transition-colors">
                      <td className="py-3 px-4 font-medium text-brand-950">
                        {u.email}
                      </td>
                      <td className="py-3 px-4 text-atelier-charcoal">
                        {[u.firstName, u.lastName].filter(Boolean).join(" ") || "—"}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`text-[10px] font-mono px-2 py-0.5 rounded font-semibold ${
                            u.role === "ADMIN"
                              ? "bg-purple-100 text-purple-800"
                              : u.role === "CONTENT_MANAGER"
                              ? "bg-blue-100 text-blue-800"
                              : "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {u.role}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center text-[11px] ${
                            u.isActive ? "text-emerald-700 font-medium" : "text-red-600"
                          }`}
                        >
                          {u.isActive ? "● Активен" : "○ Заблокирован"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
