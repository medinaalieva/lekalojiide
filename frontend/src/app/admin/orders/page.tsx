"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../../../lib/api";
import { Order, OrderStatus } from "../../../types";
import { Button } from "../../../components/ui/Button";
import { Badge } from "../../../components/ui/Badge";
import {
  ShoppingCart,
  Search,
  RefreshCw,
  AlertCircle,
  Eye,
  Filter,
  Calendar,
} from "lucide-react";

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  const fetchOrders = async (pageNum: number = page) => {
    setIsLoading(true);
    setError(null);
    try {
      let url = `/api/v1/admin/orders?page=${pageNum}&limit=${limit}`;
      if (statusFilter !== "ALL") {
        url += `&status=${statusFilter}`;
      }
      if (search.trim()) {
        url += `&email=${encodeURIComponent(search.trim())}`;
      }

      const res = await api.get<{
        success: boolean;
        data: { orders: Order[]; total: number; page: number; limit: number };
      }>(url);

      if (res.success && res.data) {
        setOrders(res.data.orders || []);
        setTotal(res.data.total || 0);
        setPage(res.data.page || 1);
      }
    } catch (err: any) {
      setError(err?.message || "Не удалось загрузить заказы клиентов");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders(1);
  }, [statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchOrders(1);
  };

  const totalPages = Math.ceil(total / limit) || 1;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-atelier-border pb-6">
        <div>
          <span className="text-[10px] uppercase tracking-[0.25em] text-brand-700 font-semibold">
            Продажи и транзакции
          </span>
          <h1 className="font-serif text-3xl font-bold text-brand-950 mt-1">
            Заказы покупателей
          </h1>
          <p className="text-xs text-atelier-muted mt-1">
            Всего оформлено заказов: {total}
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchOrders(page)}
            disabled={isLoading}
            className="text-xs"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 mr-1.5 ${isLoading ? "animate-spin" : ""}`}
            />
            Обновить
          </Button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-sm text-xs text-red-800 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
          <Button variant="outline" size="sm" onClick={() => fetchOrders(page)} className="text-xs">
            Повторить
          </Button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 border border-atelier-border rounded-sm shadow-sm flex flex-col md:flex-row items-center gap-4 justify-between">
        <form onSubmit={handleSearchSubmit} className="relative w-full md:w-80 flex gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-atelier-muted absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Поиск по email или номеру заказа..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs border border-atelier-border rounded-sm focus:outline-none focus:border-brand-900"
            />
          </div>
          <Button type="submit" size="sm" variant="outline" className="text-xs">
            Найти
          </Button>
        </form>

        <div className="flex items-center space-x-2 text-xs w-full md:w-auto">
          <Filter className="w-3.5 h-3.5 text-atelier-muted" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-2.5 py-2 text-xs border border-atelier-border rounded-sm bg-white focus:outline-none focus:border-brand-900"
          >
            <option value="ALL">Все статусы заказов</option>
            <option value="PAID">Оплаченные (PAID)</option>
            <option value="PENDING">Ожидающие (PENDING)</option>
            <option value="CANCELLED">Отменённые (CANCELLED)</option>
            <option value="REFUNDED">Возвращённые (REFUNDED)</option>
          </select>
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-white border border-atelier-border rounded-sm shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="p-12 text-center text-xs text-atelier-muted">
              Загрузка заказов...
            </div>
          ) : orders.length === 0 ? (
            <div className="p-12 text-center text-xs text-atelier-muted space-y-2">
              <ShoppingCart className="w-8 h-8 mx-auto text-atelier-muted stroke-1" />
              <p>Заказов с указанными параметрами не найдено</p>
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-atelier-surface text-atelier-muted uppercase tracking-wider text-[10px] border-b border-atelier-border">
                <tr>
                  <th className="py-3 px-4">№ Заказа</th>
                  <th className="py-3 px-4">Дата оформления</th>
                  <th className="py-3 px-4">Покупатель</th>
                  <th className="py-3 px-4">Позиций</th>
                  <th className="py-3 px-4">Сумма</th>
                  <th className="py-3 px-4">Статус</th>
                  <th className="py-3 px-4 text-right">Детали</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-atelier-border">
                {orders.map((o) => (
                  <tr key={o.id} className="hover:bg-atelier-subtle transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-brand-950">
                      {o.orderNumber}
                    </td>

                    <td className="py-3 px-4 text-atelier-muted">
                      {new Date(o.createdAt).toLocaleString("ru-RU", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>

                    <td className="py-3 px-4">
                      <div className="font-medium text-atelier-charcoal">
                        {o.customerEmail}
                      </div>
                      {o.customerPhone && (
                        <div className="text-[11px] text-atelier-muted">
                          {o.customerPhone}
                        </div>
                      )}
                    </td>

                    <td className="py-3 px-4 text-atelier-charcoal">
                      {o.items?.length || (o as any)._count?.items || 1} шт.
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
                          : o.status === "CANCELLED"
                          ? "Отменён"
                          : o.status === "REFUNDED"
                          ? "Возврат"
                          : o.status}
                      </Badge>
                    </td>

                    <td className="py-3 px-4 text-right">
                      <Link href={`/admin/orders/${o.id}`}>
                        <Button variant="outline" size="sm" className="h-7 px-2.5 text-xs">
                          <Eye className="w-3.5 h-3.5 mr-1" />
                          Подробнее
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-atelier-border flex items-center justify-between text-xs text-atelier-muted">
            <span>
              Страница {page} из {totalPages}
            </span>
            <div className="flex space-x-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1 || isLoading}
                onClick={() => fetchOrders(page - 1)}
                className="text-xs"
              >
                Назад
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages || isLoading}
                onClick={() => fetchOrders(page + 1)}
                className="text-xs"
              >
                Вперёд
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
