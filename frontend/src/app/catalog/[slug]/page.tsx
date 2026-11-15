"use client";

import React, { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Product, ProductVariant } from "../../../types";
import { api } from "../../../lib/api";
import { useCart } from "../../../lib/cart-context";
import { useAuth } from "../../../lib/auth-context";
import { Button } from "../../../components/ui/Button";
import { DifficultyBadge } from "../../../components/ui/Badge";
import {
  Scissors,
  Check,
  ShoppingBag,
  FileText,
  AlertCircle,
  Sparkles,
  Layers,
  ChevronRight,
} from "lucide-react";

const getSizeStr = (v: any) =>
  typeof v?.size === "object" ? v.size?.label || v.size?.code : v?.size || "";
const getHeightStr = (v: any) =>
  typeof v?.height === "object" ? v.height?.label || v.height?.code : v?.height || "";
const getFormatStr = (v: any) =>
  typeof v?.format === "object" ? v.format?.label || v.format?.code : v?.format || "";
const getVariantId = (v: any) => v?.variantId || v?.id || "";
const getVariantPrice = (v: any) => v?.priceKgs ?? v?.price ?? 0;

export default function ProductDetailPage() {
  const params = useParams();
  const slug = params?.slug as string;
  const router = useRouter();

  const { user } = useAuth();
  const { addItem, isLoading: cartLoading } = useCart();

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Variant selection state
  const [selectedSize, setSelectedSize] = useState<string>("");
  const [selectedHeight, setSelectedHeight] = useState<string>("");
  const [selectedFormat, setSelectedFormat] = useState<string>("");
  const [selectedImage, setSelectedImage] = useState<string>("");
  const [addedSuccess, setAddedSuccess] = useState(false);
  const [authPromptOpen, setAuthPromptOpen] = useState(false);

  useEffect(() => {
    async function loadProduct() {
      if (!slug) return;
      setLoading(true);
      setError(null);
      try {
        const res = await api.get<{ success: boolean; data: Product }>(
          `/api/v1/catalog/products/${slug}`
        );
        if (res.success && res.data) {
          setProduct(res.data);
          if (res.data.coverImage) {
            setSelectedImage(res.data.coverImage);
          } else if (res.data.images && res.data.images.length > 0) {
            const firstImg = typeof res.data.images[0] === "string" ? res.data.images[0] : (res.data.images[0] as any)?.imageUrl;
            if (firstImg) setSelectedImage(firstImg);
          }

          // Pre-select first available variant values
          if (res.data.variants && res.data.variants.length > 0) {
            const first = res.data.variants[0];
            setSelectedSize(getSizeStr(first));
            setSelectedHeight(getHeightStr(first));
            setSelectedFormat(getFormatStr(first));
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
  }, [slug]);

  // Extract unique available sizes, heights, formats for this product
  const availableSizes = useMemo(() => {
    if (!product?.variants) return [];
    return Array.from(new Set(product.variants.map((v) => getSizeStr(v)).filter(Boolean))).sort();
  }, [product]);

  const availableHeights = useMemo(() => {
    if (!product?.variants) return [];
    const heights = product.variants
      .filter((v) => !selectedSize || getSizeStr(v) === selectedSize)
      .map((v) => getHeightStr(v))
      .filter(Boolean);
    return Array.from(new Set(heights)).sort();
  }, [product, selectedSize]);

  const availableFormats = useMemo(() => {
    if (!product?.variants) return [];
    const formats = product.variants
      .filter(
        (v) =>
          (!selectedSize || getSizeStr(v) === selectedSize) &&
          (!selectedHeight || getHeightStr(v) === selectedHeight)
      )
      .map((v) => getFormatStr(v))
      .filter(Boolean);
    return Array.from(new Set(formats)).sort();
  }, [product, selectedSize, selectedHeight]);

  // Synchronize height and format if previous selection is unavailable for selected size
  useEffect(() => {
    if (availableHeights.length > 0 && (!selectedHeight || !availableHeights.includes(selectedHeight))) {
      setSelectedHeight(availableHeights[0]);
    }
  }, [availableHeights, selectedHeight]);

  useEffect(() => {
    if (availableFormats.length > 0 && (!selectedFormat || !availableFormats.includes(selectedFormat))) {
      setSelectedFormat(availableFormats[0]);
    }
  }, [availableFormats, selectedFormat]);

  // Find exact matching variant
  const activeVariant: any | undefined = useMemo(() => {
    if (!product?.variants) return undefined;
    return product.variants.find(
      (v) =>
        getSizeStr(v) === selectedSize &&
        getHeightStr(v) === selectedHeight &&
        getFormatStr(v) === selectedFormat
    );
  }, [product, selectedSize, selectedHeight, selectedFormat]);

  const handleAddToCart = async () => {
    if (!user) {
      setAuthPromptOpen(true);
      return;
    }

    const varId = getVariantId(activeVariant);
    if (!varId) return;

    try {
      await addItem(varId);
      setAddedSuccess(true);
      setTimeout(() => setAddedSuccess(false), 3000);
    } catch (err: any) {
      if (err.message === "AUTH_REQUIRED") {
        setAuthPromptOpen(true);
      } else {
        alert(err.message || "Не удалось добавить товар в корзину");
      }
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
          <div className="aspect-[3/4] bg-atelier-subtle animate-pulse rounded-sm" />
          <div className="space-y-4">
            <div className="h-6 w-32 bg-atelier-subtle animate-pulse" />
            <div className="h-10 w-3/4 bg-atelier-subtle animate-pulse" />
            <div className="h-20 w-full bg-atelier-subtle animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
        <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-brand-950">
          {error || "Выкройка не найдена"}
        </h2>
        <p className="text-xs text-atelier-muted mt-2">
          Возможно, модель была снята с публикации или ссылка устарела.
        </p>
        <Link href="/catalog" className="inline-block mt-6">
          <Button variant="outline">Вернуться в каталог</Button>
        </Link>
      </div>
    );
  }

  const allImages = [
    ...(product.coverImage ? [product.coverImage] : []),
    ...(product.images?.map((img: any) => (typeof img === "string" ? img : img?.imageUrl)).filter(Boolean) || []),
  ];

  return (
    <div className="bg-white min-h-screen py-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Breadcrumbs */}
        <nav className="flex items-center space-x-2 text-xs text-atelier-muted mb-8">
          <Link href="/" className="hover:text-brand-900">
            Главная
          </Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <Link href="/catalog" className="hover:text-brand-900">
            Каталог
          </Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <span className="text-atelier-charcoal font-medium truncate max-w-xs">
            {product.title}
          </span>
        </nav>

        {/* Product Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
          {/* Gallery - 7 cols */}
          <div className="lg:col-span-7 space-y-4">
            <div className="relative aspect-[3/4] bg-atelier-subtle border border-atelier-border rounded-sm overflow-hidden flex items-center justify-center">
              {selectedImage ? (
                <img
                  src={selectedImage}
                  alt={product.title}
                  className="w-full h-full object-cover object-center"
                />
              ) : (
                <div className="flex flex-col items-center justify-center text-atelier-muted p-12">
                  <Scissors className="w-16 h-16 stroke-[1.2] mb-3 text-atelier-accent" />
                  <span className="text-xs uppercase tracking-wider">
                    {product.title}
                  </span>
                </div>
              )}
            </div>

            {/* Thumbnails */}
            {allImages.length > 1 && (
              <div className="flex space-x-3 overflow-x-auto pb-2">
                {allImages.map((img, i) => (
                  <button
                    key={i}
                    onClick={() => setSelectedImage(img)}
                    className={`relative w-20 h-24 border rounded-sm overflow-hidden flex-shrink-0 transition-all ${
                      selectedImage === img
                        ? "border-brand-900 ring-2 ring-brand-900/20"
                        : "border-atelier-border opacity-70 hover:opacity-100"
                    }`}
                  >
                    <img
                      src={img}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Details & Variant Form - 5 cols */}
          <div className="lg:col-span-5 flex flex-col">
            <div className="border-b border-atelier-border pb-6">
              <div className="flex items-center space-x-3 mb-2">
                {product.category && (
                  <span className="text-xs uppercase tracking-widest text-brand-700 font-semibold">
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

              <h1 className="font-serif text-3xl font-bold text-brand-950 leading-tight">
                {product.title}
              </h1>

              {/* Price display */}
              <div className="mt-4 flex items-baseline space-x-3">
                <span className="font-serif text-3xl font-bold text-brand-950">
                  {activeVariant
                    ? `${getVariantPrice(activeVariant).toLocaleString("ru-RU")} KGS`
                    : (product.basePrice ?? product.priceFromKgs ?? 0) > 0
                    ? `от ${(product.basePrice ?? product.priceFromKgs ?? 0).toLocaleString("ru-RU")} KGS`
                    : "Бесплатно"}
                </span>
                <span className="text-xs text-atelier-muted">
                  (электронная выкройка в PDF)
                </span>
              </div>
            </div>

            {/* Variant Selector Form */}
            <div className="py-6 border-b border-atelier-border space-y-5">
              {/* Size Selector */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold uppercase tracking-wider text-atelier-charcoal">
                    Размер: {selectedSize ? `${selectedSize} RU` : "Выберите"}
                  </label>
                </div>
                <div className="flex flex-wrap gap-2">
                  {availableSizes.map((s) => (
                    <button
                      key={s}
                      onClick={() => setSelectedSize(s)}
                      className={`h-9 px-4 text-xs font-medium border rounded-sm transition-all ${
                        selectedSize === s
                          ? "bg-brand-900 text-white border-brand-900"
                          : "border-atelier-border text-atelier-charcoal hover:border-brand-500"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* Height Selector */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-atelier-charcoal mb-2">
                  Ростовая группа: {selectedHeight ? `${selectedHeight} см` : "Выберите"}
                </label>
                <div className="flex flex-wrap gap-2">
                  {availableHeights.map((h) => (
                    <button
                      key={h}
                      onClick={() => setSelectedHeight(h)}
                      className={`h-9 px-4 text-xs font-medium border rounded-sm transition-all ${
                        selectedHeight === h
                          ? "bg-brand-900 text-white border-brand-900"
                          : "border-atelier-border text-atelier-charcoal hover:border-brand-500"
                      }`}
                    >
                      {h} см
                    </button>
                  ))}
                </div>
              </div>

              {/* Format Selector */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-atelier-charcoal mb-2">
                  Формат печати: {selectedFormat || "Выберите"}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {availableFormats.map((f) => {
                    const label =
                      f === "A4"
                        ? "А4 (домашний принтер)"
                        : f === "PLOTTER_900"
                        ? "Плоттер 900 мм"
                        : f === "PLOTTER_600"
                        ? "Плоттер 600 мм"
                        : f;
                    return (
                      <button
                        key={f}
                        onClick={() => setSelectedFormat(f)}
                        className={`py-2 px-3 text-xs border rounded-sm text-left transition-all ${
                          selectedFormat === f
                            ? "bg-brand-900 text-white border-brand-900 font-medium"
                            : "border-atelier-border text-atelier-charcoal hover:bg-atelier-subtle"
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Add to Cart CTA */}
              <div className="pt-2">
                <Button
                  onClick={handleAddToCart}
                  disabled={!activeVariant || cartLoading}
                  isLoading={cartLoading}
                  size="lg"
                  className="w-full text-base"
                >
                  {addedSuccess ? (
                    <>
                      <Check className="w-5 h-5 mr-2 text-emerald-400" />
                      <span>Добавлено в корзину!</span>
                    </>
                  ) : (
                    <>
                      <ShoppingBag className="w-5 h-5 mr-2" />
                      <span>Добавить в корзину</span>
                    </>
                  )}
                </Button>

                {addedSuccess && (
                  <div className="mt-3 flex items-center justify-between p-3 bg-emerald-50 border border-emerald-200 rounded-sm text-xs text-emerald-900">
                    <span>Выкройка успешно добавлена</span>
                    <Link
                      href="/cart"
                      className="font-semibold underline hover:text-emerald-950"
                    >
                      Перейти в корзину →
                    </Link>
                  </div>
                )}
              </div>
            </div>

            {/* Description & Specifications Accordion/Tabs */}
            <div className="py-6 space-y-6 text-xs text-atelier-charcoal leading-relaxed">
              {product.description && (
                <div>
                  <h3 className="font-semibold uppercase tracking-wider text-atelier-muted mb-2">
                    Описание модели
                  </h3>
                  <p className="whitespace-pre-line text-atelier-charcoal">
                    {product.description}
                  </p>
                </div>
              )}

              {product.fabricRequirements && (
                <div className="pt-4 border-t border-atelier-border/60">
                  <h3 className="font-semibold uppercase tracking-wider text-atelier-muted mb-2">
                    Рекомендации по ткани
                  </h3>
                  <p className="whitespace-pre-line text-atelier-charcoal">
                    {product.fabricRequirements}
                  </p>
                </div>
              )}

              {/* Instructions preview */}
              {product.instructions && product.instructions.length > 0 && (
                <div className="pt-4 border-t border-atelier-border/60">
                  <h3 className="font-semibold uppercase tracking-wider text-atelier-muted mb-2">
                    Инструкция по пошиву
                  </h3>
                  <div className="space-y-2">
                    {product.instructions.map((inst) => (
                      <div
                        key={inst.id}
                        className="flex items-center space-x-2 p-2 bg-atelier-subtle rounded-sm"
                      >
                        <FileText className="w-4 h-4 text-brand-700" />
                        <span className="font-medium">{inst.fileName}</span>
                        <span className="text-[10px] text-atelier-muted">
                          (входит в комплект)
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Auth Prompt Modal if guest clicks add to cart */}
      {authPromptOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white max-w-md w-full p-6 rounded-sm shadow-xl border border-atelier-border">
            <h3 className="font-serif text-xl font-bold text-brand-950">
              Вход для оформления выкроек
            </h3>
            <p className="text-xs text-atelier-muted mt-2 leading-relaxed">
              Чтобы добавить выкройку в корзину и привязать купленные файлы к вашему личному кабинету, пожалуйста, войдите или зарегистрируйтесь.
            </p>

            <div className="mt-6 flex flex-col space-y-3">
              <Link href="/login" onClick={() => setAuthPromptOpen(false)}>
                <Button className="w-full">Войти в аккаунт</Button>
              </Link>
              <Link href="/register" onClick={() => setAuthPromptOpen(false)}>
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
