"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../../../lib/api";
import { Button } from "../../../components/ui/Button";
import {
  Ruler,
  PlusCircle,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Edit2,
  Trash2,
  X,
  Layers,
  ArrowUpDown,
  Lock,
} from "lucide-react";

interface AdminSize {
  id: string;
  code: string;
  label: string;
  displayOrder: number;
  variantsCount: number;
}

export default function AdminSizesPage() {
  const [sizes, setSizes] = useState<AdminSize[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Modal State for Add / Edit
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSize, setEditingSize] = useState<AdminSize | null>(null);
  const [formCode, setFormCode] = useState("");
  const [formLabel, setFormLabel] = useState("");
  const [formDisplayOrder, setFormDisplayOrder] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Deletion State
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchSizes = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.get<{ success: boolean; data: AdminSize[] }>("/api/v1/admin/sizes");
      if (res.success && Array.isArray(res.data)) {
        setSizes(res.data);
      }
    } catch (err: any) {
      setError(err?.message || "Не удалось загрузить справочник размеров");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSizes();
  }, []);

  const openCreateModal = () => {
    setEditingSize(null);
    setFormCode("");
    setFormLabel("");
    const maxOrder = sizes.length > 0 ? Math.max(...sizes.map((s) => (s.code === "ALL" ? 0 : s.displayOrder))) : 0;
    setFormDisplayOrder(maxOrder + 1);
    setModalError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (size: AdminSize) => {
    setEditingSize(size);
    setFormCode(size.code);
    setFormLabel(size.label);
    setFormDisplayOrder(size.displayOrder);
    setModalError(null);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingSize(null);
    setModalError(null);
  };

  const handleSaveSize = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formCode.trim()) {
      setModalError("Укажите код размера (например, 62)");
      return;
    }
    if (!formLabel.trim()) {
      setModalError("Укажите название или мерки (например, 62 (ОГ 124, ОБ 130))");
      return;
    }

    setIsSubmitting(true);
    setModalError(null);

    try {
      if (editingSize) {
        // Update existing size
        await api.put(`/api/v1/admin/sizes/${editingSize.id}`, {
          code: formCode.trim(),
          label: formLabel.trim(),
          displayOrder: Number(formDisplayOrder) || 0,
        });
        setSuccessMessage(`Размер «${formCode.trim()}» успешно обновлен`);
      } else {
        // Create new size
        await api.post("/api/v1/admin/sizes", {
          code: formCode.trim(),
          label: formLabel.trim(),
          displayOrder: Number(formDisplayOrder) || 0,
        });
        setSuccessMessage(`Новый размер «${formCode.trim()}» успешно добавлен в справочник`);
      }

      await fetchSizes();
      closeModal();
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setModalError(err?.message || "Ошибка при сохранении размера");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteSize = async (size: AdminSize) => {
    if (size.variantsCount > 0) {
      setError(`Невозможно удалить размер «${size.code}», так как он используется в ${size.variantsCount} вариантах товаров.`);
      setTimeout(() => setError(null), 5000);
      return;
    }

    if (!confirm(`Вы действительно хотите удалить размер «${size.code} — ${size.label}» из справочника?`)) {
      return;
    }

    setDeletingId(size.id);
    setError(null);

    try {
      await api.delete(`/api/v1/admin/sizes/${size.id}`);
      setSuccessMessage(`Размер «${size.code}» успешно удален`);
      await fetchSizes();
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setError(err?.message || "Не удалось удалить размер");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-atelier-border pb-5">
        <div>
          <div className="flex items-center space-x-2 text-xs uppercase tracking-widest text-atelier-muted mb-1 font-mono">
            <Link href="/admin" className="hover:text-brand-950 transition-colors">
              Админ
            </Link>
            <span>/</span>
            <span className="text-brand-950">Справочники</span>
          </div>
          <h1 className="font-serif text-2xl sm:text-3xl font-bold text-brand-950 flex items-center space-x-3">
            <Ruler className="w-7 h-7 text-brand-700" />
            <span>Справочник размеров</span>
          </h1>
          <p className="text-xs text-atelier-muted mt-1">
            Управление размерной сеткой каталога. Добавленные размеры сразу становятся доступны в генераторе вариантов и карточках товаров.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchSizes} disabled={isLoading} className="min-h-[44px] sm:min-h-0 sm:h-9 px-4 sm:px-3 text-xs">
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isLoading ? "animate-spin" : ""}`} />
            Обновить
          </Button>
          <Button onClick={openCreateModal} size="sm" className="min-h-[44px] sm:min-h-0 sm:h-9 px-4 sm:px-3 text-xs bg-brand-900 hover:bg-brand-950 text-white font-medium shadow-sm">
            <PlusCircle className="w-3.5 h-3.5 mr-1.5" />
            Добавить размер
          </Button>
        </div>
      </div>

      {/* Alerts */}
      {successMessage && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 px-4 py-3 rounded-sm flex items-center justify-between text-xs animate-in fade-in">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button onClick={() => setSuccessMessage(null)} className="min-h-[44px] min-w-[44px] flex items-center justify-center p-2 text-emerald-700 hover:text-emerald-950 rounded-sm">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-900 px-4 py-3 rounded-sm flex items-center justify-between text-xs animate-in fade-in">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="min-h-[44px] min-w-[44px] flex items-center justify-center p-2 text-red-700 hover:text-red-950 rounded-sm">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Stats Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-atelier-border p-4 rounded-sm shadow-sm">
          <div className="text-[11px] font-mono uppercase tracking-wider text-atelier-muted">Всего размеров</div>
          <div className="text-2xl font-bold font-serif text-brand-950 mt-1">{sizes.length}</div>
          <div className="text-[11px] text-atelier-muted mt-0.5">Включая системный комплект ALL</div>
        </div>

        <div className="bg-white border border-atelier-border p-4 rounded-sm shadow-sm">
          <div className="text-[11px] font-mono uppercase tracking-wider text-atelier-muted">Используются в выкройках</div>
          <div className="text-2xl font-bold font-serif text-emerald-700 mt-1">
            {sizes.filter((s) => s.variantsCount > 0).length}
          </div>
          <div className="text-[11px] text-atelier-muted mt-0.5">Привязаны к активным карточкам товаров</div>
        </div>

        <div className="bg-white border border-atelier-border p-4 rounded-sm shadow-sm">
          <div className="text-[11px] font-mono uppercase tracking-wider text-atelier-muted">Свободных для удаления</div>
          <div className="text-2xl font-bold font-serif text-brand-700 mt-1">
            {sizes.filter((s) => s.variantsCount === 0).length}
          </div>
          <div className="text-[11px] text-atelier-muted mt-0.5">Новые или резервные размеры</div>
        </div>
      </div>

      {/* Sizes Table */}
      <div className="bg-white border border-atelier-border rounded-sm shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-atelier-border bg-brand-50/40 flex items-center justify-between">
          <span className="text-xs uppercase tracking-wider font-semibold text-brand-950 flex items-center space-x-2">
            <Layers className="w-4 h-4 text-brand-600" />
            <span>Размерный ряд LEKALO ZHIIDE</span>
          </span>
          <span className="text-[11px] text-atelier-muted font-mono">
            {sizes.length} записей
          </span>
        </div>

        {isLoading ? (
          <div className="py-16 text-center text-atelier-muted text-xs flex flex-col items-center justify-center space-y-3">
            <div className="w-8 h-8 border-2 border-brand-200 border-t-brand-800 rounded-full animate-spin" />
            <span>Загрузка справочника размеров...</span>
          </div>
        ) : sizes.length === 0 ? (
          <div className="py-12 text-center text-atelier-muted text-xs">
            Размеры не найдены. Нажмите «Добавить размер», чтобы создать первую запись.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-atelier-surface/80 text-atelier-muted text-[10px] uppercase font-mono tracking-wider border-b border-atelier-border">
                <tr>
                  <th className="py-3 px-4 w-16 text-center">Порядок</th>
                  <th className="py-3 px-4 w-28">Код</th>
                  <th className="py-3 px-4">Название и обхваты</th>
                  <th className="py-3 px-4 w-40 text-center">Использование</th>
                  <th className="py-3 px-4 w-32 text-right">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-atelier-border">
                {sizes.map((s) => {
                  const isBundleAll = s.code === "ALL";
                  return (
                    <tr
                      key={s.id}
                      className={`hover:bg-brand-50/30 transition-colors ${
                        isBundleAll ? "bg-amber-50/30 font-medium" : ""
                      }`}
                    >
                      <td className="py-3 px-4 text-center font-mono text-atelier-muted">
                        {s.displayOrder}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded font-mono text-xs font-semibold ${
                            isBundleAll
                              ? "bg-amber-100 text-amber-900 border border-amber-300"
                              : "bg-brand-100 text-brand-950"
                          }`}
                        >
                          {s.code}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-brand-950">
                        <span>{s.label}</span>
                        {isBundleAll && (
                          <span className="ml-2 text-[10px] text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                            Системный комплект
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {s.variantsCount > 0 ? (
                          <span className="inline-flex items-center text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                            {s.variantsCount} вар.
                          </span>
                        ) : (
                          <span className="inline-flex items-center text-[11px] font-mono px-2 py-0.5 rounded bg-zinc-100 text-zinc-500">
                            0 вар.
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end space-x-1.5">
                          <button
                            onClick={() => openEditModal(s)}
                            className="min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 sm:w-8 sm:h-8 flex items-center justify-center p-2.5 sm:p-1 text-atelier-muted hover:text-brand-900 transition-colors rounded hover:bg-brand-50"
                            title="Редактировать размер"
                          >
                            <Edit2 className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                          </button>

                          {isBundleAll ? (
                            <span
                              className="min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 sm:w-8 sm:h-8 flex items-center justify-center p-2.5 sm:p-1 text-zinc-300 cursor-not-allowed"
                              title="Системный размер ALL защищён от удаления"
                            >
                              <Lock className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                            </span>
                          ) : (
                            <button
                              onClick={() => handleDeleteSize(s)}
                              disabled={deletingId === s.id || s.variantsCount > 0}
                              className={`min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 sm:w-8 sm:h-8 flex items-center justify-center p-2.5 sm:p-1 transition-colors rounded ${
                                s.variantsCount > 0
                                  ? "text-zinc-300 cursor-not-allowed hover:bg-transparent"
                                  : "text-red-500 hover:text-red-700 hover:bg-red-50"
                              }`}
                              title={
                                s.variantsCount > 0
                                  ? `Нельзя удалить: используется в ${s.variantsCount} вариантах`
                                  : "Удалить размер"
                              }
                            >
                              <Trash2 className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Add / Edit */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-brand-950/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-atelier-border rounded-sm max-w-md w-full p-6 shadow-xl space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-atelier-border pb-3">
              <h2 className="font-serif text-lg font-bold text-brand-950 flex items-center space-x-2">
                <Ruler className="w-5 h-5 text-brand-700" />
                <span>{editingSize ? "Редактирование размера" : "Новый размер"}</span>
              </h2>
              <button
                onClick={closeModal}
                className="text-atelier-muted hover:text-brand-950 min-h-[44px] min-w-[44px] flex items-center justify-center p-2 rounded-sm"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {modalError && (
              <div className="bg-red-50 border border-red-200 text-red-900 px-3 py-2 rounded text-xs flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleSaveSize} className="space-y-4 text-xs">
              <div>
                <label className="block text-brand-950 font-medium mb-1">
                  Код размера <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formCode}
                  onChange={(e) => setFormCode(e.target.value)}
                  placeholder="Например: 62 или 44-46"
                  disabled={editingSize?.code === "ALL"}
                  className="w-full px-3 py-2 border border-atelier-border rounded-sm focus:outline-none focus:border-brand-900 font-mono text-xs uppercase"
                  required
                />
                <p className="text-[11px] text-atelier-muted mt-1">
                  Уникальный идентификатор размера для артикула (SKU).
                </p>
              </div>

              <div>
                <label className="block text-brand-950 font-medium mb-1">
                  Название и мерки <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formLabel}
                  onChange={(e) => setFormLabel(e.target.value)}
                  placeholder="Например: 62 (ОГ 124, ОБ 130)"
                  className="w-full px-3 py-2 border border-atelier-border rounded-sm focus:outline-none focus:border-brand-900 text-xs"
                  required
                />
                <p className="text-[11px] text-atelier-muted mt-1">
                  Отображается покупателю в выпадающем списке и карточке товара.
                </p>
              </div>

              <div>
                <label className="block text-brand-950 font-medium mb-1">
                  Порядок отображения в каталоге
                </label>
                <input
                  type="number"
                  value={formDisplayOrder}
                  onChange={(e) => setFormDisplayOrder(Number(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-atelier-border rounded-sm focus:outline-none focus:border-brand-900 font-mono text-xs"
                />
                <p className="text-[11px] text-atelier-muted mt-1">
                  Меньшее число отображается раньше (например: 1, 2, 3...). Комплект ALL обычно имеет 999.
                </p>
              </div>

              <div className="pt-3 border-t border-atelier-border flex flex-wrap sm:flex-nowrap items-center justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={closeModal} className="min-h-[44px] px-4 text-xs sm:h-9 sm:min-h-0 sm:px-3">
                  Отмена
                </Button>
                <Button type="submit" size="sm" disabled={isSubmitting} className="min-h-[44px] px-5 text-xs sm:h-9 sm:min-h-0 sm:px-4 bg-brand-900 hover:bg-brand-950 text-white font-medium">
                  {isSubmitting ? "Сохранение..." : editingSize ? "Сохранить изменения" : "Добавить размер"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
