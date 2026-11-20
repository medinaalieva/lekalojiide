"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { api } from "../../../../../lib/api";
import { Category, DifficultyLevel } from "../../../../../types";
import { Button } from "../../../../../components/ui/Button";
import {
  Package,
  ArrowLeft,
  Save,
  AlertCircle,
  CheckCircle2,
  Layers,
  Upload,
  Image as ImageIcon,
  Sparkles,
  Flame,
  TrendingUp,
  Tag,
  DollarSign,
  Scissors,
  Video,
  FileCheck2,
  Eye,
  FileText,
  RefreshCw,
} from "lucide-react";

export default function AdminEditProductPage({
  params,
}: {
  params?: { id: string };
}) {
  const routeParams = useParams();
  const productId = (routeParams?.id as string) || (params as any)?.id || "";
  const router = useRouter();

  // Loading state
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Reference data
  const [categories, setCategories] = useState<Category[]>([]);

  // Form State - Основное
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [selectedMainCategoryId, setSelectedMainCategoryId] = useState("");
  const [selectedSubcategoryId, setSelectedSubcategoryId] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [difficultyLevel, setDifficultyLevel] = useState<DifficultyLevel>("INTERMEDIATE");
  const [shortDescription, setShortDescription] = useState("");
  const [description, setDescription] = useState("");

  // Form State - Цены и скидки
  const [basePrice, setBasePrice] = useState("450");
  const [hasBundleOption, setHasBundleOption] = useState(true);
  const [bundlePrice, setBundlePrice] = useState("1200");
  const [hasDiscount, setHasDiscount] = useState(false);
  const [discountPrice, setDiscountPrice] = useState("");
  const [discountFrom, setDiscountFrom] = useState("");
  const [discountUntil, setDiscountUntil] = useState("");

  // Form State - Маркетинговые бейджи
  const [isNew, setIsNew] = useState(false);
  const [isBestseller, setIsBestseller] = useState(false);
  const [isPopular, setIsPopular] = useState(false);

  // Form State - Ткани и мерки
  const [fabricType, setFabricType] = useState("");
  const [notions, setNotions] = useState("");
  const [consumption, setConsumption] = useState("");
  const [measurements, setMeasurements] = useState("");

  // Form State - Медиа
  const [coverImageUrl, setCoverImageUrl] = useState("");
  const [technicalDrawingUrl, setTechnicalDrawingUrl] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [photoUploadError, setPhotoUploadError] = useState<string | null>(null);

  // Existing variants count
  const [variantsCount, setVariantsCount] = useState(0);

  // UI state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Derived categories hierarchy
  const { mainCategories, subcategoriesByParent } = React.useMemo(() => {
    const mains: Category[] = [];
    const subMap: Record<string, Category[]> = {};

    categories.forEach((cat) => {
      if (!cat.parentId) {
        mains.push(cat);
        if (cat.children && cat.children.length > 0) {
          subMap[cat.id] = [...cat.children];
        }
      } else {
        if (!subMap[cat.parentId]) {
          subMap[cat.parentId] = [];
        }
        if (!subMap[cat.parentId].some((c) => c.id === cat.id)) {
          subMap[cat.parentId].push(cat);
        }
      }
    });

    return {
      mainCategories: mains.sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0)),
      subcategoriesByParent: subMap,
    };
  }, [categories]);

  const availableSubcategories = React.useMemo(() => {
    return subcategoriesByParent[selectedMainCategoryId] || [];
  }, [subcategoriesByParent, selectedMainCategoryId]);

  // Fetch product and categories
  const fetchData = async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      let catData: Category[] = [];
      try {
        const adminCatRes = await api.get<{ success: boolean; data: Category[] }>("/api/v1/admin/categories");
        if (adminCatRes.success && adminCatRes.data && adminCatRes.data.length > 0) {
          catData = adminCatRes.data;
        }
      } catch {
        // ignore
      }

      const [prodRes, catRes] = await Promise.all([
        api.get<{ success: boolean; data: any }>(`/api/v1/admin/products/${productId}`),
        catData.length === 0
          ? api.get<{ success: boolean; data: Category[] }>("/api/v1/catalog/categories")
          : Promise.resolve({ success: true, data: catData }),
      ]);

      const resolvedCats = catData.length > 0 ? catData : (catRes.data || []);
      if (resolvedCats.length > 0) {
        setCategories(resolvedCats);
      }

      if (prodRes.success && prodRes.data) {
        const p = prodRes.data;
        setTitle(p.title || "");
        setSlug(p.slug || "");

        // Category determination
        const currentCatId = p.categoryId || (p.category?.id) || "";
        setCategoryId(currentCatId);

        // Pre-populate main and sub categories
        if (p.category?.parentId) {
          setSelectedMainCategoryId(p.category.parentId);
          setSelectedSubcategoryId(p.category.id);
        } else if (currentCatId) {
          const parentOfCat = resolvedCats.find((c) =>
            c.children?.some((ch) => ch.id === currentCatId)
          );
          if (parentOfCat) {
            setSelectedMainCategoryId(parentOfCat.id);
            setSelectedSubcategoryId(currentCatId);
          } else {
            setSelectedMainCategoryId(currentCatId);
            setSelectedSubcategoryId("");
          }
        }
        setIsActive(p.isActive !== false);
        setDifficultyLevel(p.difficultyLevel || "INTERMEDIATE");
        setShortDescription(p.shortDescription || "");
        setDescription(p.description || "");

        // Prices
        setBasePrice(String(p.basePrice || 0));
        setHasBundleOption(p.hasBundleOption !== false);
        setBundlePrice(p.bundlePrice ? String(p.bundlePrice) : "");

        if (p.discountPrice && Number(p.discountPrice) > 0) {
          setHasDiscount(true);
          setDiscountPrice(String(p.discountPrice));
          if (p.discountFrom) {
            const dt = new Date(p.discountFrom);
            const localIso = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000)
              .toISOString()
              .slice(0, 16);
            setDiscountFrom(localIso);
          }
          if (p.discountUntil) {
            const dt = new Date(p.discountUntil);
            // format YYYY-MM-DDTHH:mm for datetime-local
            const localIso = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000)
              .toISOString()
              .slice(0, 16);
            setDiscountUntil(localIso);
          }
        }

        // Badges
        setIsNew(Boolean(p.isNew));
        setIsBestseller(Boolean(p.isBestseller));
        setIsPopular(Boolean(p.isPopular));

        // Fabric details
        const fd = p.fabricDetails || {};
        if (typeof fd === "object") {
          setFabricType(fd.fabricType || fd.summary || "");
          setNotions(fd.notions || "");
          setConsumption(fd.consumption || "");
          setMeasurements(fd.measurements || "");
        } else if (typeof fd === "string") {
          setFabricType(fd);
        }

        // Technical drawing & video
        setTechnicalDrawingUrl(p.technicalDrawingUrl || "");
        setVideoUrl(p.videoUrl || "");

        // Cover image
        const coverImg = p.coverImage || p.images?.find((img: any) => img.isCover)?.imageUrl || p.images?.[0]?.imageUrl || "";
        setCoverImageUrl(coverImg);

        // Variants
        setVariantsCount(p.variants?.length || 0);
      }
    } catch (err: any) {
      setLoadError(err?.message || "Не удалось загрузить данные выкройки");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [productId]);

  const handlePhotoFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setPhotoUploadError("Разрешены только изображения JPG, PNG или WebP");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setPhotoUploadError("Размер фото не должен превышать 10 МБ");
      return;
    }

    setPhotoUploadError(null);
    setIsUploadingPhoto(true);

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const base64 = event.target?.result as string;
        const res = await api.post<{ success: boolean; data: { publicUrl: string } }>(
          "/api/v1/admin/storage/upload-image",
          {
            productId,
            fileBase64: base64,
            fileName: file.name,
            contentType: file.type,
            isCover: true,
          }
        );
        if (res.success && res.data?.publicUrl) {
          setCoverImageUrl(res.data.publicUrl);
        }
      } catch (err: any) {
        setPhotoUploadError(err?.message || "Ошибка загрузки фото в облако");
      } finally {
        setIsUploadingPhoto(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleApplyCoverUrl = async () => {
    if (!coverImageUrl.trim()) return;
    setIsUploadingPhoto(true);
    setPhotoUploadError(null);
    try {
      const res = await api.post<{ success: boolean; data: { publicUrl: string } }>(
        "/api/v1/admin/storage/upload-image",
        {
          productId,
          url: coverImageUrl.trim(),
          isCover: true,
        }
      );
      if (res.success && res.data?.publicUrl) {
        setCoverImageUrl(res.data.publicUrl);
      }
    } catch (err: any) {
      setPhotoUploadError(err?.message || "Ошибка применения URL обложки");
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  // Pricing calculations
  const parsedBasePrice = parseFloat(basePrice) || 0;
  const parsedDiscountPrice = hasDiscount && discountPrice ? parseFloat(discountPrice) : null;
  const isDiscountValid =
    parsedDiscountPrice !== null &&
    parsedDiscountPrice > 0 &&
    parsedDiscountPrice < parsedBasePrice;
  const discountPercent = isDiscountValid
    ? Math.round(((parsedBasePrice - parsedDiscountPrice!) / parsedBasePrice) * 100)
    : 0;

  const getDiscountStatus = (): "PLANNED" | "ACTIVE" | "EXPIRED" | "NONE" => {
    if (!hasDiscount || !isDiscountValid) return "NONE";
    const now = new Date();
    const from = discountFrom ? new Date(discountFrom) : null;
    const until = discountUntil ? new Date(discountUntil) : null;
    if (from && now < from) return "PLANNED";
    if (until && now >= until) return "EXPIRED";
    return "ACTIVE";
  };
  const discountStatus = getDiscountStatus();
  const isDiscountActive = discountStatus === "ACTIVE";

  // Submit Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (!title.trim()) {
      setError("Укажите название выкройки");
      return;
    }
    if (!slug.trim()) {
      setError("Укажите артикул (slug)");
      return;
    }
    if (parsedBasePrice <= 0) {
      setError("Укажите корректную базовую цену");
      return;
    }

    if (hasDiscount) {
      if (!parsedDiscountPrice || parsedDiscountPrice <= 0) {
        setError("Укажите корректную цену со скидкой (больше 0)");
        return;
      }
      if (parsedDiscountPrice >= parsedBasePrice) {
        setError("Цена со скидкой должна быть меньше базовой цены");
        return;
      }
      if (discountFrom && discountUntil && new Date(discountFrom) > new Date(discountUntil)) {
        setError("Дата начала скидки не может быть позже даты окончания");
        return;
      }
    }

    setIsSubmitting(true);

    try {
      const structuredFabricDetails = {
        summary: fabricType.trim(),
        fabricType: fabricType.trim(),
        notions: notions.trim(),
        consumption: consumption.trim(),
        measurements: measurements.trim(),
      };

      const targetCategoryId = selectedSubcategoryId || selectedMainCategoryId || categoryId;
      if (!targetCategoryId) {
        setError("Пожалуйста, выберите категорию для выкройки");
        setIsSubmitting(false);
        return;
      }

      const payload: any = {
        title: title.trim(),
        slug: slug.trim().toLowerCase(),
        categoryId: targetCategoryId,
        basePrice: parsedBasePrice,
        bundlePrice: hasBundleOption && bundlePrice ? parseFloat(bundlePrice) || null : null,
        hasBundleOption,
        discountPrice: hasDiscount && isDiscountValid ? parsedDiscountPrice : null,
        discountFrom: hasDiscount && isDiscountValid && discountFrom ? new Date(discountFrom).toISOString() : null,
        discountUntil: hasDiscount && isDiscountValid && discountUntil ? new Date(discountUntil).toISOString() : null,
        isNew,
        isBestseller,
        isPopular,
        technicalDrawingUrl: technicalDrawingUrl.trim() || null,
        videoUrl: videoUrl.trim() || null,
        difficultyLevel,
        shortDescription: shortDescription.trim() || null,
        description: description.trim() || title.trim(),
        fabricDetails: structuredFabricDetails,
        isActive,
      };

      await api.put(`/api/v1/admin/products/${productId}`, payload);

      // Сохраняем обложку, если введен URL
      if (coverImageUrl.trim()) {
        try {
          await api.post("/api/v1/admin/storage/upload-image", {
            productId,
            url: coverImageUrl.trim(),
            isCover: true,
          });
        } catch (imgErr) {
          console.warn("Could not sync cover image URL:", imgErr);
        }
      }

      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
      }, 3500);
    } catch (err: any) {
      setError(err?.message || "Ошибка при сохранении выкройки");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-12 text-center text-xs text-atelier-muted space-y-2">
        <RefreshCw className="w-6 h-6 animate-spin mx-auto text-brand-700" />
        <p>Загрузка карточки выкройки...</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="p-8 max-w-md mx-auto text-center space-y-4">
        <AlertCircle className="w-10 h-10 text-red-500 mx-auto" />
        <div className="text-red-800 font-semibold text-sm">{loadError}</div>
        <Link href="/admin/products">
          <Button variant="outline" size="sm">
            Вернуться в каталог
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-atelier-border pb-4">
        <div className="flex items-center space-x-3">
          <Link href="/admin/products">
            <Button variant="ghost" size="sm" className="min-h-[44px] px-3 sm:min-h-0 sm:h-8 sm:px-2 text-atelier-muted hover:text-brand-950">
              <ArrowLeft className="w-4 h-4 mr-1" />
              В каталог
            </Button>
          </Link>
          <div>
            <span className="text-[10px] uppercase tracking-[0.25em] text-brand-700 font-semibold">
              Редактирование
            </span>
            <h1 className="font-serif text-2xl font-bold text-brand-950">
              {title || "Редактирование выкройки"}
            </h1>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/admin/products/${productId}/files`}>
            <Button variant="outline" size="sm" className="min-h-[44px] px-3.5 sm:min-h-0 sm:h-8 sm:px-3 text-xs text-brand-900 border-brand-300 hover:bg-brand-50">
              <FileText className="w-3.5 h-3.5 mr-1.5 text-brand-700" />
              Файлы и PDF ({variantsCount})
            </Button>
          </Link>

          <Link href={`/catalog/${slug}`} target="_blank">
            <Button variant="ghost" size="sm" className="min-h-[44px] px-3 sm:min-h-0 sm:h-8 sm:px-2 text-xs text-atelier-charcoal hover:text-brand-950">
              <Eye className="w-3.5 h-3.5 mr-1" />
              На сайте
            </Button>
          </Link>

          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="min-h-[44px] px-4 sm:min-h-0 sm:h-8 sm:px-3 bg-brand-900 hover:bg-brand-950 text-white text-xs"
          >
            <Save className="w-3.5 h-3.5 mr-1.5" />
            {isSubmitting ? "Сохранение..." : "Сохранить изменения"}
          </Button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-sm text-xs text-red-800 flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-sm text-xs text-emerald-800 flex items-center space-x-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>Изменения успешно сохранены!</span>
        </div>
      )}

      {/* Main Grid: Form (left) + Live Preview Card (right) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* LEFT COLUMN: FORM */}
        <div className="lg:col-span-2 space-y-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* БЛОК 1: ОСНОВНАЯ ИНФОРМАЦИЯ */}
            <div className="bg-white p-6 border border-atelier-border rounded-sm shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-atelier-border pb-3">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-brand-950 flex items-center space-x-2">
                  <Package className="w-4 h-4 text-brand-700" />
                  <span>1. Основные сведения</span>
                </h2>
                {/* Active switch */}
                <label className="inline-flex items-center min-h-[44px] space-x-2 text-xs cursor-pointer px-2 py-1">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="rounded text-brand-900 focus:ring-brand-900 w-4 h-4"
                  />
                  <span className={`font-semibold ${isActive ? "text-emerald-700" : "text-atelier-muted"}`}>
                    {isActive ? "✓ Опубликована на сайте" : "В черновиках"}
                  </span>
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-atelier-charcoal mb-1">
                    Название модели *
                  </label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full px-3 py-2.5 min-h-[44px] text-xs border border-atelier-border rounded-sm focus:outline-none focus:border-brand-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-atelier-charcoal mb-1">
                    Артикул / URL Slug *
                  </label>
                  <input
                    type="text"
                    required
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    className="w-full px-3 py-2.5 min-h-[44px] text-xs border border-atelier-border rounded-sm font-mono focus:outline-none focus:border-brand-900"
                  />
                </div>
              </div>

              {/* Двухуровневый выбор категории: Основная -> Подкатегория */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-atelier-charcoal mb-1">
                    Основная категория *
                  </label>
                  <select
                    required
                    value={selectedMainCategoryId}
                    onChange={(e) => {
                      const newMainId = e.target.value;
                      setSelectedMainCategoryId(newMainId);
                      const children = subcategoriesByParent[newMainId] || [];
                      if (children.length > 0) {
                        setSelectedSubcategoryId(children[0].id);
                        setCategoryId(children[0].id);
                      } else {
                        setSelectedSubcategoryId("");
                        setCategoryId(newMainId);
                      }
                    }}
                    className="w-full px-3 py-2.5 min-h-[44px] text-xs border border-atelier-border rounded-sm bg-white focus:outline-none focus:border-brand-900"
                  >
                    <option value="">— Выберите основную категорию —</option>
                    {mainCategories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title || c.name || c.slug}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-atelier-charcoal mb-1">
                    Подкатегория {availableSubcategories.length === 0 ? "(нет вложенных)" : "(рекомендуется)"}
                  </label>
                  <select
                    value={selectedSubcategoryId}
                    onChange={(e) => {
                      const newSubId = e.target.value;
                      setSelectedSubcategoryId(newSubId);
                      setCategoryId(newSubId || selectedMainCategoryId);
                    }}
                    disabled={availableSubcategories.length === 0}
                    className="w-full px-3 py-2.5 min-h-[44px] text-xs border border-atelier-border rounded-sm bg-white focus:outline-none focus:border-brand-900 disabled:bg-gray-50 disabled:text-gray-400"
                  >
                    {availableSubcategories.length > 0 ? (
                      <>
                        <option value="">— Без подкатегории (привязать к основной) —</option>
                        {availableSubcategories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.title || c.name || c.slug}
                          </option>
                        ))}
                      </>
                    ) : (
                      <option value="">— Без подкатегорий (выбрана основная) —</option>
                    )}
                  </select>
                </div>
              </div>

              {/* Хлебные крошки выбранной категории и уровень сложности */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                <div className="text-[11px] text-atelier-muted bg-atelier-surface/50 px-3 py-2 rounded-sm border border-atelier-border/60 flex items-center space-x-1.5 truncate">
                  <span className="font-medium text-brand-950">Раздел:</span>
                  <span className="text-brand-800 font-semibold truncate">
                    {mainCategories.find((c) => c.id === selectedMainCategoryId)?.title || "Не выбрана"}
                  </span>
                  {selectedSubcategoryId && (
                    <>
                      <span>→</span>
                      <span className="text-brand-900 font-bold truncate">
                        {availableSubcategories.find((c) => c.id === selectedSubcategoryId)?.title ||
                          categories.find((c) => c.id === selectedSubcategoryId)?.title}
                      </span>
                    </>
                  )}
                  {!selectedSubcategoryId && selectedMainCategoryId && (
                    <span className="text-atelier-muted">(основная)</span>
                  )}
                </div>

                <div>
                  <div className="flex items-center space-x-2">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-atelier-charcoal whitespace-nowrap">
                      Сложность:
                    </label>
                    <select
                      value={difficultyLevel}
                      onChange={(e) => setDifficultyLevel(e.target.value as DifficultyLevel)}
                      className="w-full px-3 py-2 min-h-[44px] text-xs border border-atelier-border rounded-sm bg-white focus:outline-none focus:border-brand-900"
                    >
                      <option value="BEGINNER">Для начинающих (Beginner)</option>
                      <option value="EASY">Простой (Easy)</option>
                      <option value="MEDIUM">Средний (Medium)</option>
                      <option value="INTERMEDIATE">Уверенный (Intermediate)</option>
                      <option value="ADVANCED">Продвинутый (Advanced)</option>
                      <option value="EXPERT">Эксперт / Профи (Expert)</option>
                    </select>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-atelier-charcoal mb-1">
                  Краткое описание (для карточки в каталоге)
                </label>
                <input
                  type="text"
                  value={shortDescription}
                  onChange={(e) => setShortDescription(e.target.value)}
                  className="w-full px-3 py-2.5 min-h-[44px] text-xs border border-atelier-border rounded-sm focus:outline-none focus:border-brand-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-atelier-charcoal mb-1">
                  Полное описание и конструктивные прибавки
                </label>
                <textarea
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2.5 min-h-[88px] text-xs border border-atelier-border rounded-sm focus:outline-none focus:border-brand-900"
                />
              </div>
            </div>

            {/* БЛОК 2: ЦЕНОВАЯ ПОЛИТИКА И АКЦИИ */}
            <div className="bg-white p-6 border border-atelier-border rounded-sm shadow-sm space-y-4">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-brand-950 border-b border-atelier-border pb-3 flex items-center space-x-2">
                <DollarSign className="w-4 h-4 text-brand-700" />
                <span>2. Ценообразование, комплекты и скидки</span>
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Базовая цена */}
                <div className="p-4 bg-atelier-surface/50 border border-atelier-border rounded-sm space-y-2">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-atelier-charcoal">
                    Базовая цена за 1 размер (KGS) *
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="10"
                    required
                    value={basePrice}
                    onChange={(e) => setBasePrice(e.target.value)}
                    className="w-full px-3 py-2 text-base font-bold font-mono border border-atelier-border rounded-sm focus:outline-none focus:border-brand-900 bg-white"
                  />
                  <p className="text-[11px] text-atelier-muted">
                    Стандартная розничная цена одного выбранного размера
                  </p>
                </div>

                {/* Комплект ALL */}
                <div className="p-4 bg-atelier-surface/50 border border-atelier-border rounded-sm space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-atelier-charcoal">
                      Цена комплекта ALL (KGS)
                    </label>
                    <label className="inline-flex items-center min-h-[44px] space-x-1.5 text-xs cursor-pointer px-1">
                      <input
                        type="checkbox"
                        checked={hasBundleOption}
                        onChange={(e) => setHasBundleOption(e.target.checked)}
                        className="rounded text-brand-900 focus:ring-brand-900 w-4 h-4"
                      />
                      <span className="text-xs font-medium text-brand-900">Включить ALL</span>
                    </label>
                  </div>
                  <input
                    type="number"
                    min="0"
                    step="50"
                    disabled={!hasBundleOption}
                    value={bundlePrice}
                    onChange={(e) => setBundlePrice(e.target.value)}
                    placeholder="Не задана"
                    className={`w-full px-3 py-2 text-base font-bold font-mono border rounded-sm focus:outline-none focus:border-brand-900 ${
                      hasBundleOption ? "bg-white border-atelier-border" : "bg-gray-100 text-gray-400"
                    }`}
                  />
                  <p className="text-[11px] text-atelier-muted">
                    {hasBundleOption
                      ? "Покупатель получает доступ ко всем размерам выбранного роста и формата"
                      : "Опция комплекта ALL отключена"}
                  </p>
                </div>
              </div>

              {/* Акционная цена и таймер скидки */}
              <div className="p-4 border border-dashed border-atelier-border rounded-sm space-y-3 bg-amber-50/20">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center space-x-2">
                    <Tag className="w-4 h-4 text-amber-600" />
                    <span className="text-xs font-semibold uppercase tracking-wider text-brand-950">
                      Скидочная акция и маркетинг
                    </span>
                    {discountStatus === "ACTIVE" && (
                      <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-100 text-emerald-800 rounded-full">
                        ● Активна (-{discountPercent}%)
                      </span>
                    )}
                    {discountStatus === "PLANNED" && (
                      <span className="px-2 py-0.5 text-[10px] font-bold bg-blue-100 text-blue-800 rounded-full">
                        🕒 Запланирована (-{discountPercent}%)
                      </span>
                    )}
                    {discountStatus === "EXPIRED" && (
                      <span className="px-2 py-0.5 text-[10px] font-bold bg-gray-100 text-gray-700 rounded-full">
                        ✕ Завершена
                      </span>
                    )}
                    {discountStatus === "NONE" && (
                      <span className="px-2 py-0.5 text-[10px] font-medium bg-gray-100 text-gray-500 rounded-full">
                        Не установлена
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    {hasDiscount && (
                      <button
                        type="button"
                        onClick={() => {
                          setHasDiscount(false);
                          setDiscountPrice("");
                          setDiscountFrom("");
                          setDiscountUntil("");
                        }}
                        className="min-h-[44px] inline-flex items-center px-2.5 py-1 text-xs text-rose-700 hover:text-rose-900 font-medium underline"
                      >
                        Отменить скидку
                      </button>
                    )}
                    <label className="inline-flex items-center min-h-[44px] space-x-2 text-xs cursor-pointer px-1">
                      <input
                        type="checkbox"
                        checked={hasDiscount}
                        onChange={(e) => setHasDiscount(e.target.checked)}
                        className="rounded text-amber-600 focus:ring-amber-600 w-4 h-4"
                      />
                      <span className="font-semibold text-amber-800 text-xs">
                        Включить акцию
                      </span>
                    </label>
                  </div>
                </div>

                {hasDiscount && (
                  <div className="space-y-3 pt-2 border-t border-amber-200/50">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-atelier-charcoal mb-1">
                          Акционная цена (KGS) *
                        </label>
                        <input
                          type="number"
                          min="1"
                          step="10"
                          required={hasDiscount}
                          value={discountPrice}
                          onChange={(e) => setDiscountPrice(e.target.value)}
                          placeholder="Например: 350"
                          className="w-full px-3 py-2 min-h-[44px] text-xs font-mono font-bold border border-atelier-border rounded-sm focus:outline-none focus:border-brand-900 bg-white"
                        />
                        {isDiscountValid && (
                          <p className="text-[11px] text-emerald-700 font-semibold mt-1">
                            Скидка {discountPercent}% (экономия {parsedBasePrice - parsedDiscountPrice!} KGS)
                          </p>
                        )}
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-atelier-charcoal mb-1">
                          Дата и время начала
                        </label>
                        <input
                          type="datetime-local"
                          value={discountFrom}
                          onChange={(e) => setDiscountFrom(e.target.value)}
                          className="w-full px-3 py-2 min-h-[44px] text-xs border border-atelier-border rounded-sm focus:outline-none focus:border-brand-900 bg-white"
                        />
                        <p className="text-[10px] text-atelier-muted mt-1">
                          Оставьте пустым для старта сразу после сохранения
                        </p>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-atelier-charcoal mb-1">
                          Дата и время окончания
                        </label>
                        <input
                          type="datetime-local"
                          value={discountUntil}
                          onChange={(e) => setDiscountUntil(e.target.value)}
                          className="w-full px-3 py-2 min-h-[44px] text-xs border border-atelier-border rounded-sm focus:outline-none focus:border-brand-900 bg-white"
                        />
                        <p className="text-[10px] text-atelier-muted mt-1">
                          Оставьте пустым, если акция бессрочная
                        </p>
                      </div>
                    </div>

                    <div className="text-[11px] text-atelier-muted bg-amber-100/40 p-2.5 rounded-sm">
                      <span className="font-semibold text-amber-900">Приоритет цен: </span>
                      Скидка применяется к стандартным размерам. Индивидуальные цены вариантов (priceOverride) и комплект ALL имеют высший приоритет и не снижаются акцией на товар.
                    </div>
                  </div>
                )}
              </div>

              {/* Маркетинговые бейджи */}
              <div className="space-y-2 pt-2">
                <label className="block text-xs font-semibold uppercase tracking-wider text-atelier-charcoal">
                  Маркетинговые бейджи на витрине
                </label>
                <div className="flex flex-wrap gap-4 text-xs">
                  <label className="inline-flex items-center min-h-[44px] space-x-2 bg-atelier-surface px-3 py-2 rounded-sm border border-atelier-border cursor-pointer hover:border-brand-900">
                    <input
                      type="checkbox"
                      checked={isNew}
                      onChange={(e) => setIsNew(e.target.checked)}
                      className="rounded text-brand-900 focus:ring-brand-900"
                    />
                    <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                    <span className="font-medium text-brand-950">Новинка (isNew)</span>
                  </label>

                  <label className="inline-flex items-center min-h-[44px] space-x-2 bg-atelier-surface px-3 py-2 rounded-sm border border-atelier-border cursor-pointer hover:border-brand-900">
                    <input
                      type="checkbox"
                      checked={isBestseller}
                      onChange={(e) => setIsBestseller(e.target.checked)}
                      className="rounded text-brand-900 focus:ring-brand-900"
                    />
                    <Flame className="w-3.5 h-3.5 text-amber-600" />
                    <span className="font-medium text-brand-950">Хит продаж (isBestseller)</span>
                  </label>

                  <label className="inline-flex items-center min-h-[44px] space-x-2 bg-atelier-surface px-3 py-2 rounded-sm border border-atelier-border cursor-pointer hover:border-brand-900">
                    <input
                      type="checkbox"
                      checked={isPopular}
                      onChange={(e) => setIsPopular(e.target.checked)}
                      className="rounded text-brand-900 focus:ring-brand-900"
                    />
                    <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="font-medium text-brand-950">Популярное (isPopular)</span>
                  </label>
                </div>
              </div>
            </div>

            {/* БЛОК 3: ТКАНИ, МАТЕРИАЛЫ И МЕРКИ */}
            <div className="bg-white p-6 border border-atelier-border rounded-sm shadow-sm space-y-4">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-brand-950 border-b border-atelier-border pb-3 flex items-center space-x-2">
                <Scissors className="w-4 h-4 text-brand-700" />
                <span>3. Рекомендуемые ткани, фурнитура и расход</span>
              </h2>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-atelier-charcoal mb-1">
                    Рекомендуемые ткани
                  </label>
                  <input
                    type="text"
                    value={fabricType}
                    onChange={(e) => setFabricType(e.target.value)}
                    placeholder="Шелк, штапель, плательная вискоза, лен, хлопок"
                    className="w-full px-3 py-2.5 min-h-[44px] text-xs border border-atelier-border rounded-sm focus:outline-none focus:border-brand-900"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-atelier-charcoal mb-1">
                      Необходимая фурнитура
                    </label>
                    <input
                      type="text"
                      value={notions}
                      onChange={(e) => setNotions(e.target.value)}
                      placeholder="Потайная молния 50 см, пуговицы 4 шт, нитки"
                      className="w-full px-3 py-2.5 min-h-[44px] text-xs border border-atelier-border rounded-sm focus:outline-none focus:border-brand-900"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-atelier-charcoal mb-1">
                      Расход ткани по размерам
                    </label>
                    <input
                      type="text"
                      value={consumption}
                      onChange={(e) => setConsumption(e.target.value)}
                      placeholder="42–46: 1.8 м; 48–52: 2.1 м; 54–60: 2.5 м при ширине 140 см"
                      className="w-full px-3 py-2.5 min-h-[44px] text-xs border border-atelier-border rounded-sm focus:outline-none focus:border-brand-900"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-atelier-charcoal mb-1">
                    Параметры и мерки готового изделия
                  </label>
                  <input
                    type="text"
                    value={measurements}
                    onChange={(e) => setMeasurements(e.target.value)}
                    placeholder="Длина спинки: 118 см; Прибавка к обхвату груди: +4 см; Прибавка к талии: +2 см"
                    className="w-full px-3 py-2.5 min-h-[44px] text-xs border border-atelier-border rounded-sm focus:outline-none focus:border-brand-900"
                  />
                </div>
              </div>
            </div>

            {/* БЛОК 4: ФОТОГРАФИИ, ЧЕРТЁЖ И ВИДЕО */}
            <div className="bg-white p-6 border border-atelier-border rounded-sm shadow-sm space-y-4">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-brand-950 border-b border-atelier-border pb-3 flex items-center space-x-2">
                <ImageIcon className="w-4 h-4 text-brand-700" />
                <span>4. Медиаматериалы (Фото, Технический рисунок, Видео)</span>
              </h2>

              {/* Фотография обложки */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-atelier-charcoal">
                    Главная фотография изделия (Обложка)
                  </label>
                  <Link
                    href={`/admin/products/${productId}/files?tab=images`}
                    className="text-xs text-brand-700 hover:text-brand-900 font-medium"
                  >
                    Перейти в галерею фото →
                  </Link>
                </div>

                {photoUploadError && (
                  <div className="p-2.5 bg-red-50 border border-red-200 rounded-sm text-xs text-red-800 flex items-center space-x-1.5">
                    <AlertCircle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                    <span>{photoUploadError}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
                  <div className="space-y-2">
                    <span className="text-[11px] text-atelier-muted block">
                      Способ 1: Загрузить новую обложку с компьютера
                    </span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handlePhotoFileSelect}
                      disabled={isUploadingPhoto}
                      className="text-xs text-atelier-charcoal file:mr-3 file:py-2.5 file:px-3 file:min-h-[44px] file:rounded-sm file:border-0 file:text-xs file:font-semibold file:bg-brand-50 file:text-brand-900 hover:file:bg-brand-100 cursor-pointer min-h-[44px] flex items-center"
                    />
                    {isUploadingPhoto && (
                      <p className="text-[11px] text-brand-700 animate-pulse">
                        Загрузка фото в хранилище Supabase...
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <span className="text-[11px] text-atelier-muted block">
                      Способ 2: Или ссылка на изображение
                    </span>
                    <div className="flex items-center space-x-2">
                      <input
                        type="url"
                        value={coverImageUrl}
                        onChange={(e) => setCoverImageUrl(e.target.value)}
                        placeholder="https://images.example.com/dress.jpg"
                        className="flex-1 px-3 py-2.5 min-h-[44px] text-xs border border-atelier-border rounded-sm focus:outline-none focus:border-brand-900 font-mono"
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={handleApplyCoverUrl}
                        disabled={isUploadingPhoto || !coverImageUrl.trim()}
                        className="min-h-[44px] text-xs shrink-0"
                      >
                        Применить
                      </Button>
                    </div>
                  </div>
                </div>

                {coverImageUrl && (
                  <div className="flex items-center space-x-3 p-3 bg-atelier-surface border border-atelier-border rounded-sm">
                    <img
                      src={coverImageUrl}
                      alt="Обложка"
                      className="w-14 h-18 object-cover rounded-sm border border-atelier-border shrink-0"
                    />
                    <div className="text-xs space-y-0.5 overflow-hidden">
                      <div className="font-semibold text-brand-950 flex items-center space-x-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                        <span>Обложка установлена</span>
                      </div>
                      <div className="text-[10px] text-atelier-muted font-mono truncate max-w-sm">
                        {coverImageUrl}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Технический рисунок */}
              <div className="pt-3 border-t border-atelier-border space-y-2">
                <label className="block text-xs font-semibold uppercase tracking-wider text-atelier-charcoal flex items-center space-x-1.5">
                  <FileCheck2 className="w-3.5 h-3.5 text-brand-700" />
                  <span>Технический рисунок конструкции (URL)</span>
                </label>
                <input
                  type="url"
                  value={technicalDrawingUrl}
                  onChange={(e) => setTechnicalDrawingUrl(e.target.value)}
                  placeholder="https://.../technical-drawing.png"
                  className="w-full px-3 py-2.5 min-h-[44px] text-xs border border-atelier-border rounded-sm focus:outline-none focus:border-brand-900 font-mono"
                />
                {technicalDrawingUrl && (
                  <div className="p-2 bg-atelier-surface border border-atelier-border rounded-sm flex items-center space-x-3">
                    <img
                      src={technicalDrawingUrl}
                      alt="Технический рисунок"
                      className="w-16 h-16 object-contain bg-white border border-atelier-border rounded-sm"
                    />
                    <span className="text-[11px] text-brand-950 font-medium">
                      Предпросмотр технического рисунка
                    </span>
                  </div>
                )}
              </div>

              {/* Видео изделия */}
              <div className="pt-3 border-t border-atelier-border space-y-2">
                <label className="block text-xs font-semibold uppercase tracking-wider text-atelier-charcoal flex items-center space-x-1.5">
                  <Video className="w-3.5 h-3.5 text-brand-700" />
                  <span>Видео готового изделия или видео-инструкция (URL)</span>
                </label>
                <input
                  type="url"
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  placeholder="https://youtube.com/watch?v=... или https://rutube.ru/..."
                  className="w-full px-3 py-2.5 min-h-[44px] text-xs border border-atelier-border rounded-sm focus:outline-none focus:border-brand-900 font-mono"
                />
              </div>
            </div>

            {/* Bottom Submit Bar */}
            <div className="flex items-center justify-between p-4 bg-white border border-atelier-border rounded-sm">
              <Link href="/admin/products">
                <Button variant="outline" type="button" disabled={isSubmitting} className="min-h-[44px] px-5 text-xs sm:h-9 sm:min-h-0">
                  Отмена
                </Button>
              </Link>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="min-h-[44px] px-6 sm:h-9 sm:min-h-0 bg-brand-900 hover:bg-brand-950 text-white text-xs font-semibold"
              >
                <Save className="w-4 h-4 mr-2" />
                {isSubmitting ? "Сохранение..." : "Сохранить изменения"}
              </Button>
            </div>
          </form>
        </div>

        {/* RIGHT COLUMN: LIVE PREVIEW CARD (Sticky) */}
        <div className="lg:col-span-1 sticky top-6 space-y-4">
          <div className="bg-white border border-atelier-border rounded-sm shadow-sm overflow-hidden">
            <div className="p-3 bg-atelier-surface border-b border-atelier-border flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold tracking-wider text-atelier-muted flex items-center space-x-1">
                <Eye className="w-3.5 h-3.5 text-brand-700" />
                <span>Предпросмотр на сайте</span>
              </span>
              <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${isActive ? "bg-emerald-100 text-emerald-800" : "bg-gray-200 text-gray-700"}`}>
                {isActive ? "Опубликована" : "Черновик"}
              </span>
            </div>

            {/* Visual Card simulation */}
            <div className="p-4 space-y-3">
              <div className="aspect-[3/4] bg-atelier-surface relative rounded-sm overflow-hidden border border-atelier-border">
                {coverImageUrl ? (
                  <img
                    src={coverImageUrl}
                    alt={title || "Предпросмотр"}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-atelier-muted">
                    <Package className="w-10 h-10 stroke-1 mb-1" />
                    <span className="text-[11px]">Фото отсутствует</span>
                  </div>
                )}

                {/* Badges in top-left */}
                <div className="absolute top-2 left-2 flex flex-col gap-1 items-start">
                  {isNew && (
                    <span className="bg-blue-600 text-white text-[10px] font-bold px-2 py-0.5 uppercase tracking-wider rounded-sm shadow-sm">
                      Новинка
                    </span>
                  )}
                  {isBestseller && (
                    <span className="bg-amber-600 text-white text-[10px] font-bold px-2 py-0.5 uppercase tracking-wider rounded-sm shadow-sm">
                      Хит
                    </span>
                  )}
                  {isPopular && (
                    <span className="bg-emerald-600 text-white text-[10px] font-bold px-2 py-0.5 uppercase tracking-wider rounded-sm shadow-sm">
                      Популярно
                    </span>
                  )}
                  {isDiscountActive && (
                    <span className="bg-rose-600 text-white text-[10px] font-bold px-2 py-0.5 uppercase tracking-wider rounded-sm shadow-sm">
                      -{discountPercent}%
                    </span>
                  )}
                </div>

                {/* Technical Drawing Thumbnail */}
                {technicalDrawingUrl && (
                  <div className="absolute bottom-2 right-2 w-12 h-12 bg-white/90 backdrop-blur-sm p-1 rounded-sm border border-atelier-border shadow-sm">
                    <img
                      src={technicalDrawingUrl}
                      alt="Эскиз"
                      className="w-full h-full object-contain"
                    />
                  </div>
                )}
              </div>

              <div>
                <span className="text-[10px] uppercase tracking-wider text-atelier-muted font-medium">
                  {categories.find((c) => c.id === categoryId)?.title || "Категория"}
                </span>
                <h3 className="font-serif font-bold text-base text-brand-950 leading-tight">
                  {title || "Название выкройки"}
                </h3>
                <p className="text-xs text-atelier-muted line-clamp-2 mt-1">
                  {shortDescription || description || "Краткое описание модели"}
                </p>
              </div>

              {/* Price section in preview */}
              <div className="pt-2 border-t border-atelier-border flex items-baseline justify-between">
                <div>
                  <span className="text-[10px] uppercase text-atelier-muted block">Цена за размер:</span>
                  <div className="flex items-baseline space-x-2">
                    {isDiscountActive ? (
                      <>
                        <span className="font-serif text-lg font-bold text-rose-700">
                          {parsedDiscountPrice} KGS
                        </span>
                        <span className="text-xs text-atelier-muted line-through">
                          {parsedBasePrice} KGS
                        </span>
                      </>
                    ) : (
                      <span className="font-serif text-lg font-bold text-brand-950">
                        {parsedBasePrice} KGS
                      </span>
                    )}
                  </div>
                </div>

                {hasBundleOption && (
                  <div className="text-right">
                    <span className="text-[10px] uppercase text-atelier-muted block">Комплект ALL:</span>
                    <span className="font-serif text-sm font-bold text-brand-800 bg-brand-50 px-2 py-0.5 rounded-sm border border-brand-200">
                      {bundlePrice || "0"} KGS
                    </span>
                  </div>
                )}
              </div>

              {/* Quick links box */}
              <div className="pt-3 border-t border-atelier-border space-y-2">
                <Link
                  href={`/admin/products/${productId}/files`}
                  className="w-full block text-center py-2 px-3 bg-brand-50 hover:bg-brand-100 text-brand-900 border border-brand-200 rounded-sm text-xs font-semibold transition-colors"
                >
                  <FileText className="w-3.5 h-3.5 inline mr-1 text-brand-700" />
                  Управление файлами вариантов ({variantsCount})
                </Link>

                <Link
                  href={`/catalog/${slug}`}
                  target="_blank"
                  className="w-full block text-center py-1.5 px-3 bg-atelier-surface hover:bg-atelier-border/50 text-atelier-charcoal border border-atelier-border rounded-sm text-xs transition-colors"
                >
                  <Eye className="w-3.5 h-3.5 inline mr-1" />
                  Посмотреть страницу на сайте
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}