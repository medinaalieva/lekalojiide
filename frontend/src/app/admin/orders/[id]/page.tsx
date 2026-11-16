"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "../../../../lib/api";
import { Order } from "../../../../types";
import { Button } from "../../../../components/ui/Button";
import { Badge } from "../../../../components/ui/Badge";
import {
  ArrowLeft,
  ShoppingCart,
  User,
  CreditCard,
  FileText,
  AlertCircle,
  RefreshCw,
  Clock,
  CheckCircle2,
} from "lucide-react";

export default function AdminOrderDetailPage() {
  const params = useParams();
  const orderId = params?.id as string;

  const [order, setOrder] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOrder = async () => {
    if (!orderId) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.get<{ success: boolean; data: any }>(
        `/api/v1/admin/orders/${orderId}`
      );
      if (res.success && res.data) {
        setOrder(res.data);
      }
    } catch (err: any) {
      setError(err?.message || "Не удалось загрузить подробности заказа");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOrder();
  }, [orderId]);

  if (isLoading) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center space-y-3">
        <div className="w-8 h-8 border-4 border-brand-200 border-t-brand-900 rounded-full animate-spin" />
        <p className="text-xs uppercase tracking-wider text-atelier-muted">
          Загрузка информации о заказе...
        </p>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="max-w-xl mx-auto p-6 bg-white border border-atelier-border rounded-sm shadow-sm text-center space-y-4">
        <AlertCircle className="w-8 h-8 text-red-600 mx-auto" />
        <h2 className="font-serif text-xl font-bold text-brand-950">
          Заказ не найден
        </h2>
        <p className="text-xs text-atelier-muted">
          {error || "Заказ с указанным идентификатором отсутствует в системе"}
        </p>
        <Link href="/admin/orders">
          <Button variant="outline" size="sm" className="text-xs">
            <ArrowLeft className="w-4 h-4 mr-1" /> Вернуться к списку заказов
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-atelier-border pb-4">
        <div className="flex items-center space-x-3">
          <Link href="/admin/orders">
            <Button variant="ghost" size="sm" className="h-8 px-2 text-atelier-muted">
              <ArrowLeft className="w-4 h-4 mr-1" />
              К заказам
            </Button>
          </Link>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="font-serif text-2xl font-bold text-brand-950">
                Заказ № {order.orderNumber}
              </h1>
              <Badge
                variant={
                  order.status === "PAID"
                    ? "success"
                    : order.status === "PENDING"
                    ? "warning"
                    : "neutral"
                }
              >
                {order.status === "PAID"
                  ? "Оплачен"
                  : order.status === "PENDING"
                  ? "В ожидании"
                  : order.status}
              </Badge>
            </div>
            <p className="text-xs text-atelier-muted mt-0.5">
              Создан:{" "}
              {new Date(order.createdAt).toLocaleString("ru-RU", {
                day: "2-digit",
                month: "long",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <Button variant="outline" size="sm" onClick={fetchOrder} className="text-xs">
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            Обновить
          </Button>
        </div>
      </div>

      {/* Two Column Layout: Items + Customer Info */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left (2 cols): Items List */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white p-6 border border-atelier-border rounded-sm shadow-sm space-y-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-brand-950 border-b border-atelier-border pb-2 flex items-center space-x-2">
              <FileText className="w-4 h-4 text-brand-700" />
              <span>Позиции заказа ({order.items?.length || 0})</span>
            </h2>

            <div className="divide-y divide-atelier-border">
              {order.items?.map((item: any, idx: number) => {
                const snapshot = item.snapshot || {};
                return (
                  <div key={item.id || idx} className="py-3 flex items-start justify-between">
                    <div>
                      <div className="font-semibold text-brand-950 text-xs">
                        {snapshot.productTitle || item.product?.title || "Цифровая выкройка"}
                      </div>
                      <div className="text-[11px] text-atelier-muted mt-1 space-x-3">
                        <span>
                          Размер:{" "}
                          <strong className="text-brand-950 font-mono">
                            {snapshot.size || item.size || "—"}
                          </strong>
                        </span>
                        <span>
                          Рост:{" "}
                          <strong className="text-brand-950 font-mono">
                            {snapshot.height || item.height || "—"} см
                          </strong>
                        </span>
                        <span>
                          Формат:{" "}
                          <strong className="text-brand-950 font-mono">
                            {snapshot.format || item.format || "PDF"}
                          </strong>
                        </span>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="font-semibold text-xs text-brand-950">
                        {Number(item.priceKgs || item.price || 0).toLocaleString("ru-RU")}{" "}
                        KGS
                      </div>
                      <div className="text-[10px] text-atelier-muted">
                        Кол-во: {item.quantity || 1} шт.
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="border-t border-atelier-border pt-4 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-atelier-charcoal">
                Итого к оплате
              </span>
              <span className="font-serif text-xl font-bold text-brand-950">
                {Number(order.totalAmount).toLocaleString("ru-RU")} KGS
              </span>
            </div>
          </div>

          {/* Payment Attempts / Transactions */}
          <div className="bg-white p-6 border border-atelier-border rounded-sm shadow-sm space-y-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-brand-950 border-b border-atelier-border pb-2 flex items-center space-x-2">
              <CreditCard className="w-4 h-4 text-brand-700" />
              <span>Транзакции и попытки оплаты ({order.payments?.length || 0})</span>
            </h2>

            {(!order.payments || order.payments.length === 0) ? (
              <p className="text-xs text-atelier-muted py-2">
                Транзакции по данному заказу отсутствуют
              </p>
            ) : (
              <div className="divide-y divide-atelier-border">
                {order.payments.map((p: any) => (
                  <div key={p.id} className="py-2.5 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-medium text-brand-950">
                        Шлюз: {p.gateway || "Freedom Pay / MBank"}
                      </div>
                      <div className="text-[11px] text-atelier-muted font-mono">
                        ID: {p.externalPaymentId || p.id}
                      </div>
                    </div>

                    <div className="text-right">
                      <Badge
                        variant={
                          p.status === "PAID"
                            ? "success"
                            : p.status === "PENDING"
                            ? "warning"
                            : "neutral"
                        }
                      >
                        {p.status}
                      </Badge>
                      <div className="text-[10px] text-atelier-muted mt-1">
                        {new Date(p.createdAt).toLocaleTimeString("ru-RU")}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right (1 col): Customer Details */}
        <div className="space-y-6">
          <div className="bg-white p-6 border border-atelier-border rounded-sm shadow-sm space-y-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-brand-950 border-b border-atelier-border pb-2 flex items-center space-x-2">
              <User className="w-4 h-4 text-brand-700" />
              <span>Информация о клиенте</span>
            </h2>

            <div className="space-y-3 text-xs">
              <div>
                <span className="text-[10px] uppercase tracking-wider text-atelier-muted block">
                  Email покупателя
                </span>
                <span className="font-medium text-brand-950">
                  {order.customerEmail}
                </span>
              </div>

              <div>
                <span className="text-[10px] uppercase tracking-wider text-atelier-muted block">
                  Телефон
                </span>
                <span className="font-medium text-brand-950">
                  {order.customerPhone || "Не указан"}
                </span>
              </div>

              <div>
                <span className="text-[10px] uppercase tracking-wider text-atelier-muted block">
                  Привязка к профилю
                </span>
                <span className="text-atelier-charcoal font-mono text-[11px]">
                  {order.userId ? (
                    <Link
                      href={`/admin/users`}
                      className="text-brand-700 hover:underline"
                    >
                      {order.userId}
                    </Link>
                  ) : (
                    "Гостевой заказ"
                  )}
                </span>
              </div>

              <div>
                <span className="text-[10px] uppercase tracking-wider text-atelier-muted block">
                  Валюта расчёта
                </span>
                <span className="font-semibold text-brand-950">
                  {order.currency || "KGS"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
