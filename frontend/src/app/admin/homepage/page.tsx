"use client";

import React, { useEffect, useState, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { api } from "../../../lib/api";
import { Button } from "../../../components/ui/Button";
import {
  Sparkles,
  Save,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Eye,
  Calendar,
  Layers,
  ArrowRight,
  ExternalLink,
  Tag,
  Flame,
  Star,
  Image as ImageIcon,
  Check,
} from "lucide-react";

interface AdminProductOption {
  id: string;
  title: string;
  slug: string;
  basePrice: number;
  bundlePrice: number | null;
  categoryTitle: string;
  coverImage: string;
  images: string[];
}

interface HomepageConfigData {
  heroFeatured: {
    isEnabled: boolean;
    isVisible?: boolean;
    productId: string | null;
    badge: string;
    title: string;
    subtitle: string;
    description: string;
    imageUrl: string;
    buttonText: string;
    buttonLink: string;
    startDate: string | null;
    endDate: string | null;
    basePrice?: number;
    bundlePrice?: number | null;
    product?: any;
  };
  newArrivals: {
    isEnabled: boolean;
    title: string;
    subtitle: string;
  };
  bestsellers: {
    isEnabled: boolean;
    title: string;
    subtitle: string;
  };
  promoBanner: {
    isEnabled: boolean;
    title: string;
    subtitle: string;
    description: string;
    buttonText: string;
    buttonLink: string;
    badge: string;
    imageUrl?: string | null;
  };
}

export default function AdminHomepageManagementPage() {
  const [activeTab, setActiveTab] = useState<"hero" | "sections" | "banner">("hero");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [products, setProducts] = useState<AdminProductOption[]>([]);
  const [productSearch, setProductSearch] = useState("");

  // Hero state
  const [heroEnabled, setHeroEnabled] = useState(true);
  const [heroProductId, setHeroProductId] = useState<string>("");
  const [heroBadge, setHeroBadge] = useState("Хит сезона • Точная посадка");
  const [heroTitle, setHeroTitle] = useState("Платье миди «Аида» с запахом");
  const [heroSubtitle, setHeroSubtitle] = useState("Флагманская выкройка");
  const [heroDescription, setHeroDescription] = useState(
    "Профессиональные электронные лекала с точной градацией размеров (40–60), заложенными припусками на швы и подробными инструкциями по пошиву."
  );
  const [heroImageUrl, setHeroImageUrl] = useState("");
  const [heroButtonText, setHeroButtonText] = useState("Смотреть выкройку →");
  const [heroButtonLink, setHeroButtonLink] = useState("/catalog/plate-midi-aida-s-zapakhom");
  const [heroStartDate, setHeroStartDate] = useState("");
  const [heroEndDate, setHeroEndDate] = useState("");

  // Sections state
  const [newArrivalsEnabled, setNewArrivalsEnabled] = useState(true);
  const [newArrivalsTitle, setNewArrivalsTitle] = useState("Новинки сезона");
  const [newArrivalsSubtitle, setNewArrivalsSubtitle] = useState("Свежие выкройки с безупречной посадкой");

  const [bestsellersEnabled, setBestsellersEnabled] = useState(true);
  const [bestsellersTitle, setBestsellersTitle] = useState("Популярные выкройки");
  const [bestsellersSubtitle, setBestsellersSubtitle] = useState("Выбор покупателей LEKALO ZHIIDE");

  // Promo banner state
  const [bannerEnabled, setBannerEnabled] = useState(true);
  const [bannerBadge, setBannerBadge] = useState("Начните шить прямо сегодня");
  const [bannerTitle, setBannerTitle] = useState("Создайте свой идеальный гардероб с LEKALO ZHIIDE");
  const [bannerSubtitle, setBannerSubtitle] = useState("Цифровые лекала ресторанного и подиумного уровня");
  const [bannerDescription, setBannerDescription] = useState(
    "В каталоге собраны платья, юбки, брюки, жакеты и костюмы с точной европейской градацией. Выбирайте выкройку и скачивайте PDF за 2 минуты."
  );
  const [bannerButtonText, setBannerButtonText] = useState("Перейти в каталог выкроек");
  const [bannerButtonLink, setBannerButtonLink] = useState("/catalog");

  // Load initial data
  const fetchData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.get<{
        success: boolean;
        data: { config: HomepageConfigData; products: AdminProductOption[] };
      }>("/api/v1/admin/homepage");

      if (res && res.success && res.data) {
        const { config, products: prodList } = res.data;
        setProducts(prodList || []);

        if (config?.heroFeatured) {
          const h = config.heroFeatured;
          setHeroEnabled(h.isEnabled !== false);
          setHeroProductId(h.productId || "");
          setHeroBadge(h.badge || "Хит сезона • Точная посадка");
          setHeroTitle(h.title || "");
          setHeroSubtitle(h.subtitle || "Флагманская выкройка");
          setHeroDescription(h.description || "");
          setHeroImageUrl(h.imageUrl || "");
          setHeroButtonText(h.buttonText || "Смотреть выкройку →");
          setHeroButtonLink(h.buttonLink || "");
          setHeroStartDate(h.startDate ? h.startDate.slice(0, 10) : "");
          setHeroEndDate(h.endDate ? h.endDate.slice(0, 10) : "");
        }

        if (config?.newArrivals) {
          setNewArrivalsEnabled(config.newArrivals.isEnabled !== false);
          setNewArrivalsTitle(config.newArrivals.title || "Новинки сезона");
          setNewArrivalsSubtitle(config.newArrivals.subtitle || "Свежие выкройки с безупречной посадкой");
        }

        if (config?.bestsellers) {
          setBestsellersEnabled(config.bestsellers.isEnabled !== false);
          setBestsellersTitle(config.bestsellers.title || "Популярные выкройки");
          setBestsellersSubtitle(config.bestsellers.subtitle || "Выбор покупателей LEKALO ZHIIDE");
        }

        if (config?.promoBanner) {
          setBannerEnabled(config.promoBanner.isEnabled !== false);
          setBannerBadge(config.promoBanner.badge || "Начните шить прямо сегодня");
          setBannerTitle(config.promoBanner.title || "Создайте свой идеальный гардероб с LEKALO ZHIIDE");
          setBannerSubtitle(config.promoBanner.subtitle || "Цифровые лекала ресторанного и подиумного уровня");
          setBannerDescription(
            config.promoBanner.description ||
              "В каталоге собраны платья, юбки, брюки, жакеты и костюмы с точной европейской градацией. Выбирайте выкройку и скачивайте PDF за 2 минуты."
          );
          setBannerButtonText(config.promoBanner.buttonText || "Перейти в каталог выкроек");
          setBannerButtonLink(config.promoBanner.buttonLink || "/catalog");
        }
      }
    } catch (err: any) {
      console.error("Error loading homepage config:", err);
      setError(err?.message || "Не удалось загрузить настройки главной страницы");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Selected product object
  const selectedProduct = useMemo(() => {
    return products.find((p) => p.id === heroProductId) || null;
  }, [products, heroProductId]);

  // Handle product change
  const handleSelectProduct = (prodId: string) => {
    setHeroProductId(prodId);
    const prod = products.find((p) => p.id === prodId);
    if (prod) {
      if (!heroTitle || heroTitle === "Платье миди «Аида» с запахом") {
        setHeroTitle(prod.title);
      }
      if (!heroImageUrl || heroImageUrl.includes("1cfe5f94-564b-40dc-81ed-f953f5b2239b")) {
        setHeroImageUrl(prod.coverImage || prod.images[0] || "");
      }
      setHeroButtonLink(`/catalog/${prod.slug}`);
    }
  };

  // Filtered products for dropdown search
  const filteredProducts = useMemo(() => {
    if (!productSearch) return products;
    const q = productSearch.toLowerCase();
    return products.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.categoryTitle.toLowerCase().includes(q) ||
        p.slug.toLowerCase().includes(q)
    );
  }, [products, productSearch]);

  // Save Hero block
  const handleSaveHero = async () => {
    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const payload = {
        isEnabled: heroEnabled,
        productId: heroProductId || null,
        badge: heroBadge.trim(),
        title: heroTitle.trim(),
        subtitle: heroSubtitle.trim(),
        description: heroDescription.trim(),
        imageUrl: heroImageUrl.trim(),
        buttonText: heroButtonText.trim(),
        buttonLink: heroButtonLink.trim(),
        startDate: heroStartDate ? new Date(heroStartDate).toISOString() : null,
        endDate: heroEndDate ? new Date(heroEndDate + "T23:59:59").toISOString() : null,
      };

      await api.put("/api/v1/admin/homepage/hero_featured", payload);
      setSuccessMessage("Блок «Хит сезона» успешно сохранён и опубликован!");
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setError(err?.message || "Ошибка при сохранении блока «Хит сезона»");
    } finally {
      setIsSaving(false);
    }
  };

  // Save Sections block
  const handleSaveSections = async () => {
    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);
    try {
      await Promise.all([
        api.put("/api/v1/admin/homepage/new_arrivals", {
          isEnabled: newArrivalsEnabled,
          title: newArrivalsTitle.trim(),
          subtitle: newArrivalsSubtitle.trim(),
        }),
        api.put("/api/v1/admin/homepage/bestsellers", {
          isEnabled: bestsellersEnabled,
          title: bestsellersTitle.trim(),
          subtitle: bestsellersSubtitle.trim(),
        }),
      ]);
      setSuccessMessage("Секции каталога успешно сохранены!");
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setError(err?.message || "Ошибка при сохранении секций каталога");
    } finally {
      setIsSaving(false);
    }
  };

  // Save Promo Banner block
  const handleSaveBanner = async () => {
    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);
    try {
      await api.put("/api/v1/admin/homepage/promo_banner", {
        isEnabled: bannerEnabled,
        badge: bannerBadge.trim(),
        title: bannerTitle.trim(),
        subtitle: bannerSubtitle.trim(),
        description: bannerDescription.trim(),
        buttonText: bannerButtonText.trim(),
        buttonLink: bannerButtonLink.trim(),
      });
      setSuccessMessage("Промо-баннер успешно сохранён!");
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setError(err?.message || "Ошибка при сохранении промо-баннера");
    } finally {
      setIsSaving(false);
    }
  };

  // Preview prices
  const previewBasePrice = selectedProduct?.basePrice ?? 650;
  const previewBundlePrice = selectedProduct?.bundlePrice ?? 1290;
  const previewImage =
    heroImageUrl ||
    selectedProduct?.coverImage ||
    "https://susoqzykfmwivajdkvtb.storage.supabase.co/storage/v1/object/public/product-images/products/1cfe5f94-564b-40dc-81ed-f953f5b2239b/1794847456360-bec05e1f-ru8PR-XHAiuIkXL3bVXX2oM_o-VanPASlCx6yM0FfWCP-Qp5x55eVRXgVWp9KqdSPFAg3POjmFb40Z2Ipu4epBkBnu4SeeHi58AJxjASU2zUQRUMjnWkduOmVnzCv11CKnPjKfW5d7dmq2mA5M4nesPNzUIIgrvC0Je_fc1DeOvlTpbxl-Wn6DHufavuRicm.jpg";

  if (isLoading) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center space-y-3">
        <RefreshCw className="w-8 h-8 text-brand-900 animate-spin" />
        <p className="text-xs uppercase tracking-widest text-atelier-muted">
          Загрузка настроек главной страницы...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-atelier-border">
        <div>
          <div className="flex items-center space-x-2 text-xs font-semibold uppercase tracking-wider text-brand-800 mb-1">
            <Sparkles className="w-3.5 h-3.5 text-brand-700" />
            <span>Конструктор главной витрины</span>
          </div>
          <h1 className="font-serif text-2xl sm:text-3xl font-bold text-brand-950">
            Управление главной страницей
          </h1>
          <p className="text-xs text-atelier-muted mt-1">
            Настройка флагманской модели «Хит сезона», блоков каталога и промо-баннера.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link href="/" target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm" className="text-xs">
              <Eye className="w-4 h-4 mr-1.5" />
              <span>Посмотреть витрину</span>
              <ExternalLink className="w-3.5 h-3.5 ml-1 text-atelier-muted" />
            </Button>
          </Link>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchData}
            disabled={isLoading}
            className="text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1 ${isLoading ? "animate-spin" : ""}`} />
            <span>Обновить</span>
          </Button>
        </div>
      </div>

      {/* Alert notifications */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-sm flex items-start space-x-3 text-red-800 text-xs">
          <AlertCircle className="w-5 h-5 shrink-0 text-red-600 mt-0.5" />
          <div className="flex-1 font-medium">{error}</div>
        </div>
      )}

      {successMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-sm flex items-start space-x-3 text-emerald-900 text-xs animate-in fade-in">
          <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600 mt-0.5" />
          <div className="flex-1 font-medium">{successMessage}</div>
        </div>
      )}

      {/* Tabs navigation */}
      <div className="flex border-b border-atelier-border gap-2">
        <button
          onClick={() => setActiveTab("hero")}
          className={`flex items-center space-x-2 px-5 py-3 text-xs font-semibold border-b-2 transition-colors ${
            activeTab === "hero"
              ? "border-brand-900 text-brand-950 bg-brand-50/50"
              : "border-transparent text-atelier-muted hover:text-brand-950"
          }`}
        >
          <Flame className="w-4 h-4 text-brand-800" />
          <span>Хит сезона (Флагман)</span>
        </button>

        <button
          onClick={() => setActiveTab("sections")}
          className={`flex items-center space-x-2 px-5 py-3 text-xs font-semibold border-b-2 transition-colors ${
            activeTab === "sections"
              ? "border-brand-900 text-brand-950 bg-brand-50/50"
              : "border-transparent text-atelier-muted hover:text-brand-950"
          }`}
        >
          <Layers className="w-4 h-4 text-brand-800" />
          <span>Новинки и Бестселлеры</span>
        </button>

        <button
          onClick={() => setActiveTab("banner")}
          className={`flex items-center space-x-2 px-5 py-3 text-xs font-semibold border-b-2 transition-colors ${
            activeTab === "banner"
              ? "border-brand-900 text-brand-950 bg-brand-50/50"
              : "border-transparent text-atelier-muted hover:text-brand-950"
          }`}
        >
          <Sparkles className="w-4 h-4 text-brand-800" />
          <span>Промо-баннер (CTA)</span>
        </button>
      </div>

      {/* =================================================================== */}
      {/* TAB 1: HERO FEATURED                                                */}
      {/* =================================================================== */}
      {activeTab === "hero" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Settings form - 7 cols */}
          <div className="lg:col-span-7 bg-white border border-atelier-border rounded-sm p-6 space-y-6 shadow-xs">
            <div className="flex items-center justify-between pb-4 border-b border-atelier-border">
              <div>
                <h2 className="font-serif text-lg font-bold text-brand-950">
                  Настройки блока «Хит сезона»
                </h2>
                <p className="text-xs text-atelier-muted">
                  Карточка отображается в правом блоке Hero на главной странице.
                </p>
              </div>

              {/* Enabled toggle */}
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={heroEnabled}
                  onChange={(e) => setHeroEnabled(e.target.checked)}
                  className="w-4 h-4 text-brand-900 border-gray-300 rounded focus:ring-brand-800"
                />
                <span className="text-xs font-semibold text-brand-950">
                  {heroEnabled ? "Включен на сайте" : "Отключен"}
                </span>
              </label>
            </div>

            {/* Product selection */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold uppercase tracking-wider text-brand-950">
                1. Выберите товар из каталога (Флагманская выкройка)
              </label>
              <div className="space-y-2">
                <input
                  type="text"
                  placeholder="Поиск по названию или категории..."
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-atelier-border rounded-sm focus:outline-none focus:border-brand-800"
                />
                <select
                  value={heroProductId}
                  onChange={(e) => handleSelectProduct(e.target.value)}
                  className="w-full text-xs px-3 py-2.5 border border-atelier-border rounded-sm bg-white focus:outline-none focus:border-brand-800"
                >
                  <option value="">-- Выберите модель из каталога --</option>
                  {filteredProducts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title} ({p.categoryTitle}) — {p.basePrice} KGS
                    </option>
                  ))}
                </select>
              </div>

              {selectedProduct && (
                <div className="mt-2 p-3 bg-brand-50/50 border border-brand-200/60 rounded-sm flex items-center justify-between text-xs">
                  <div className="flex items-center space-x-3">
                    {selectedProduct.coverImage && (
                      <div className="relative w-10 h-12 rounded-xs overflow-hidden shrink-0 border border-atelier-border">
                        <Image
                          src={selectedProduct.coverImage}
                          alt={selectedProduct.title}
                          fill
                          className="object-cover"
                        />
                      </div>
                    )}
                    <div>
                      <div className="font-semibold text-brand-950">{selectedProduct.title}</div>
                      <div className="text-[11px] text-atelier-muted">
                        Категория: {selectedProduct.categoryTitle} • Базовая цена: {selectedProduct.basePrice} KGS
                        {selectedProduct.bundlePrice ? ` • Комплект ALL: ${selectedProduct.bundlePrice} KGS` : ""}
                      </div>
                    </div>
                  </div>
                  <Link
                    href={`/catalog/${selectedProduct.slug}`}
                    target="_blank"
                    className="text-brand-800 hover:text-brand-950 shrink-0 font-medium text-[11px] flex items-center"
                  >
                    <span>Смотреть</span>
                    <ExternalLink className="w-3 h-3 ml-1" />
                  </Link>
                </div>
              )}
            </div>

            {/* Overrides */}
            <div className="space-y-4 pt-4 border-t border-atelier-border">
              <label className="block text-xs font-semibold uppercase tracking-wider text-brand-950">
                2. Текстовые поля и бейджи (Переопределение)
              </label>

              <div>
                <label className="block text-xs font-medium text-atelier-charcoal mb-1">
                  Верхний бейдж (В плашке поверх карточки)
                </label>
                <input
                  type="text"
                  value={heroBadge}
                  onChange={(e) => setHeroBadge(e.target.value)}
                  placeholder="Хит сезона • Точная посадка"
                  className="w-full text-xs px-3 py-2 border border-atelier-border rounded-sm focus:outline-none focus:border-brand-800"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-atelier-charcoal mb-1">
                  Подзаголовок (Маленький верхний текст над названием)
                </label>
                <input
                  type="text"
                  value={heroSubtitle}
                  onChange={(e) => setHeroSubtitle(e.target.value)}
                  placeholder="Флагманская выкройка"
                  className="w-full text-xs px-3 py-2 border border-atelier-border rounded-sm focus:outline-none focus:border-brand-800"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-atelier-charcoal mb-1">
                  Название модели (Заголовок на карточке)
                </label>
                <input
                  type="text"
                  value={heroTitle}
                  onChange={(e) => setHeroTitle(e.target.value)}
                  placeholder="Платье миди «Аида» с запахом"
                  className="w-full text-xs px-3 py-2 border border-atelier-border rounded-sm focus:outline-none focus:border-brand-800"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-atelier-charcoal mb-1">
                  Краткое описание выкройки
                </label>
                <textarea
                  rows={2}
                  value={heroDescription}
                  onChange={(e) => setHeroDescription(e.target.value)}
                  placeholder="Описание преимуществ модели..."
                  className="w-full text-xs px-3 py-2 border border-atelier-border rounded-sm focus:outline-none focus:border-brand-800"
                />
              </div>
            </div>

            {/* Photo picker */}
            <div className="space-y-3 pt-4 border-t border-atelier-border">
              <label className="block text-xs font-semibold uppercase tracking-wider text-brand-950">
                3. Фотография для карточки
              </label>

              {selectedProduct && selectedProduct.images.length > 0 && (
                <div>
                  <span className="text-[11px] text-atelier-muted block mb-2">
                    Выберите из загруженных фотографий выбранной модели:
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {selectedProduct.images.map((imgUrl, idx) => {
                      const isChosen = heroImageUrl === imgUrl;
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setHeroImageUrl(imgUrl)}
                          className={`relative w-14 h-18 rounded-xs overflow-hidden border-2 transition-all ${
                            isChosen
                              ? "border-brand-900 ring-2 ring-brand-300 shadow-sm"
                              : "border-atelier-border opacity-70 hover:opacity-100"
                          }`}
                        >
                          <Image src={imgUrl} alt={`Фото ${idx + 1}`} fill className="object-cover" />
                          {isChosen && (
                            <div className="absolute top-1 right-1 bg-brand-900 text-white rounded-full p-0.5 shadow-xs">
                              <Check className="w-2.5 h-2.5" />
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-atelier-charcoal mb-1">
                  Или укажите прямую ссылку на фотографию (URL)
                </label>
                <input
                  type="text"
                  value={heroImageUrl}
                  onChange={(e) => setHeroImageUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full text-xs px-3 py-2 border border-atelier-border rounded-sm focus:outline-none focus:border-brand-800 font-mono"
                />
              </div>
            </div>

            {/* Button Link */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-atelier-border">
              <div>
                <label className="block text-xs font-medium text-atelier-charcoal mb-1">
                  Текст кнопки
                </label>
                <input
                  type="text"
                  value={heroButtonText}
                  onChange={(e) => setHeroButtonText(e.target.value)}
                  placeholder="Смотреть выкройку →"
                  className="w-full text-xs px-3 py-2 border border-atelier-border rounded-sm focus:outline-none focus:border-brand-800"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-atelier-charcoal mb-1">
                  Ссылка перехода кнопки
                </label>
                <input
                  type="text"
                  value={heroButtonLink}
                  onChange={(e) => setHeroButtonLink(e.target.value)}
                  placeholder="/catalog/plate-midi-aida-s-zapakhom"
                  className="w-full text-xs px-3 py-2 border border-atelier-border rounded-sm focus:outline-none focus:border-brand-800 font-mono"
                />
              </div>
            </div>

            {/* Active Period */}
            <div className="space-y-3 pt-4 border-t border-atelier-border">
              <label className="block text-xs font-semibold uppercase tracking-wider text-brand-950">
                4. Период активности (Опционально)
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] text-atelier-muted mb-1">
                    Дата начала показа
                  </label>
                  <input
                    type="date"
                    value={heroStartDate}
                    onChange={(e) => setHeroStartDate(e.target.value)}
                    className="w-full text-xs px-3 py-2 border border-atelier-border rounded-sm focus:outline-none focus:border-brand-800"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-atelier-muted mb-1">
                    Дата завершения показа
                  </label>
                  <input
                    type="date"
                    value={heroEndDate}
                    onChange={(e) => setHeroEndDate(e.target.value)}
                    className="w-full text-xs px-3 py-2 border border-atelier-border rounded-sm focus:outline-none focus:border-brand-800"
                  />
                </div>
              </div>
              <p className="text-[11px] text-atelier-muted">
                Если даты не указаны, блок отображается бессрочно при включенном чекбоксе активности.
              </p>
            </div>

            {/* Submit button */}
            <div className="pt-4 border-t border-atelier-border flex items-center justify-end space-x-3">
              <Button
                onClick={handleSaveHero}
                disabled={isSaving}
                className="px-6 text-xs font-semibold"
              >
                <Save className="w-4 h-4 mr-2" />
                <span>{isSaving ? "Сохранение..." : "Сохранить изменения"}</span>
              </Button>
            </div>
          </div>

          {/* Interactive Live Preview - 5 cols */}
          <div className="lg:col-span-5 sticky top-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-xs font-semibold uppercase tracking-wider text-brand-800">
                <Eye className="w-4 h-4" />
                <span>Живой предпросмотр на сайте</span>
              </div>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                  heroEnabled ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-700"
                }`}
              >
                {heroEnabled ? "Блок активен" : "Блок скрыт"}
              </span>
            </div>

            {/* Showcase preview card */}
            <div className="relative mx-auto max-w-sm w-full">
              {/* Decorative frame */}
              <div className="absolute -inset-2 bg-gradient-to-tr from-brand-200/50 via-brand-100/20 to-transparent rounded-sm -rotate-1 pointer-events-none" />

              <div className="relative bg-white border border-atelier-border rounded-sm shadow-xl overflow-hidden group">
                <div className="relative aspect-[3/4] bg-atelier-subtle overflow-hidden">
                  {previewImage ? (
                    <Image
                      src={previewImage}
                      alt={heroTitle}
                      fill
                      sizes="400px"
                      className="object-cover object-center group-hover:scale-105 transition-transform duration-700"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-atelier-muted">
                      <ImageIcon className="w-12 h-12 mb-2 stroke-[1]" />
                      <span className="text-xs">Фото не выбрано</span>
                    </div>
                  )}

                  {/* Gradient shadow */}
                  <div className="absolute inset-0 bg-gradient-to-t from-brand-950/85 via-black/10 to-black/20 pointer-events-none" />

                  {/* Top badges bar */}
                  <div className="absolute top-3 left-3 right-3 z-10 flex items-center justify-between gap-2 pointer-events-none">
                    <div className="flex items-center space-x-1.5 px-2.5 py-1 bg-white/95 backdrop-blur-xs text-brand-950 rounded-sm text-[10px] sm:text-xs font-semibold uppercase tracking-wider shadow-sm truncate">
                      <Sparkles className="w-3.5 h-3.5 text-brand-800 shrink-0" />
                      <span className="truncate">{heroBadge || "Хит сезона"}</span>
                    </div>

                    <div className="px-2 py-0.5 bg-brand-900/90 text-white rounded-sm text-[10px] font-mono shadow-sm shrink-0 whitespace-nowrap">
                      A4 + Плоттер
                    </div>
                  </div>

                  {/* Bottom overlay info */}
                  <div className="absolute bottom-0 left-0 right-0 p-5 text-white z-10">
                    <span className="text-[11px] uppercase tracking-widest text-brand-200 font-semibold block mb-1">
                      {heroSubtitle || "Флагманская выкройка"}
                    </span>
                    <h3 className="font-serif text-xl sm:text-2xl font-bold leading-snug">
                      {heroTitle || "Название модели"}
                    </h3>
                    <div className="mt-2 flex items-baseline justify-between">
                      <div>
                        <span className="text-lg font-bold text-white">
                          {previewBasePrice} KGS
                        </span>
                        {previewBundlePrice ? (
                          <span className="text-xs text-brand-200 ml-2">
                            • или комплект ALL за {previewBundlePrice} KGS
                          </span>
                        ) : null}
                      </div>
                      <span className="text-xs font-semibold text-white bg-white/20 px-3 py-1.5 rounded-sm transition-colors backdrop-blur-xs">
                        {heroButtonText || "Смотреть выкройку →"}
                      </span>
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
      )}

      {/* =================================================================== */}
      {/* TAB 2: SECTIONS (NEW ARRIVALS & BESTSELLERS)                         */}
      {/* =================================================================== */}
      {activeTab === "sections" && (
        <div className="bg-white border border-atelier-border rounded-sm p-6 space-y-8 shadow-xs max-w-3xl">
          <div>
            <h2 className="font-serif text-lg font-bold text-brand-950">
              Секции витрины каталога
            </h2>
            <p className="text-xs text-atelier-muted">
              Управление заголовками и видимостью секций новинок и бестселлеров.
            </p>
          </div>

          {/* Section 1: New arrivals */}
          <div className="p-5 border border-atelier-border rounded-sm space-y-4 bg-atelier-surface/50">
            <div className="flex items-center justify-between pb-3 border-b border-atelier-border">
              <div className="flex items-center space-x-2">
                <Star className="w-4 h-4 text-brand-800" />
                <h3 className="text-sm font-bold text-brand-950">Секция «Новинки»</h3>
              </div>
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newArrivalsEnabled}
                  onChange={(e) => setNewArrivalsEnabled(e.target.checked)}
                  className="w-4 h-4 text-brand-900 border-gray-300 rounded focus:ring-brand-800"
                />
                <span className="text-xs font-semibold text-brand-950">
                  {newArrivalsEnabled ? "Включена" : "Отключена"}
                </span>
              </label>
            </div>

            <div>
              <label className="block text-xs font-medium text-atelier-charcoal mb-1">
                Заголовок секции
              </label>
              <input
                type="text"
                value={newArrivalsTitle}
                onChange={(e) => setNewArrivalsTitle(e.target.value)}
                placeholder="Новинки сезона"
                className="w-full text-xs px-3 py-2 border border-atelier-border rounded-sm focus:outline-none focus:border-brand-800"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-atelier-charcoal mb-1">
                Подзаголовок / Описание секции
              </label>
              <input
                type="text"
                value={newArrivalsSubtitle}
                onChange={(e) => setNewArrivalsSubtitle(e.target.value)}
                placeholder="Свежие выкройки с безупречной посадкой"
                className="w-full text-xs px-3 py-2 border border-atelier-border rounded-sm focus:outline-none focus:border-brand-800"
              />
            </div>
          </div>

          {/* Section 2: Bestsellers */}
          <div className="p-5 border border-atelier-border rounded-sm space-y-4 bg-atelier-surface/50">
            <div className="flex items-center justify-between pb-3 border-b border-atelier-border">
              <div className="flex items-center space-x-2">
                <Flame className="w-4 h-4 text-brand-800" />
                <h3 className="text-sm font-bold text-brand-950">Секция «Бестселлеры / Популярные»</h3>
              </div>
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={bestsellersEnabled}
                  onChange={(e) => setBestsellersEnabled(e.target.checked)}
                  className="w-4 h-4 text-brand-900 border-gray-300 rounded focus:ring-brand-800"
                />
                <span className="text-xs font-semibold text-brand-950">
                  {bestsellersEnabled ? "Включена" : "Отключена"}
                </span>
              </label>
            </div>

            <div>
              <label className="block text-xs font-medium text-atelier-charcoal mb-1">
                Заголовок секции
              </label>
              <input
                type="text"
                value={bestsellersTitle}
                onChange={(e) => setBestsellersTitle(e.target.value)}
                placeholder="Популярные выкройки"
                className="w-full text-xs px-3 py-2 border border-atelier-border rounded-sm focus:outline-none focus:border-brand-800"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-atelier-charcoal mb-1">
                Подзаголовок / Описание секции
              </label>
              <input
                type="text"
                value={bestsellersSubtitle}
                onChange={(e) => setBestsellersSubtitle(e.target.value)}
                placeholder="Выбор покупателей LEKALO ZHIIDE"
                className="w-full text-xs px-3 py-2 border border-atelier-border rounded-sm focus:outline-none focus:border-brand-800"
              />
            </div>
          </div>

          {/* Submit */}
          <div className="flex justify-end pt-4 border-t border-atelier-border">
            <Button
              onClick={handleSaveSections}
              disabled={isSaving}
              className="px-6 text-xs font-semibold"
            >
              <Save className="w-4 h-4 mr-2" />
              <span>{isSaving ? "Сохранение..." : "Сохранить секции"}</span>
            </Button>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 3: PROMO BANNER                                                 */}
      {/* =================================================================== */}
      {activeTab === "banner" && (
        <div className="space-y-6 max-w-4xl">
          <div className="bg-white border border-atelier-border rounded-sm p-6 space-y-6 shadow-xs">
            <div className="flex items-center justify-between pb-4 border-b border-atelier-border">
              <div>
                <h2 className="font-serif text-lg font-bold text-brand-950">
                  Настройки нижнего промо-баннера (CTA)
                </h2>
                <p className="text-xs text-atelier-muted">
                  Баннер побуждает клиентов перейти в каталог и сделать первый заказ.
                </p>
              </div>

              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={bannerEnabled}
                  onChange={(e) => setBannerEnabled(e.target.checked)}
                  className="w-4 h-4 text-brand-900 border-gray-300 rounded focus:ring-brand-800"
                />
                <span className="text-xs font-semibold text-brand-950">
                  {bannerEnabled ? "Баннер включен" : "Баннер скрыт"}
                </span>
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-atelier-charcoal mb-1">
                  Верхний бейдж
                </label>
                <input
                  type="text"
                  value={bannerBadge}
                  onChange={(e) => setBannerBadge(e.target.value)}
                  placeholder="Начните шить прямо сегодня"
                  className="w-full text-xs px-3 py-2 border border-atelier-border rounded-sm focus:outline-none focus:border-brand-800"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-atelier-charcoal mb-1">
                  Подзаголовок
                </label>
                <input
                  type="text"
                  value={bannerSubtitle}
                  onChange={(e) => setBannerSubtitle(e.target.value)}
                  placeholder="Цифровые лекала ресторанного и подиумного уровня"
                  className="w-full text-xs px-3 py-2 border border-atelier-border rounded-sm focus:outline-none focus:border-brand-800"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-atelier-charcoal mb-1">
                Главный заголовок баннера
              </label>
              <input
                type="text"
                value={bannerTitle}
                onChange={(e) => setBannerTitle(e.target.value)}
                placeholder="Создайте свой идеальный гардероб с LEKALO ZHIIDE"
                className="w-full text-xs px-3 py-2 border border-atelier-border rounded-sm focus:outline-none focus:border-brand-800"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-atelier-charcoal mb-1">
                Подробный текст баннера
              </label>
              <textarea
                rows={3}
                value={bannerDescription}
                onChange={(e) => setBannerDescription(e.target.value)}
                placeholder="Описание преимуществ каталога..."
                className="w-full text-xs px-3 py-2 border border-atelier-border rounded-sm focus:outline-none focus:border-brand-800"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-atelier-charcoal mb-1">
                  Текст кнопки действия
                </label>
                <input
                  type="text"
                  value={bannerButtonText}
                  onChange={(e) => setBannerButtonText(e.target.value)}
                  placeholder="Перейти в каталог выкроек"
                  className="w-full text-xs px-3 py-2 border border-atelier-border rounded-sm focus:outline-none focus:border-brand-800"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-atelier-charcoal mb-1">
                  Ссылка перехода кнопки
                </label>
                <input
                  type="text"
                  value={bannerButtonLink}
                  onChange={(e) => setBannerButtonLink(e.target.value)}
                  placeholder="/catalog"
                  className="w-full text-xs px-3 py-2 border border-atelier-border rounded-sm focus:outline-none focus:border-brand-800 font-mono"
                />
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-atelier-border">
              <Button
                onClick={handleSaveBanner}
                disabled={isSaving}
                className="px-6 text-xs font-semibold"
              >
                <Save className="w-4 h-4 mr-2" />
                <span>{isSaving ? "Сохранение..." : "Сохранить промо-баннер"}</span>
              </Button>
            </div>
          </div>

          {/* Banner Live Preview */}
          <div className="space-y-2">
            <div className="flex items-center space-x-2 text-xs font-semibold uppercase tracking-wider text-brand-800">
              <Eye className="w-4 h-4" />
              <span>Предпросмотр промо-баннера</span>
            </div>

            <div className="bg-gradient-to-r from-brand-950 via-brand-900 to-brand-950 text-white p-8 rounded-sm text-center space-y-4 shadow-md">
              <span className="text-[11px] uppercase tracking-widest text-brand-300 font-semibold inline-block">
                {bannerBadge}
              </span>
              <h2 className="font-serif text-2xl sm:text-3xl font-bold tracking-tight">
                {bannerTitle}
              </h2>
              <p className="text-xs sm:text-sm text-brand-200/90 max-w-xl mx-auto leading-relaxed">
                {bannerDescription}
              </p>
              <div className="pt-2">
                <span className="inline-flex items-center text-xs font-semibold bg-white text-brand-950 px-6 py-2.5 rounded-sm shadow-sm cursor-pointer">
                  <span>{bannerButtonText}</span>
                  <ArrowRight className="w-3.5 h-3.5 ml-2" />
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
