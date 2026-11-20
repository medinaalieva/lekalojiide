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
  FileText,
  Edit2,
  Sparkles,
  Flame,
  Tag,
  Layers,
} from "lucide-react";

export default function AdminProductsPage() {
  const [products, setProducts] = useState<any[]>([]);
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
        api.get<{ success: boolean; data: { products?: any[] } | any[] }>(
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
            Всего моделей в базе: {products.length} • Опубликовано:{" "}
            {products.filter((p) => p.isActive !== false).length}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchData}
            disabled={isLoading}
            className="min-h-[44px] sm:min-h-0 sm:h-9 px-4 sm:px-3 text-xs"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 mr-1.5 ${isLoading ? "animate-spin" : ""}`}
            />
            Обновить
          </Button>

          <Link href="/admin/products/new">
            <Button size="sm" className="min-h-[44px] sm:min-h-0 sm:h-9 px-4 sm:px-3 text-xs bg-brand-900 hover:bg-brand-950 text-white font-medium shadow-sm">
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
          <Button variant="outline" size="sm" onClick={fetchData} className="min-h-[44px] sm:min-h-0 px-4 text-xs">
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
            className="w-full pl-9 pr-3 py-2 min-h-[44px] text-xs border border-atelier-border rounded-sm focus:outline-none focus:border-brand-900"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Category Filter */}
          <div className="flex items-center space-x-2 text-xs w-full sm:w-auto">
            <Filter className="w-3.5 h-3.5 text-atelier-muted shrink-0" />
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full sm:w-auto px-3 py-2 min-h-[44px] sm:min-h-0 sm:py-1.5 text-xs border border-atelier-border rounded-sm bg-white focus:outline-none focus:border-brand-900"
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
            className="w-full sm:w-auto px-3 py-2 min-h-[44px] sm:min-h-0 sm:py-1.5 text-xs border border-atelier-border rounded-sm bg-white focus:outline-none focus:border-brand-900"
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
                  <th className="py-3 px-4">Цены и Комплект</th>
                  <th className="py-3 px-4">Бейджи</th>
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

                  const hasDiscount = p.isDiscountActive && p.discountPrice && p.discountPrice < p.basePrice;

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
                            <div className="font-semibold text-brand-950 hover:text-brand-700">
                              <Link href={`/admin/products/${p.id}/edit`}>
                                {p.title}
                              </Link>
                            </div>
                            <div className="text-[11px] text-atelier-muted font-mono flex items-center space-x-2">
                              <span>/{p.slug}</span>
                              <span className="text-atelier-border">•</span>
                              <span className="uppercase text-[10px] text-brand-800">
                                {p.difficultyLevel || "INTERMEDIATE"}
                              </span>
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-4 text-atelier-charcoal">
                        {typeof p.category === "object"
                          ? p.category?.name || p.category?.title || p.category?.slug
                          : "—"}
                      </td>

                      <td className="py-3 px-4">
                        <div>
                          {hasDiscount ? (
                            <div className="flex items-baseline space-x-1.5">
                              <span className="font-bold text-rose-700 font-mono">
                                {Number(p.discountPrice).toLocaleString("ru-RU")} KGS
                              </span>
                              <span className="text-[11px] text-atelier-muted line-through font-mono">
                                {Number(p.basePrice).toLocaleString("ru-RU")}
                              </span>
                            </div>
                          ) : (
                            <div className="font-semibold text-brand-950 font-mono">
                              {Number(p.basePrice || (p as any).priceKgs || 0).toLocaleString("ru-RU")}{" "}
                              KGS
                            </div>
                          )}

                          {p.bundlePrice ? (
                            <div className="text-[10px] text-brand-800 font-medium mt-0.5">
                              ALL: <span className="font-mono font-bold">{Number(p.bundlePrice).toLocaleString("ru-RU")} KGS</span>
                            </div>
                          ) : (
                            <div className="text-[10px] text-atelier-muted">Без комплекта</div>
                          )}
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="flex flex-wrap gap-1">
                          {p.isNew && (
                            <span className="inline-flex items-center text-[10px] font-bold px-1.5 py-0.2 bg-blue-50 text-blue-700 border border-blue-200 rounded">
                              <Sparkles className="w-2.5 h-2.5 mr-0.5" />
                              Новинка
                            </span>
                          )}
                          {p.isBestseller && (
                            <span className="inline-flex items-center text-[10px] font-bold px-1.5 py-0.2 bg-amber-50 text-amber-700 border border-amber-200 rounded">
                              <Flame className="w-2.5 h-2.5 mr-0.5" />
                              Хит
                            </span>
                          )}
                          {hasDiscount && (
                            <span className="inline-flex items-center text-[10px] font-bold px-1.5 py-0.2 bg-rose-50 text-rose-700 border border-rose-200 rounded">
                              <Tag className="w-2.5 h-2.5 mr-0.5" />
                              -{p.discountPercent || ""}%
                            </span>
                          )}
                          {!p.isNew && !p.isBestseller && !hasDiscount && (
                            <span className="text-atelier-muted text-[11px]">—</span>
                          )}
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <Badge variant={isActive ? "success" : "neutral"}>
                          {isActive ? "Опубликована" : "В черновиках"}
                        </Badge>
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex flex-wrap sm:flex-nowrap items-center justify-end gap-1.5">
                          <Link
                            href={`/admin/products/${p.id}/edit`}
                            title="Редактировать параметры выкройки"
                          >
                            <Button
                              variant="ghost"
                              size="sm"
                              className="min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 sm:h-8 px-3 py-2 sm:px-2 sm:py-1 text-xs sm:text-[11px] text-atelier-charcoal hover:text-brand-950"
                            >
                              <Edit2 className="w-3.5 h-3.5 mr-1" />
                              Изменить
                            </Button>
                          </Link>

                          <Link
                            href={`/admin/products/${p.id}/files`}
                            title="Управление фото и матрицей PDF"
                          >
                            <Button
                              variant="outline"
                              size="sm"
                              className="min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 sm:h-8 px-3 py-2 sm:px-2 sm:py-1 text-xs sm:text-[11px] text-brand-900 border-brand-300 hover:bg-brand-50"
                            >
                              <FileText className="w-3.5 h-3.5 mr-1 text-brand-700" />
                              Файлы
                            </Button>
                          </Link>

                          <Link
                            href={`/catalog/${p.slug}`}
                            target="_blank"
                            title="Открыть карточку на сайте"
                          >
                            <Button variant="ghost" size="sm" className="min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 sm:h-8 p-2.5 sm:px-2 sm:py-1 flex items-center justify-center">
                              <Eye className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-atelier-muted hover:text-brand-900" />
                            </Button>
                          </Link>

                          <Button
                            variant="outline"
                            size="sm"
                            disabled={isActionLoading}
                            onClick={() => handleToggleStatus(p.id, isActive)}
                            className="min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 sm:h-8 px-3 py-2 sm:px-2 sm:py-1 text-xs sm:text-[11px]"
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
                        </div>
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