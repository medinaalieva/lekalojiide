"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useCart } from "../../lib/cart-context";
import { useAuth } from "../../lib/auth-context";
import { api } from "../../lib/api";
import { Button } from "../../components/ui/Button";
import {
  ShieldCheck,
  CreditCard,
  CheckCircle,
  AlertCircle,
  ArrowRight,
  ExternalLink,
  Scissors,
  Check,
  XCircle,
  RotateCcw,
  Sparkles,
  Layers,
} from "lucide-react";

export default function CheckoutPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { cart, itemsCount, totalAmountKgs, refreshCart } = useCart();

  // Contact fields (BUG-01 fix: aligned with backend CheckoutDtoSchema)
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerNote, setCustomerNote] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Result of successful checkout
  const [createdOrder, setCreatedOrder] = useState<any | null>(null);
  const [paymentInfo, setPaymentInfo] = useState<any | null>(null);

  // In-place Payment Sandbox Simulation
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationStatus, setSimulationStatus] = useState<"SUCCEEDED" | "FAILED" | "CANCELED" | null>(null);

  useEffect(() => {
    if (user) {
      if (!customerName) {
        const full = [user.firstName, user.lastName].filter(Boolean).join(" ");
        if (full) setCustomerName(full);
      }
      if (user.email && !customerEmail) setCustomerEmail(user.email);
      if (user.phone && !customerPhone) setCustomerPhone(user.phone);
    }
  }, [user, customerName, customerEmail, customerPhone]);

  // Guest wall: guide to login with safe redirect
  if (!user) {
    return (
      <div className="bg-atelier-surface min-h-[70vh] flex items-center justify-center py-16 px-4 sm:px-6">
        <div className="max-w-md w-full mx-auto text-center bg-white p-8 sm:p-10 border border-atelier-border rounded-sm shadow-sm">
          <CreditCard className="w-12 h-12 text-atelier-muted mx-auto mb-4 stroke-[1.2]" />
          <h2 className="font-serif text-2xl font-bold text-brand-950">
            Оформление заказа
          </h2>
          <p className="text-xs text-atelier-muted mt-2 leading-relaxed">
            Для оформления заказа, безопасной оплаты и сохранения цифровых выкроек в вашем личном кабинете войдите в аккаунт.
          </p>
          <div className="mt-6 flex flex-col space-y-3">
            <Link href="/login?redirect=/checkout">
              <Button className="w-full">Войти в аккаунт</Button>
            </Link>
            <Link href="/register?redirect=/checkout">
              <Button variant="outline" className="w-full">
                Зарегистрироваться
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const items = cart?.items || [];

  if (items.length === 0 && !createdOrder) {
    return (
      <div className="bg-atelier-surface min-h-[70vh] flex items-center justify-center py-16 px-4 sm:px-6">
        <div className="max-w-md w-full mx-auto text-center bg-white p-8 sm:p-10 border border-atelier-border rounded-sm shadow-sm">
          <h2 className="font-serif text-2xl font-bold text-brand-950">
            В корзине нет товаров
          </h2>
          <p className="text-xs text-atelier-muted mt-2 leading-relaxed">
            Добавьте понравившуюся выкройку в каталоге перед оформлением.
          </p>
          <Link href="/catalog" className="inline-block mt-6">
            <Button>В каталог выкроек</Button>
          </Link>
        </div>
      </div>
    );
  }

  const handleCheckoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Client-side validations
    const trimmedName = customerName.trim();
    if (!trimmedName || trimmedName.length < 2) {
      setError("Пожалуйста, укажите имя и фамилию (минимум 2 символа).");
      return;
    }

    const trimmedEmail = customerEmail.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      setError("Пожалуйста, укажите корректный адрес электронной почты.");
      return;
    }

    setIsSubmitting(true);

    try {
      // BUG-01 Fix: align field names with CheckoutDtoSchema
      const payload: {
        customerName: string;
        customerEmail: string;
        customerPhone?: string | null;
      } = {
        customerName: trimmedName,
        customerEmail: trimmedEmail,
        customerPhone: customerPhone.trim() || null,
      };

      const res = await api.post<{
        success: boolean;
        data: any;
      }>("/api/v1/orders/checkout", payload);

      if (res.success && res.data) {
        const orderData = res.data.order || res.data;
        setCreatedOrder(orderData);
        await refreshCart();

        // Auto-initiate payment to get active payment details
        const orderId = orderData.orderId || orderData.id;
        if (orderId) {
          try {
            const payRes = await api.post<{
              success: boolean;
              data: {
                paymentId: string;
                paymentUrl: string;
                idempotencyKey: string;
                amount: number;
                currency: string;
              };
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

  // Payment simulation handler (BUG-03 fix)
  const handleSimulatePayment = async (status: "SUCCEEDED" | "FAILED" | "CANCELED") => {
    const orderId = createdOrder?.orderId || createdOrder?.id;
    if (!orderId) return;

    setIsSimulating(true);
    setError(null);

    try {
      const res = await api.post<{
        success: boolean;
        data: any;
      }>(`/api/v1/orders/${orderId}/mock-simulate`, { status });

      if (res.success) {
        setSimulationStatus(status);

        // Fetch verified order payment status from backend
        const statusRes = await api.get<{
          success: boolean;
          data: {
            orderStatus: string;
            isPaid: boolean;
          };
        }>(`/api/v1/orders/${orderId}/payment-status`);

        if (statusRes.success && statusRes.data) {
          setCreatedOrder((prev: any) => ({
            ...prev,
            status: statusRes.data.orderStatus,
            isPaid: statusRes.data.isPaid,
          }));
        }
      }
    } catch (err: any) {
      setError(err.message || "Ошибка при обработке тестового платежа");
    } finally {
      setIsSimulating(false);
    }
  };

  // Order created confirmation view with local Test Payment Sandbox
  if (createdOrder) {
    const isPaid = createdOrder.status === "PAID" || simulationStatus === "SUCCEEDED";
    const isFailed = simulationStatus === "FAILED";
    const isCanceled = simulationStatus === "CANCELED";
    const orderId = createdOrder.orderId || createdOrder.id;
    const idempotencyKey = paymentInfo?.idempotencyKey || orderId;

    return (
      <div className="bg-atelier-surface min-h-screen py-12 px-4 sm:px-6">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white p-6 sm:p-10 border border-atelier-border rounded-sm shadow-sm text-center space-y-6">
            {isPaid ? (
              <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                <Check className="w-10 h-10" />
              </div>
            ) : (
              <CheckCircle className="w-16 h-16 text-brand-800 mx-auto" />
            )}

            <div>
              <span className="text-xs font-semibold uppercase tracking-widest text-brand-700">
                {isPaid ? "Оплата успешно подтверждена" : "Заказ ожидает оплаты"}
              </span>
              <h1 className="font-serif text-3xl font-bold text-brand-950 mt-1">
                Заказ № {createdOrder.orderNumber}
              </h1>
              <p className="text-xs text-atelier-muted mt-2">
                Сумма к оплате:{" "}
                <strong className="text-brand-950 text-base font-bold">
                  {(
                    createdOrder.totalAmount ??
                    createdOrder.totalKgs ??
                    0
                  ).toLocaleString("ru-RU")}{" "}
                  KGS
                </strong>
              </p>
              <p className="text-[11px] text-atelier-muted mt-0.5">
                Получатель: {createdOrder.customerName || customerName} ({createdOrder.customerEmail || customerEmail})
              </p>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-sm text-xs text-red-800 text-left flex items-start space-x-2">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* Status alerts */}
            {isPaid && (
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-sm text-left text-xs text-emerald-950 space-y-1">
                <div className="font-bold flex items-center space-x-1.5 text-emerald-800">
                  <Check className="w-4 h-4" />
                  <span>Цифровые права активированы!</span>
                </div>
                <p className="text-emerald-900/90 leading-relaxed">
                  Платёж подтверждён сервером. Все выкройки, ростовки и инструкции уже доступны для скачивания в вашем личном кабинете.
                </p>
              </div>
            )}

            {isFailed && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-sm text-left text-xs text-red-950 space-y-1">
                <div className="font-bold flex items-center space-x-1.5 text-red-800">
                  <XCircle className="w-4 h-4" />
                  <span>Платёж отклонён банком</span>
                </div>
                <p className="text-red-900/90 leading-relaxed">
                  Тестовый шлюз вернул статус FAILED. Вы можете повторить попытку оплаты.
                </p>
              </div>
            )}

            {isCanceled && (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-sm text-left text-xs text-amber-950 space-y-1">
                <div className="font-bold flex items-center space-x-1.5 text-amber-800">
                  <RotateCcw className="w-4 h-4" />
                  <span>Платёж отменён пользователем</span>
                </div>
                <p className="text-amber-900/90 leading-relaxed">
                  Попытка оплаты была отменена. Заказ остаётся в ожидании оплаты.
                </p>
              </div>
            )}

            {/* Test Payment Sandbox Panel */}
            <div className="p-6 bg-brand-50/60 border border-brand-200/60 rounded-sm text-left space-y-4">
              <div className="flex items-center justify-between border-b border-brand-200/60 pb-3">
                <div className="flex items-center space-x-2 text-xs font-semibold uppercase tracking-wider text-brand-950">
                  <CreditCard className="w-4 h-4 text-brand-800" />
                  <span>Тестовый платежный шлюз (KGS Sandbox)</span>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-sm">
                  Активен
                </span>
              </div>

              <p className="text-xs text-atelier-charcoal leading-relaxed">
                В тестовом окружении выберите сценарий для проверки сквозной обработки платежа через защищенный вебхук:
              </p>

              {/* Scenario buttons */}
              {!isPaid ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                  <Button
                    size="md"
                    className="bg-emerald-700 hover:bg-emerald-800 text-white font-medium text-xs justify-center"
                    isLoading={isSimulating}
                    disabled={isSimulating}
                    onClick={() => handleSimulatePayment("SUCCEEDED")}
                  >
                    <span>✅ Оплатить (Успех)</span>
                  </Button>

                  <Button
                    variant="outline"
                    size="md"
                    className="border-red-300 text-red-700 hover:bg-red-50 font-medium text-xs justify-center"
                    isLoading={isSimulating}
                    disabled={isSimulating}
                    onClick={() => handleSimulatePayment("FAILED")}
                  >
                    <span>❌ Отказ банка</span>
                  </Button>

                  <Button
                    variant="outline"
                    size="md"
                    className="border-atelier-border text-atelier-charcoal hover:bg-atelier-subtle font-medium text-xs justify-center"
                    isLoading={isSimulating}
                    disabled={isSimulating}
                    onClick={() => handleSimulatePayment("CANCELED")}
                  >
                    <span>↩️ Отмена</span>
                  </Button>
                </div>
              ) : (
                <div className="pt-2">
                  <Link href="/cabinet/library" className="block">
                    <Button size="lg" className="w-full text-base bg-emerald-700 hover:bg-emerald-800">
                      <span>Перейти в Мои выкройки (Скачать PDF)</span>
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </Link>
                </div>
              )}

              {/* Link to dedicated mock payment page */}
              <div className="pt-3 border-t border-brand-200/50 flex flex-col sm:flex-row items-center justify-between text-xs text-atelier-muted gap-2">
                <span>Отдельная страница эмулятора:</span>
                <Link
                  href={`/payment/mock/${idempotencyKey}?orderId=${orderId}&order=${encodeURIComponent(
                    createdOrder.orderNumber
                  )}&amount=${createdOrder.totalAmount ?? 0}&currency=KGS`}
                  className="text-brand-800 hover:text-brand-950 font-medium inline-flex items-center space-x-1 underline"
                >
                  <span>Открыть шлюз в отдельном окне</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>

            {/* Navigation links */}
            <div className="pt-2 flex flex-wrap justify-center gap-6 text-xs">
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
    <div className="bg-atelier-surface min-h-screen py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
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
              <div className="bg-white p-6 sm:p-8 border border-atelier-border rounded-sm shadow-2xs space-y-4">
                <h2 className="font-serif text-base font-bold text-brand-950 border-b border-atelier-border pb-3">
                  1. Данные для отправки чека и доступа к выкройкам
                </h2>

                {error && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-sm flex items-start space-x-2 text-xs text-red-800">
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                {/* BUG-01 Fix: customerName input */}
                <div>
                  <label htmlFor="customerName" className="block text-xs font-semibold uppercase tracking-wider text-atelier-charcoal mb-1">
                    Имя и фамилия покупателя *
                  </label>
                  <input
                    type="text"
                    id="customerName"
                    name="customerName"
                    required
                    minLength={2}
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Айпери Бектемирова"
                    className="w-full px-3 py-2 text-sm border border-atelier-border rounded-sm focus:outline-none focus:border-brand-500"
                  />
                  <span className="text-[11px] text-atelier-muted mt-1 block">
                    Указывается в чеке и сопроводительных документах
                  </span>
                </div>

                {/* BUG-01 Fix: customerEmail input */}
                <div>
                  <label htmlFor="customerEmail" className="block text-xs font-semibold uppercase tracking-wider text-atelier-charcoal mb-1">
                    Email для получения доступа *
                  </label>
                  <input
                    type="email"
                    id="customerEmail"
                    name="customerEmail"
                    required
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    placeholder="example@mail.kg"
                    className="w-full px-3 py-2 text-sm border border-atelier-border rounded-sm focus:outline-none focus:border-brand-500"
                  />
                  <span className="text-[11px] text-atelier-muted mt-1 block">
                    На этот адрес будет выслан электронный чек и уведомление об обновлении выкроек
                  </span>
                </div>

                {/* BUG-01 Fix: customerPhone input */}
                <div>
                  <label htmlFor="customerPhone" className="block text-xs font-semibold uppercase tracking-wider text-atelier-charcoal mb-1">
                    Номер телефона (WhatsApp / Telegram)
                  </label>
                  <input
                    type="tel"
                    id="customerPhone"
                    name="customerPhone"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="+996 555 123456"
                    className="w-full px-3 py-2 text-sm border border-atelier-border rounded-sm focus:outline-none focus:border-brand-500"
                  />
                  <span className="text-[11px] text-atelier-muted mt-1 block">
                    Для оперативной связи в мессенджерах при возникновении вопросов
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-atelier-charcoal mb-1">
                    Примечание к заказу (необязательно)
                  </label>
                  <textarea
                    rows={2}
                    value={customerNote}
                    onChange={(e) => setCustomerNote(e.target.value)}
                    placeholder="Дополнительные пожелания к заказу..."
                    className="w-full px-3 py-2 text-sm border border-atelier-border rounded-sm focus:outline-none focus:border-brand-500"
                  />
                </div>
              </div>

              {/* Payment Method Details */}
              <div className="bg-white p-6 sm:p-8 border border-atelier-border rounded-sm shadow-2xs space-y-3">
                <div className="flex items-center justify-between border-b border-atelier-border pb-3">
                  <h2 className="font-serif text-base font-bold text-brand-950">
                    2. Способ оплаты
                  </h2>
                  <span className="text-[11px] text-atelier-muted">
                    Валюта: KGS (сом)
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
                    const isBundle = Boolean(
                      item.isBundle ||
                      sizeStr === "ALL" ||
                      (typeof sizeStr === "string" && sizeStr.toLowerCase().includes("все размеры"))
                    );

                    return (
                      <div key={item.id} className="pt-2 flex justify-between text-xs">
                        <div className="pr-2">
                          <p className="font-medium text-atelier-charcoal line-clamp-1">{title}</p>
                          <div className="mt-0.5 flex flex-wrap gap-1 text-[11px] text-atelier-muted">
                            {isBundle ? (
                              <span className="text-amber-800 font-semibold inline-flex items-center space-x-1">
                                <Layers className="w-3 h-3 text-amber-700 inline" />
                                <span>Комплект ALL</span>
                              </span>
                            ) : (
                              sizeStr && <span>{sizeStr} RU</span>
                            )}
                            {heightStr && <span>· {heightStr}</span>}
                            {formatStr && <span>· {formatStr}</span>}
                          </div>
                        </div>
                        <span className="font-semibold text-brand-950 shrink-0">
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
                    <span className="text-emerald-700 font-medium">Бесплатно (PDF в ЛК)</span>
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
                  <span>Подтвердить и перейти к оплате</span>
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
