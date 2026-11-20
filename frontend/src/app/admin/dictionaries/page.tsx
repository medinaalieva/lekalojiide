"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../../../lib/api";
import { HeightItem, FormatItem } from "../../../types";
import { Button } from "../../../components/ui/Button";
import {
  SlidersHorizontal,
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
  Printer,
  Ruler,
  AlertTriangle,
  Info,
  Power,
  Package,
} from "lucide-react";

type ActiveTab = "heights" | "formats";

export default function AdminDictionariesPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("heights");

  // Heights State
  const [heights, setHeights] = useState<HeightItem[]>([]);
  const [isHeightsLoading, setIsHeightsLoading] = useState(true);

  // Formats State
  const [formats, setFormats] = useState<FormatItem[]>([]);
  const [isFormatsLoading, setIsFormatsLoading] = useState(true);

  // General Page Messages
  const [pageError, setPageError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Height Modal State (Add / Edit)
  const [isHeightModalOpen, setIsHeightModalOpen] = useState(false);
  const [editingHeight, setEditingHeight] = useState<HeightItem | null>(null);
  const [heightCode, setHeightCode] = useState("");
  const [heightLabel, setHeightLabel] = useState("");
  const [heightMin, setHeightMin] = useState<string>("");
  const [heightMax, setHeightMax] = useState<string>("");
  const [heightOrder, setHeightOrder] = useState<number>(0);
  const [heightIsActive, setHeightIsActive] = useState<boolean>(true);
  const [heightModalError, setHeightModalError] = useState<string | null>(null);
  const [isHeightSubmitting, setIsHeightSubmitting] = useState(false);

  // Format Modal State (Add / Edit)
  const [isFormatModalOpen, setIsFormatModalOpen] = useState(false);
  const [editingFormat, setEditingFormat] = useState<FormatItem | null>(null);
  const [formatCode, setFormatCode] = useState("");
  const [formatLabel, setFormatLabel] = useState("");
  const [formatDescription, setFormatDescription] = useState("");
  const [formatMaxWidth, setFormatMaxWidth] = useState<string>("");
  const [formatOrder, setFormatOrder] = useState<number>(0);
  const [formatIsActive, setFormatIsActive] = useState<boolean>(true);
  const [formatModalError, setFormatModalError] = useState<string | null>(null);
  const [isFormatSubmitting, setIsFormatSubmitting] = useState(false);

  // Delete Confirmation Modal State
  const [deleteTarget, setDeleteTarget] = useState<{
    type: "height" | "format";
    id: string;
    code: string;
    label: string;
    variantsCount: number;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // ===========================================================================
  // DATA FETCHING
  // ===========================================================================

  const fetchHeights = async () => {
    setIsHeightsLoading(true);
    setPageError(null);
    try {
      const res = await api.get<{ success: boolean; data: HeightItem[] }>(
        "/api/v1/admin/heights"
      );
      if (res.success && Array.isArray(res.data)) {
        setHeights(res.data);
      }
    } catch (err: any) {
      setPageError(err?.message || "Не удалось загрузить справочник ростовок");
    } finally {
      setIsHeightsLoading(false);
    }
  };

  const fetchFormats = async () => {
    setIsFormatsLoading(true);
    setPageError(null);
    try {
      const res = await api.get<{ success: boolean; data: FormatItem[] }>(
        "/api/v1/admin/formats"
      );
      if (res.success && Array.isArray(res.data)) {
        setFormats(res.data);
      }
    } catch (err: any) {
      setPageError(err?.message || "Не удалось загрузить справочник форматов");
    } finally {
      setIsFormatsLoading(false);
    }
  };

  useEffect(() => {
    fetchHeights();
    fetchFormats();
  }, []);

  // Clear success notification after 4s
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  // ===========================================================================
  // HEIGHT ACTIONS
  // ===========================================================================

  const openAddHeightModal = () => {
    setEditingHeight(null);
    setHeightCode("");
    setHeightLabel("");
    setHeightMin("");
    setHeightMax("");
    setHeightOrder(heights.length > 0 ? Math.max(...heights.map((h) => h.displayOrder)) + 1 : 1);
    setHeightIsActive(true);
    setHeightModalError(null);
    setIsHeightModalOpen(true);
  };

  const openEditHeightModal = (h: HeightItem) => {
    setEditingHeight(h);
    setHeightCode(h.code);
    setHeightLabel(h.label);
    setHeightMin(h.minHeight != null ? String(h.minHeight) : "");
    setHeightMax(h.maxHeight != null ? String(h.maxHeight) : "");
    setHeightOrder(h.displayOrder);
    setHeightIsActive(h.isActive);
    setHeightModalError(null);
    setIsHeightModalOpen(true);
  };

  const handleHeightSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setHeightModalError(null);

    const minH = heightMin.trim() ? parseInt(heightMin.trim(), 10) : null;
    const maxH = heightMax.trim() ? parseInt(heightMax.trim(), 10) : null;

    if (minH != null && maxH != null && minH > maxH) {
      setHeightModalError("Нижняя граница роста не может превышать верхнюю границу");
      return;
    }

    setIsHeightSubmitting(true);
    try {
      if (editingHeight) {
        // Update
        const payload: any = {
          code: heightCode.trim(),
          label: heightLabel.trim(),
          minHeight: minH,
          maxHeight: maxH,
          displayOrder: heightOrder,
          isActive: heightIsActive,
        };
        const res = await api.put<{ success: boolean; data: HeightItem }>(
          `/api/v1/admin/heights/${editingHeight.id}`,
          payload
        );
        if (res.success) {
          setSuccessMessage(`Ростовка «${res.data.label}» успешно обновлена`);
          setIsHeightModalOpen(false);
          fetchHeights();
        }
      } else {
        // Create
        const payload = {
          code: heightCode.trim(),
          label: heightLabel.trim(),
          minHeight: minH,
          maxHeight: maxH,
          displayOrder: heightOrder,
          isActive: heightIsActive,
        };
        const res = await api.post<{ success: boolean; data: HeightItem }>(
          "/api/v1/admin/heights",
          payload
        );
        if (res.success) {
          setSuccessMessage(`Ростовка «${res.data.label}» успешно создана`);
          setIsHeightModalOpen(false);
          fetchHeights();
        }
      }
    } catch (err: any) {
      setHeightModalError(err?.message || "Ошибка при сохранении ростовки");
    } finally {
      setIsHeightSubmitting(false);
    }
  };

  const toggleHeightActive = async (h: HeightItem) => {
    try {
      const res = await api.patch<{ success: boolean; data: HeightItem }>(
        `/api/v1/admin/heights/${h.id}/toggle-active`,
        { isActive: !h.isActive }
      );
      if (res.success) {
        setSuccessMessage(
          `Ростовка «${h.code}» ${!h.isActive ? "активирована" : "деактивирована"}`
        );
        fetchHeights();
      }
    } catch (err: any) {
      setPageError(err?.message || "Ошибка переключения статуса ростовки");
    }
  };

  // ===========================================================================
  // FORMAT ACTIONS
  // ===========================================================================

  const openAddFormatModal = () => {
    setEditingFormat(null);
    setFormatCode("");
    setFormatLabel("");
    setFormatDescription("");
    setFormatMaxWidth("");
    setFormatOrder(formats.length > 0 ? Math.max(...formats.map((f) => f.displayOrder)) + 1 : 1);
    setFormatIsActive(true);
    setFormatModalError(null);
    setIsFormatModalOpen(true);
  };

  const openEditFormatModal = (f: FormatItem) => {
    setEditingFormat(f);
    setFormatCode(f.code);
    setFormatLabel(f.label);
    setFormatDescription(f.description || "");
    setFormatMaxWidth(f.maxPrintWidth != null ? String(f.maxPrintWidth) : "");
    setFormatOrder(f.displayOrder);
    setFormatIsActive(f.isActive);
    setFormatModalError(null);
    setIsFormatModalOpen(true);
  };

  const handleFormatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormatModalError(null);

    const maxWidth = formatMaxWidth.trim() ? parseInt(formatMaxWidth.trim(), 10) : null;

    setIsFormatSubmitting(true);
    try {
      if (editingFormat) {
        // Update
        const payload: any = {
          code: formatCode.trim(),
          label: formatLabel.trim(),
          description: formatDescription.trim() || null,
          maxPrintWidth: maxWidth,
          displayOrder: formatOrder,
          isActive: formatIsActive,
        };
        const res = await api.put<{ success: boolean; data: FormatItem }>(
          `/api/v1/admin/formats/${editingFormat.id}`,
          payload
        );
        if (res.success) {
          setSuccessMessage(`Формат «${res.data.label}» успешно обновлен`);
          setIsFormatModalOpen(false);
          fetchFormats();
        }
      } else {
        // Create
        const payload = {
          code: formatCode.trim(),
          label: formatLabel.trim(),
          description: formatDescription.trim() || null,
          maxPrintWidth: maxWidth,
          displayOrder: formatOrder,
          isActive: formatIsActive,
        };
        const res = await api.post<{ success: boolean; data: FormatItem }>(
          "/api/v1/admin/formats",
          payload
        );
        if (res.success) {
          setSuccessMessage(`Формат «${res.data.label}» успешно создан`);
          setIsFormatModalOpen(false);
          fetchFormats();
        }
      }
    } catch (err: any) {
      setFormatModalError(err?.message || "Ошибка при сохранении формата");
    } finally {
      setIsFormatSubmitting(false);
    }
  };

  const toggleFormatActive = async (f: FormatItem) => {
    try {
      const res = await api.patch<{ success: boolean; data: FormatItem }>(
        `/api/v1/admin/formats/${f.id}/toggle-active`,
        { isActive: !f.isActive }
      );
      if (res.success) {
        setSuccessMessage(
          `Формат «${f.code}» ${!f.isActive ? "активирован" : "деактивирован"}`
        );
        fetchFormats();
      }
    } catch (err: any) {
      setPageError(err?.message || "Ошибка переключения статуса формата");
    }
  };

  // ===========================================================================
  // DELETE HANDLING
  // ===========================================================================

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    setDeleteError(null);

    try {
      if (deleteTarget.type === "height") {
        await api.delete(`/api/v1/admin/heights/${deleteTarget.id}`);
        setSuccessMessage(`Ростовка «${deleteTarget.code}» успешно удалена`);
        fetchHeights();
      } else {
        await api.delete(`/api/v1/admin/formats/${deleteTarget.id}`);
        setSuccessMessage(`Формат «${deleteTarget.code}» успешно удален`);
        fetchFormats();
      }
      setDeleteTarget(null);
    } catch (err: any) {
      setDeleteError(err?.message || "Ошибка при удалении элемента справочника");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-atelier-border pb-4">
        <div>
          <span className="text-[10px] uppercase tracking-[0.25em] text-brand-700 font-semibold">
            Конфигурация каталога
          </span>
          <h1 className="font-serif text-2xl font-bold text-brand-950 flex items-center space-x-2">
            <SlidersHorizontal className="w-6 h-6 text-brand-800" />
            <span>Справочники: Ростовки и Форматы</span>
          </h1>
          <p className="text-xs text-atelier-muted mt-1">
            Управление размерно-ростовочными сетками и форматами выкроек без ручного SQL
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (activeTab === "heights") fetchHeights();
              else fetchFormats();
            }}
            disabled={isHeightsLoading || isFormatsLoading}
            className="min-h-[44px] sm:min-h-0 sm:h-9 px-4 sm:px-3 text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isHeightsLoading || isFormatsLoading ? "animate-spin" : ""}`} />
            Обновить
          </Button>

          {activeTab === "heights" ? (
            <Button
              onClick={openAddHeightModal}
              size="sm"
              className="bg-brand-900 hover:bg-brand-950 text-white min-h-[44px] sm:min-h-0 sm:h-9 px-4 sm:px-3 text-xs shadow-sm font-medium"
            >
              <PlusCircle className="w-4 h-4 mr-1.5" />
              Добавить ростовку
            </Button>
          ) : (
            <Button
              onClick={openAddFormatModal}
              size="sm"
              className="bg-brand-900 hover:bg-brand-950 text-white min-h-[44px] sm:min-h-0 sm:h-9 px-4 sm:px-3 text-xs shadow-sm font-medium"
            >
              <PlusCircle className="w-4 h-4 mr-1.5" />
              Добавить формат
            </Button>
          )}
        </div>
      </div>

      {/* Notifications */}
      {pageError && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-sm flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{pageError}</span>
          </div>
          <button onClick={() => setPageError(null)} className="min-h-[44px] min-w-[44px] flex items-center justify-center p-2 text-red-500 hover:text-red-700 rounded-sm">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {successMessage && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-sm flex items-center justify-between animate-fadeIn">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>{successMessage}</span>
          </div>
          <button onClick={() => setSuccessMessage(null)} className="min-h-[44px] min-w-[44px] flex items-center justify-center p-2 text-emerald-600 hover:text-emerald-800 rounded-sm">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Tabs Header */}
      <div className="flex flex-wrap sm:flex-nowrap items-center border-b border-atelier-border gap-1 sm:space-x-2 bg-atelier-surface/50 p-1 rounded-sm">
        <button
          type="button"
          onClick={() => setActiveTab("heights")}
          className={`min-h-[44px] sm:min-h-0 flex items-center space-x-2 px-4 py-2.5 text-xs font-semibold rounded-sm transition-all ${
            activeTab === "heights"
              ? "bg-white text-brand-950 shadow-sm border border-atelier-border"
              : "text-atelier-muted hover:text-brand-950"
          }`}
        >
          <Ruler className="w-4 h-4 text-brand-700" />
          <span>Ростовки</span>
          <span className="ml-1.5 px-1.5 py-0.2 text-[10px] rounded-full bg-brand-100 text-brand-900 font-mono">
            {heights.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("formats")}
          className={`min-h-[44px] sm:min-h-0 flex items-center space-x-2 px-4 py-2.5 text-xs font-semibold rounded-sm transition-all ${
            activeTab === "formats"
              ? "bg-white text-brand-950 shadow-sm border border-atelier-border"
              : "text-atelier-muted hover:text-brand-950"
          }`}
        >
          <Printer className="w-4 h-4 text-brand-700" />
          <span>Форматы выкроек</span>
          <span className="ml-1.5 px-1.5 py-0.2 text-[10px] rounded-full bg-brand-100 text-brand-900 font-mono">
            {formats.length}
          </span>
        </button>

        <div className="flex-1" />

        <Link href="/admin/sizes">
          <Button variant="ghost" size="sm" className="min-h-[44px] px-3 text-xs text-atelier-muted hover:text-brand-950 sm:h-8 sm:min-h-0 sm:px-2">
            <Layers className="w-3.5 h-3.5 mr-1" />
            Справочник размеров →
          </Button>
        </Link>
      </div>

      {/* TAB 1: HEIGHTS */}
      {activeTab === "heights" && (
        <div className="bg-white border border-atelier-border rounded-sm shadow-sm overflow-hidden">
          <div className="p-4 bg-atelier-surface border-b border-atelier-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-atelier-charcoal flex items-center space-x-1.5">
                <Ruler className="w-4 h-4 text-brand-800" />
                <span>Реестр ростовок (диапазоны роста)</span>
              </h2>
              <p className="text-[11px] text-atelier-muted mt-0.5">
                Активные ростовки предлагаются покупателям в фильтрах каталога и при генерации матриц выкроек
              </p>
            </div>
          </div>

          {isHeightsLoading ? (
            <div className="p-12 text-center text-xs text-atelier-muted flex flex-col items-center justify-center space-y-2">
              <RefreshCw className="w-5 h-5 animate-spin text-brand-700" />
              <span>Загрузка справочника ростовок...</span>
            </div>
          ) : heights.length === 0 ? (
            <div className="p-12 text-center text-xs text-atelier-muted">
              Справочник ростовок пуст. Нажмите «Добавить ростовку», чтобы создать первый диапазон.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-atelier-border bg-atelier-surface text-[10px] font-bold uppercase tracking-wider text-atelier-muted">
                    <th className="py-3 px-4">Порядок</th>
                    <th className="py-3 px-4">Код ростовки</th>
                    <th className="py-3 px-4">Название</th>
                    <th className="py-3 px-4">Диапазон роста (см)</th>
                    <th className="py-3 px-4">Использование</th>
                    <th className="py-3 px-4">Статус</th>
                    <th className="py-3 px-4 text-right">Действия</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-atelier-border font-sans">
                  {heights.map((h) => {
                    const isInUse = (h.variantsCount || 0) > 0;
                    return (
                      <tr
                        key={h.id}
                        className={`hover:bg-atelier-surface/50 transition-colors ${
                          !h.isActive ? "opacity-60 bg-gray-50/50" : ""
                        }`}
                      >
                        <td className="py-3 px-4 font-mono text-atelier-muted">
                          #{h.displayOrder}
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-brand-950">
                          {h.code}
                        </td>
                        <td className="py-3 px-4 font-medium text-brand-950">
                          {h.label}
                        </td>
                        <td className="py-3 px-4 font-mono text-xs">
                          {h.minHeight && h.maxHeight ? (
                            <span className="text-atelier-charcoal font-semibold">
                              {h.minHeight} – {h.maxHeight} см
                            </span>
                          ) : (
                            <span className="text-atelier-muted italic">Не задан</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          {isInUse ? (
                            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-brand-50 text-brand-900 border border-brand-200">
                              <Package className="w-3 h-3 text-brand-700" />
                              <span>{h.variantsCount} вар.</span>
                            </span>
                          ) : (
                            <span className="text-[10px] text-atelier-muted italic">
                              Не используется
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <button
                            type="button"
                            onClick={() => toggleHeightActive(h)}
                            title={h.isActive ? "Нажмите для деактивации" : "Нажмите для активации"}
                            className={`inline-flex items-center min-h-[44px] sm:min-h-0 space-x-1.5 px-3 py-2 sm:px-2 sm:py-0.5 rounded text-xs sm:text-[10px] font-bold uppercase tracking-wider transition-colors ${
                              h.isActive
                                ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                            }`}
                          >
                            <Power className="w-3 h-3 sm:w-2.5 sm:h-2.5" />
                            <span>{h.isActive ? "Активна" : "Неактивна"}</span>
                          </button>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end space-x-1.5">
                            <button
                              type="button"
                              onClick={() => openEditHeightModal(h)}
                              className="min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 sm:w-8 sm:h-8 flex items-center justify-center p-2.5 sm:p-1.5 text-atelier-muted hover:text-brand-900 hover:bg-atelier-surface rounded transition-colors"
                              title="Редактировать ростовку"
                            >
                              <Edit2 className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setDeleteTarget({
                                  type: "height",
                                  id: h.id,
                                  code: h.code,
                                  label: h.label,
                                  variantsCount: h.variantsCount || 0,
                                })
                              }
                              className={`min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 sm:w-8 sm:h-8 flex items-center justify-center p-2.5 sm:p-1.5 rounded transition-colors ${
                                isInUse
                                  ? "text-gray-300 cursor-not-allowed"
                                  : "text-red-500 hover:text-red-700 hover:bg-red-50"
                              }`}
                              title={
                                isInUse
                                  ? "Нельзя удалить ростовку, привязанную к вариантам товаров. Используйте деактивацию."
                                  : "Удалить ростовку"
                              }
                            >
                              <Trash2 className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                            </button>
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
      )}

      {/* TAB 2: FORMATS */}
      {activeTab === "formats" && (
        <div className="bg-white border border-atelier-border rounded-sm shadow-sm overflow-hidden">
          <div className="p-4 bg-atelier-surface border-b border-atelier-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-atelier-charcoal flex items-center space-x-1.5">
                <Printer className="w-4 h-4 text-brand-800" />
                <span>Реестр форматов выкроек</span>
              </h2>
              <p className="text-[11px] text-atelier-muted mt-0.5">
                Форматы печати (А4, Плоттер 900 мм и др.) для генерации лекал и проверки файлов
              </p>
            </div>
          </div>

          {isFormatsLoading ? (
            <div className="p-12 text-center text-xs text-atelier-muted flex flex-col items-center justify-center space-y-2">
              <RefreshCw className="w-5 h-5 animate-spin text-brand-700" />
              <span>Загрузка справочника форматов...</span>
            </div>
          ) : formats.length === 0 ? (
            <div className="p-12 text-center text-xs text-atelier-muted">
              Справочник форматов пуст. Нажмите «Добавить формат», чтобы создать первый формат.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-atelier-border bg-atelier-surface text-[10px] font-bold uppercase tracking-wider text-atelier-muted">
                    <th className="py-3 px-4">Порядок</th>
                    <th className="py-3 px-4">Код формата</th>
                    <th className="py-3 px-4">Название</th>
                    <th className="py-3 px-4">Описание</th>
                    <th className="py-3 px-4">Ширина печати</th>
                    <th className="py-3 px-4">Использование</th>
                    <th className="py-3 px-4">Статус</th>
                    <th className="py-3 px-4 text-right">Действия</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-atelier-border font-sans">
                  {formats.map((f) => {
                    const isInUse = (f.variantsCount || 0) > 0;
                    return (
                      <tr
                        key={f.id}
                        className={`hover:bg-atelier-surface/50 transition-colors ${
                          !f.isActive ? "opacity-60 bg-gray-50/50" : ""
                        }`}
                      >
                        <td className="py-3 px-4 font-mono text-atelier-muted">
                          #{f.displayOrder}
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-brand-950">
                          {f.code}
                        </td>
                        <td className="py-3 px-4 font-medium text-brand-950">
                          {f.label}
                        </td>
                        <td className="py-3 px-4 text-atelier-muted max-w-xs truncate" title={f.description || ""}>
                          {f.description || "—"}
                        </td>
                        <td className="py-3 px-4 font-mono text-xs">
                          {f.maxPrintWidth ? (
                            <span className="text-atelier-charcoal font-semibold">
                              {f.maxPrintWidth} мм
                            </span>
                          ) : (
                            <span className="text-atelier-muted italic">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          {isInUse ? (
                            <div className="flex flex-col space-y-0.5">
                              <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-brand-50 text-brand-900 border border-brand-200">
                                <span>{f.variantsCount} вар.</span>
                              </span>
                              {f.productsCount ? (
                                <span className="text-[10px] text-atelier-muted font-mono">
                                  в {f.productsCount} товарах
                                </span>
                              ) : null}
                            </div>
                          ) : (
                            <span className="text-[10px] text-atelier-muted italic">
                              Не используется
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <button
                            type="button"
                            onClick={() => toggleFormatActive(f)}
                            title={f.isActive ? "Нажмите для деактивации" : "Нажмите для активации"}
                            className={`inline-flex items-center min-h-[44px] sm:min-h-0 space-x-1.5 px-3 py-2 sm:px-2 sm:py-0.5 rounded text-xs sm:text-[10px] font-bold uppercase tracking-wider transition-colors ${
                              f.isActive
                                ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                            }`}
                          >
                            <Power className="w-3 h-3 sm:w-2.5 sm:h-2.5" />
                            <span>{f.isActive ? "Активен" : "Неактивен"}</span>
                          </button>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end space-x-1.5">
                            <button
                              type="button"
                              onClick={() => openEditFormatModal(f)}
                              className="min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 sm:w-8 sm:h-8 flex items-center justify-center p-2.5 sm:p-1.5 text-atelier-muted hover:text-brand-900 hover:bg-atelier-surface rounded transition-colors"
                              title="Редактировать формат"
                            >
                              <Edit2 className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setDeleteTarget({
                                  type: "format",
                                  id: f.id,
                                  code: f.code,
                                  label: f.label,
                                  variantsCount: f.variantsCount || 0,
                                })
                              }
                              className={`min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 sm:w-8 sm:h-8 flex items-center justify-center p-2.5 sm:p-1.5 rounded transition-colors ${
                                isInUse
                                  ? "text-gray-300 cursor-not-allowed"
                                  : "text-red-500 hover:text-red-700 hover:bg-red-50"
                              }`}
                              title={
                                isInUse
                                  ? "Нельзя удалить формат, привязанный к вариантам товаров. Используйте деактивацию."
                                  : "Удалить формат"
                              }
                            >
                              <Trash2 className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                            </button>
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
      )}

      {/* MODAL: ADD / EDIT HEIGHT */}
      {isHeightModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-950/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white border border-atelier-border rounded-sm shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-atelier-border pb-3">
              <h3 className="font-serif text-lg font-bold text-brand-950 flex items-center space-x-2">
                <Ruler className="w-5 h-5 text-brand-800" />
                <span>{editingHeight ? "Редактирование ростовки" : "Новая ростовка"}</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsHeightModalOpen(false)}
                className="text-atelier-muted hover:text-brand-950 min-h-[44px] min-w-[44px] flex items-center justify-center p-2 rounded-sm"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {heightModalError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-sm flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{heightModalError}</span>
              </div>
            )}

            <form onSubmit={handleHeightSubmit} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="block font-semibold text-atelier-charcoal">
                  Код ростовки <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={heightCode}
                  onChange={(e) => setHeightCode(e.target.value)}
                  placeholder="например: 164-170"
                  className="w-full px-3 py-2 border border-atelier-border rounded-sm font-mono uppercase focus:outline-none focus:border-brand-900"
                />
                <span className="text-[10px] text-atelier-muted">
                  Уникальный идентификатор, используемый в SKU лекал
                </span>
              </div>

              <div className="space-y-1">
                <label className="block font-semibold text-atelier-charcoal">
                  Название для витрины <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={heightLabel}
                  onChange={(e) => setHeightLabel(e.target.value)}
                  placeholder="например: 164-170 см"
                  className="w-full px-3 py-2 border border-atelier-border rounded-sm focus:outline-none focus:border-brand-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block font-semibold text-atelier-charcoal">
                    Нижняя граница (см)
                  </label>
                  <input
                    type="number"
                    min="50"
                    max="250"
                    value={heightMin}
                    onChange={(e) => setHeightMin(e.target.value)}
                    placeholder="164"
                    className="w-full px-3 py-2 border border-atelier-border rounded-sm font-mono focus:outline-none focus:border-brand-900"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block font-semibold text-atelier-charcoal">
                    Верхняя граница (см)
                  </label>
                  <input
                    type="number"
                    min="50"
                    max="250"
                    value={heightMax}
                    onChange={(e) => setHeightMax(e.target.value)}
                    placeholder="170"
                    className="w-full px-3 py-2 border border-atelier-border rounded-sm font-mono focus:outline-none focus:border-brand-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block font-semibold text-atelier-charcoal">
                    Порядок сортировки
                  </label>
                  <input
                    type="number"
                    value={heightOrder}
                    onChange={(e) => setHeightOrder(parseInt(e.target.value || "0", 10))}
                    className="w-full px-3 py-2 border border-atelier-border rounded-sm font-mono focus:outline-none focus:border-brand-900"
                  />
                </div>

                <div className="space-y-1 flex flex-col justify-end">
                  <label className="flex items-center space-x-2 py-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={heightIsActive}
                      onChange={(e) => setHeightIsActive(e.target.checked)}
                      className="rounded text-brand-900 focus:ring-brand-900"
                    />
                    <span className="font-semibold text-atelier-charcoal">
                      Активна в каталоге
                    </span>
                  </label>
                </div>
              </div>

              <div className="flex flex-wrap sm:flex-nowrap items-center justify-end gap-2 pt-3 border-t border-atelier-border">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsHeightModalOpen(false)}
                  disabled={isHeightSubmitting}
                  className="min-h-[44px] px-4 text-xs sm:h-9 sm:min-h-0 sm:px-3"
                >
                  Отмена
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isHeightSubmitting}
                  className="bg-brand-900 hover:bg-brand-950 text-white min-h-[44px] px-5 text-xs sm:h-9 sm:min-h-0 sm:px-4 font-medium"
                >
                  {isHeightSubmitting ? "Сохранение..." : "Сохранить ростовку"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD / EDIT FORMAT */}
      {isFormatModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-950/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white border border-atelier-border rounded-sm shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-atelier-border pb-3">
              <h3 className="font-serif text-lg font-bold text-brand-950 flex items-center space-x-2">
                <Printer className="w-5 h-5 text-brand-800" />
                <span>{editingFormat ? "Редактирование формата" : "Новый формат выкроек"}</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsFormatModalOpen(false)}
                className="text-atelier-muted hover:text-brand-950 min-h-[44px] min-w-[44px] flex items-center justify-center p-2 rounded-sm"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formatModalError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-sm flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formatModalError}</span>
              </div>
            )}

            <form onSubmit={handleFormatSubmit} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="block font-semibold text-atelier-charcoal">
                  Код формата <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formatCode}
                  onChange={(e) => setFormatCode(e.target.value)}
                  placeholder="например: PLOTTER_900 или A4"
                  className="w-full px-3 py-2 border border-atelier-border rounded-sm font-mono uppercase focus:outline-none focus:border-brand-900"
                />
                <span className="text-[10px] text-atelier-muted">
                  Используется в кодах файлов и SKU (например: A4, PLOTTER_900)
                </span>
              </div>

              <div className="space-y-1">
                <label className="block font-semibold text-atelier-charcoal">
                  Название для витрины <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formatLabel}
                  onChange={(e) => setFormatLabel(e.target.value)}
                  placeholder="например: Плоттер 900 мм"
                  className="w-full px-3 py-2 border border-atelier-border rounded-sm focus:outline-none focus:border-brand-900"
                />
              </div>

              <div className="space-y-1">
                <label className="block font-semibold text-atelier-charcoal">
                  Описание для покупателей
                </label>
                <textarea
                  rows={2}
                  value={formatDescription}
                  onChange={(e) => setFormatDescription(e.target.value)}
                  placeholder="например: Непрерывная печать на рулонном плоттере без склейки листов"
                  className="w-full px-3 py-2 border border-atelier-border rounded-sm focus:outline-none focus:border-brand-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block font-semibold text-atelier-charcoal">
                    Ширина печати (мм)
                  </label>
                  <input
                    type="number"
                    min="50"
                    max="5000"
                    value={formatMaxWidth}
                    onChange={(e) => setFormatMaxWidth(e.target.value)}
                    placeholder="например: 900"
                    className="w-full px-3 py-2 border border-atelier-border rounded-sm font-mono focus:outline-none focus:border-brand-900"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block font-semibold text-atelier-charcoal">
                    Порядок сортировки
                  </label>
                  <input
                    type="number"
                    value={formatOrder}
                    onChange={(e) => setFormatOrder(parseInt(e.target.value || "0", 10))}
                    className="w-full px-3 py-2 border border-atelier-border rounded-sm font-mono focus:outline-none focus:border-brand-900"
                  />
                </div>
              </div>

              <div className="pt-1">
                <label className="flex items-center space-x-2 py-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formatIsActive}
                    onChange={(e) => setFormatIsActive(e.target.checked)}
                    className="rounded text-brand-900 focus:ring-brand-900"
                  />
                  <span className="font-semibold text-atelier-charcoal">
                    Активен для новых выкроек и фильтрации
                  </span>
                </label>
              </div>

              <div className="flex flex-wrap sm:flex-nowrap items-center justify-end gap-2 pt-3 border-t border-atelier-border">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsFormatModalOpen(false)}
                  disabled={isFormatSubmitting}
                  className="min-h-[44px] px-4 text-xs sm:h-9 sm:min-h-0 sm:px-3"
                >
                  Отмена
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isFormatSubmitting}
                  className="bg-brand-900 hover:bg-brand-950 text-white min-h-[44px] px-5 text-xs sm:h-9 sm:min-h-0 sm:px-4 font-medium"
                >
                  {isFormatSubmitting ? "Сохранение..." : "Сохранить формат"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CONFIRM DELETE MODAL */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-950/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white border border-atelier-border rounded-sm shadow-xl max-w-sm w-full p-6 space-y-4">
            <div className="flex items-center space-x-3 text-red-600">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h3 className="font-bold text-sm text-brand-950">
                Удаление из справочника
              </h3>
            </div>

            {deleteError && (
              <div className="p-2.5 bg-red-50 border border-red-200 text-red-700 text-xs rounded-sm flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{deleteError}</span>
              </div>
            )}

            <p className="text-xs text-atelier-charcoal leading-relaxed">
              Вы уверены, что хотите безвозвратно удалить {deleteTarget.type === "height" ? "ростовку" : "формат"}{" "}
              <strong className="font-mono text-brand-950 font-bold">«{deleteTarget.code}»</strong> ({deleteTarget.label})?
            </p>

            {deleteTarget.variantsCount > 0 && (
              <div className="p-3 bg-amber-50 border border-amber-200 text-amber-900 text-xs rounded-sm space-y-1">
                <div className="font-semibold flex items-center space-x-1">
                  <Lock className="w-3.5 h-3.5 text-amber-700" />
                  <span>Значение используется в {deleteTarget.variantsCount} вариантах!</span>
                </div>
                <p className="text-[11px] text-amber-800">
                  Физическое удаление невозможно для сохранения целостности каталога и заказов. Пожалуйста, используйте переключатель «Деактивировать».
                </p>
              </div>
            )}

            <div className="flex flex-wrap sm:flex-nowrap items-center justify-end gap-2 pt-2 border-t border-atelier-border">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setDeleteTarget(null);
                  setDeleteError(null);
                }}
                disabled={isDeleting}
                className="min-h-[44px] px-4 text-xs sm:h-9 sm:min-h-0 sm:px-3"
              >
                Отмена
              </Button>

              {deleteTarget.variantsCount === 0 && (
                <Button
                  size="sm"
                  onClick={handleDeleteConfirm}
                  disabled={isDeleting}
                  className="bg-red-600 hover:bg-red-700 text-white min-h-[44px] px-5 text-xs sm:h-9 sm:min-h-0 sm:px-4 font-medium"
                >
                  {isDeleting ? "Удаление..." : "Удалить"}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
