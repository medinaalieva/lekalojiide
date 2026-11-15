"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Product, Category } from "../types";
import { api } from "../lib/api";
import { ProductCard } from "../components/catalog/ProductCard";
import { Button } from "../components/ui/Button";
import { ArrowRight, Sparkles, Scissors, Printer, CheckCircle2 } from "lucide-react";

export default function HomePage() {
  const [featuredProducts, setFeaturedProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [prodRes, catRes] = await Promise.allSettled([
          api.get<{ success: boolean; data: Product[] }>("/api/v1/catalog/products?limit=4"),
          api.get<{ success: boolean; data: Category[] }>("/api/v1/catalog/categories"),
        ]);

        if (prodRes.status === "fulfilled" && prodRes.value.data) {
          setFeaturedProducts(prodRes.value.data);
        }
        if (catRes.status === "fulfilled" && catRes.value.data) {
          setCategories(catRes.value.data);
        }
      } catch (err) {
        console.error("Error loading home page data:", err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero Section */}
      <section className="relative bg-gradient-to-b from-brand-50 via-white to-white border-b border-atelier-border py-20 lg:py-28 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="max-w-3xl">
            <div className="inline-flex items-center space-x-2 px-3 py-1 bg-brand-100 rounded-full text-brand-900 text-xs font-medium uppercase tracking-wider mb-6">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Цифровое ателье выкроек</span>
            </div>

            <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl font-bold text-brand-950 tracking-tight leading-[1.15]">
              Безупречная посадка в каждом стежке
            </h1>

            <p className="mt-6 text-base sm:text-lg text-atelier-muted leading-relaxed max-w-2xl">
              Профессиональные электронные выкройки одежды в формате PDF. Точная градация по размерам и ростовкам, припуски на швы и подробные инструкции по сборке и пошиву.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link href="/catalog">
                <Button size="lg" className="px-8">
                  <span>Перейти в каталог</span>
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
              <Link href="/cabinet/library">
                <Button variant="outline" size="lg">
                  Моя библиотека выкроек
                </Button>
              </Link>
            </div>

            {/* Quick badges */}
            <div className="mt-10 pt-8 border-t border-atelier-border/80 grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs text-atelier-charcoal">
              <div className="flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 text-brand-700 shrink-0" />
                <span>Печать A4 и Плоттер (600/900)</span>
              </div>
              <div className="flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 text-brand-700 shrink-0" />
                <span>Оплата в сомах (KGS)</span>
              </div>
              <div className="flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 text-brand-700 shrink-0" />
                <span>Мгновенный доступ к PDF</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Categories Grid */}
      {categories.length > 0 && (
        <section className="py-16 bg-white border-b border-atelier-border">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-end justify-between mb-8">
              <div>
                <span className="text-xs font-semibold uppercase tracking-widest text-brand-700">
                  Разделы
                </span>
                <h2 className="font-serif text-2xl sm:text-3xl font-bold text-brand-950 mt-1">
                  Категории выкроек
                </h2>
              </div>
              <Link
                href="/catalog"
                className="text-xs uppercase tracking-wider font-semibold text-brand-800 hover:text-brand-950 transition-colors flex items-center"
              >
                Все категории →
              </Link>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {categories.slice(0, 4).map((cat) => (
                <Link
                  key={cat.id}
                  href={`/catalog?categoryId=${cat.id}`}
                  className="p-6 bg-brand-50/50 hover:bg-brand-100/60 border border-atelier-border rounded-sm transition-all group"
                >
                  <Scissors className="w-6 h-6 text-brand-800 mb-3 group-hover:scale-110 transition-transform" />
                  <h3 className="font-medium text-sm text-brand-950 group-hover:text-brand-800">
                    {cat.title || cat.name}
                  </h3>
                  <p className="text-xs text-atelier-muted mt-1 line-clamp-2">
                    {cat.description || "Коллекция цифровых выкроек"}
                  </p>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Featured Patterns Showcase */}
      <section className="py-16 bg-atelier-surface">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-end justify-between mb-10">
            <div>
              <span className="text-xs font-semibold uppercase tracking-widest text-brand-700">
                Новинки и бестселлеры
              </span>
              <h2 className="font-serif text-2xl sm:text-3xl font-bold text-brand-950 mt-1">
                Популярные выкройки
              </h2>
            </div>
            <Link
              href="/catalog"
              className="text-xs uppercase tracking-wider font-semibold text-brand-800 hover:text-brand-950 transition-colors"
            >
              Смотреть все модели →
            </Link>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {[1, 2, 3, 4].map((n) => (
                <div
                  key={n}
                  className="bg-white border border-atelier-border aspect-[3/4] animate-pulse rounded-sm"
                />
              ))}
            </div>
          ) : featuredProducts.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {featuredProducts.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          ) : (
            <div className="text-center py-16 bg-white border border-atelier-border rounded-sm">
              <Scissors className="w-10 h-10 text-atelier-muted mx-auto mb-3" />
              <h3 className="text-base font-medium text-brand-950">
                Каталог готовится к открытию
              </h3>
              <p className="text-xs text-atelier-muted mt-1">
                Новые модели выкроек добавляются дизайнерами
              </p>
              <Link href="/catalog" className="inline-block mt-4">
                <Button size="sm">Перейти в каталог</Button>
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* Why Choose Us */}
      <section className="py-20 bg-white border-t border-atelier-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mx-auto text-center mb-16">
            <span className="text-xs font-semibold uppercase tracking-widest text-brand-700">
              Стандарты качества
            </span>
            <h2 className="font-serif text-3xl font-bold text-brand-950 mt-2">
              Почему шьют по лекалам LEKALO ZHIIDE
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="p-6 border border-atelier-border rounded-sm bg-brand-50/30">
              <div className="w-10 h-10 bg-brand-100 rounded-sm flex items-center justify-center text-brand-900 mb-4 font-serif font-bold text-lg">
                01
              </div>
              <h3 className="font-medium text-base text-brand-950 mb-2">
                Конструктивная точность
              </h3>
              <p className="text-xs text-atelier-muted leading-relaxed">
                Каждое лекало отшивается и тестируется в реальной ткани. Проверенный баланс изделия, удобная пройма и припуски на швы.
              </p>
            </div>

            <div className="p-6 border border-atelier-border rounded-sm bg-brand-50/30">
              <div className="w-10 h-10 bg-brand-100 rounded-sm flex items-center justify-center text-brand-900 mb-4 font-serif font-bold text-lg">
                02
              </div>
              <h3 className="font-medium text-base text-brand-950 mb-2">
                Удобство печати и сборки
              </h3>
              <p className="text-xs text-atelier-muted leading-relaxed">
                Два формата на выбор: постраничная печать на обычном домашнем принтере А4 с проверочным квадратом или печать на широкоформатном плоттере.
              </p>
            </div>

            <div className="p-6 border border-atelier-border rounded-sm bg-brand-50/30">
              <div className="w-10 h-10 bg-brand-100 rounded-sm flex items-center justify-center text-brand-900 mb-4 font-serif font-bold text-lg">
                03
              </div>
              <h3 className="font-medium text-base text-brand-950 mb-2">
                Бессрочный доступ в кабинете
              </h3>
              <p className="text-xs text-atelier-muted leading-relaxed">
                Купленные выкройки навсегда сохраняются в вашем личном кабинете. Вы всегда можете скачать актуальную версию и подробные инструкции.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
