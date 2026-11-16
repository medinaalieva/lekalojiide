"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../../../lib/api";
import { Product, Category } from "../../../types";
import { Button } from "../../../components/ui/Button";
import { Badge } from "../../../components/ui/Badge";
import {
  Package,
  PlusCircle,
  Search,
  Filter,
  RefreshCw,
  AlertCircle,
  Eye,
  CheckCircle,
  XCircle,
} from "lucide-react";

export default function AdminProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [selectedStatus, setSelectedStatus] = useState<string>("ALL");
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const fetchData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [prodRes, catRes] = await Promise.all([
        api.get<{ success: boolean; data: { products?: Product[] } | Product[] }>(
          "/api/v1/catalog/products?limit=100"
        ),
        api.get<{ success: boolean; data: Category[] }>("/api/v1/catalog/categories"),
      ]);

      if (prodRes.success && prodRes.data) {
        const list = Array.isArray(prodRes.data)
          ? prodRes.data
          : prodRes.data.products || [];
        setProducts(list);
      }

      if (catRes.success && catRes.data) {
        setCategories(catRes.data);
      }
    } catch (err: any) {
      setError(err?.message || "Не удалось загрузить список выкроек");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleToggleStatus = async (productId: string, currentActive: boolean) => {
    setActionLoadingId(productId);
    try {
      await api.patch(`/api/v1/admin/products/${productId}/status`, {
        isActive: !currentActive,
      });
      setProducts((prev) =>
        prev.map((p) =>
          p.id === productId ? { ...p, isActive: !currentActive } : p
        )
      );
    } catch (err: any) {
      alert(`Ошибка смены статуса: ${err?.message || "Действие отклонено"}`);
    } finally {
      setActionLoadingId(null);
    }
  };

  const filteredProducts = products.filter((p) => {
    const matchesSearch =
      !search ||
      p.title.toLowerCase().includes(search.toLowerCase()) ||
      p.slug.toLowerCase().includes(search.toLowerCase());

    const matchesCategory =
      selectedCategory === "ALL" ||
      (typeof p.category === "object"
        ? p.category?.slug === selectedCategory
        : (p as any).categoryId === selectedCategory);

    const matchesStatus =
      selectedStatus === "ALL" ||
      (selectedStatus === "ACTIVE" && p.isActive !== false) ||
      (selectedStatus === "INACTIVE" && p.isActive === false);

    return matchesSearch && matchesCategory && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-atelier-border pb-6">
        <div>
          <span className="text-[10px] uppercase tracking-[0.25em] text-brand-700 font-semibold">
            Каталог ателье
          </span>
          <h1 className="font-serif text-3xl font-bold text-brand-950 mt-1">
            Управление выкройками
          </h1>
          <p className="text-xs text-atelier-muted mt-1">
            Всего моделей в базе: {products.length}
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchData}
            disabled={isLoading}
            className="text-xs"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 mr-1.5 ${isLoading ? "animate-spin" : ""}`}
            />
            Обновить
          </Button>

          <Link href="/admin/products/new">
            <Button size="sm" className="text-xs">
              <PlusCircle className="w-3.5 h-3.5 mr-1.5" />
              Добавить выкройку
            </Button>
          </Link>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-sm text-xs text-red-800 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
          <Button variant="outline" size="sm" onClick={fetchData} className="text-xs">
            Повторить
          </Button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 border border-atelier-border rounded-sm shadow-sm flex flex-col md:flex-row items-center gap-4 justify-between">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-atelier-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Поиск по названию или артикулу..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs border border-atelier-border rounded-sm focus:outline-none focus:border-brand-900"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Category Filter */}
          <div className="flex items-center space-x-2 text-xs">
            <Filter className="w-3.5 h-3.5 text-atelier-muted" />
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-2 py-1.5 text-xs border border-atelier-border rounded-sm bg-white focus:outline-none focus:border-brand-900"
            >
              <option value="ALL">Все категории</option>
              {categories.map((c) => (
                <option key={c.id} value={c.slug}>
                  {c.name || c.title || c.slug}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="px-2 py-1.5 text-xs border border-atelier-border rounded-sm bg-white focus:outline-none focus:border-brand-900"
          >
            <option value="ALL">Все статусы</option>
            <option value="ACTIVE">Опубликованы</option>
            <option value="INACTIVE">Сняты с публикации</option>
          </select>
        </div>
      </div>

      {/* Products Table */}
      <div className="bg-white border border-atelier-border rounded-sm shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="p-12 text-center text-xs text-atelier-muted">
              Загрузка каталога выкроек...
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="p-12 text-center text-xs text-atelier-muted space-y-3">
              <Package className="w-8 h-8 mx-auto text-atelier-muted stroke-1" />
              <p>Выкройки не найдены</p>
              <Link href="/admin/products/new">
                <Button size="sm" variant="outline" className="text-xs">
                  Создать первую выкройку
                </Button>
              </Link>
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-atelier-surface text-atelier-muted uppercase tracking-wider text-[10px] border-b border-atelier-border">
                <tr>
                  <th className="py-3 px-4">Выкройка</th>
                  <th className="py-3 px-4">Категория</th>
                  <th className="py-3 px-4">Базовая цена</th>
                  <th className="py-3 px-4">Сложность</th>
                  <th className="py-3 px-4">Статус</th>
                  <th className="py-3 px-4 text-right">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-atelier-border">
                {filteredProducts.map((p) => {
                  const isActive = p.isActive !== false;
                  const isActionLoading = actionLoadingId === p.id;
                  const firstImg: any = p.images?.[0];
                  const coverImage =
                    typeof firstImg === "string"
                      ? firstImg
                      : (p.images as any[])?.find((img) => typeof img === "object" && img?.isCover)?.imageUrl ||
                        firstImg?.imageUrl ||
                        (p as any).coverImage;

                  return (
                    <tr key={p.id} className="hover:bg-atelier-subtle transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center space-x-3">
                          <div className="w-12 h-14 bg-atelier-surface border border-atelier-border rounded-sm overflow-hidden shrink-0 flex items-center justify-center">
                            {coverImage ? (
                              <img
                                src={coverImage}
                                alt={p.title}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <Package className="w-5 h-5 text-atelier-muted stroke-1" />
                            )}
                          </div>
                          <div>
                            <div className="font-semibold text-brand-950">
                              {p.title}
                            </div>
                            <div className="text-[11px] text-atelier-muted font-mono">
                              /{p.slug}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-4 text-atelier-charcoal">
                        {typeof p.category === "object"
                          ? p.category?.name || p.category?.title || p.category?.slug
                          : "—"}
                      </td>

                      <td className="py-3 px-4 font-semibold text-brand-950">
                        {Number(p.basePrice || (p as any).priceKgs || 0).toLocaleString("ru-RU")}{" "}
                        KGS
                      </td>

                      <td className="py-3 px-4">
                        <span className="text-[11px] uppercase tracking-wider text-atelier-muted font-medium">
                          {p.difficultyLevel || "INTERMEDIATE"}
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        <Badge variant={isActive ? "success" : "neutral"}>
                          {isActive ? "Опубликована" : "В черновиках"}
                        </Badge>
                      </td>

                      <td className="py-3 px-4 text-right space-x-2">
                        <Link
                          href={`/catalog/${p.slug}`}
                          target="_blank"
                          title="Открыть на сайте"
                        >
                          <Button variant="ghost" size="sm" className="h-7 px-2">
                            <Eye className="w-3.5 h-3.5 text-atelier-muted hover:text-brand-900" />
                          </Button>
                        </Link>

                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isActionLoading}
                          onClick={() => handleToggleStatus(p.id, isActive)}
                          className="h-7 px-2 text-[11px]"
                          title={isActive ? "Снять с публикации" : "Опубликовать"}
                        >
                          {isActive ? (
                            <>
                              <XCircle className="w-3.5 h-3.5 mr-1 text-amber-600" />
                              В черновик
                            </>
                          ) : (
                            <>
                              <CheckCircle className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                              Опубликовать
                            </>
                          )}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
