"use client";

import React from "react";
import Link from "next/link";
import { useCart } from "../../lib/cart-context";
import { useAuth } from "../../lib/auth-context";
import { Button } from "../../components/ui/Button";
import { Trash2, ShoppingBag, ArrowRight, Scissors, ShieldCheck } from "lucide-react";

export default function CartPage() {
  const { user } = useAuth();
  const { cart, itemsCount, totalAmountKgs, removeItem, clearCart, isLoading } =
    useCart();

  if (!user) {
    return (
      <div className="bg-atelier-surface min-h-[70vh] flex items-center justify-center py-16">
        <div className="max-w-md w-full mx-auto px-4 text-center bg-white p-8 border border-atelier-border rounded-sm shadow-sm">
          <ShoppingBag className="w-12 h-12 text-atelier-muted mx-auto mb-4" />
          <h2 className="font-serif text-2xl font-bold text-brand-950">
            Корзина покупателя
          </h2>
          <p className="text-xs text-atelier-muted mt-2 leading-relaxed">
            Пожалуйста, войдите в свой профиль, чтобы посмотреть сохраненную корзину или продолжить оформление цифровых выкроек.
          </p>
          <div className="mt-6 flex flex-col space-y-3">
            <Link href="/login">
              <Button className="w-full">Войти в аккаунт</Button>
            </Link>
            <Link href="/register">
              <Button variant="outline" className="w-full">
                Зарегистрироваться
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading && !cart) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="h-8 w-48 bg-atelier-subtle animate-pulse mb-8" />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-8 space-y-4">
            {[1, 2].map((i) => (
              <div
                key={i}
                className="h-28 bg-atelier-subtle animate-pulse rounded-sm"
              />
            ))}
          </div>
          <div className="lg:col-span-4 h-64 bg-atelier-subtle animate-pulse rounded-sm" />
        </div>
      </div>
    );
  }

  const items = cart?.items || [];

  if (items.length === 0) {
    return (
      <div className="bg-atelier-surface min-h-[70vh] flex items-center justify-center py-16">
        <div className="max-w-md w-full mx-auto px-4 text-center bg-white p-10 border border-atelier-border rounded-sm shadow-sm">
          <ShoppingBag className="w-12 h-12 text-atelier-muted mx-auto mb-4 stroke-[1.2]" />
          <h2 className="font-serif text-2xl font-bold text-brand-950">
            Ваша корзина пуста
          </h2>
          <p className="text-xs text-atelier-muted mt-2 leading-relaxed">
            Вы пока не выбрали ни одной выкройки. В нашем каталоге представлены современные модели с точной посадкой.
          </p>
          <Link href="/catalog" className="inline-block mt-6">
            <Button size="lg">Перейти в каталог</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-atelier-surface min-h-screen py-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between border-b border-atelier-border pb-4 mb-8">
          <div>
            <span className="text-xs uppercase tracking-widest text-brand-700 font-semibold">
              Заказ
            </span>
            <h1 className="font-serif text-3xl font-bold text-brand-950 mt-1">
              Корзина ({itemsCount})
            </h1>
          </div>
          <button
            onClick={() => clearCart()}
            className="text-xs text-atelier-muted hover:text-red-600 transition-colors"
          >
            Очистить корзину
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Cart items list - 8 cols */}
          <div className="lg:col-span-8 space-y-4">
            {items.map((item) => {
              const title = item.title || item.variant?.product?.title || "Выкройка";
              const slug = item.slug || item.variant?.product?.slug || "";
              const coverImage = item.coverImage || item.variant?.product?.coverImage;
              const sizeStr = typeof item.size === "object" ? item.size?.label : item.size || item.variant?.size;
              const heightStr = typeof item.height === "object" ? item.height?.label : item.height || item.variant?.height;
              const formatStr = typeof item.format === "object" ? item.format?.label : item.format || item.variant?.format;
              const price = item.price ?? item.variant?.priceKgs ?? item.variant?.price ?? 0;

              return (
                <div
                  key={item.id}
                  className="bg-white p-4 sm:p-6 border border-atelier-border rounded-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                >
                  <div className="flex items-center space-x-4">
                    {/* Thumbnail */}
                    <div className="w-16 h-20 bg-atelier-subtle border border-atelier-border rounded-sm overflow-hidden flex items-center justify-center shrink-0">
                      {coverImage ? (
                        <img
                          src={coverImage}
                          alt={title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Scissors className="w-6 h-6 text-atelier-muted" />
                      )}
                    </div>

                    {/* Info */}
                    <div>
                      <Link
                        href={slug ? `/catalog/${slug}` : "/catalog"}
                        className="font-medium text-sm text-atelier-charcoal hover:text-brand-800 line-clamp-1"
                      >
                        {title}
                      </Link>

                      {/* Variant Specs */}
                      <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-atelier-muted">
                        {sizeStr && (
                          <span className="bg-atelier-subtle px-2 py-0.5 rounded-sm">
                            Размер: {sizeStr} RU
                          </span>
                        )}
                        {heightStr && (
                          <span className="bg-atelier-subtle px-2 py-0.5 rounded-sm">
                            Рост: {heightStr} см
                          </span>
                        )}
                        {formatStr && (
                          <span className="bg-atelier-subtle px-2 py-0.5 rounded-sm">
                            Формат: {formatStr}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Price & Remove */}
                  <div className="flex sm:flex-col items-center sm:items-end justify-between w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-0 border-atelier-border">
                    <span className="font-serif text-lg font-bold text-brand-950">
                      {price.toLocaleString("ru-RU")} KGS
                    </span>
                    <button
                      onClick={() => removeItem(item.id)}
                      className="text-xs text-atelier-muted hover:text-red-600 flex items-center space-x-1 mt-2 transition-colors"
                      aria-label="Удалить"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Удалить</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Summary Box - 4 cols */}
          <div className="lg:col-span-4">
            <div className="bg-white p-6 border border-atelier-border rounded-sm shadow-sm sticky top-28 space-y-6">
              <h2 className="font-serif text-lg font-bold text-brand-950 border-b border-atelier-border pb-3">
                Итого к оплате
              </h2>

              <div className="space-y-3 text-xs">
                <div className="flex justify-between text-atelier-charcoal">
                  <span>Количество выкроек:</span>
                  <span className="font-medium">{itemsCount} шт.</span>
                </div>
                <div className="flex justify-between text-atelier-charcoal">
                  <span>Доставка:</span>
                  <span className="font-medium text-emerald-700">
                    Мгновенно (PDF в ЛК)
                  </span>
                </div>
                <div className="flex justify-between text-atelier-charcoal">
                  <span>Валюта:</span>
                  <span className="font-medium">KGS (кыргызский сом)</span>
                </div>

                <div className="pt-3 border-t border-atelier-border flex justify-between items-baseline">
                  <span className="text-sm font-semibold text-brand-950">
                    Сумма заказа:
                  </span>
                  <span className="font-serif text-2xl font-bold text-brand-950">
                    {totalAmountKgs.toLocaleString("ru-RU")} KGS
                  </span>
                </div>
              </div>

              <Link href="/checkout" className="block">
                <Button size="lg" className="w-full text-base">
                  <span>Оформить заказ</span>
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>

              <div className="p-3 bg-brand-50/50 rounded-sm border border-brand-200/50 flex items-start space-x-2 text-[11px] text-brand-950">
                <ShieldCheck className="w-4 h-4 text-brand-700 shrink-0 mt-0.5" />
                <span>
                  Электронные выкройки станут доступны для скачивания в личном кабинете сразу после подтверждения оплаты.
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
