"use client";

import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { Product, Category } from "../types";
import { api } from "../lib/api";
import { ProductCard } from "../components/catalog/ProductCard";
import { Button } from "../components/ui/Button";
import {
  ArrowRight,
  Sparkles,
  Scissors,
  Printer,
  CheckCircle2,
  FileCheck2,
  CreditCard,
  Download,
  Flame,
  Star,
  ChevronRight,
  ShieldCheck,
  Layers,
} from "lucide-react";

export function HomeView() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"all" | "dresses" | "bottoms" | "new">("all");

  useEffect(() => {
    async function loadData() {
      try {
        const [prodRes, catRes] = await Promise.allSettled([
          api.get<{ success: boolean; data: Product[] }>("/api/v1/catalog/products?limit=24"),
          api.get<{ success: boolean; data: Category[] }>("/api/v1/catalog/categories"),
        ]);

        if (prodRes.status === "fulfilled" && prodRes.value.data) {
          // Prioritize genuine garment photos from Supabase Storage for the homepage showcase
          const sorted = [...prodRes.value.data].sort((a, b) => {
            const imgA = a.coverImage || (typeof a.images?.[0] === "string" ? a.images[0] : (a.images?.[0] as any)?.imageUrl) || "";
            const imgB = b.coverImage || (typeof b.images?.[0] === "string" ? b.images[0] : (b.images?.[0] as any)?.imageUrl) || "";
            const isSupaA = imgA.includes("supabase.co");
            const isSupaB = imgB.includes("supabase.co");
            if (isSupaA && !isSupaB) return -1;
            if (!isSupaA && isSupaB) return 1;
            if (imgA && !imgB) return -1;
            if (!imgA && imgB) return 1;
            return 0;
          });
          setProducts(sorted);
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

  // Filter products by active tab
  const tabProducts = useMemo(() => {
    if (!products.length) return [];
    if (activeTab === "dresses") {
      return products
        .filter((p) => {
          const cat = (p.category as any)?.slug || (p.category as any)?.title || "";
          return cat.toLowerCase().includes("plat") || p.title.toLowerCase().includes("платье") || p.title.toLowerCase().includes("сарафан");
        })
        .slice(0, 8);
    }
    if (activeTab === "bottoms") {
      return products
        .filter((p) => {
          const cat = (p.category as any)?.slug || (p.category as any)?.title || "";
          return (
            cat.toLowerCase().includes("yubk") ||
            cat.toLowerCase().includes("bryuk") ||
            p.title.toLowerCase().includes("юбка") ||
            p.title.toLowerCase().includes("брюки") ||
            p.title.toLowerCase().includes("шорты")
          );
        })
        .slice(0, 8);
    }
    if (activeTab === "new") {
      return products
        .filter((p) => p.isNew || p.isDiscountActive || p.isBestseller)
        .slice(0, 8);
    }
    // "all" - return top 8
    return products.slice(0, 8);
  }, [products, activeTab]);

  // Featured flagship image for Hero right column
  const heroImage =
    "https://susoqzykfmwivajdkvtb.storage.supabase.co/storage/v1/object/public/product-images/products/1cfe5f94-564b-40dc-81ed-f953f5b2239b/1794847456360-bec05e1f-ru8PR-XHAiuIkXL3bVXX2oM_o-VanPASlCx6yM0FfWCP-Qp5x55eVRXgVWp9KqdSPFAg3POjmFb40Z2Ipu4epBkBnu4SeeHi58AJxjASU2zUQRUMjnWkduOmVnzCv11CKnPjKfW5d7dmq2mA5M4nesPNzUIIgrvC0Je_fc1DeOvlTpbxl-Wn6DHufavuRicm.jpg";

  // Pre-mapped standard category groups
  const categoryHighlights = [
    {
      title: "Платья и сарафаны",
      slug: "platya",
      desc: "Женственные миди, макси и футляры",
      count: "8 моделей",
      icon: Scissors,
    },
    {
      title: "Юбки",
      slug: "yubki",
      desc: "Солнце, карандаш, плиссе и миди",
      count: "3 модели",
      icon: Layers,
    },
    {
      title: "Брюки и шорты",
      slug: "bryuki-shorty",
      desc: "Палаццо, классика и летние бермуды",
      count: "4 модели",
      icon: Scissors,
    },
    {
      title: "Блузки и топы",
      slug: "bluzy",
      desc: "Романтичные рукава, оверсайз и запах",
      count: "3 модели",
      icon: Sparkles,
    },
    {
      title: "Жакеты и верхняя одежда",
      slug: "zhakety-verkhnyaya-odezhda",
      desc: "Пальто, тренчи и элегантные жакеты",
      count: "4 модели",
      icon: ShieldCheck,
    },
    {
      title: "Домашняя и спорт одежда",
      slug: "domashnyaya-sportivnaya-odezhda",
      desc: "Уютные костюмы, пижамы и платья",
      count: "3 модели",
      icon: CheckCircle2,
    },
  ];

  return (
    <div className="flex flex-col min-h-screen bg-white">
      {/* =================================================================== */}
      {/* 1. HERO SECTION                                                    */}
      {/* =================================================================== */}
      <section className="relative bg-gradient-to-b from-brand-50/70 via-white to-white border-b border-atelier-border py-12 lg:py-20 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            {/* Left text column - 7 cols */}
            <div className="lg:col-span-7 space-y-6">
              <div className="inline-flex items-center space-x-2 px-3 py-1 bg-brand-100/80 border border-brand-200/60 rounded-full text-brand-900 text-xs font-semibold uppercase tracking-wider">
                <Sparkles className="w-3.5 h-3.5 text-brand-700" />
                <span>Цифровое ателье выкроек • Кыргызстан</span>
              </div>

              <h1 className="font-serif text-3xl sm:text-5xl lg:text-6xl font-bold text-brand-950 tracking-tight leading-[1.12]">
                Точность кроя. Свобода творчества.
              </h1>

              <p className="text-sm sm:text-base text-atelier-charcoal/80 leading-relaxed max-w-2xl">
                Профессиональные электронные лекала с точной градацией размеров (40–60), заложенными припусками на швы и подробными инструкциями по пошиву. Скачивайте PDF мгновенно и создавайте гардероб ресторанного и подиумного уровня своими руками.
              </p>

              {/* Action buttons */}
              <div className="flex flex-wrap items-center gap-4 pt-2">
                <Link href="/catalog">
                  <Button size="lg" className="px-8 shadow-sm">
                    <span>Смотреть каталог</span>
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
                <Link href="/catalog?categorySlug=platya">
                  <Button variant="outline" size="lg">
                    Платья и сарафаны
                  </Button>
                </Link>
              </div>

              {/* Quick trust metrics */}
              <div className="pt-8 border-t border-atelier-border/80 grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs text-atelier-charcoal">
                <div className="flex items-center space-x-2">
                  <Printer className="w-4 h-4 text-brand-800 shrink-0" />
                  <span>Печать A4 и Плоттер (600/900 мм)</span>
                </div>
                <div className="flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-brand-800 shrink-0" />
                  <span>Оплата в сомах (KGS)</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Download className="w-4 h-4 text-brand-800 shrink-0" />
                  <span>Мгновенный доступ в личном кабинете</span>
                </div>
              </div>
            </div>

            {/* Right showcase column - 5 cols (Editorial Fashion Piece) */}
            <div className="lg:col-span-5 relative">
              <div className="relative mx-auto max-w-sm sm:max-w-md lg:max-w-none">
                {/* Decorative border frame */}
                <div className="absolute -inset-3 bg-gradient-to-tr from-brand-200/50 via-brand-100/20 to-transparent rounded-sm -rotate-1 hidden sm:block pointer-events-none" />

                {/* Main showcase card */}
                <div className="relative bg-white border border-atelier-border rounded-sm shadow-xl overflow-hidden group">
                  <div className="relative aspect-[3/4] bg-atelier-subtle overflow-hidden">
                    <Image
                      src={heroImage}
                      alt="Платье миди Аида с запахом — LEKALO ZHIIDE"
                      fill
                      priority
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 450px"
                      className="object-cover object-center group-hover:scale-105 transition-transform duration-700"
                    />

                    {/* Gradient shadow for text readability */}
                    <div className="absolute inset-0 bg-gradient-to-t from-brand-950/80 via-transparent to-black/20" />

                    {/* Top badges bar - responsive and collision-free */}
                    <div className="absolute top-3 left-3 right-3 z-10 flex items-center justify-between gap-2 pointer-events-none">
                      <div className="flex items-center space-x-1.5 px-2.5 py-1 bg-white/95 backdrop-blur-xs text-brand-950 rounded-sm text-[10px] sm:text-xs font-semibold uppercase tracking-wider shadow-sm truncate">
                        <Sparkles className="w-3.5 h-3.5 text-brand-800 shrink-0" />
                        <span className="truncate">Хит сезона • Точная посадка</span>
                      </div>

                      <div className="px-2 py-0.5 bg-brand-900/90 text-white rounded-sm text-[10px] font-mono shadow-sm shrink-0 whitespace-nowrap">
                        A4 + Плоттер
                      </div>
                    </div>

                    {/* Bottom overlay info */}
                    <div className="absolute bottom-0 left-0 right-0 p-5 text-white z-10">
                      <span className="text-[11px] uppercase tracking-widest text-brand-200 font-semibold block mb-1">
                        Флагманская выкройка
                      </span>
                      <h3 className="font-serif text-xl sm:text-2xl font-bold leading-snug">
                        Платье миди «Аида» с запахом
                      </h3>
                      <div className="mt-2 flex items-baseline justify-between">
                        <div>
                          <span className="text-lg font-bold text-white">
                            650 KGS
                          </span>
                          <span className="text-xs text-brand-200 ml-2">
                            • или комплект ALL за 1 290 KGS
                          </span>
                        </div>
                        <Link
                          href="/catalog/plate-midi-aida-s-zapakhom"
                          className="text-xs font-semibold text-white bg-white/20 hover:bg-white hover:text-brand-950 px-3 py-1.5 rounded-sm transition-colors backdrop-blur-xs"
                        >
                          Смотреть выкройку →
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Floating benefit tag below card */}
                <div className="mt-3 flex items-center justify-between text-[11px] text-atelier-muted px-2">
                  <span>Размеры 40–60 • Европейская градация</span>
                  <span className="font-medium text-brand-900">Припуски 1 см заложены</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =================================================================== */}
      {/* 2. CATEGORIES GRID SECTION                                          */}
      {/* =================================================================== */}
      <section className="py-16 bg-white border-b border-atelier-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-10">
            <div>
              <span className="text-xs font-semibold uppercase tracking-widest text-brand-700">
                Коллекции цифровых выкроек
              </span>
              <h2 className="font-serif text-2xl sm:text-3xl font-bold text-brand-950 mt-1">
                Категории моделей
              </h2>
            </div>
            <Link
              href="/catalog"
              className="text-xs uppercase tracking-wider font-semibold text-brand-800 hover:text-brand-950 transition-colors flex items-center mt-2 sm:mt-0"
            >
              <span>Смотреть все модели ({products.length || 23})</span>
              <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Link>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {categoryHighlights.map((cat) => {
              const Icon = cat.icon;
              return (
                <Link
                  key={cat.slug}
                  href={`/catalog?categorySlug=${cat.slug}`}
                  className="p-5 bg-atelier-surface hover:bg-brand-50/70 border border-atelier-border hover:border-brand-400 rounded-sm transition-all group flex flex-col justify-between"
                >
                  <div>
                    <div className="w-10 h-10 rounded-full bg-brand-100/70 flex items-center justify-center text-brand-900 mb-3 group-hover:scale-110 group-hover:bg-brand-200/80 transition-all">
                      <Icon className="w-5 h-5 stroke-[1.5]" />
                    </div>
                    <h3 className="font-serif font-semibold text-sm text-brand-950 group-hover:text-brand-800 leading-snug">
                      {cat.title}
                    </h3>
                    <p className="text-[11px] text-atelier-muted mt-1 line-clamp-2 leading-relaxed">
                      {cat.desc}
                    </p>
                  </div>
                  <span className="text-[10px] uppercase tracking-wider text-brand-800 font-semibold mt-4 block">
                    Выбрать →
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* =================================================================== */}
      {/* 3. FEATURED PATTERNS SHOWCASE WITH TABS                             */}
      {/* =================================================================== */}
      <section className="py-16 bg-atelier-surface">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
            <div>
              <span className="text-xs font-semibold uppercase tracking-widest text-brand-700">
                Каталог ателье
              </span>
              <h2 className="font-serif text-2xl sm:text-3xl font-bold text-brand-950 mt-1">
                Популярные выкройки
              </h2>
            </div>

            {/* Interactive Category Tabs */}
            <div className="flex flex-wrap items-center gap-1.5 p-1 bg-white border border-atelier-border rounded-sm">
              <button
                onClick={() => setActiveTab("all")}
                className={`px-3 py-1.5 text-xs font-medium rounded-xs transition-colors ${
                  activeTab === "all"
                    ? "bg-brand-900 text-white font-semibold shadow-xs"
                    : "text-atelier-charcoal hover:bg-atelier-subtle"
                }`}
              >
                Все популярные
              </button>
              <button
                onClick={() => setActiveTab("dresses")}
                className={`px-3 py-1.5 text-xs font-medium rounded-xs transition-colors ${
                  activeTab === "dresses"
                    ? "bg-brand-900 text-white font-semibold shadow-xs"
                    : "text-atelier-charcoal hover:bg-atelier-subtle"
                }`}
              >
                Платья
              </button>
              <button
                onClick={() => setActiveTab("bottoms")}
                className={`px-3 py-1.5 text-xs font-medium rounded-xs transition-colors ${
                  activeTab === "bottoms"
                    ? "bg-brand-900 text-white font-semibold shadow-xs"
                    : "text-atelier-charcoal hover:bg-atelier-subtle"
                }`}
              >
                Юбки и брюки
              </button>
              <button
                onClick={() => setActiveTab("new")}
                className={`px-3 py-1.5 text-xs font-medium rounded-xs transition-colors ${
                  activeTab === "new"
                    ? "bg-brand-900 text-white font-semibold shadow-xs"
                    : "text-atelier-charcoal hover:bg-atelier-subtle"
                }`}
              >
                Новинки и акции
              </button>
            </div>
          </div>

          {/* Product Cards Grid */}
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {[1, 2, 3, 4].map((n) => (
                <div
                  key={n}
                  className="bg-white border border-atelier-border aspect-[3/4] animate-pulse rounded-sm"
                />
              ))}
            </div>
          ) : tabProducts.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {tabProducts.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          ) : (
            <div className="text-center py-16 bg-white border border-atelier-border rounded-sm">
              <Scissors className="w-10 h-10 text-atelier-muted mx-auto mb-3" />
              <h3 className="text-base font-medium text-brand-950">
                В этой категории модели готовятся к открытию
              </h3>
              <p className="text-xs text-atelier-muted mt-1">
                Перейдите в каталог, чтобы посмотреть весь список выкроек
              </p>
              <Link href="/catalog" className="inline-block mt-4">
                <Button size="sm">Перейти в полный каталог</Button>
              </Link>
            </div>
          )}

          <div className="mt-10 text-center">
            <Link href="/catalog">
              <Button size="lg" variant="outline" className="px-10">
                <span>Смотреть все 23 выкройки каталога</span>
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* =================================================================== */}
      {/* 4. HOW IT WORKS: 4 SIMPLE STEPS                                     */}
      {/* =================================================================== */}
      <section className="py-20 bg-white border-t border-atelier-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mx-auto text-center mb-16">
            <span className="text-xs font-semibold uppercase tracking-widest text-brand-700">
              Простой процесс
            </span>
            <h2 className="font-serif text-3xl font-bold text-brand-950 mt-2">
              Как сшить изделие по выкройкам LEKALO ZHIIDE
            </h2>
            <p className="text-xs text-atelier-muted mt-2">
              От идеи до готового платья — всего 4 понятных шага
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="p-6 border border-atelier-border rounded-sm bg-brand-50/20 relative">
              <div className="w-10 h-10 bg-brand-900 text-white rounded-full flex items-center justify-center font-serif font-bold text-base mb-4 shadow-sm">
                1
              </div>
              <h3 className="font-serif font-semibold text-base text-brand-950 mb-2">
                Выберите модель
              </h3>
              <p className="text-xs text-atelier-muted leading-relaxed">
                Выберите одиночный размер или выгодный комплект ALL со всеми размерами нужного роста и формата.
              </p>
            </div>

            <div className="p-6 border border-atelier-border rounded-sm bg-brand-50/20 relative">
              <div className="w-10 h-10 bg-brand-900 text-white rounded-full flex items-center justify-center font-serif font-bold text-base mb-4 shadow-sm">
                2
              </div>
              <h3 className="font-serif font-semibold text-base text-brand-950 mb-2">
                Оплатите в сомах
              </h3>
              <p className="text-xs text-atelier-muted leading-relaxed">
                Оформите заказ и оплатите в KGS через защищенный шлюз. Никаких скрытых комиссий и конвертаций.
              </p>
            </div>

            <div className="p-6 border border-atelier-border rounded-sm bg-brand-50/20 relative">
              <div className="w-10 h-10 bg-brand-900 text-white rounded-full flex items-center justify-center font-serif font-bold text-base mb-4 shadow-sm">
                3
              </div>
              <h3 className="font-serif font-semibold text-base text-brand-950 mb-2">
                Скачайте PDF
              </h3>
              <p className="text-xs text-atelier-muted leading-relaxed">
                Файлы выкроек и пошаговые инструкции мгновенно появятся в вашем личном кабинете навсегда.
              </p>
            </div>

            <div className="p-6 border border-atelier-border rounded-sm bg-brand-50/20 relative">
              <div className="w-10 h-10 bg-brand-900 text-white rounded-full flex items-center justify-center font-serif font-bold text-base mb-4 shadow-sm">
                4
              </div>
              <h3 className="font-serif font-semibold text-base text-brand-950 mb-2">
                Распечатайте и сшейте
              </h3>
              <p className="text-xs text-atelier-muted leading-relaxed">
                Печатайте дома на листах A4 с проверочным квадратом 10×10 см или на плоттере (900 мм) без склейки.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* =================================================================== */}
      {/* 5. QUALITY STANDARDS SECTION                                        */}
      {/* =================================================================== */}
      <section className="py-20 bg-brand-50/40 border-t border-atelier-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mx-auto text-center mb-16">
            <span className="text-xs font-semibold uppercase tracking-widest text-brand-700">
              Стандарты цифрового ателье
            </span>
            <h2 className="font-serif text-3xl font-bold text-brand-950 mt-2">
              Почему шьют по лекалам LEKALO ZHIIDE
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="p-8 border border-atelier-border rounded-sm bg-white shadow-xs">
              <div className="w-12 h-12 bg-brand-100 rounded-sm flex items-center justify-center text-brand-900 mb-5 font-serif font-bold text-xl">
                01
              </div>
              <h3 className="font-serif font-semibold text-lg text-brand-950 mb-2">
                Конструктивная точность посадки
              </h3>
              <p className="text-xs text-atelier-charcoal/80 leading-relaxed">
                Каждая модель отшивается из реальной ткани перед публикацией. Мы выверяем баланс изделия, удобную пройму и эргономику рукава, чтобы готовая вещь сидела безупречно.
              </p>
            </div>

            <div className="p-8 border border-atelier-border rounded-sm bg-white shadow-xs">
              <div className="w-12 h-12 bg-brand-100 rounded-sm flex items-center justify-center text-brand-900 mb-5 font-serif font-bold text-xl">
                02
              </div>
              <h3 className="font-serif font-semibold text-lg text-brand-950 mb-2">
                Припуски на швы уже заложены
              </h3>
              <p className="text-xs text-atelier-charcoal/80 leading-relaxed">
                Вам не нужно отмерять сантиметры линейкой на ткани: припуски (1 см на стачивание и 3–4 см на подгибку низа) уже включены в контур лекал с точными совмещаемыми рассечками.
              </p>
            </div>

            <div className="p-8 border border-atelier-border rounded-sm bg-white shadow-xs">
              <div className="w-12 h-12 bg-brand-100 rounded-sm flex items-center justify-center text-brand-900 mb-5 font-serif font-bold text-xl">
                03
              </div>
              <h3 className="font-serif font-semibold text-lg text-brand-950 mb-2">
                Бессрочный доступ в кабинете
              </h3>
              <p className="text-xs text-atelier-charcoal/80 leading-relaxed">
                Купленные выкройки навсегда сохраняются в вашей библиотеке. Вы всегда можете зайти с компьютера или смартфона и скачать нужный файл и инструкцию по пошиву.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* =================================================================== */}
      {/* 6. CALL TO ACTION BANNER                                            */}
      {/* =================================================================== */}
      <section className="bg-gradient-to-r from-brand-950 via-brand-900 to-brand-950 text-white py-16">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-6">
          <span className="text-xs uppercase tracking-widest text-brand-300 font-semibold inline-block">
            Начните шить прямо сегодня
          </span>
          <h2 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight">
            Создайте свой идеальный гардероб с LEKALO ZHIIDE
          </h2>
          <p className="text-sm sm:text-base text-brand-200/90 max-w-2xl mx-auto leading-relaxed">
            В каталоге собраны платья, юбки, брюки, жакеты и костюмы с точной европейской градацией. Выбирайте выкройку и скачивайте PDF за 2 минуты.
          </p>
          <div className="pt-4 flex flex-wrap justify-center gap-4">
            <Link href="/catalog">
              <Button size="lg" className="bg-white text-brand-950 hover:bg-brand-100 font-semibold px-8 shadow-md">
                <span>Перейти в каталог выкроек</span>
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
