"use client";

import React, { useEffect, useState } from "react";
import { api } from "../../../lib/api";
import { Category } from "../../../types";
import { Button } from "../../../components/ui/Button";
import {
  FolderTree,
  PlusCircle,
  Edit,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  X,
  Save,
} from "lucide-react";

export default function AdminCategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal / Form state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [formName, setFormName] = useState("");
  const [formSlug, setFormSlug] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fetchCategories = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.get<{ success: boolean; data: Category[] }>(
        "/api/v1/catalog/categories"
      );
      if (res.success && res.data) {
        setCategories(res.data);
      }
    } catch (err: any) {
      setError(err?.message || "Не удалось загрузить список категорий");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  const openCreateModal = () => {
    setEditingCategory(null);
    setFormName("");
    setFormSlug("");
    setFormDescription("");
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (cat: Category) => {
    setEditingCategory(cat);
    setFormName(cat.name || cat.title || "");
    setFormSlug(cat.slug);
    setFormDescription(cat.description || "");
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formName.trim()) {
      setFormError("Укажите наименование категории");
      return;
    }
    if (!formSlug.trim()) {
      setFormError("Укажите slug категории");
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingCategory) {
        // Edit existing
        await api.put(`/api/v1/admin/categories/${editingCategory.id}`, {
          title: formName.trim(),
          slug: formSlug.trim().toLowerCase(),
          description: formDescription.trim() || undefined,
        });
      } else {
        // Create new
        await api.post("/api/v1/admin/categories", {
          title: formName.trim(),
          slug: formSlug.trim().toLowerCase(),
          description: formDescription.trim() || undefined,
        });
      }

      setIsModalOpen(false);
      fetchCategories();
    } catch (err: any) {
      setFormError(err?.message || "Ошибка при сохранении категории");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-atelier-border pb-6">
        <div>
          <span className="text-[10px] uppercase tracking-[0.25em] text-brand-700 font-semibold">
            Структура каталога
          </span>
          <h1 className="font-serif text-3xl font-bold text-brand-950 mt-1">
            Категории выкроек
          </h1>
          <p className="text-xs text-atelier-muted mt-1">
            Управление иерархией и разделами моделей ателье
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchCategories}
            disabled={isLoading}
            className="text-xs"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 mr-1.5 ${isLoading ? "animate-spin" : ""}`}
            />
            Обновить
          </Button>

          <Button size="sm" onClick={openCreateModal} className="text-xs">
            <PlusCircle className="w-3.5 h-3.5 mr-1.5" />
            Добавить категорию
          </Button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-sm text-xs text-red-800 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
          <Button variant="outline" size="sm" onClick={fetchCategories} className="text-xs">
            Повторить
          </Button>
        </div>
      )}

      {/* Categories Table */}
      <div className="bg-white border border-atelier-border rounded-sm shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="p-12 text-center text-xs text-atelier-muted">
              Загрузка категорий...
            </div>
          ) : categories.length === 0 ? (
            <div className="p-12 text-center text-xs text-atelier-muted space-y-3">
              <FolderTree className="w-8 h-8 mx-auto text-atelier-muted stroke-1" />
              <p>Категории не найдены</p>
              <Button size="sm" onClick={openCreateModal} className="text-xs">
                Создать первую категорию
              </Button>
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-atelier-surface text-atelier-muted uppercase tracking-wider text-[10px] border-b border-atelier-border">
                <tr>
                  <th className="py-3 px-4">Наименование</th>
                  <th className="py-3 px-4">Slug (URL)</th>
                  <th className="py-3 px-4">Описание</th>
                  <th className="py-3 px-4 text-right">Действие</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-atelier-border">
                {categories.map((c) => (
                  <tr key={c.id} className="hover:bg-atelier-subtle transition-colors">
                    <td className="py-3 px-4 font-semibold text-brand-950 flex items-center space-x-2">
                      <FolderTree className="w-4 h-4 text-brand-700 shrink-0" />
                      <span>{c.name || c.title}</span>
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-atelier-muted">
                      /{c.slug}
                    </td>
                    <td className="py-3 px-4 text-atelier-charcoal max-w-md truncate">
                      {c.description || "—"}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEditModal(c)}
                        className="h-7 px-2 text-xs"
                      >
                        <Edit className="w-3.5 h-3.5 mr-1" />
                        Изменить
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Modal / Dialog for Create or Edit Category */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white border border-atelier-border rounded-sm max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-atelier-border pb-3">
              <h3 className="font-serif text-lg font-bold text-brand-950">
                {editingCategory ? "Редактирование категории" : "Новая категория"}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-atelier-muted hover:text-brand-950"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-sm text-xs text-red-800 flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-atelier-charcoal mb-1">
                  Название категории *
                </label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => {
                    setFormName(e.target.value);
                    if (!editingCategory && (!formSlug || formSlug === formName.toLowerCase())) {
                      setFormSlug(
                        e.target.value
                          .toLowerCase()
                          .replace(/[^a-z0-9а-яё]+/gi, "-")
                          .replace(/^-+|-+$/g, "")
                      );
                    }
                  }}
                  placeholder="Платья и сарафаны"
                  className="w-full px-3 py-2 text-xs border border-atelier-border rounded-sm focus:outline-none focus:border-brand-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-atelier-charcoal mb-1">
                  Slug (URL) *
                </label>
                <input
                  type="text"
                  required
                  value={formSlug}
                  onChange={(e) => setFormSlug(e.target.value)}
                  placeholder="platya"
                  className="w-full px-3 py-2 text-xs border border-atelier-border rounded-sm font-mono focus:outline-none focus:border-brand-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-atelier-charcoal mb-1">
                  Описание
                </label>
                <textarea
                  rows={3}
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Выкройки повседневных, вечерних и офисных платьев..."
                  className="w-full px-3 py-2 text-xs border border-atelier-border rounded-sm focus:outline-none focus:border-brand-900"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-atelier-border">
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={isSubmitting}
                  size="sm"
                >
                  Отмена
                </Button>
                <Button type="submit" disabled={isSubmitting} size="sm">
                  <Save className="w-3.5 h-3.5 mr-1.5" />
                  {isSubmitting ? "Сохранение..." : "Сохранить"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
