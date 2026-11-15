"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Product, Category, CatalogFilters as FiltersType } from "../../types";
import { api } from "../../lib/api";
import { ProductCard } from "../../components/catalog/ProductCard";
import { CatalogFilters } from "../../components/catalog/CatalogFilters";
import { Search, SlidersHorizontal, ArrowUpDown } from "lucide-react";

export default function CatalogPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [filterMeta, setFilterMeta] = useState<FiltersType | null>(null);
  const [loading, setLoading] = useState(true);

  // Filter state
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [selectedSize, setSelectedSize] = useState<string>("");
  const [selectedHeight, setSelectedHeight] = useState<string>("");
  const [selectedFormat, setSelectedFormat] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [sortBy, setSortBy] = useState<string>("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);

  // Load categories and filter dictionaries
  useEffect(() => {
    async function loadMeta() {
      try {
        const [catsRes, filtersRes] = await Promise.allSettled([
          api.get<{ success: boolean; data: Category[] }>("/api/v1/catalog/categories"),
          api.get<{ success: boolean; data: FiltersType }>("/api/v1/catalog/filters"),
        ]);

        if (catsRes.status === "fulfilled" && catsRes.value.data) {
          setCategories(catsRes.value.data);
        }
        if (filtersRes.status === "fulfilled" && filtersRes.value.data) {
          setFilterMeta(filtersRes.value.data);
        }
      } catch (err) {
        console.error("Failed to load catalog metadata:", err);
      }
    }

    loadMeta();
  }, []);

  // Fetch products with active filters
  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append("page", page.toString());
      params.append("limit", "12");

      if (selectedCategory) params.append("categoryId", selectedCategory);
      if (selectedSize) params.append("size", selectedSize);
      if (selectedHeight) params.append("height", selectedHeight);
      if (selectedFormat) params.append("format", selectedFormat);
      if (searchQuery.trim()) params.append("search", searchQuery.trim());
      if (sortBy) params.append("sortBy", sortBy);
      if (sortOrder) params.append("sortOrder", sortOrder);

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
      }
    } catch (err) {
      console.error("Failed to load catalog products:", err);
    } finally {
      setLoading(false);
    }
  }, [
    page,
    selectedCategory,
    selectedSize,
    selectedHeight,
    selectedFormat,
    searchQuery,
    sortBy,
    sortOrder,
  ]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const handleResetFilters = () => {
    setSelectedCategory("");
    setSelectedSize("");
    setSelectedHeight("");
    setSelectedFormat("");
    setSearchQuery("");
    setPage(1);
  };

  return (
    <div className="bg-atelier-surface min-h-screen py-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header Breadcrumbs & Title */}
        <div className="mb-8">
          <span className="text-xs uppercase tracking-widest text-brand-700 font-semibold">
            Коллекция выкроек
          </span>
          <h1 className="font-serif text-3xl sm:text-4xl font-bold text-brand-950 mt-1">
            Каталог цифровых выкроек
          </h1>
          <p className="text-xs sm:text-sm text-atelier-muted mt-2">
            Найдено моделей: {totalCount}
          </p>
        </div>

        {/* Top Search & Sorting Bar */}
        <div className="bg-white p-4 border border-atelier-border rounded-sm mb-8 flex flex-col md:flex-row items-center justify-between gap-4">
          {/* Search bar */}
          <div className="relative w-full md:w-96">
            <Search className="w-4 h-4 text-atelier-muted absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Поиск по названию или описанию..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              className="w-full pl-9 pr-4 py-2 text-xs border border-atelier-border rounded-sm focus:outline-none focus:border-brand-500"
            />
          </div>

          {/* Sort selector */}
          <div className="flex items-center space-x-3 w-full md:w-auto justify-end">
            <ArrowUpDown className="w-4 h-4 text-atelier-muted" />
            <span className="text-xs text-atelier-muted uppercase tracking-wider">
              Сортировка:
            </span>
            <select
              value={`${sortBy}:${sortOrder}`}
              onChange={(e) => {
                const [sb, so] = e.target.value.split(":");
                setSortBy(sb);
                setSortOrder(so as "asc" | "desc");
                setPage(1);
              }}
              className="text-xs border border-atelier-border rounded-sm px-3 py-2 bg-white focus:outline-none focus:border-brand-500"
            >
              <option value="createdAt:desc">Сначала новые</option>
              <option value="price:asc">Сначала дешевле</option>
              <option value="price:desc">Сначала дороже</option>
              <option value="title:asc">По названию (А-Я)</option>
            </select>
          </div>
        </div>

        {/* Layout with Sidebar Filters and Product Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Filters Sidebar */}
          <div className="lg:col-span-1">
            <CatalogFilters
              categories={categories}
              selectedCategory={selectedCategory}
              onSelectCategory={(id) => {
                setSelectedCategory(id);
                setPage(1);
              }}
              selectedSize={selectedSize}
              onSelectSize={(s) => {
                setSelectedSize(s);
                setPage(1);
              }}
              selectedHeight={selectedHeight}
              onSelectHeight={(h) => {
                setSelectedHeight(h);
                setPage(1);
              }}
              selectedFormat={selectedFormat}
              onSelectFormat={(f) => {
                setSelectedFormat(f);
                setPage(1);
              }}
              availableSizes={filterMeta?.sizes}
              availableHeights={filterMeta?.heights}
              availableFormats={filterMeta?.formats}
              onReset={handleResetFilters}
            />
          </div>

          {/* Product Grid Area */}
          <div className="lg:col-span-3">
            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <div
                    key={n}
                    className="bg-white border border-atelier-border aspect-[3/4] animate-pulse rounded-sm"
                  />
                ))}
              </div>
            ) : products.length > 0 ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {products.map((product) => (
                    <ProductCard key={product.id} product={product} />
                  ))}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="mt-12 flex justify-center items-center space-x-2">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="px-4 py-2 text-xs border border-atelier-border rounded-sm disabled:opacity-40 hover:bg-white bg-white"
                    >
                      Назад
                    </button>
                    <span className="text-xs text-atelier-muted px-3">
                      Страница {page} из {totalPages}
                    </span>
                    <button
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                      className="px-4 py-2 text-xs border border-atelier-border rounded-sm disabled:opacity-40 hover:bg-white bg-white"
                    >
                      Вперёд
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="bg-white border border-atelier-border rounded-sm p-12 text-center">
                <SlidersHorizontal className="w-12 h-12 text-atelier-muted mx-auto mb-3" />
                <h3 className="text-base font-medium text-brand-950">
                  По заданным параметрам выкройки не найдены
                </h3>
                <p className="text-xs text-atelier-muted mt-1 max-w-sm mx-auto">
                  Попробуйте смягчить условия поиска или сбросить активные фильтры.
                </p>
                <button
                  onClick={handleResetFilters}
                  className="mt-4 px-4 py-2 text-xs bg-brand-900 text-white rounded-sm hover:bg-brand-950"
                >
                  Сбросить все фильтры
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
