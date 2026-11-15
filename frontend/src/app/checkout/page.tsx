"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useCart } from "../../lib/cart-context";
import { useAuth } from "../../lib/auth-context";
import { api, ApiError } from "../../lib/api";
import { Button } from "../../components/ui/Button";
import {
  ShieldCheck,
  CreditCard,
  CheckCircle,
  AlertCircle,
  ArrowRight,
  ExternalLink,
  Scissors,
} from "lucide-react";

export default function CheckoutPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { cart, itemsCount, totalAmountKgs, refreshCart } = useCart();

  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [customerNote, setCustomerNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Result of successful checkout
  const [createdOrder, setCreatedOrder] = useState<any | null>(null);
  const [paymentInfo, setPaymentInfo] = useState<any | null>(null);

  useEffect(() => {
    if (user) {
      if (user.email && !contactEmail) setContactEmail(user.email);
      if (user.phone && !contactPhone) setContactPhone(user.phone);
    }
  }, [user, contactEmail, contactPhone]);

  if (!user) {
    return (
      <div className="bg-atelier-surface min-h-[70vh] flex items-center justify-center py-16">
        <div className="max-w-md w-full mx-auto px-4 text-center bg-white p-8 border border-atelier-border rounded-sm">
          <CreditCard className="w-12 h-12 text-atelier-muted mx-auto mb-4" />
          <h2 className="font-serif text-2xl font-bold text-brand-950">
            Оформление заказа
          </h2>
          <p className="text-xs text-atelier-muted mt-2">
            Для завершения покупки и привязки выкроек к вашему профилю войдите в аккаунт.
          </p>
          <Link href="/login" className="inline-block mt-6">
            <Button>Войти в аккаунт</Button>
          </Link>
        </div>
      </div>
    );
  }

  const items = cart?.items || [];

  if (items.length === 0 && !createdOrder) {
    return (
      <div className="bg-atelier-surface min-h-[70vh] flex items-center justify-center py-16">
        <div className="max-w-md w-full mx-auto px-4 text-center bg-white p-8 border border-atelier-border rounded-sm">
          <h2 className="font-serif text-2xl font-bold text-brand-950">
            В корзине нет товаров
          </h2>
          <p className="text-xs text-atelier-muted mt-2">
            Добавьте выкройку в каталоге перед оформлением.
          </p>
          <Link href="/catalog" className="inline-block mt-6">
            <Button>В каталог</Button>
          </Link>
        </div>
      </div>
    );
  }

  const handleCheckoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const payload: {
        contactEmail?: string;
        contactPhone?: string;
        customerNote?: string;
      } = {};

      if (contactEmail.trim()) payload.contactEmail = contactEmail.trim();
      if (contactPhone.trim()) payload.contactPhone = contactPhone.trim();
      if (customerNote.trim()) payload.customerNote = customerNote.trim();

      const res = await api.post<{
        success: boolean;
        data: {
          order: any;
          payment?: any;
        };
      }>("/api/v1/orders/checkout", payload);

      if (res.success && res.data) {
        const orderData = (res.data as any).order || res.data;
        setCreatedOrder(orderData);
        await refreshCart();

        // Auto-initiate payment to get active paymentUrl
        const orderId = orderData.orderId || orderData.id;
        if (orderId) {
          try {
            const payRes = await api.post<{
              success: boolean;
              data: { paymentUrl: string; externalId?: string };
            }>(`/api/v1/orders/${orderId}/payment`, {});
            if (payRes.success && payRes.data) {
              setPaymentInfo(payRes.data);
            }
          } catch (payErr) {
            console.warn("Could not auto-initiate payment:", payErr);
          }
        }
      }
    } catch (err: any) {
      setError(err.message || "Не удалось оформить заказ. Попробуйте еще раз.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // If order successfully created, show confirmation & payment step
  if (createdOrder) {
    return (
      <div className="bg-atelier-surface min-h-screen py-16">
        <div className="max-w-2xl mx-auto px-4">
          <div className="bg-white p-8 border border-atelier-border rounded-sm shadow-sm text-center">
            <CheckCircle className="w-16 h-16 text-emerald-600 mx-auto mb-4" />
            <span className="text-xs font-semibold uppercase tracking-widest text-brand-700">
              Заказ успешно оформлен
            </span>
            <h1 className="font-serif text-3xl font-bold text-brand-950 mt-1">
              Заказ № {createdOrder.orderNumber}
            </h1>
            <p className="text-xs text-atelier-muted mt-2">
              Сумма к оплате:{" "}
              <strong className="text-brand-950 text-base">
                {(
                  createdOrder.totalAmount ??
                  createdOrder.totalKgs ??
                  0
                ).toLocaleString("ru-RU")}{" "}
                KGS
              </strong>
            </p>

            <div className="mt-8 p-6 bg-brand-50/60 border border-brand-200/60 rounded-sm text-left space-y-4">
              <div className="flex items-center space-x-2 text-xs font-semibold uppercase tracking-wider text-brand-950">
                <CreditCard className="w-4 h-4 text-brand-800" />
                <span>Тестовая оплата онлайн (KGS Sandbox)</span>
              </div>
              <p className="text-xs text-atelier-charcoal leading-relaxed">
                Для перехода в тестовый платёжный шлюз нажмите кнопку ниже. После подтверждения транзакции файлы выкроек мгновенно появятся в разделе «Мои выкройки».
              </p>

              {paymentInfo?.paymentUrl ? (
                <a
                  href={paymentInfo.paymentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block"
                >
                  <Button size="lg" className="w-full text-base">
                    <span>
                      Оплатить заказ{" "}
                      {createdOrder.totalAmount ?? createdOrder.totalKgs ?? ""}{" "}
                      сом
                    </span>
                    <ExternalLink className="w-4 h-4 ml-2" />
                  </Button>
                </a>
              ) : (
                <Link href={`/cabinet`} className="block">
                  <Button size="lg" className="w-full text-base">
                    <span>Перейти в личный кабинет</span>
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
              )}
            </div>

            <div className="mt-6 flex flex-wrap justify-center gap-4 text-xs">
              <Link
                href="/cabinet/library"
                className="text-brand-800 hover:text-brand-950 font-medium underline"
              >
                Моя библиотека выкроек →
              </Link>
              <Link
                href="/catalog"
                className="text-atelier-muted hover:text-atelier-charcoal"
              >
                Вернуться в каталог
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-atelier-surface min-h-screen py-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="border-b border-atelier-border pb-4 mb-8">
          <span className="text-xs uppercase tracking-widest text-brand-700 font-semibold">
            Оформление покупки
          </span>
          <h1 className="font-serif text-3xl font-bold text-brand-950 mt-1">
            Контактные данные и оплата
          </h1>
        </div>

        <form onSubmit={handleCheckoutSubmit}>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Form Fields - 7 cols */}
            <div className="lg:col-span-7 space-y-6">
              <div className="bg-white p-6 border border-atelier-border rounded-sm space-y-4">
                <h2 className="font-serif text-base font-bold text-brand-950 border-b border-atelier-border pb-3">
                  1. Данные для отправки чека и доступа к выкройкам
                </h2>

                {error && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-sm flex items-start space-x-2 text-xs text-red-800">
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-atelier-charcoal mb-1">
                    Email для получения доступа *
                  </label>
                  <input
                    type="email"
                    required
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    placeholder="example@mail.kg"
                    className="w-full px-3 py-2 text-sm border border-atelier-border rounded-sm focus:outline-none focus:border-brand-500"
                  />
                  <span className="text-[11px] text-atelier-muted mt-1 block">
                    На этот адрес будет выслан чек и уведомление об обновлении версий выкроек
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-atelier-charcoal mb-1">
                    Номер телефона (WhatsApp / Telegram)
                  </label>
                  <input
                    type="tel"
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    placeholder="+996 555 123456"
                    className="w-full px-3 py-2 text-sm border border-atelier-border rounded-sm focus:outline-none focus:border-brand-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-atelier-charcoal mb-1">
                    Примечание к заказу (необязательно)
                  </label>
                  <textarea
                    rows={2}
                    value={customerNote}
                    onChange={(e) => setCustomerNote(e.target.value)}
                    placeholder="Дополнительные пожелания..."
                    className="w-full px-3 py-2 text-sm border border-atelier-border rounded-sm focus:outline-none focus:border-brand-500"
                  />
                </div>
              </div>

              {/* Payment Method Details */}
              <div className="bg-white p-6 border border-atelier-border rounded-sm space-y-3">
                <div className="flex items-center justify-between border-b border-atelier-border pb-3">
                  <h2 className="font-serif text-base font-bold text-brand-950">
                    2. Способ оплаты
                  </h2>
                  <span className="text-[11px] text-atelier-muted">
                    Валюта расчетов: KGS (сом)
                  </span>
                </div>

                {/* Active Test/Sandbox Method */}
                <div className="p-4 border-2 border-brand-800 bg-brand-50/40 rounded-sm flex items-start justify-between">
                  <div className="flex items-start space-x-3">
                    <div className="mt-0.5">
                      <input
                        type="radio"
                        id="payment-mock"
                        name="payment-method"
                        checked
                        readOnly
                        className="text-brand-800 focus:ring-brand-500"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="payment-mock"
                        className="text-xs font-bold text-brand-950 cursor-pointer block"
                      >
                        Тестовый платежный шлюз (KGS Sandbox)
                      </label>
                      <p className="text-[11px] text-atelier-charcoal mt-0.5 leading-relaxed">
                        Безопасная онлайн-оплата в сомах с моментальным подтверждением и открытием доступа к файлам в личном кабинете.
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-sm shrink-0 ml-2">
                    Активен
                  </span>
                </div>

                {/* Disabled Real Processors Under Integration */}
                <div className="space-y-2 pt-2">
                  <div className="p-3 border border-atelier-border/70 bg-atelier-subtle/50 rounded-sm flex items-center justify-between opacity-60 cursor-not-allowed">
                    <div className="flex items-center space-x-3">
                      <CreditCard className="w-4 h-4 text-atelier-muted" />
                      <div>
                        <span className="text-xs font-medium text-atelier-charcoal">
                          Банковские карты КР (Элкарт, Visa, MasterCard)
                        </span>
                        <span className="block text-[10px] text-atelier-muted">
                          Прямой эквайринг коммерческих банков КР
                        </span>
                      </div>
                    </div>
                    <span className="text-[9px] uppercase font-semibold tracking-wider px-2 py-0.5 bg-atelier-subtle border border-atelier-border text-atelier-muted rounded-sm">
                      В процессе подключения
                    </span>
                  </div>

                  <div className="p-3 border border-atelier-border/70 bg-atelier-subtle/50 rounded-sm flex items-center justify-between opacity-60 cursor-not-allowed">
                    <div className="flex items-center space-x-3">
                      <CreditCard className="w-4 h-4 text-atelier-muted" />
                      <div>
                        <span className="text-xs font-medium text-atelier-charcoal">
                          Мобильные кошельки (MBank, О!Деньги)
                        </span>
                        <span className="block text-[10px] text-atelier-muted">
                          Оплата по динамическому QR-коду
                        </span>
                      </div>
                    </div>
                    <span className="text-[9px] uppercase font-semibold tracking-wider px-2 py-0.5 bg-atelier-subtle border border-atelier-border text-atelier-muted rounded-sm">
                      В процессе подключения
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Summary Box - 5 cols */}
            <div className="lg:col-span-5">
              <div className="bg-white p-6 border border-atelier-border rounded-sm shadow-sm space-y-5 sticky top-28">
                <h2 className="font-serif text-base font-bold text-brand-950 border-b border-atelier-border pb-3">
                  Состав заказа ({itemsCount})
                </h2>

                <div className="max-h-60 overflow-y-auto space-y-3 divide-y divide-atelier-border/50">
                  {items.map((item) => {
                    const title = item.title || item.variant?.product?.title || "Выкройка";
                    const sizeStr = typeof item.size === "object" ? item.size?.label : item.size || item.variant?.size;
                    const heightStr = typeof item.height === "object" ? item.height?.label : item.height || item.variant?.height;
                    const formatStr = typeof item.format === "object" ? item.format?.label : item.format || item.variant?.format;
                    const price = item.price ?? item.variant?.priceKgs ?? item.variant?.price ?? 0;

                    return (
                      <div key={item.id} className="pt-2 flex justify-between text-xs">
                        <div>
                          <p className="font-medium text-atelier-charcoal">{title}</p>
                          <p className="text-[11px] text-atelier-muted">
                            {sizeStr ? `${sizeStr} RU · ` : ""}{heightStr ? `${heightStr} см · ` : ""}{formatStr}
                          </p>
                        </div>
                        <span className="font-semibold text-brand-950 shrink-0 ml-2">
                          {price.toLocaleString("ru-RU")} KGS
                        </span>
                      </div>
                    );
                  })}
                </div>

                <div className="pt-4 border-t border-atelier-border space-y-2 text-xs">
                  <div className="flex justify-between text-atelier-muted">
                    <span>Сумма:</span>
                    <span>{totalAmountKgs.toLocaleString("ru-RU")} KGS</span>
                  </div>
                  <div className="flex justify-between text-atelier-muted">
                    <span>Доставка:</span>
                    <span className="text-emerald-700 font-medium">Бесплатно (PDF)</span>
                  </div>
                  <div className="flex justify-between items-baseline pt-2 border-t border-atelier-border">
                    <span className="text-sm font-bold text-brand-950">
                      Итого к оплате:
                    </span>
                    <span className="font-serif text-2xl font-bold text-brand-950">
                      {totalAmountKgs.toLocaleString("ru-RU")} KGS
                    </span>
                  </div>
                </div>

                <Button
                  type="submit"
                  size="lg"
                  className="w-full text-base"
                  isLoading={isSubmitting}
                  disabled={isSubmitting}
                >
                  <span>Подтвердить и оплатить</span>
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>

                <div className="flex items-center space-x-2 text-[11px] text-atelier-muted justify-center">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>Защищенное SSL соединение 256-bit</span>
                </div>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
