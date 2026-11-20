"use client";

import React, { useEffect, useState, useCallback, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Product, Category, CatalogFilters as FiltersType } from "../../types";
import { api } from "../../lib/api";
import { ProductCard } from "../../components/catalog/ProductCard";
import { CatalogFilters } from "../../components/catalog/CatalogFilters";
import {
  Search,
  SlidersHorizontal,
  ArrowUpDown,
  X,
  RotateCcw,
  Sparkles,
  Flame,
  Tag,
  AlertCircle,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

const DIFFICULTY_LABELS: Record<string, string> = {
  BEGINNER: "Для начинающих",
  INTERMEDIATE: "Средняя сложность",
  ADVANCED: "Продвинутый",
};

function CatalogContent() {
  const searchParams = useSearchParams();

  // State
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [filterMeta, setFilterMeta] = useState<FiltersType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search input with debounce
  const [searchInput, setSearchInput] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Filters state
  const [selectedCategorySlug, setSelectedCategorySlug] = useState<string>("");
  const [selectedSizes, setSelectedSizes] = useState<string[]>([]);
  const [selectedHeights, setSelectedHeights] = useState<string[]>([]);
  const [selectedFormats, setSelectedFormats] = useState<string[]>([]);
  const [selectedDifficulties, setSelectedDifficulties] = useState<string[]>([]);
  const [isNewOnly, setIsNewOnly] = useState<boolean>(false);
  const [isBestsellerOnly, setIsBestsellerOnly] = useState<boolean>(false);
  const [hasDiscountOnly, setHasDiscountOnly] = useState<boolean>(false);

  // Sorting and pagination
  const [sort, setSort] = useState<string>("newest");
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);

  // Mobile drawer state
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);

  // Track last synchronized query string to avoid cyclic updates
  const lastSyncedQsRef = useRef<string | null>(null);

  // Reactive URL searchParams synchronization (handles initial load and Navbar / router clicks)
  useEffect(() => {
    const currentQs = searchParams?.toString() || "";
    if (lastSyncedQsRef.current === currentQs) {
      return;
    }
    lastSyncedQsRef.current = currentQs;

    const qSearch = searchParams?.get("search") || "";
    const qCat = searchParams?.get("categorySlug") || searchParams?.get("category") || "";
    const qSizes = searchParams?.get("sizes") || searchParams?.get("size") || "";
    const qHeights = searchParams?.get("heights") || searchParams?.get("height") || "";
    const qFormats = searchParams?.get("formats") || searchParams?.get("format") || "";
    const qDifficulty = searchParams?.get("difficulty") || "";
    const qIsNew = searchParams?.get("isNew") === "true";
    const qIsBestseller = searchParams?.get("isBestseller") === "true";
    const qHasDiscount = searchParams?.get("hasDiscount") === "true";
    const qSort = searchParams?.get("sort") || "newest";
    const qPage = parseInt(searchParams?.get("page") || "1", 10);

    setSearchInput(qSearch);
    setSearchQuery(qSearch);
    setSelectedCategorySlug(qCat);
    setSelectedSizes(qSizes ? qSizes.split(",").map((s) => s.trim()).filter(Boolean) : []);
    setSelectedHeights(qHeights ? qHeights.split(",").map((h) => h.trim()).filter(Boolean) : []);
    setSelectedFormats(qFormats ? qFormats.split(",").map((f) => f.trim()).filter(Boolean) : []);
    setSelectedDifficulties(qDifficulty ? qDifficulty.split(",").map((d) => d.trim()).filter(Boolean) : []);
    setIsNewOnly(qIsNew);
    setIsBestsellerOnly(qIsBestseller);
    setHasDiscountOnly(qHasDiscount);
    setSort(qSort);
    setPage(!isNaN(qPage) && qPage > 0 ? qPage : 1);
  }, [searchParams]);

  // Load categories and filter dictionaries
  useEffect(() => {
    async function loadMeta() {
      try {
        const [catsRes, filtersRes] = await Promise.allSettled([
          api.get<{ success: boolean; data: Category[] }>("/api/v1/catalog/categories"),
          api.get<{ success: boolean; data: FiltersType }>("/api/v1/catalog/filters"),
        ]);

        if (catsRes.status === "fulfilled" && catsRes.value?.data) {
          setCategories(catsRes.value.data);
        }
        if (filtersRes.status === "fulfilled" && filtersRes.value?.data) {
          setFilterMeta(filtersRes.value.data);
        }
      } catch (err) {
        console.error("Failed to load catalog metadata:", err);
      }
    }

    loadMeta();
  }, []);

  // Debounce search input (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== searchQuery) {
        setSearchQuery(searchInput);
        setPage(1);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchInput, searchQuery]);

  // Bi-directional URL synchronization
  useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams();
    if (searchQuery.trim()) params.set("search", searchQuery.trim());
    if (selectedCategorySlug) params.set("categorySlug", selectedCategorySlug);
    if (selectedSizes.length > 0) params.set("sizes", selectedSizes.join(","));
    if (selectedHeights.length > 0) params.set("heights", selectedHeights.join(","));
    if (selectedFormats.length > 0) params.set("formats", selectedFormats.join(","));
    if (selectedDifficulties.length > 0) params.set("difficulty", selectedDifficulties.join(","));
    if (isNewOnly) params.set("isNew", "true");
    if (isBestsellerOnly) params.set("isBestseller", "true");
    if (hasDiscountOnly) params.set("hasDiscount", "true");
    if (sort && sort !== "newest") params.set("sort", sort);
    if (page > 1) params.set("page", String(page));

    const qs = params.toString();
    const windowQs = window.location.search.replace(/^\?/, "");

    if (qs !== windowQs) {
      lastSyncedQsRef.current = qs;
      const newUrl = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
      window.history.replaceState(null, "", newUrl);
    }
  }, [
    searchQuery,
    selectedCategorySlug,
    selectedSizes,
    selectedHeights,
    selectedFormats,
    selectedDifficulties,
    isNewOnly,
    isBestsellerOnly,
    hasDiscountOnly,
    sort,
    page,
  ]);

  // Handle browser Back / Forward (popstate)
  useEffect(() => {
    function handlePopState() {
      const sp = new URLSearchParams(window.location.search);
      const qSearch = sp.get("search") || "";
      const qCat = sp.get("categorySlug") || sp.get("category") || "";
      const qSizes = sp.get("sizes") || sp.get("size") || "";
      const qHeights = sp.get("heights") || sp.get("height") || "";
      const qFormats = sp.get("formats") || sp.get("format") || "";
      const qDifficulty = sp.get("difficulty") || "";
      const qIsNew = sp.get("isNew") === "true";
      const qIsBestseller = sp.get("isBestseller") === "true";
      const qHasDiscount = sp.get("hasDiscount") === "true";
      const qSort = sp.get("sort") || "newest";
      const qPage = parseInt(sp.get("page") || "1", 10);

      setSearchInput(qSearch);
      setSearchQuery(qSearch);
      setSelectedCategorySlug(qCat);
      setSelectedSizes(qSizes ? qSizes.split(",").map((s) => s.trim()).filter(Boolean) : []);
      setSelectedHeights(qHeights ? qHeights.split(",").map((h) => h.trim()).filter(Boolean) : []);
      setSelectedFormats(qFormats ? qFormats.split(",").map((f) => f.trim()).filter(Boolean) : []);
      setSelectedDifficulties(qDifficulty ? qDifficulty.split(",").map((d) => d.trim()).filter(Boolean) : []);
      setIsNewOnly(qIsNew);
      setIsBestsellerOnly(qIsBestseller);
      setHasDiscountOnly(qHasDiscount);
      setSort(qSort);
      setPage(!isNaN(qPage) && qPage > 0 ? qPage : 1);
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // Fetch products from backend
  const fetchProducts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.append("page", page.toString());
      params.append("limit", "12");

      if (selectedCategorySlug) params.append("categorySlug", selectedCategorySlug);
      if (selectedSizes.length > 0) params.append("sizes", selectedSizes.join(","));
      if (selectedHeights.length > 0) params.append("heights", selectedHeights.join(","));
      if (selectedFormats.length > 0) params.append("formats", selectedFormats.join(","));
      if (selectedDifficulties.length > 0) params.append("difficulty", selectedDifficulties.join(","));
      if (isNewOnly) params.append("isNew", "true");
      if (isBestsellerOnly) params.append("isBestseller", "true");
      if (hasDiscountOnly) params.append("hasDiscount", "true");
      if (searchQuery.trim()) params.append("search", searchQuery.trim());
      if (sort) params.append("sort", sort);

      const res = await api.get<{
        success: boolean;
        data: Product[];
        pagination?: {
          page: number;
          limit: number;
          totalItems: number;
          totalPages: number;
        };
      }>(`/api/v1/catalog/products?${params.toString()}`);

      if (res.success) {
        setProducts(res.data || []);
        if (res.pagination) {
          setTotalPages(res.pagination.totalPages || 1);
          setTotalCount(res.pagination.totalItems || 0);
        }
      } else {
        setError("Не удалось получить список выкроек");
      }
    } catch (err: any) {
      console.error("Failed to load catalog products:", err);
      setError(err?.message || "Ошибка подключения к серверу");
    } finally {
      setLoading(false);
    }
  }, [
    page,
    selectedCategorySlug,
    selectedSizes,
    selectedHeights,
    selectedFormats,
    selectedDifficulties,
    isNewOnly,
    isBestsellerOnly,
    hasDiscountOnly,
    searchQuery,
    sort,
  ]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  // Toggle helpers
  const handleToggleSize = (code: string) => {
    setSelectedSizes((prev) =>
      prev.includes(code) ? prev.filter((s) => s !== code) : [...prev, code]
    );
    setPage(1);
  };

  const handleToggleHeight = (code: string) => {
    setSelectedHeights((prev) =>
      prev.includes(code) ? prev.filter((h) => h !== code) : [...prev, code]
    );
    setPage(1);
  };

  const handleToggleFormat = (code: string) => {
    setSelectedFormats((prev) =>
      prev.includes(code) ? prev.filter((f) => f !== code) : [...prev, code]
    );
    setPage(1);
  };

  const handleToggleDifficulty = (level: string) => {
    setSelectedDifficulties((prev) =>
      prev.includes(level) ? prev.filter((d) => d !== level) : [...prev, level]
    );
    setPage(1);
  };

  const handleResetFilters = () => {
    setSearchInput("");
    setSearchQuery("");
    setSelectedCategorySlug("");
    setSelectedSizes([]);
    setSelectedHeights([]);
    setSelectedFormats([]);
    setSelectedDifficulties([]);
    setIsNewOnly(false);
    setIsBestsellerOnly(false);
    setHasDiscountOnly(false);
    setPage(1);
  };

  // Active filter count calculation
  const activeCount =
    (selectedCategorySlug ? 1 : 0) +
    selectedSizes.length +
    selectedHeights.length +
    selectedFormats.length +
    selectedDifficulties.length +
    (isNewOnly ? 1 : 0) +
    (isBestsellerOnly ? 1 : 0) +
    (hasDiscountOnly ? 1 : 0) +
    (searchQuery.trim() ? 1 : 0);

  // Selected category object (with alias fallback for dresses platya/plate)
  const isDressSlug = (s: string) => s === "platya" || s === "plate";
  const activeCategory = categories.find(
    (c) =>
      c.slug === selectedCategorySlug ||
      (isDressSlug(selectedCategorySlug) &&
        (isDressSlug(c.slug) || (c.title || "").toLowerCase().includes("плать")))
  );

  return (
    <div className="bg-atelier-surface min-h-screen py-8 sm:py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Breadcrumb & Header */}
        <div className="mb-6 sm:mb-8">
          <div className="flex items-center space-x-2 text-[11px] uppercase tracking-wider text-atelier-muted">
            <span>Главная</span>
            <span>/</span>
            <span className="text-brand-800 font-semibold">Каталог выкроек</span>
            {activeCategory && (
              <>
                <span>/</span>
                <span className="text-brand-950 font-semibold">{activeCategory.title || activeCategory.name}</span>
              </>
            )}
          </div>
          <h1 className="font-serif text-2xl sm:text-4xl font-bold text-brand-950 mt-2">
            {activeCategory ? activeCategory.title || activeCategory.name : "Каталог цифровых выкроек"}
          </h1>
          <p className="text-xs sm:text-sm text-atelier-muted mt-1.5">
            {activeCategory?.description || "Точные выкройки с подробными инструкциями в форматах PDF А4 и для широкоформатного плоттера"}
          </p>
        </div>

        {/* Top Control Bar: Search, Mobile Filter Trigger & Sorting */}
        <div className="bg-white p-3.5 sm:p-4 border border-atelier-border rounded-sm mb-6 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 sm:gap-4">
          {/* Search Input with Debounce & Clear Icon */}
          <div className="relative flex-1 max-w-full md:max-w-md">
            <Search className="w-4 h-4 text-atelier-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Поиск по названию или описанию..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full pl-9 pr-9 py-2 text-xs border border-atelier-border rounded-sm focus:outline-none focus:border-brand-800 bg-atelier-surface/40 transition-colors"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => {
                  setSearchInput("");
                  setSearchQuery("");
                  setPage(1);
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-atelier-muted hover:text-brand-950 p-0.5 rounded-sm"
                aria-label="Очистить поиск"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Controls: Mobile Drawer Button, Count, and Sorting */}
          <div className="flex items-center justify-between md:justify-end gap-3 shrink-0">
            {/* Mobile Filter Button */}
            <button
              type="button"
              onClick={() => setIsMobileDrawerOpen(true)}
              className="lg:hidden inline-flex items-center space-x-2 px-3.5 py-2 text-xs font-semibold uppercase tracking-wider bg-brand-900 text-white rounded-sm hover:bg-brand-950 transition-colors shadow-xs"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Фильтры</span>
              {activeCount > 0 && (
                <span className="w-4 h-4 rounded-full bg-brand-500 text-white text-[10px] font-bold flex items-center justify-center">
                  {activeCount}
                </span>
              )}
            </button>

            {/* Sort Dropdown */}
            <div className="flex items-center space-x-2 ml-auto md:ml-0">
              <ArrowUpDown className="w-3.5 h-3.5 text-atelier-muted shrink-0 hidden sm:block" />
              <label htmlFor="catalog-sort" className="text-[11px] text-atelier-muted uppercase tracking-wider hidden sm:inline">
                Сортировка:
              </label>
              <select
                id="catalog-sort"
                value={sort}
                onChange={(e) => {
                  setSort(e.target.value);
                  setPage(1);
                }}
                className="text-xs border border-atelier-border rounded-sm px-2.5 py-2 bg-white text-brand-950 focus:outline-none focus:border-brand-800 cursor-pointer"
              >
                <option value="newest">Сначала новые</option>
                <option value="price_asc">Сначала дешевле</option>
                <option value="price_desc">Сначала дороже</option>
                <option value="title_asc">По названию (А-Я)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Active Filter Chips / Tags Bar */}
        {activeCount > 0 && (
          <div className="bg-white border border-atelier-border/80 rounded-sm p-3 mb-6 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-atelier-muted mr-1">
              Активные фильтры:
            </span>

            {searchQuery && (
              <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 bg-atelier-subtle text-brand-950 border border-atelier-border rounded-sm text-xs">
                <span>Поиск: &laquo;{searchQuery}&raquo;</span>
                <button
                  type="button"
                  onClick={() => {
                    setSearchInput("");
                    setSearchQuery("");
                    setPage(1);
                  }}
                  className="hover:text-rose-600 transition-colors"
                  aria-label="Удалить фильтр поиска"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {activeCategory && (
              <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 bg-brand-50 text-brand-950 border border-brand-200 rounded-sm text-xs font-medium">
                <span>Категория: {activeCategory.title || activeCategory.name}</span>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCategorySlug("");
                    setPage(1);
                  }}
                  className="hover:text-rose-600 transition-colors"
                  aria-label="Удалить фильтр категории"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {selectedDifficulties.map((level) => (
              <span
                key={level}
                className="inline-flex items-center space-x-1.5 px-2.5 py-1 bg-atelier-subtle text-brand-950 border border-atelier-border rounded-sm text-xs"
              >
                <span>Сложность: {DIFFICULTY_LABELS[level] || level}</span>
                <button
                  type="button"
                  onClick={() => handleToggleDifficulty(level)}
                  className="hover:text-rose-600 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}

            {selectedSizes.map((code) => (
              <span
                key={code}
                className="inline-flex items-center space-x-1.5 px-2.5 py-1 bg-atelier-subtle text-brand-950 border border-atelier-border rounded-sm text-xs font-mono"
              >
                <span>Размер: {code}</span>
                <button
                  type="button"
                  onClick={() => handleToggleSize(code)}
                  className="hover:text-rose-600 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}

            {selectedHeights.map((code) => (
              <span
                key={code}
                className="inline-flex items-center space-x-1.5 px-2.5 py-1 bg-atelier-subtle text-brand-950 border border-atelier-border rounded-sm text-xs"
              >
                <span>Рост: {code} см</span>
                <button
                  type="button"
                  onClick={() => handleToggleHeight(code)}
                  className="hover:text-rose-600 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}

            {selectedFormats.map((code) => (
              <span
                key={code}
                className="inline-flex items-center space-x-1.5 px-2.5 py-1 bg-atelier-subtle text-brand-950 border border-atelier-border rounded-sm text-xs"
              >
                <span>Формат: {code}</span>
                <button
                  type="button"
                  onClick={() => handleToggleFormat(code)}
                  className="hover:text-rose-600 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}

            {isNewOnly && (
              <span className="inline-flex items-center space-x-1 px-2.5 py-1 bg-sky-50 text-sky-900 border border-sky-200 rounded-sm text-xs">
                <Sparkles className="w-3 h-3 text-sky-600" />
                <span>Только новинки</span>
                <button
                  type="button"
                  onClick={() => {
                    setIsNewOnly(false);
                    setPage(1);
                  }}
                  className="hover:text-rose-600 transition-colors ml-1"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {isBestsellerOnly && (
              <span className="inline-flex items-center space-x-1 px-2.5 py-1 bg-amber-50 text-amber-900 border border-amber-200 rounded-sm text-xs">
                <Flame className="w-3 h-3 text-amber-600" />
                <span>Хиты продаж</span>
                <button
                  type="button"
                  onClick={() => {
                    setIsBestsellerOnly(false);
                    setPage(1);
                  }}
                  className="hover:text-rose-600 transition-colors ml-1"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {hasDiscountOnly && (
              <span className="inline-flex items-center space-x-1 px-2.5 py-1 bg-rose-50 text-rose-900 border border-rose-200 rounded-sm text-xs">
                <Tag className="w-3 h-3 text-rose-600" />
                <span>Со скидкой</span>
                <button
                  type="button"
                  onClick={() => {
                    setHasDiscountOnly(false);
                    setPage(1);
                  }}
                  className="hover:text-rose-600 transition-colors ml-1"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            <button
              type="button"
              onClick={handleResetFilters}
              className="ml-auto inline-flex items-center space-x-1 text-xs text-rose-700 hover:text-rose-900 font-semibold px-2 py-1 transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Сбросить все</span>
            </button>
          </div>
        )}

        {/* Layout with Sidebar Filters and Product Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 items-start">
          {/* Filters Sidebar (Desktop) + Mobile Drawer */}
          <div className="lg:col-span-1">
            <CatalogFilters
              categories={categories}
              selectedCategorySlug={selectedCategorySlug}
              onSelectCategorySlug={(slug) => {
                setSelectedCategorySlug(slug);
                setPage(1);
              }}
              selectedSizes={selectedSizes}
              onToggleSize={handleToggleSize}
              selectedHeights={selectedHeights}
              onToggleHeight={handleToggleHeight}
              selectedFormats={selectedFormats}
              onToggleFormat={handleToggleFormat}
              selectedDifficulties={selectedDifficulties}
              onToggleDifficulty={handleToggleDifficulty}
              isNewOnly={isNewOnly}
              onToggleNewOnly={() => {
                setIsNewOnly((prev) => !prev);
                setPage(1);
              }}
              isBestsellerOnly={isBestsellerOnly}
              onToggleBestsellerOnly={() => {
                setIsBestsellerOnly((prev) => !prev);
                setPage(1);
              }}
              hasDiscountOnly={hasDiscountOnly}
              onToggleDiscountOnly={() => {
                setHasDiscountOnly((prev) => !prev);
                setPage(1);
              }}
              availableSizes={filterMeta?.sizes}
              availableHeights={filterMeta?.heights}
              availableFormats={filterMeta?.formats}
              availableDifficulties={filterMeta?.difficultyLevels || ["BEGINNER", "INTERMEDIATE", "ADVANCED"]}
              activeCount={activeCount}
              onReset={handleResetFilters}
              isMobileDrawerOpen={isMobileDrawerOpen}
              onCloseMobileDrawer={() => setIsMobileDrawerOpen(false)}
            />
          </div>

          {/* Product Grid Area */}
          <div className="lg:col-span-3">
            {/* Results count indicator */}
            <div className="flex items-center justify-between mb-4 text-xs text-atelier-muted">
              <span>
                Найдено моделей: <strong className="text-brand-950 font-semibold">{totalCount}</strong>
              </span>
              {totalPages > 1 && (
                <span>
                  Страница <strong className="text-brand-950">{page}</strong> из {totalPages}
                </span>
              )}
            </div>

            {/* Error State */}
            {error ? (
              <div className="bg-white border border-rose-200 rounded-sm p-10 text-center my-4 shadow-xs">
                <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-rose-50 flex items-center justify-center text-rose-600">
                  <AlertCircle className="w-6 h-6 stroke-[1.5]" />
                </div>
                <h3 className="text-base font-serif font-semibold text-brand-950">
                  Не удалось загрузить каталог выкроек
                </h3>
                <p className="text-xs text-atelier-muted mt-1 max-w-sm mx-auto">
                  {error}. Пожалуйста, проверьте подключение и повторите попытку.
                </p>
                <button
                  type="button"
                  onClick={fetchProducts}
                  className="mt-5 inline-flex items-center space-x-2 px-4 py-2 text-xs font-semibold uppercase tracking-wider bg-brand-900 text-white rounded-sm hover:bg-brand-950 transition-colors shadow-xs"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Попробовать снова</span>
                </button>
              </div>
            ) : loading ? (
              /* Loading Skeletons */
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <div
                    key={n}
                    className="bg-white border border-atelier-border rounded-sm overflow-hidden p-4 space-y-3"
                  >
                    <div className="aspect-[3/4] bg-atelier-subtle animate-pulse rounded-sm w-full" />
                    <div className="h-3 bg-atelier-subtle animate-pulse rounded-xs w-1/3" />
                    <div className="h-4 bg-atelier-subtle animate-pulse rounded-xs w-4/5" />
                    <div className="h-4 bg-atelier-subtle animate-pulse rounded-xs w-1/2" />
                  </div>
                ))}
              </div>
            ) : products.length > 0 ? (
              /* Product Grid */
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {products.map((product, idx) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      priority={page === 1 && idx === 0}
                    />
                  ))}
                </div>

                {/* Pagination Controls */}
                {totalPages > 1 && (
                  <div className="mt-12 flex flex-col sm:flex-row justify-center items-center gap-3">
                    <div className="flex items-center space-x-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setPage((p) => Math.max(1, p - 1));
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                        disabled={page === 1}
                        className="inline-flex items-center space-x-1 px-3 py-2 text-xs font-medium border border-atelier-border rounded-sm disabled:opacity-40 hover:bg-white bg-white text-atelier-charcoal transition-colors cursor-pointer disabled:cursor-not-allowed"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                        <span>Назад</span>
                      </button>

                      {/* Numeric page buttons */}
                      {Array.from({ length: totalPages }, (_, idx) => idx + 1)
                        .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                        .map((p, idx, arr) => {
                          const prevPage = arr[idx - 1];
                          const showEllipsis = prevPage && p - prevPage > 1;
                          return (
                            <React.Fragment key={p}>
                              {showEllipsis && (
                                <span className="px-2 text-xs text-atelier-muted">...</span>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  setPage(p);
                                  window.scrollTo({ top: 0, behavior: "smooth" });
                                }}
                                className={`w-8 h-8 text-xs font-semibold rounded-sm transition-colors ${
                                  page === p
                                    ? "bg-brand-900 text-white"
                                    : "bg-white border border-atelier-border text-atelier-charcoal hover:bg-atelier-surface"
                                }`}
                              >
                                {p}
                              </button>
                            </React.Fragment>
                          );
                        })}

                      <button
                        type="button"
                        onClick={() => {
                          setPage((p) => Math.min(totalPages, p + 1));
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                        disabled={page === totalPages}
                        className="inline-flex items-center space-x-1 px-3 py-2 text-xs font-medium border border-atelier-border rounded-sm disabled:opacity-40 hover:bg-white bg-white text-atelier-charcoal transition-colors cursor-pointer disabled:cursor-not-allowed"
                      >
                        <span>Вперёд</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <span className="text-[11px] text-atelier-muted">
                      Показано {products.length} из {totalCount} выкроек
                    </span>
                  </div>
                )}
              </>
            ) : (
              /* Empty State */
              <div className="bg-white border border-atelier-border rounded-sm p-12 text-center my-6 shadow-xs">
                <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-brand-50 flex items-center justify-center text-brand-800">
                  <SlidersHorizontal className="w-6 h-6 stroke-[1.5]" />
                </div>
                <h3 className="text-base sm:text-lg font-serif font-semibold text-brand-950">
                  По заданным параметрам выкроек не найдено
                </h3>
                <p className="text-xs sm:text-sm text-atelier-muted mt-2 max-w-md mx-auto leading-relaxed">
                  Попробуйте изменить параметры поиска, снять часть фильтров или выбрать другую категорию.
                </p>
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="mt-6 inline-flex items-center space-x-2 px-5 py-2.5 text-xs font-semibold uppercase tracking-wider bg-brand-900 text-white rounded-sm hover:bg-brand-950 transition-colors shadow-sm"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Сбросить все фильтры</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function CatalogView() {
  return (
    <Suspense
      fallback={
        <div className="bg-atelier-surface min-h-screen py-16 text-center">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="h-8 w-64 bg-atelier-subtle animate-pulse mx-auto mb-8 rounded-sm" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <div
                  key={n}
                  className="bg-white border border-atelier-border aspect-[3/4] animate-pulse rounded-sm"
                />
              ))}
            </div>
          </div>
        </div>
      }
    >
      <CatalogContent />
    </Suspense>
  );
}
