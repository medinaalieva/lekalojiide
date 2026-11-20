"use client";

import React, { useEffect, useState, useMemo, useRef } from "react";
import Link from "next/link";
import { Product, ProductVariant } from "../../../types";
import { api } from "../../../lib/api";
import { useCart } from "../../../lib/cart-context";
import { useAuth } from "../../../lib/auth-context";
import { Button } from "../../../components/ui/Button";
import { DifficultyBadge } from "../../../components/ui/Badge";
import { ProductCard } from "../../../components/catalog/ProductCard";
import {
  Scissors,
  Check,
  ShoppingBag,
  FileText,
  AlertCircle,
  Sparkles,
  Layers,
  ChevronRight,
  ChevronLeft,
  ZoomIn,
  ZoomOut,
  X,
  Clock,
  Ruler,
  HelpCircle,
  Video,
  Eye,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Info,
} from "lucide-react";

// Helper utilities for variant properties
const getSizeCode = (v: any) =>
  typeof v?.size === "object" ? v.size?.code || v.size?.label : v?.size || "";
const getSizeLabel = (v: any) =>
  typeof v?.size === "object" ? v.size?.label || v.size?.code : v?.size || "";
const getHeightCode = (v: any) =>
  typeof v?.height === "object" ? v.height?.code || v.height?.label : v?.height || "";
const getHeightLabel = (v: any) =>
  typeof v?.height === "object" ? v.height?.label || v.height?.code : v?.height || "";
const getFormatCode = (v: any) =>
  typeof v?.format === "object" ? v.format?.code || v.format?.label : v?.format || "";
const getFormatLabel = (v: any) =>
  typeof v?.format === "object" ? v.format?.label || v.format?.code : v?.format || "";
const getVariantId = (v: any) => v?.variantId || v?.id || "";
const getVariantPrice = (v: any) => v?.price ?? v?.priceKgs ?? 0;

// Clean height display to prevent duplicate "см см" bug
const cleanHeightStr = (str: string) => {
  if (!str) return "";
  return str.replace(/\s*см\s*$/i, "").trim() + " см";
};

// Clean format display names
const cleanFormatStr = (fmt: string) => {
  if (!fmt) return "";
  if (fmt === "A4") return "А4 (домашний принтер)";
  if (fmt === "PLOTTER_900") return "Плоттер 900 мм";
  if (fmt === "PLOTTER_600") return "Плоттер 600 мм";
  if (fmt === "LETTER") return "US Letter";
  return fmt;
};

// Russian date formatter for discount expiry
function formatDiscountDate(isoStr?: string | null): string {
  if (!isoStr) return "";
  try {
    const d = new Date(isoStr);
    return d.toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

// YouTube embed URL helper
function getYouTubeEmbedUrl(url?: string | null): string | null {
  if (!url) return null;
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
  if (match && match[1]) {
    return `https://www.youtube.com/embed/${match[1]}`;
  }
  return null;
}

interface ToastMessage {
  type: "success" | "conflict" | "error";
  text: string;
  actionUrl?: string;
  actionLabel?: string;
}

interface ProductDetailViewProps {
  slug: string;
  initialProduct?: Product | null;
  initialError?: string | null;
}

// Helpers for extracting initial cover image and variants synchronously
const extractCoverImage = (prod?: Product | null): string => {
  if (!prod) return "";
  const foundCover = prod.images?.find(
    (img: any) => typeof img === "object" && img?.isCover
  );
  return (
    (typeof foundCover === "object" ? (foundCover as any).imageUrl : null) ||
    (prod.images && prod.images.length > 0
      ? typeof prod.images[0] === "string"
        ? prod.images[0]
        : (prod.images[0] as any)?.imageUrl
      : prod.coverImage || "")
  );
};

const extractInitialVariants = (prod?: Product | null) => {
  if (!prod?.variants || prod.variants.length === 0) {
    return { size: "", height: "", format: "" };
  }
  const nonBundleVariants = prod.variants.filter(
    (v: any) => v.size?.code !== "ALL" && !v.isBundle
  );
  const first = nonBundleVariants.length > 0 ? nonBundleVariants[0] : prod.variants[0];
  return {
    size: getSizeCode(first) || getSizeLabel(first),
    height: getHeightCode(first) || getHeightLabel(first),
    format: getFormatCode(first) || getFormatLabel(first),
  };
};

export default function ProductDetailView({
  slug,
  initialProduct = null,
  initialError = null,
}: ProductDetailViewProps) {
  const { user } = useAuth();
  const { addItem, isLoading: cartLoading } = useCart();

  const [product, setProduct] = useState<Product | null>(initialProduct);
  const [loading, setLoading] = useState<boolean>(!initialProduct && !initialError);
  const [error, setError] = useState<string | null>(initialError);

  // Gallery state
  const [selectedImage, setSelectedImage] = useState<string>(() =>
    extractCoverImage(initialProduct)
  );
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  // Dedicated CAD Lightbox state
  const [cadLightboxOpen, setCadLightboxOpen] = useState(false);
  const [cadZoomed, setCadZoomed] = useState(false);

  // Purchase Mode: "single" | "bundle"
  const [purchaseMode, setPurchaseMode] = useState<"single" | "bundle">("single");

  // Variant selection state
  const initialVars = useMemo(
    () => extractInitialVariants(initialProduct),
    [initialProduct]
  );
  const [selectedSize, setSelectedSize] = useState<string>(initialVars.size);
  const [selectedHeight, setSelectedHeight] = useState<string>(initialVars.height);
  const [selectedFormat, setSelectedFormat] = useState<string>(initialVars.format);

  // UI Modals & Popovers
  const [authPromptOpen, setAuthPromptOpen] = useState(false);
  const [sizeGuideOpen, setSizeGuideOpen] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  // Similar products
  const [similarProducts, setSimilarProducts] = useState<Product[]>([]);

  // Mobile Sticky Buy Bar trigger
  const buyButtonRef = useRef<HTMLDivElement>(null);
  const [showStickyBar, setShowStickyBar] = useState(false);

  // Active accordion/tab
  const [activeTab, setActiveTab] = useState<"description" | "fabric" | "measurements" | "drawing" | "video">("description");

  // Helper function to fetch similar products independently (does not block initial view)
  const fetchSimilar = async (categorySlug: string, currentProductId: string) => {
    try {
      const simRes = await api.get<{ success: boolean; data: Product[] }>(
        `/api/v1/catalog/products?categorySlug=${categorySlug}&limit=5`
      );
      if (simRes.success && simRes.data) {
        setSimilarProducts(
          simRes.data.filter((p) => p.id !== currentProductId).slice(0, 4)
        );
      }
    } catch {
      // Non-critical, ignore
    }
  };

  // Synchronize or load product data
  useEffect(() => {
    // 1. If initialProduct is provided and matches current slug, DO NOT re-fetch!
    if (initialProduct && initialProduct.slug === slug) {
      if (initialProduct.category?.slug && similarProducts.length === 0) {
        fetchSimilar(initialProduct.category.slug, initialProduct.id);
      }
      return;
    }

    // 2. If initialError was provided by Server Component, do not perform duplicate client fetch
    if (initialError) {
      return;
    }

    // 3. Fallback: Client-side fetch when rendered without initialProduct
    async function loadProduct() {
      if (!slug) return;
      setLoading(true);
      setError(null);
      try {
        const res = await api.get<{ success: boolean; data: Product }>(
          `/api/v1/catalog/products/${slug}`
        );
        if (res.success && res.data) {
          const prodData = res.data;
          setProduct(prodData);

          const coverImg = extractCoverImage(prodData);
          if (coverImg) setSelectedImage(coverImg);

          const vars = extractInitialVariants(prodData);
          setSelectedSize(vars.size);
          setSelectedHeight(vars.height);
          setSelectedFormat(vars.format);

          if (prodData.category?.slug) {
            fetchSimilar(prodData.category.slug, prodData.id);
          }
        } else {
          setError("Выкройка не найдена");
        }
      } catch (err: any) {
        setError(err.message || "Ошибка загрузки карточки выкройки");
      } finally {
        setLoading(false);
      }
    }

    loadProduct();
  }, [slug, initialProduct, initialError]);

  // Track scroll position for Mobile Sticky Buy Bar
  useEffect(() => {
    const handleScroll = () => {
      if (!buyButtonRef.current) return;
      const rect = buyButtonRef.current.getBoundingClientRect();
      // Show sticky bar when the main button scrolls above the viewport
      setShowStickyBar(rect.bottom < 0);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Prevent background scroll when any modal is open (CAD Lightbox, Gallery Lightbox, Size Guide)
  useEffect(() => {
    const isAnyModalOpen = cadLightboxOpen || lightboxOpen || sizeGuideOpen;
    if (isAnyModalOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [cadLightboxOpen, lightboxOpen, sizeGuideOpen]);

  // Keyboard navigation & Escape for CAD Lightbox
  useEffect(() => {
    if (!cadLightboxOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setCadLightboxOpen(false);
        setCadZoomed(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [cadLightboxOpen]);

  // Keyboard navigation for Lightbox
  useEffect(() => {
    if (!lightboxOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxOpen(false);
      if (e.key === "ArrowLeft") handlePrevImage();
      if (e.key === "ArrowRight") handleNextImage();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lightboxOpen, lightboxIndex]);

  // Helper getters
  const getSizeStr = (v: any) =>
    typeof v?.size === "object" ? v.size?.code || v.size?.label : v?.size || "";
  const getHeightStr = (v: any) =>
    typeof v?.height === "object" ? v.height?.code || v.height?.label : v?.height || "";
  const getFormatStr = (v: any) =>
    typeof v?.format === "object" ? v.format?.code || v.format?.label : v?.format || "";

  // All extracted images for gallery and lightbox
  const allImages = useMemo(() => {
    if (!product) return [];
    const list: string[] = [];
    if (product.coverImage && !list.includes(product.coverImage)) {
      list.push(product.coverImage);
    }
    if (product.images) {
      for (const img of product.images) {
        const url = typeof img === "string" ? img : img?.imageUrl;
        if (url && !list.includes(url)) {
          list.push(url);
        }
      }
    }
    if (product.technicalDrawingUrl && !list.includes(product.technicalDrawingUrl)) {
      list.push(product.technicalDrawingUrl);
    }
    return list;
  }, [product]);

  // ALL Bundle availability check
  const bundleVariantList = useMemo(() => {
    if (!product?.variants) return [];
    return product.variants.filter((v: any) => v.size?.code === "ALL" || v.isBundle);
  }, [product]);

  const hasBundleOption = useMemo(() => {
    return Boolean(
      product?.hasBundleOption &&
      bundleVariantList.length > 0
    );
  }, [product, bundleVariantList]);

  // Single-size variants (excluding ALL)
  const singleVariants = useMemo(() => {
    if (!product?.variants) return [];
    return product.variants.filter((v: any) => v.size?.code !== "ALL" && !v.isBundle);
  }, [product]);

  // Available sizes for single mode
  const availableSizes = useMemo(() => {
    const list = singleVariants.map((v) => ({
      code: getSizeCode(v),
      label: getSizeLabel(v),
    }));
    const unique = new Map<string, string>();
    for (const s of list) {
      if (s.code && !unique.has(s.code)) {
        unique.set(s.code, s.label);
      }
    }
    return Array.from(unique.entries()).map(([code, label]) => ({ code, label }));
  }, [singleVariants]);

  // Available heights for current selection
  const availableHeights = useMemo(() => {
    if (!product?.variants) return [];
    const targetVariants = purchaseMode === "bundle" ? bundleVariantList : singleVariants;
    const heights = targetVariants
      .filter((v) => purchaseMode === "bundle" || !selectedSize || getSizeCode(v) === selectedSize)
      .map((v) => ({
        code: getHeightCode(v) || getHeightStr(v),
        label: cleanHeightStr(getHeightLabel(v) || getHeightStr(v)),
      }));

    const unique = new Map<string, string>();
    for (const h of heights) {
      if (h.code && !unique.has(h.code)) {
        unique.set(h.code, h.label);
      }
    }
    return Array.from(unique.entries()).map(([code, label]) => ({ code, label }));
  }, [product, purchaseMode, bundleVariantList, singleVariants, selectedSize]);

  // Available formats for current selection
  const availableFormats = useMemo(() => {
    if (!product?.variants) return [];
    const targetVariants = purchaseMode === "bundle" ? bundleVariantList : singleVariants;
    const formats = targetVariants
      .filter(
        (v) =>
          (purchaseMode === "bundle" || !selectedSize || getSizeCode(v) === selectedSize) &&
          (!selectedHeight || (getHeightCode(v) || getHeightStr(v)) === selectedHeight)
      )
      .map((v) => ({
        code: getFormatCode(v) || getFormatStr(v),
        label: cleanFormatStr(getFormatCode(v) || getFormatStr(v)),
      }));

    const unique = new Map<string, string>();
    for (const f of formats) {
      if (f.code && !unique.has(f.code)) {
        unique.set(f.code, f.label);
      }
    }
    return Array.from(unique.entries()).map(([code, label]) => ({ code, label }));
  }, [product, purchaseMode, bundleVariantList, singleVariants, selectedSize, selectedHeight]);

  // Synchronize height and format if selections become unavailable
  useEffect(() => {
    if (availableHeights.length > 0) {
      const currentExists = availableHeights.some((h) => h.code === selectedHeight);
      if (!selectedHeight || !currentExists) {
        setSelectedHeight(availableHeights[0].code);
      }
    }
  }, [availableHeights, selectedHeight]);

  useEffect(() => {
    if (availableFormats.length > 0) {
      const currentExists = availableFormats.some((f) => f.code === selectedFormat);
      if (!selectedFormat || !currentExists) {
        setSelectedFormat(availableFormats[0].code);
      }
    }
  }, [availableFormats, selectedFormat]);

  // Find exact matching active variant
  const activeVariant: any | undefined = useMemo(() => {
    if (!product?.variants) return undefined;

    if (purchaseMode === "bundle") {
      // Find bundle variant matching selected height and format
      const match = bundleVariantList.find(
        (v) =>
          (!selectedHeight || (getHeightCode(v) || getHeightStr(v)) === selectedHeight) &&
          (!selectedFormat || (getFormatCode(v) || getFormatStr(v)) === selectedFormat)
      );
      if (match) return match;
      return bundleVariantList[0];
    } else {
      // Find single variant matching size, height, and format
      return singleVariants.find(
        (v) =>
          getSizeCode(v) === selectedSize &&
          (!selectedHeight || (getHeightCode(v) || getHeightStr(v)) === selectedHeight) &&
          (!selectedFormat || (getFormatCode(v) || getFormatStr(v)) === selectedFormat)
      );
    }
  }, [product, purchaseMode, bundleVariantList, singleVariants, selectedSize, selectedHeight, selectedFormat]);

  // Bundle economy calculation
  const bundleSavings = useMemo(() => {
    if (!product?.bundlePrice) return null;
    // Base single-size price on a corresponding single variant (not the bundle variant)
    const sampleSingle =
      singleVariants.find(
        (v) =>
          (!selectedHeight || (getHeightCode(v) || getHeightStr(v)) === selectedHeight) &&
          (!selectedFormat || (getFormatCode(v) || getFormatStr(v)) === selectedFormat)
      ) || singleVariants[0];

    const singlePrice = sampleSingle
      ? getVariantPrice(sampleSingle)
      : (product.currentPrice || product.basePrice || 0);
    const totalSizesCount = availableSizes.length || 4;
    const totalIndividualCost = singlePrice * totalSizesCount;
    const savings = totalIndividualCost - product.bundlePrice;
    const percent = totalIndividualCost > 0 ? Math.round((savings / totalIndividualCost) * 100) : 0;

    if (savings > 0) {
      return { amount: savings, percent };
    }
    return null;
  }, [product, singleVariants, availableSizes, selectedHeight, selectedFormat]);

  // Lightbox navigation
  const openLightbox = (index: number) => {
    setLightboxIndex(index);
    setLightboxOpen(true);
  };

  const handlePrevImage = () => {
    if (allImages.length <= 1) return;
    setLightboxIndex((prev) => (prev > 0 ? prev - 1 : allImages.length - 1));
  };

  const handleNextImage = () => {
    if (allImages.length <= 1) return;
    setLightboxIndex((prev) => (prev < allImages.length - 1 ? prev + 1 : 0));
  };

  // Toast trigger
  const showToast = (msg: ToastMessage) => {
    setToast(msg);
    setTimeout(() => {
      setToast((current) => (current === msg ? null : current));
    }, 5000);
  };

  // Add to Cart handler
  const handleAddToCart = async () => {
    const varId = getVariantId(activeVariant);
    if (!varId) {
      showToast({
        type: "error",
        text: "Пожалуйста, выберите доступный размер и формат выкройки.",
      });
      return;
    }

    if (activeVariant && activeVariant.isAvailable === false) {
      showToast({
        type: "error",
        text: (activeVariant as any).unavailableMessage || "Выкройка пока готовится конструктором и недоступна для заказа.",
      });
      return;
    }

    try {
      const price = activeVariant
        ? getVariantPrice(activeVariant)
        : (product?.currentPrice || product?.basePrice || 0);
      const isBundle = purchaseMode === "bundle" || activeVariant?.size?.code === "ALL";

      await addItem(varId, {
        productId: product?.id,
        title: product?.title,
        slug: product?.slug,
        coverImage: selectedImage || product?.coverImage,
        sku: activeVariant?.sku,
        size: isBundle ? "ALL" : getSizeLabel(activeVariant),
        height: cleanHeightStr(getHeightLabel(activeVariant) || getHeightStr(activeVariant)),
        format: cleanFormatStr(getFormatCode(activeVariant) || getFormatStr(activeVariant)),
        price,
        originalPrice: activeVariant?.originalPrice,
        isDiscountActive: activeVariant?.isDiscountActive,
        isBundle,
      });

      showToast({
        type: "success",
        text: purchaseMode === "bundle"
          ? "Комплект ALL (все размеры) успешно добавлен в корзину!"
          : "Выкройка успешно добавлена в корзину!",
        actionUrl: "/cart",
        actionLabel: "В корзину →",
      });
    } catch (err: any) {
      if (
        err.message?.includes("VARIANT_ALREADY_IN_CART") ||
        err.code === "VARIANT_ALREADY_IN_CART" ||
        err.status === 409
      ) {
        showToast({
          type: "conflict",
          text: "Этот вариант выкройки уже добавлен в вашу корзину.",
          actionUrl: "/cart",
          actionLabel: "Оформить заказ →",
        });
      } else {
        showToast({
          type: "error",
          text: err.message || "Не удалось добавить товар в корзину. Попробуйте еще раз.",
        });
      }
    }
  };

  // Fabric details extraction
  const fabricData = useMemo(() => {
    const raw = product?.fabricDetails || {};
    return {
      recommendation: raw.recommendation || raw.fabricType || raw.summary || product?.fabricRequirements || null,
      consumption: raw.consumption || null,
      notions: raw.notions || null,
      measurements: raw.measurements || product?.measurementsInfo || null,
    };
  }, [product]);

  const hasFabricInfo = Boolean(
    fabricData.recommendation || fabricData.consumption || fabricData.notions || fabricData.measurements
  );

  const videoEmbedUrl = useMemo(() => getYouTubeEmbedUrl(product?.videoUrl), [product?.videoUrl]);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
          <div className="lg:col-span-7 aspect-[3/4] bg-atelier-subtle animate-pulse rounded-sm" />
          <div className="lg:col-span-5 space-y-6">
            <div className="h-6 w-32 bg-atelier-subtle animate-pulse" />
            <div className="h-10 w-3/4 bg-atelier-subtle animate-pulse" />
            <div className="h-12 w-1/2 bg-atelier-subtle animate-pulse" />
            <div className="h-36 w-full bg-atelier-subtle animate-pulse" />
            <div className="h-12 w-full bg-atelier-subtle animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
        <AlertTriangle className="w-12 h-12 text-amber-600 mx-auto mb-4" />
        <h2 className="text-xl font-serif font-bold text-brand-950">
          Временная ошибка сервера
        </h2>
        <p className="text-sm text-atelier-muted mt-2 max-w-md mx-auto">
          {error}
        </p>
        <p className="text-xs text-atelier-muted mt-1">
          Сервис каталога временно недоступен. Пожалуйста, обновите страницу или повторите попытку позже.
        </p>
        <div className="mt-6 flex items-center justify-center gap-4">
          <Button
            variant="primary"
            onClick={() => window.location.reload()}
          >
            Обновить страницу
          </Button>
          <Link href="/catalog">
            <Button variant="outline">Вернуться в каталог</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
        <AlertCircle className="w-12 h-12 text-rose-500 mx-auto mb-4" />
        <h2 className="text-xl font-serif font-bold text-brand-950">
          Выкройка не найдена
        </h2>
        <p className="text-xs text-atelier-muted mt-2 max-w-sm mx-auto">
          Возможно, модель была снята с публикации или ссылка устарела.
        </p>
        <Link href="/catalog" className="inline-block mt-6">
          <Button variant="outline">Вернуться в каталог</Button>
        </Link>
      </div>
    );
  }

  // Active price calculations
  const currentDisplayPrice = activeVariant
    ? getVariantPrice(activeVariant)
    : purchaseMode === "bundle" && product.bundlePrice
    ? Number(product.bundlePrice)
    : (product.currentPrice ?? product.basePrice ?? 0);

  const originalDisplayPrice = activeVariant?.originalPrice ?? product.basePrice ?? null;
  const isDiscountActive = Boolean(
    activeVariant?.isDiscountActive ?? (product.isDiscountActive && product.discountPrice)
  );
  const discountPercent = product.discountPercent ?? (
    isDiscountActive && originalDisplayPrice && currentDisplayPrice < originalDisplayPrice
      ? Math.round(((originalDisplayPrice - currentDisplayPrice) / originalDisplayPrice) * 100)
      : null
  );

  return (
    <div className="bg-white min-h-screen py-6 sm:py-10 pb-24 lg:pb-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Toast Notification Alert */}
        {toast && (
          <div
            className={`fixed top-5 right-5 z-50 max-w-md w-full shadow-xl border rounded-sm p-4 flex items-start space-x-3 transition-all animate-in slide-in-from-top-3 ${
              toast.type === "success"
                ? "bg-emerald-50 border-emerald-300 text-emerald-950"
                : toast.type === "conflict"
                ? "bg-amber-50 border-amber-300 text-amber-950"
                : "bg-rose-50 border-rose-300 text-rose-950"
            }`}
          >
            {toast.type === "success" ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
            ) : toast.type === "conflict" ? (
              <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
            )}
            <div className="flex-1 text-xs leading-relaxed">
              <p className="font-medium">{toast.text}</p>
              {toast.actionUrl && (
                <Link
                  href={toast.actionUrl}
                  className="font-bold underline mt-1.5 inline-flex items-center space-x-1 hover:opacity-80"
                >
                  <span>{toast.actionLabel}</span>
                  <ArrowRight className="w-3 h-3" />
                </Link>
              )}
            </div>
            <button
              onClick={() => setToast(null)}
              className="text-atelier-muted hover:text-atelier-charcoal p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Breadcrumbs with Category Link */}
        <nav className="flex items-center space-x-2 text-xs text-atelier-muted mb-6 overflow-x-auto whitespace-nowrap pb-1">
          <Link href="/" className="hover:text-brand-900 transition-colors">
            Главная
          </Link>
          <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" />
          <Link href="/catalog" className="hover:text-brand-900 transition-colors">
            Каталог
          </Link>
          {product.category && (
            <>
              <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" />
              <Link
                href={`/catalog?categorySlug=${product.category.slug}`}
                className="hover:text-brand-900 transition-colors"
              >
                {(product.category as any)?.title || product.category?.name}
              </Link>
            </>
          )}
          <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="text-atelier-charcoal font-medium truncate max-w-xs">
            {product.title}
          </span>
        </nav>

        {/* Main Grid: Gallery (7 cols) + Form & Details (5 cols) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
          {/* LEFT: Gallery Column */}
          <div className="lg:col-span-7 space-y-4">
            <div className="relative aspect-[3/4] max-h-[640px] bg-atelier-subtle border border-atelier-border rounded-sm overflow-hidden flex items-center justify-center group shadow-sm">
              {/* Badges on main image */}
              <div className="absolute top-3 left-3 z-10 flex flex-col gap-1.5 items-start">
                {product.isNew && (
                  <span className="bg-brand-900 text-white text-[10px] uppercase font-bold tracking-widest px-2.5 py-1 rounded-sm shadow-sm">
                    Новинка
                  </span>
                )}
                {product.isBestseller && (
                  <span className="bg-amber-600 text-white text-[10px] uppercase font-bold tracking-widest px-2.5 py-1 rounded-sm shadow-sm">
                    Хит продаж
                  </span>
                )}
                {isDiscountActive && discountPercent && (
                  <span className="bg-rose-600 text-white text-[10px] uppercase font-bold tracking-widest px-2.5 py-1 rounded-sm shadow-sm">
                    -{discountPercent}%
                  </span>
                )}
              </div>

              {/* Main Image */}
              {selectedImage ? (
                <img
                  src={selectedImage}
                  alt={product.title}
                  onClick={() => openLightbox(allImages.indexOf(selectedImage) >= 0 ? allImages.indexOf(selectedImage) : 0)}
                  className="w-full h-full object-cover object-top cursor-zoom-in transition-transform duration-300 group-hover:scale-[1.02]"
                />
              ) : (
                <div className="flex flex-col items-center justify-center text-atelier-muted p-12 text-center">
                  <Scissors className="w-16 h-16 stroke-[1.2] mb-3 text-atelier-accent" />
                  <span className="text-xs uppercase tracking-wider font-medium">
                    {product.title}
                  </span>
                  <span className="text-[11px] text-atelier-muted mt-1">
                    Фотография примерки готовится
                  </span>
                </div>
              )}

              {/* Zoom trigger icon */}
              {selectedImage && (
                <button
                  onClick={() => openLightbox(allImages.indexOf(selectedImage) >= 0 ? allImages.indexOf(selectedImage) : 0)}
                  aria-label="Увеличить фото"
                  className="absolute bottom-3 right-3 p-2 bg-white/90 hover:bg-white text-atelier-charcoal rounded-sm shadow-md backdrop-blur-sm transition-all"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
              )}

              {/* Gallery navigation arrows (desktop & mobile) */}
              {allImages.length > 1 && (
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const curIdx = allImages.indexOf(selectedImage);
                      const prevIdx = curIdx > 0 ? curIdx - 1 : allImages.length - 1;
                      setSelectedImage(allImages[prevIdx]);
                    }}
                    aria-label="Предыдущее фото"
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 p-2 bg-white/80 hover:bg-white text-brand-950 rounded-full shadow-md backdrop-blur-sm opacity-80 sm:opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const curIdx = allImages.indexOf(selectedImage);
                      const nextIdx = curIdx < allImages.length - 1 ? curIdx + 1 : 0;
                      setSelectedImage(allImages[nextIdx]);
                    }}
                    aria-label="Следующее фото"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-2 bg-white/80 hover:bg-white text-brand-950 rounded-full shadow-md backdrop-blur-sm opacity-80 sm:opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>

            {/* Thumbnails strip */}
            {allImages.length > 1 && (
              <div className="flex space-x-3 overflow-x-auto pb-2 scrollbar-thin">
                {allImages.map((img, i) => (
                  <button
                    key={i}
                    onClick={() => setSelectedImage(img)}
                    className={`relative w-20 h-24 border rounded-sm overflow-hidden flex-shrink-0 transition-all ${
                      selectedImage === img
                        ? "border-brand-900 ring-2 ring-brand-900/30 opacity-100"
                        : "border-atelier-border opacity-70 hover:opacity-100"
                    }`}
                  >
                    <img src={img} alt="" className="w-full h-full object-cover object-top" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* RIGHT: Details & Purchase Options Column */}
          <div className="lg:col-span-5 flex flex-col justify-start">
            <div className="border-b border-atelier-border pb-5">
              {/* Category & Difficulty */}
              <div className="flex items-center space-x-3 mb-2.5 flex-wrap gap-y-1">
                {product.category && (
                  <span className="text-xs uppercase tracking-widest text-brand-800 font-semibold">
                    {(product.category as any)?.title || product.category?.name}
                  </span>
                )}
                <DifficultyBadge
                  difficulty={
                    product.difficulty ||
                    (product as any)?.difficultyLevel ||
                    product.complexity
                  }
                />
              </div>

              {/* Title */}
              <h1 className="font-serif text-2xl sm:text-3xl font-bold text-brand-950 leading-tight">
                {product.title}
              </h1>

              {/* Price Block */}
              <div className="mt-4 flex flex-col space-y-1.5">
                <div className="flex items-baseline space-x-3 flex-wrap">
                  <span className="font-serif text-3xl font-bold text-brand-950">
                    {currentDisplayPrice > 0
                      ? `${currentDisplayPrice.toLocaleString("ru-RU")} KGS`
                      : "Бесплатно"}
                  </span>

                  {isDiscountActive && originalDisplayPrice && (
                    <span className="text-base text-atelier-muted line-through font-medium">
                      {originalDisplayPrice.toLocaleString("ru-RU")} KGS
                    </span>
                  )}

                  {isDiscountActive && discountPercent && (
                    <span className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-sm">
                      Скидка {discountPercent}%
                    </span>
                  )}
                </div>

                {/* Bundle Savings Badge */}
                {purchaseMode === "bundle" && bundleSavings && (
                  <div className="flex items-center space-x-2 text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-sm w-fit mt-1">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                    <span>
                      Ваша выгода: {bundleSavings.amount.toLocaleString("ru-RU")} KGS ({bundleSavings.percent}%)
                    </span>
                  </div>
                )}

                {/* Discount expiration notice */}
                {isDiscountActive && product.discountUntil && (
                  <div className="flex items-center space-x-1.5 text-xs text-rose-700 pt-1">
                    <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>
                      Акция действует до {formatDiscountDate(product.discountUntil)}
                    </span>
                  </div>
                )}

                <span className="text-[11px] text-atelier-muted">
                  {purchaseMode === "bundle"
                    ? "Все размеры в выбранном росте и формате PDF (моментальный доступ в кабинете)"
                    : "Электронная выкройка одного размера в формате PDF для печати"}
                </span>
              </div>
            </div>

            {/* PURCHASE MODE TOGGLE: Single Size vs ALL Bundle */}
            {hasBundleOption && (
              <div className="py-4 border-b border-atelier-border">
                <label className="block text-xs font-semibold uppercase tracking-wider text-atelier-charcoal mb-2">
                  Вариант покупки:
                </label>
                <div className="grid grid-cols-2 gap-2 p-1 bg-atelier-subtle rounded-sm border border-atelier-border">
                  <button
                    onClick={() => setPurchaseMode("single")}
                    className={`py-2 px-3 text-xs rounded-sm transition-all text-center flex flex-col items-center justify-center ${
                      purchaseMode === "single"
                        ? "bg-white text-brand-950 font-bold shadow-sm border border-atelier-border"
                        : "text-atelier-charcoal hover:text-brand-900"
                    }`}
                  >
                    <span>Один размер</span>
                    <span className="text-[10px] text-atelier-muted font-normal mt-0.5">
                      от {(product.currentPrice ?? product.basePrice ?? 0).toLocaleString("ru-RU")} KGS
                    </span>
                  </button>

                  <button
                    onClick={() => setPurchaseMode("bundle")}
                    className={`py-2 px-3 text-xs rounded-sm transition-all text-center flex flex-col items-center justify-center relative ${
                      purchaseMode === "bundle"
                        ? "bg-white text-brand-950 font-bold shadow-sm border border-brand-800"
                        : "text-atelier-charcoal hover:text-brand-900"
                    }`}
                  >
                    <span className="flex items-center space-x-1">
                      <span>Комплект ALL</span>
                      <span className="bg-amber-100 text-amber-900 text-[9px] font-bold px-1.5 py-0.2 rounded-full">
                        Выгодно
                      </span>
                    </span>
                    <span className="text-[10px] text-atelier-muted font-normal mt-0.5">
                      {product.bundlePrice ? `${Number(product.bundlePrice).toLocaleString("ru-RU")} KGS` : "Все размеры"}
                    </span>
                  </button>
                </div>
              </div>
            )}

            {/* VARIANT CONFIGURATOR */}
            <div className="py-5 border-b border-atelier-border space-y-5">
              {/* SIZE SELECTION */}
              {purchaseMode === "single" ? (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-semibold uppercase tracking-wider text-atelier-charcoal">
                      Размер:{" "}
                      <span className="text-brand-950 font-bold">
                        {selectedSize ? `${selectedSize} RU` : "Выберите"}
                      </span>
                    </label>
                    <button
                      onClick={() => setSizeGuideOpen(true)}
                      className="text-[11px] text-brand-800 hover:text-brand-950 font-medium inline-flex items-center space-x-1 underline"
                    >
                      <Ruler className="w-3 h-3" />
                      <span>Таблица размеров</span>
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {availableSizes.map((s) => (
                      <button
                        key={s.code}
                        onClick={() => setSelectedSize(s.code)}
                        className={`h-9 px-3.5 text-xs font-medium border rounded-sm transition-all ${
                          selectedSize === s.code
                            ? "bg-brand-900 text-white border-brand-900 shadow-sm"
                            : "border-atelier-border text-atelier-charcoal hover:border-brand-500 hover:bg-atelier-subtle"
                        }`}
                      >
                        {s.code}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                /* BUNDLE INFORMATIVE BANNER */
                <div className="p-3 bg-brand-50/70 border border-brand-200 rounded-sm text-xs text-brand-950 space-y-1">
                  <div className="font-bold flex items-center space-x-1.5 text-brand-900">
                    <Layers className="w-4 h-4 text-brand-700" />
                    <span>Все размеры включены в комплект</span>
                  </div>
                  <p className="text-[11px] text-atelier-charcoal leading-relaxed">
                    Вы получите выкройки на всю линейку размеров ({availableSizes.map((s) => s.code).join(", ") || "40–54"}) в выбранном росте и формате печати.
                  </p>
                </div>
              )}

              {/* HEIGHT SELECTION */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-atelier-charcoal mb-2">
                  Ростовая группа:{" "}
                  <span className="text-brand-950 font-bold">
                    {availableHeights.find((h) => h.code === selectedHeight)?.label || cleanHeightStr(selectedHeight)}
                  </span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {availableHeights.map((h) => (
                    <button
                      key={h.code}
                      onClick={() => setSelectedHeight(h.code)}
                      className={`h-9 px-4 text-xs font-medium border rounded-sm transition-all ${
                        selectedHeight === h.code
                          ? "bg-brand-900 text-white border-brand-900 shadow-sm"
                          : "border-atelier-border text-atelier-charcoal hover:border-brand-500 hover:bg-atelier-subtle"
                      }`}
                    >
                      {h.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* FORMAT SELECTION */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-atelier-charcoal mb-2">
                  Формат файла PDF:{" "}
                  <span className="text-brand-950 font-bold">
                    {cleanFormatStr(selectedFormat)}
                  </span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {availableFormats.map((f) => {
                    const targetList = purchaseMode === "bundle" ? bundleVariantList : singleVariants;
                    const fmtVariant = targetList.find(
                      (v) =>
                        (purchaseMode === "bundle" || !selectedSize || getSizeCode(v) === selectedSize) &&
                        (!selectedHeight || (getHeightCode(v) || getHeightStr(v)) === selectedHeight) &&
                        (getFormatCode(v) || getFormatStr(v)) === f.code
                    );
                    const fmtPrice = fmtVariant ? getVariantPrice(fmtVariant) : null;

                    return (
                      <button
                        key={f.code}
                        onClick={() => setSelectedFormat(f.code)}
                        className={`py-2 px-3 text-xs border rounded-sm text-left transition-all flex flex-col ${
                          selectedFormat === f.code
                            ? "bg-brand-900 text-white border-brand-900 font-medium shadow-sm"
                            : "border-atelier-border text-atelier-charcoal hover:bg-atelier-subtle hover:border-brand-500"
                        }`}
                      >
                        <div className="flex justify-between items-center w-full">
                          <span className="font-semibold">{f.label}</span>
                          {fmtPrice !== null && (
                            <span
                              className={`text-[11px] font-mono font-medium ${
                                selectedFormat === f.code ? "text-white/90" : "text-brand-900"
                              }`}
                            >
                              {fmtPrice} сом
                            </span>
                          )}
                        </div>
                        <span
                          className={`text-[10px] mt-0.5 ${
                            selectedFormat === f.code ? "text-white/80" : "text-atelier-muted"
                          }`}
                        >
                          {f.code === "A4"
                            ? "Печать на бытовом принтере А4"
                            : "Широкоформатная печать без склейки"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* CTA ADD TO CART BUTTON & AVAILABILITY GUARD */}
              <div className="pt-2 space-y-3" ref={buyButtonRef}>
                {activeVariant && activeVariant.isAvailable === false && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-sm flex items-start space-x-2.5 text-amber-900 text-xs animate-in fade-in">
                    <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-amber-950">Выкройка пока готовится</p>
                      <p className="text-amber-800 text-[11px] mt-0.5 leading-relaxed">
                        {(activeVariant as any).unavailableMessage ||
                          "Выкройка в данном размере и формате готовится конструктором. Пожалуйста, выберите другой размер или формат."}
                      </p>
                    </div>
                  </div>
                )}

                <Button
                  onClick={handleAddToCart}
                  disabled={!activeVariant || activeVariant.isAvailable === false || cartLoading}
                  isLoading={cartLoading}
                  size="lg"
                  className={`w-full text-base font-medium py-3.5 shadow-md transition-all ${
                    activeVariant && activeVariant.isAvailable === false
                      ? "bg-atelier-subtle text-atelier-muted border border-atelier-border cursor-not-allowed hover:bg-atelier-subtle opacity-90"
                      : "hover:shadow-lg"
                  }`}
                >
                  {activeVariant && activeVariant.isAvailable === false ? (
                    <>
                      <AlertCircle className="w-5 h-5 mr-2 text-atelier-muted" />
                      <span>Выкройка пока готовится</span>
                    </>
                  ) : (
                    <>
                      <ShoppingBag className="w-5 h-5 mr-2" />
                      <span>
                        Добавить в корзину • {currentDisplayPrice.toLocaleString("ru-RU")} KGS
                      </span>
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* TABBED SPECIFICATIONS & ACCORDIONS */}
            <div className="py-6 space-y-4">
              {/* Tab Navigation */}
              <div className="flex border-b border-atelier-border overflow-x-auto text-xs space-x-4 scrollbar-none">
                <button
                  onClick={() => setActiveTab("description")}
                  className={`pb-2.5 font-semibold transition-all whitespace-nowrap border-b-2 ${
                    activeTab === "description"
                      ? "border-brand-900 text-brand-950"
                      : "border-transparent text-atelier-muted hover:text-brand-900"
                  }`}
                >
                  Описание модели
                </button>

                {hasFabricInfo && (
                  <button
                    onClick={() => setActiveTab("fabric")}
                    className={`pb-2.5 font-semibold transition-all whitespace-nowrap border-b-2 ${
                      activeTab === "fabric"
                        ? "border-brand-900 text-brand-950"
                        : "border-transparent text-atelier-muted hover:text-brand-900"
                    }`}
                  >
                    Ткани и материалы
                  </button>
                )}

                {fabricData.measurements && (
                  <button
                    onClick={() => setActiveTab("measurements")}
                    className={`pb-2.5 font-semibold transition-all whitespace-nowrap border-b-2 ${
                      activeTab === "measurements"
                        ? "border-brand-900 text-brand-950"
                        : "border-transparent text-atelier-muted hover:text-brand-900"
                    }`}
                  >
                    Мерки изделия
                  </button>
                )}

                {product.technicalDrawingUrl && (
                  <button
                    onClick={() => setActiveTab("drawing")}
                    className={`pb-2.5 font-semibold transition-all whitespace-nowrap border-b-2 ${
                      activeTab === "drawing"
                        ? "border-brand-900 text-brand-950"
                        : "border-transparent text-atelier-muted hover:text-brand-900"
                    }`}
                  >
                    Технический рисунок
                  </button>
                )}

                {videoEmbedUrl && (
                  <button
                    onClick={() => setActiveTab("video")}
                    className={`pb-2.5 font-semibold transition-all whitespace-nowrap border-b-2 ${
                      activeTab === "video"
                        ? "border-brand-900 text-brand-950"
                        : "border-transparent text-atelier-muted hover:text-brand-900"
                    }`}
                  >
                    Видеообзор
                  </button>
                )}
              </div>

              {/* Tab 1: Description */}
              {activeTab === "description" && (
                <div className="text-xs text-atelier-charcoal leading-relaxed space-y-3 animate-in fade-in">
                  <p className="whitespace-pre-line">{product.description}</p>

                  <div className="pt-3 border-t border-atelier-border/50 text-[11px] text-atelier-muted space-y-1">
                    <p className="font-semibold text-atelier-charcoal">В комплект входит:</p>
                    <ul className="list-disc pl-4 space-y-0.5">
                      <li>Выкройка в выбранном формате печати (PDF с припусками на швы).</li>
                      <li>Пошаговая иллюстрированная инструкция с рекомендациями по сборке.</li>
                      <li>Тестовый квадрат 10×10 см для калибровки масштаба печати принтера.</li>
                    </ul>
                  </div>
                </div>
              )}

              {/* Tab 2: Fabric & Notions */}
              {activeTab === "fabric" && hasFabricInfo && (
                <div className="text-xs text-atelier-charcoal leading-relaxed space-y-3 animate-in fade-in">
                  {fabricData.recommendation && (
                    <div>
                      <h4 className="font-semibold text-brand-950 mb-1">Рекомендуемые ткани:</h4>
                      <p className="text-atelier-charcoal whitespace-pre-line">{fabricData.recommendation}</p>
                    </div>
                  )}

                  {fabricData.consumption && (
                    <div className="pt-2 border-t border-atelier-border/50">
                      <h4 className="font-semibold text-brand-950 mb-1">Расход ткани:</h4>
                      <p className="text-atelier-charcoal whitespace-pre-line">{fabricData.consumption}</p>
                    </div>
                  )}

                  {fabricData.notions && (
                    <div className="pt-2 border-t border-atelier-border/50">
                      <h4 className="font-semibold text-brand-950 mb-1">Фурнитура и прикладные материалы:</h4>
                      <p className="text-atelier-charcoal whitespace-pre-line">{fabricData.notions}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Tab 3: Measurements */}
              {activeTab === "measurements" && fabricData.measurements && (
                <div className="text-xs text-atelier-charcoal leading-relaxed space-y-2 animate-in fade-in">
                  <h4 className="font-semibold text-brand-950">Параметры и мерки готового изделия:</h4>
                  <p className="whitespace-pre-line bg-atelier-subtle p-3 rounded-sm border border-atelier-border">
                    {fabricData.measurements}
                  </p>
                </div>
              )}

              {/* Tab 4: Technical Drawing */}
              {activeTab === "drawing" && product.technicalDrawingUrl && (
                <div className="space-y-3 animate-in fade-in">
                  <div className="relative aspect-video max-h-72 bg-white border border-atelier-border rounded-sm overflow-hidden flex items-center justify-center group shadow-sm">
                    <img
                      src={product.technicalDrawingUrl}
                      alt={`Конструктивный CAD-чертеж выкройки — ${product.title}`}
                      className="max-h-full max-w-full object-contain cursor-zoom-in transition-transform duration-200 group-hover:scale-[1.02]"
                      onClick={() => {
                        setCadZoomed(false);
                        setCadLightboxOpen(true);
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setCadZoomed(false);
                        setCadLightboxOpen(true);
                      }}
                      aria-label="Открыть технический чертеж на весь экран"
                      className="absolute bottom-2.5 right-2.5 px-2.5 py-1.5 bg-brand-950/85 hover:bg-brand-950 text-white rounded shadow-md text-xs font-medium flex items-center space-x-1.5 transition-all focus:outline-none focus:ring-2 focus:ring-brand-500"
                    >
                      <ZoomIn className="w-3.5 h-3.5" />
                      <span>Увеличить чертеж</span>
                    </button>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-atelier-muted">
                    <p>
                      Конструктивный CAD-чертеж изделия: модельные линии, рельефы, вытачки и припуски.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setCadZoomed(false);
                        setCadLightboxOpen(true);
                      }}
                      aria-label="Развернуть чертеж во весь экран"
                      className="text-brand-800 hover:text-brand-950 font-medium underline flex items-center space-x-1 flex-shrink-0 ml-2 focus:outline-none"
                    >
                      <ZoomIn className="w-3 h-3" />
                      <span>Во весь экран</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Tab 5: Video Overview */}
              {activeTab === "video" && videoEmbedUrl && (
                <div className="space-y-2 animate-in fade-in">
                  <div className="relative aspect-video rounded-sm overflow-hidden border border-atelier-border bg-black shadow-sm">
                    <iframe
                      src={videoEmbedUrl}
                      title="Видеообзор модели"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      className="w-full h-full"
                    />
                  </div>
                  <p className="text-[11px] text-atelier-muted">
                    Видеообзор кроя, посадки и динамики изделия на фигуре.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* SIMILAR PATTERNS SECTION */}
        {similarProducts.length > 0 && (
          <div className="mt-16 pt-12 border-t border-atelier-border">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h3 className="font-serif text-2xl font-bold text-brand-950">
                  Вам также может понравиться
                </h3>
                <p className="text-xs text-atelier-muted mt-1">
                  Другие популярные выкройки из категории «{(product.category as any)?.title || product.category?.name}»
                </p>
              </div>
              <Link
                href={`/catalog?categorySlug=${product.category?.slug}`}
                className="text-xs font-semibold text-brand-800 hover:text-brand-950 inline-flex items-center space-x-1"
              >
                <span>Все в категории</span>
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
              {similarProducts.map((simProd) => (
                <ProductCard key={simProd.id} product={simProd} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* MOBILE STICKY BUY BAR */}
      {showStickyBar && (
        <div className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-md border-t border-atelier-border p-3 shadow-[0_-4px_16px_rgba(0,0,0,0.1)] animate-in slide-in-from-bottom duration-200">
          <div className="flex items-center justify-between space-x-3">
            {/* Mini thumbnail & title */}
            <div className="flex items-center space-x-2.5 min-w-0">
              {selectedImage ? (
                <img
                  src={selectedImage}
                  alt=""
                  className="w-10 h-12 object-cover rounded-sm border border-atelier-border flex-shrink-0"
                />
              ) : (
                <div className="w-10 h-12 bg-atelier-subtle rounded-sm flex items-center justify-center flex-shrink-0">
                  <Scissors className="w-5 h-5 text-atelier-accent" />
                </div>
              )}
              <div className="min-w-0">
                <p className="text-xs font-bold text-brand-950 truncate max-w-[140px]">
                  {product.title}
                </p>
                <p className="text-[10px] text-atelier-muted truncate">
                  {purchaseMode === "bundle"
                    ? "Комплект ALL"
                    : `${selectedSize || "Размер"} • ${cleanFormatStr(selectedFormat)}`}
                </p>
              </div>
            </div>

            {/* Price & Action button */}
            <div className="flex items-center space-x-2 flex-shrink-0">
              <div className="text-right">
                <span className="font-serif font-bold text-base text-brand-950">
                  {currentDisplayPrice.toLocaleString("ru-RU")} KGS
                </span>
                {isDiscountActive && originalDisplayPrice && (
                  <span className="block text-[10px] text-atelier-muted line-through -mt-1">
                    {originalDisplayPrice.toLocaleString("ru-RU")} KGS
                  </span>
                )}
              </div>

              <Button
                onClick={handleAddToCart}
                disabled={!activeVariant || activeVariant.isAvailable === false || cartLoading}
                isLoading={cartLoading}
                size="sm"
                className={`px-4 py-2 text-xs font-semibold shadow-sm ${
                  activeVariant && activeVariant.isAvailable === false
                    ? "bg-atelier-subtle text-atelier-muted border border-atelier-border cursor-not-allowed hover:bg-atelier-subtle"
                    : ""
                }`}
              >
                {activeVariant && activeVariant.isAvailable === false ? "Готовится" : "В корзину"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* CAD LIGHTBOX FULLSCREEN MODAL */}
      {cadLightboxOpen && product?.technicalDrawingUrl && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Полноэкранный просмотр технического чертежа"
          className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex flex-col items-center justify-between p-3 sm:p-6 animate-in fade-in duration-200"
          onClick={() => {
            setCadLightboxOpen(false);
            setCadZoomed(false);
          }}
        >
          {/* Top Bar with Title, Zoom Controls and Close Button */}
          <header
            className="w-full max-w-6xl flex items-center justify-between text-white pb-3 border-b border-white/10 z-10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center space-x-2 min-w-0 pr-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-white/90 truncate">
                Технический CAD-чертеж • {product.title}
              </span>
            </div>

            <div className="flex items-center space-x-2 flex-shrink-0">
              <button
                type="button"
                onClick={() => setCadZoomed((prev) => !prev)}
                aria-label={cadZoomed ? "Вернуть масштаб 100%" : "Увеличить масштаб 150%"}
                className="min-h-[40px] px-3.5 text-xs font-medium text-white/90 hover:text-white bg-white/10 hover:bg-white/20 rounded border border-white/20 transition-all flex items-center space-x-1.5 focus:outline-none focus:ring-2 focus:ring-white/50 active:scale-95"
              >
                {cadZoomed ? (
                  <>
                    <ZoomOut className="w-4 h-4" />
                    <span className="hidden sm:inline">100% масштаб</span>
                  </>
                ) : (
                  <>
                    <ZoomIn className="w-4 h-4" />
                    <span className="hidden sm:inline">Увеличить 150%</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setCadLightboxOpen(false);
                  setCadZoomed(false);
                }}
                aria-label="Закрыть просмотр чертежа (Escape)"
                className="p-2 text-white/80 hover:text-white rounded-full bg-white/10 hover:bg-white/20 border border-white/20 transition-all flex items-center justify-center min-w-[40px] min-h-[40px] focus:outline-none focus:ring-2 focus:ring-white/50 active:scale-95"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </header>

          {/* Image Display Area with Pan/Zoom Container */}
          <main
            className="flex-1 w-full max-w-6xl flex items-center justify-center overflow-auto my-3 p-2 select-none"
            onClick={() => {
              setCadLightboxOpen(false);
              setCadZoomed(false);
            }}
          >
            <div
              className="relative transition-transform duration-200 flex items-center justify-center"
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={product.technicalDrawingUrl}
                alt={`Конструктивный CAD-чертеж изделия — ${product.title}`}
                className={`max-h-[78vh] object-contain rounded bg-white p-2 shadow-2xl transition-all duration-200 ${
                  cadZoomed
                    ? "scale-150 cursor-zoom-out my-16 max-w-none"
                    : "max-w-[90vw] cursor-zoom-in"
                }`}
                onClick={() => setCadZoomed((prev) => !prev)}
              />
            </div>
          </main>

          {/* Bottom Bar: Help Text */}
          <footer
            className="w-full max-w-6xl flex items-center justify-between text-[11px] text-white/60 pt-2 border-t border-white/10"
            onClick={(e) => e.stopPropagation()}
          >
            <span>Нажмите на изображение для переключения масштаба • Клавиша Esc для выхода</span>
            <span className="hidden sm:inline">Файл: palto-oversayz-cholpon-tech.jpg</span>
          </footer>
        </div>
      )}

      {/* LIGHTBOX FULLSCREEN MODAL */}
      {lightboxOpen && allImages.length > 0 && (
        <div
          className="fixed inset-0 z-50 bg-black/95 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in"
          onClick={() => setLightboxOpen(false)}
        >
          {/* Top Bar with Counter and Close */}
          <div className="absolute top-4 inset-x-4 flex items-center justify-between text-white z-10">
            <span className="text-xs font-medium tracking-wider text-white/70">
              {lightboxIndex + 1} / {allImages.length}
            </span>
            <button
              onClick={() => setLightboxOpen(false)}
              className="p-2 text-white/80 hover:text-white rounded-full bg-white/10 hover:bg-white/20 transition-all"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Navigation Arrows */}
          {allImages.length > 1 && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handlePrevImage();
                }}
                className="absolute left-4 top-1/2 -translate-y-1/2 p-3 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition-all"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleNextImage();
                }}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-3 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition-all"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            </>
          )}

          {/* Active Image */}
          <div
            className="max-h-[85vh] max-w-[90vw] flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={allImages[lightboxIndex]}
              alt={product.title}
              className="max-h-[85vh] max-w-[90vw] object-contain rounded-sm shadow-2xl"
            />
          </div>
        </div>
      )}

      {/* SIZE GUIDE MODAL */}
      {sizeGuideOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in"
          onClick={() => setSizeGuideOpen(false)}
        >
          <div
            className="bg-white max-w-lg w-full p-6 rounded-sm shadow-2xl border border-atelier-border max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-atelier-border pb-3">
              <div className="flex items-center space-x-2">
                <Ruler className="w-5 h-5 text-brand-800" />
                <h3 className="font-serif text-lg font-bold text-brand-950">
                  Типовая размерная сетка (RU)
                </h3>
              </div>
              <button
                onClick={() => setSizeGuideOpen(false)}
                className="p-1 text-atelier-muted hover:text-atelier-charcoal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-atelier-muted mt-3 mb-4 leading-relaxed">
              Мерки указаны в сантиметрах для типовой женской фигуры. Для выбора размера ориентируйтесь на обхват груди и бёдер.
            </p>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-atelier-subtle border-b border-atelier-border text-brand-950 font-bold">
                    <th className="py-2 px-3">Размер RU</th>
                    <th className="py-2 px-3">Обхват груди (см)</th>
                    <th className="py-2 px-3">Обхват талии (см)</th>
                    <th className="py-2 px-3">Обхват бедер (см)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-atelier-border/50 text-atelier-charcoal">
                  <tr><td className="py-2 px-3 font-semibold">40</td><td className="py-2 px-3">80</td><td className="py-2 px-3">60</td><td className="py-2 px-3">86</td></tr>
                  <tr><td className="py-2 px-3 font-semibold">42</td><td className="py-2 px-3">84</td><td className="py-2 px-3">64</td><td className="py-2 px-3">90</td></tr>
                  <tr><td className="py-2 px-3 font-semibold">44</td><td className="py-2 px-3">88</td><td className="py-2 px-3">68</td><td className="py-2 px-3">94</td></tr>
                  <tr><td className="py-2 px-3 font-semibold">46</td><td className="py-2 px-3">92</td><td className="py-2 px-3">72</td><td className="py-2 px-3">98</td></tr>
                  <tr><td className="py-2 px-3 font-semibold">48</td><td className="py-2 px-3">96</td><td className="py-2 px-3">76</td><td className="py-2 px-3">102</td></tr>
                  <tr><td className="py-2 px-3 font-semibold">50</td><td className="py-2 px-3">100</td><td className="py-2 px-3">80</td><td className="py-2 px-3">106</td></tr>
                  <tr><td className="py-2 px-3 font-semibold">52</td><td className="py-2 px-3">104</td><td className="py-2 px-3">84</td><td className="py-2 px-3">110</td></tr>
                  <tr><td className="py-2 px-3 font-semibold">54</td><td className="py-2 px-3">108</td><td className="py-2 px-3">88</td><td className="py-2 px-3">114</td></tr>
                  <tr><td className="py-2 px-3 font-semibold">56</td><td className="py-2 px-3">112</td><td className="py-2 px-3">92</td><td className="py-2 px-3">118</td></tr>
                </tbody>
              </table>
            </div>

            <div className="mt-5 text-right">
              <Button size="sm" onClick={() => setSizeGuideOpen(false)}>
                Понятно
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* AUTH REQUIRED MODAL FOR GUESTS */}
      {authPromptOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white max-w-md w-full p-6 rounded-sm shadow-xl border border-atelier-border">
            <h3 className="font-serif text-xl font-bold text-brand-950">
              Вход для оформления выкроек
            </h3>
            <p className="text-xs text-atelier-muted mt-2 leading-relaxed">
              Чтобы добавить выкройку в корзину и моментально получить приобретённые файлы в вашем личном кабинете, войдите или зарегистрируйтесь.
            </p>

            <div className="mt-6 flex flex-col space-y-3">
              <Link href={`/login?redirect=/catalog/${slug}`} onClick={() => setAuthPromptOpen(false)}>
                <Button className="w-full">Войти в аккаунт</Button>
              </Link>
              <Link href={`/register?redirect=/catalog/${slug}`} onClick={() => setAuthPromptOpen(false)}>
                <Button variant="outline" className="w-full">
                  Зарегистрироваться
                </Button>
              </Link>
              <button
                onClick={() => setAuthPromptOpen(false)}
                className="text-xs text-atelier-muted hover:text-atelier-charcoal pt-2 text-center"
              >
                Продолжить просмотр
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
