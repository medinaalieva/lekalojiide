"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "../../../../lib/api";
import { Category, DifficultyLevel } from "../../../../types";
import { Button } from "../../../../components/ui/Button";
import {
  Package,
  ArrowLeft,
  Save,
  AlertCircle,
  CheckCircle2,
  Layers,
} from "lucide-react";

const SIZES = ["40", "42", "44", "46", "48", "50", "52", "54"];
const HEIGHTS = ["158-164", "164-170", "170-176"];
const FORMATS = ["A4", "PLOTTER_900"];

export default function AdminNewProductPage() {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoadingCats, setIsLoadingCats] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Form State
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [basePrice, setBasePrice] = useState("450");
  const [difficultyLevel, setDifficultyLevel] = useState<DifficultyLevel>("INTERMEDIATE");
  const [shortDescription, setShortDescription] = useState("");
  const [description, setDescription] = useState("");
  const [fabricDetails, setFabricDetails] = useState("Шелк, вискоза, лен, хлопок. Расход: 1.8 - 2.2 м.");
  const [coverImageUrl, setCoverImageUrl] = useState("");

  // Matrix Generator State
  const [generateVariants, setGenerateVariants] = useState(true);
  const [selectedSizes, setSelectedSizes] = useState<string[]>(["42", "44", "46", "48"]);
  const [selectedHeights, setSelectedHeights] = useState<string[]>(["164-170"]);
  const [selectedFormats, setSelectedFormats] = useState<string[]>(["A4", "PLOTTER_900"]);

  useEffect(() => {
    const fetchCats = async () => {
      try {
        const res = await api.get<{ success: boolean; data: Category[] }>(
          "/api/v1/catalog/categories"
        );
        if (res.success && res.data) {
          setCategories(res.data);
          if (res.data.length > 0) {
            setCategoryId(res.data[0].id);
          }
        }
      } catch (err: any) {
        setError("Не удалось загрузить категории");
      } finally {
        setIsLoadingCats(false);
      }
    };
    fetchCats();
  }, []);

  // Auto-slug generator from Russian title
  const handleTitleChange = (val: string) => {
    setTitle(val);
    if (!slug || slug === transliterate(title)) {
      setSlug(transliterate(val));
    }
  };

  const transliterate = (str: string) => {
    const ru: Record<string, string> = {
      а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "zh",
      з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o",
      п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts",
      ч: "ch", ш: "sh", щ: "shch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
    };
    return str
      .toLowerCase()
      .split("")
      .map((char) => ru[char] || char)
      .join("")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  };

  const toggleSize = (sz: string) => {
    setSelectedSizes((prev) =>
      prev.includes(sz) ? prev.filter((s) => s !== sz) : [...prev, sz]
    );
  };

  const toggleHeight = (h: string) => {
    setSelectedHeights((prev) =>
      prev.includes(h) ? prev.filter((x) => x !== h) : [...prev, h]
    );
  };

  const toggleFormat = (f: string) => {
    setSelectedFormats((prev) =>
      prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError("Укажите название выкройки");
      return;
    }
    if (!slug.trim()) {
      setError("Укажите артикул (slug)");
      return;
    }
    if (!categoryId) {
      setError("Выберите категорию");
      return;
    }

    setIsSubmitting(true);

    try {
      // 1. Создание карточки товара
      const createRes = await api.post<{ success: boolean; data: any }>(
        "/api/v1/admin/products",
        {
          title: title.trim(),
          slug: slug.trim().toLowerCase(),
          categoryId,
          basePrice: Number(basePrice) || 0,
          difficultyLevel,
          shortDescription: shortDescription.trim() || undefined,
          description: description.trim() || title.trim(),
          fabricDetails: fabricDetails.trim() ? { summary: fabricDetails.trim() } : undefined,
        }
      );

      const createdProduct = createRes.data;

      // 2. Если указано изображение обложки — добавляем
      if (coverImageUrl.trim() && createdProduct?.id) {
        try {
          await api.post(`/api/v1/admin/products/${createdProduct.id}/images`, {
            imageUrl: coverImageUrl.trim(),
            altText: title.trim(),
            displayOrder: 1,
            isCover: true,
          });
        } catch {
          // Игнорируем ошибку обложки, основная сущность уже создана
        }
      }

      // 3. Пакетная генерация матрицы вариантов
      if (
        generateVariants &&
        createdProduct?.id &&
        selectedSizes.length > 0 &&
        selectedHeights.length > 0 &&
        selectedFormats.length > 0
      ) {
        try {
          await api.post(
            `/api/v1/admin/products/${createdProduct.id}/variants/batch`,
            {
              sizes: selectedSizes,
              heights: selectedHeights,
              formats: selectedFormats,
            }
          );
        } catch (err: any) {
          console.warn("Ошибка генерации матрицы вариантов:", err);
        }
      }

      setSuccess(true);
      setTimeout(() => {
        router.push("/admin/products");
      }, 1200);
    } catch (err: any) {
      setError(err?.message || "Ошибка при сохранении выкройки");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-atelier-border pb-4">
        <div className="flex items-center space-x-3">
          <Link href="/admin/products">
            <Button variant="ghost" size="sm" className="h-8 px-2 text-atelier-muted">
              <ArrowLeft className="w-4 h-4 mr-1" />
              Назад к каталогу
            </Button>
          </Link>
          <h1 className="font-serif text-2xl font-bold text-brand-950">
            Добавление новой выкройки
          </h1>
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
          <span>Выкройка успешно создана! Перенаправление в каталог...</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Main Details */}
        <div className="bg-white p-6 border border-atelier-border rounded-sm shadow-sm space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-brand-950 border-b border-atelier-border pb-2">
            1. Основная информация
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-atelier-charcoal mb-1">
                Название выкройки *
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => handleTitleChange(e.target.value)}
                placeholder="Платье миди «Айпери» с запахом"
                className="w-full px-3 py-2 text-xs border border-atelier-border rounded-sm focus:outline-none focus:border-brand-900"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-atelier-charcoal mb-1">
                Артикул / Slug *
              </label>
              <input
                type="text"
                required
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="plate-ayperi-midi"
                className="w-full px-3 py-2 text-xs border border-atelier-border rounded-sm font-mono focus:outline-none focus:border-brand-900"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-atelier-charcoal mb-1">
                Категория *
              </label>
              <select
                required
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                disabled={isLoadingCats}
                className="w-full px-3 py-2 text-xs border border-atelier-border rounded-sm bg-white focus:outline-none focus:border-brand-900"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name || c.title || c.slug}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-atelier-charcoal mb-1">
                Базовая цена (KGS) *
              </label>
              <input
                type="number"
                min="0"
                step="10"
                required
                value={basePrice}
                onChange={(e) => setBasePrice(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-atelier-border rounded-sm font-semibold focus:outline-none focus:border-brand-900"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-atelier-charcoal mb-1">
                Сложность пошива
              </label>
              <select
                value={difficultyLevel}
                onChange={(e) => setDifficultyLevel(e.target.value as DifficultyLevel)}
                className="w-full px-3 py-2 text-xs border border-atelier-border rounded-sm bg-white focus:outline-none focus:border-brand-900"
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

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-atelier-charcoal mb-1">
              Краткое описание (для превью каталога)
            </label>
            <input
              type="text"
              value={shortDescription}
              onChange={(e) => setShortDescription(e.target.value)}
              placeholder="Женственное платье приталенного силуэта с акцентным поясом"
              className="w-full px-3 py-2 text-xs border border-atelier-border rounded-sm focus:outline-none focus:border-brand-900"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-atelier-charcoal mb-1">
              Полное описание и прибавки на свободу
            </label>
            <textarea
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Подробная информация о конструкции изделия, припусках на швы, технологических особенностях..."
              className="w-full px-3 py-2 text-xs border border-atelier-border rounded-sm focus:outline-none focus:border-brand-900"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-atelier-charcoal mb-1">
              Расход ткани и материалы
            </label>
            <input
              type="text"
              value={fabricDetails}
              onChange={(e) => setFabricDetails(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-atelier-border rounded-sm focus:outline-none focus:border-brand-900"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-atelier-charcoal mb-1">
              URL фотографии обложки
            </label>
            <input
              type="url"
              value={coverImageUrl}
              onChange={(e) => setCoverImageUrl(e.target.value)}
              placeholder="https://images.unsplash.com/photo-..."
              className="w-full px-3 py-2 text-xs border border-atelier-border rounded-sm focus:outline-none focus:border-brand-900"
            />
          </div>
        </div>

        {/* Matrix Variant Generator */}
        <div className="bg-white p-6 border border-atelier-border rounded-sm shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-atelier-border pb-2">
            <div className="flex items-center space-x-2">
              <Layers className="w-4 h-4 text-brand-700" />
              <h2 className="text-xs font-semibold uppercase tracking-wider text-brand-950">
                2. Матрица вариантов (Размеры, Рост, Форматы)
              </h2>
            </div>
            <label className="inline-flex items-center space-x-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={generateVariants}
                onChange={(e) => setGenerateVariants(e.target.checked)}
                className="rounded text-brand-900 focus:ring-brand-900"
              />
              <span className="text-atelier-charcoal font-medium">
                Сгенерировать матрицу автоматически
              </span>
            </label>
          </div>

          {generateVariants && (
            <div className="space-y-4 pt-2">
              <div>
                <label className="block text-xs font-medium text-atelier-muted mb-2">
                  Размеры:
                </label>
                <div className="flex flex-wrap gap-2">
                  {SIZES.map((sz) => {
                    const isSelected = selectedSizes.includes(sz);
                    return (
                      <button
                        type="button"
                        key={sz}
                        onClick={() => toggleSize(sz)}
                        className={`px-3 py-1 text-xs rounded-sm border transition-colors ${
                          isSelected
                            ? "bg-brand-950 text-white border-brand-950 font-semibold"
                            : "bg-white text-atelier-charcoal border-atelier-border hover:border-brand-900"
                        }`}
                      >
                        {sz}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-atelier-muted mb-2">
                  Ростовки (см):
                </label>
                <div className="flex flex-wrap gap-2">
                  {HEIGHTS.map((h) => {
                    const isSelected = selectedHeights.includes(h);
                    return (
                      <button
                        type="button"
                        key={h}
                        onClick={() => toggleHeight(h)}
                        className={`px-3 py-1 text-xs rounded-sm border transition-colors ${
                          isSelected
                            ? "bg-brand-950 text-white border-brand-950 font-semibold"
                            : "bg-white text-atelier-charcoal border-atelier-border hover:border-brand-900"
                        }`}
                      >
                        {h}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-atelier-muted mb-2">
                  Форматы PDF:
                </label>
                <div className="flex flex-wrap gap-2">
                  {FORMATS.map((f) => {
                    const isSelected = selectedFormats.includes(f);
                    return (
                      <button
                        type="button"
                        key={f}
                        onClick={() => toggleFormat(f)}
                        className={`px-3 py-1 text-xs rounded-sm border transition-colors ${
                          isSelected
                            ? "bg-brand-950 text-white border-brand-950 font-semibold"
                            : "bg-white text-atelier-charcoal border-atelier-border hover:border-brand-900"
                        }`}
                      >
                        {f === "A4" ? "А4 (бытовой принтер)" : "Плоттер 900 мм"}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="p-3 bg-brand-50 border border-brand-100 rounded-sm text-[11px] text-brand-900">
                Будет создано вариантов:{" "}
                <strong className="font-mono">
                  {selectedSizes.length * selectedHeights.length * selectedFormats.length}
                </strong>{" "}
                ({selectedSizes.length} разм. × {selectedHeights.length} рост. ×{" "}
                {selectedFormats.length} форм.)
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end space-x-3 pt-2">
          <Link href="/admin/products">
            <Button variant="outline" type="button" disabled={isSubmitting}>
              Отмена
            </Button>
          </Link>
          <Button type="submit" disabled={isSubmitting || success}>
            <Save className="w-4 h-4 mr-2" />
            {isSubmitting ? "Сохранение..." : "Создать выкройку"}
          </Button>
        </div>
      </form>
    </div>
  );
}
