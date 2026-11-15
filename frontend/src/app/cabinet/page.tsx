"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../../lib/auth-context";
import { Order } from "../../types";
import { api } from "../../lib/api";
import { Button } from "../../components/ui/Button";
import {
  User,
  Package,
  BookOpen,
  Download,
  CreditCard,
  CheckCircle,
  Clock,
  AlertCircle,
  ExternalLink,
  LogOut,
} from "lucide-react";

export default function CabinetPage() {
  const router = useRouter();
  const { user, logout, isLoading: authLoading } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    async function loadOrders() {
      if (!user) return;
      try {
        const res = await api.get<{ success: boolean; data: Order[] }>("/api/v1/orders");
        if (res.success && res.data) {
          setOrders(res.data);
        }
      } catch (err) {
        console.error("Failed to load orders:", err);
      } finally {
        setLoadingOrders(false);
      }
    }

    if (user) {
      loadOrders();
    }
  }, [user]);

  if (authLoading || !user) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16">
        <div className="h-40 bg-atelier-subtle animate-pulse rounded-sm" />
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "PAID":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-sm text-xs font-medium bg-emerald-50 text-emerald-800 border border-emerald-200">
            <CheckCircle className="w-3 h-3 mr-1" /> Оплачен
          </span>
        );
      case "PENDING":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-sm text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200">
            <Clock className="w-3 h-3 mr-1" /> Ожидает оплаты
          </span>
        );
      case "CANCELLED":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-sm text-xs font-medium bg-red-50 text-red-800 border border-red-200">
            <AlertCircle className="w-3 h-3 mr-1" /> Отменен
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-sm text-xs font-medium bg-gray-50 text-gray-800 border border-gray-200">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="bg-atelier-surface min-h-screen py-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Profile Header */}
        <div className="bg-white p-6 sm:p-8 border border-atelier-border rounded-sm shadow-sm mb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-4">
            <div className="w-14 h-14 bg-brand-100 rounded-full flex items-center justify-center text-brand-900">
              <User className="w-7 h-7 stroke-[1.5]" />
            </div>
            <div>
              <h1 className="font-serif text-2xl font-bold text-brand-950">
                {user.firstName ? `${user.firstName} ${user.lastName || ""}` : "Покупатель"}
              </h1>
              <p className="text-xs text-atelier-muted">{user.email}</p>
              {user.phone && <p className="text-xs text-atelier-muted">{user.phone}</p>}
            </div>
          </div>

          <div className="flex items-center space-x-3 w-full sm:w-auto">
            <Link href="/cabinet/library">
              <Button size="sm">
                <BookOpen className="w-4 h-4 mr-1.5" />
                Мои выкройки
              </Button>
            </Link>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                logout();
                router.push("/");
              }}
            >
              <LogOut className="w-4 h-4 mr-1.5 text-red-600" />
              Выйти
            </Button>
          </div>
        </div>

        {/* Quick Nav Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-10">
          <Link
            href="/cabinet/library"
            className="p-6 bg-white border border-atelier-border rounded-sm hover:shadow-md transition-all group"
          >
            <BookOpen className="w-8 h-8 text-brand-800 mb-3 group-hover:scale-110 transition-transform" />
            <h3 className="font-serif font-bold text-lg text-brand-950">
              Мои выкройки
            </h3>
            <p className="text-xs text-atelier-muted mt-1 leading-relaxed">
              Все купленные цифровые выкройки, доступные для мгновенного скачивания.
            </p>
          </Link>

          <Link
            href="/cabinet/downloads"
            className="p-6 bg-white border border-atelier-border rounded-sm hover:shadow-md transition-all group"
          >
            <Download className="w-8 h-8 text-brand-800 mb-3 group-hover:scale-110 transition-transform" />
            <h3 className="font-serif font-bold text-lg text-brand-950">
              Центр скачивания
            </h3>
            <p className="text-xs text-atelier-muted mt-1 leading-relaxed">
              Генерация защищенных ссылок на PDF-лекала и инструкции по сборке.
            </p>
          </Link>

          <Link
            href="/catalog"
            className="p-6 bg-white border border-atelier-border rounded-sm hover:shadow-md transition-all group"
          >
            <Package className="w-8 h-8 text-brand-800 mb-3 group-hover:scale-110 transition-transform" />
            <h3 className="font-serif font-bold text-lg text-brand-950">
              Новые модели
            </h3>
            <p className="text-xs text-atelier-muted mt-1 leading-relaxed">
              Перейти в каталог за свежими выкройками и сезонными новинками.
            </p>
          </Link>
        </div>

        {/* Orders History Section */}
        <div className="bg-white border border-atelier-border rounded-sm p-6 sm:p-8">
          <div className="border-b border-atelier-border pb-4 mb-6">
            <h2 className="font-serif text-xl font-bold text-brand-950">
              История заказов
            </h2>
            <p className="text-xs text-atelier-muted mt-1">
              Список всех ваших заказов и их текущий платежный статус
            </p>
          </div>

          {loadingOrders ? (
            <div className="space-y-4">
              {[1, 2].map((n) => (
                <div
                  key={n}
                  className="h-20 bg-atelier-subtle animate-pulse rounded-sm"
                />
              ))}
            </div>
          ) : orders.length > 0 ? (
            <div className="space-y-4">
              {orders.map((order) => (
                <div
                  key={order.id}
                  className="p-5 border border-atelier-border rounded-sm hover:border-brand-300 transition-colors"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-atelier-border/60 gap-2">
                    <div>
                      <span className="font-serif font-bold text-sm text-brand-950">
                        Заказ № {order.orderNumber}
                      </span>
                      <span className="text-xs text-atelier-muted ml-3">
                        {new Date(order.createdAt).toLocaleDateString("ru-RU", {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })}
                      </span>
                    </div>
                    <div className="flex items-center space-x-3">
                      {getStatusBadge(order.status)}
                      <span className="font-serif font-bold text-base text-brand-950">
                        {(order.totalAmount ?? order.totalKgs ?? 0).toLocaleString("ru-RU")} KGS
                      </span>
                    </div>
                  </div>

                  {/* Order Items list */}
                  <div className="pt-3 space-y-2">
                    {order.items?.map((item) => {
                      const itemTitle =
                        item.productTitle ||
                        item.productSnapshot?.title ||
                        "Выкройка";
                      const rawSize = item.size || item.productSnapshot?.size;
                      const itemSize = typeof rawSize === "object" ? (rawSize as any)?.label : rawSize;
                      const rawHeight = item.height || item.productSnapshot?.height;
                      const itemHeight = typeof rawHeight === "object" ? (rawHeight as any)?.label : rawHeight;
                      const rawFormat = item.format || item.productSnapshot?.format;
                      const itemFormat = typeof rawFormat === "object" ? (rawFormat as any)?.label : rawFormat;
                      const itemPrice =
                        item.priceAtPurchase ??
                        item.priceKgs ??
                        item.price ??
                        0;

                      return (
                        <div
                          key={item.id}
                          className="flex justify-between items-center text-xs"
                        >
                          <span className="text-atelier-charcoal font-medium">
                            {itemTitle}{" "}
                            {(itemSize || itemHeight || itemFormat) && (
                              <span className="text-atelier-muted font-normal">
                                ({[
                                  itemSize ? `${itemSize} RU` : "",
                                  itemHeight ? `${itemHeight} см` : "",
                                  itemFormat || "",
                                ]
                                  .filter(Boolean)
                                  .join(" · ")}
                                )
                              </span>
                            )}
                          </span>
                          <span className="text-atelier-muted">
                            {itemPrice.toLocaleString("ru-RU")} KGS
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Action row */}
                  {order.status === "PAID" && (
                    <div className="mt-4 pt-3 border-t border-atelier-border/50 flex justify-end">
                      <Link href="/cabinet/library">
                        <Button variant="secondary" size="sm">
                          <Download className="w-3.5 h-3.5 mr-1" />
                          Скачать выкройки
                        </Button>
                      </Link>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <Package className="w-12 h-12 text-atelier-muted mx-auto mb-3" />
              <p className="text-sm font-medium text-brand-950">
                У вас пока нет оформленных заказов
              </p>
              <p className="text-xs text-atelier-muted mt-1">
                Выберите понравившуюся модель в каталоге
              </p>
              <Link href="/catalog" className="inline-block mt-4">
                <Button size="sm">Перейти в каталог</Button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
