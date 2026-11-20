"use client";

import React from "react";
import { Category, FilterItem } from "../../types";
import { Filter, RotateCcw, X, Check, Sparkles, Flame, Tag } from "lucide-react";

export interface CatalogFiltersProps {
  categories: Category[];
  selectedCategorySlug: string;
  onSelectCategorySlug: (slug: string) => void;
  selectedSizes: string[];
  onToggleSize: (code: string) => void;
  selectedHeights: string[];
  onToggleHeight: (code: string) => void;
  selectedFormats: string[];
  onToggleFormat: (code: string) => void;
  selectedDifficulties: string[];
  onToggleDifficulty: (level: string) => void;
  isNewOnly: boolean;
  onToggleNewOnly: () => void;
  isBestsellerOnly: boolean;
  onToggleBestsellerOnly: () => void;
  hasDiscountOnly: boolean;
  onToggleDiscountOnly: () => void;
  availableSizes?: Array<FilterItem | string>;
  availableHeights?: Array<FilterItem | string>;
  availableFormats?: Array<FilterItem | string>;
  availableDifficulties?: string[];
  activeCount: number;
  onReset: () => void;
  isMobileDrawerOpen?: boolean;
  onCloseMobileDrawer?: () => void;
}

const getFilterCode = (item: any): string =>
  typeof item === "object" ? item?.code || item?.id || "" : String(item);

const getFilterLabel = (item: any): string =>
  typeof item === "object" ? item?.label || item?.code || "" : String(item);

// Filter out legacy seed codes like C44-187144, C170-187144, CA4-187144
const isLegacySeedCode = (code: string): boolean => /^C[0-9A-Z]+-\d+$/i.test(code);

const DIFFICULTY_MAP: Record<string, { label: string; activeClass: string }> = {
  BEGINNER: {
    label: "Для начинающих",
    activeClass: "bg-emerald-900 text-white border-emerald-900",
  },
  INTERMEDIATE: {
    label: "Средняя сложность",
    activeClass: "bg-amber-900 text-white border-amber-900",
  },
  ADVANCED: {
    label: "Продвинутый",
    activeClass: "bg-rose-900 text-white border-rose-900",
  },
};

export function CatalogFilters({
  categories,
  selectedCategorySlug,
  onSelectCategorySlug,
  selectedSizes,
  onToggleSize,
  selectedHeights,
  onToggleHeight,
  selectedFormats,
  onToggleFormat,
  selectedDifficulties,
  onToggleDifficulty,
  isNewOnly,
  onToggleNewOnly,
  isBestsellerOnly,
  onToggleBestsellerOnly,
  hasDiscountOnly,
  onToggleDiscountOnly,
  availableSizes = ["40", "42", "44", "46", "48", "50", "52", "54", "56", "58", "60", "ALL"],
  availableHeights = ["158-164", "164-170", "170-176"],
  availableFormats = ["A4", "PLOTTER_900", "LETTER"],
  availableDifficulties = ["BEGINNER", "INTERMEDIATE", "ADVANCED"],
  activeCount,
  onReset,
  isMobileDrawerOpen = false,
  onCloseMobileDrawer,
}: CatalogFiltersProps) {
  // Deduplicate and clean sizes
  const cleanSizes = React.useMemo(() => {
    const seen = new Set<string>();
    const result: { code: string; label: string }[] = [];
    for (const item of availableSizes) {
      const code = getFilterCode(item);
      if (!code || isLegacySeedCode(code) || seen.has(code)) continue;
      seen.add(code);
      result.push({ code, label: getFilterLabel(item) });
    }
    return result.length > 0
      ? result
      : ["40", "42", "44", "46", "48", "50", "52", "54", "56", "58", "60", "ALL"].map((c) => ({
          code: c,
          label: c,
        }));
  }, [availableSizes]);

  // Deduplicate and clean heights
  const cleanHeights = React.useMemo(() => {
    const seen = new Set<string>();
    const result: { code: string; label: string }[] = [];
    for (const item of availableHeights) {
      const code = getFilterCode(item);
      if (!code || isLegacySeedCode(code) || seen.has(code)) continue;
      seen.add(code);
      result.push({ code, label: getFilterLabel(item) });
    }
    return result.length > 0
      ? result
      : ["158-164", "164-170", "170-176"].map((c) => ({
          code: c,
          label: `${c} см`,
        }));
  }, [availableHeights]);

  // Deduplicate and clean formats
  const cleanFormats = React.useMemo(() => {
    const seen = new Set<string>();
    const result: { code: string; label: string }[] = [];
    for (const item of availableFormats) {
      const code = getFilterCode(item);
      if (!code || isLegacySeedCode(code) || seen.has(code)) continue;
      seen.add(code);
      result.push({ code, label: getFilterLabel(item) });
    }
    return result.length > 0
      ? result
      : [
          { code: "A4", label: "А4 (принтер)" },
          { code: "PLOTTER_900", label: "Плоттер 900 мм" },
          { code: "LETTER", label: "US Letter" },
        ];
  }, [availableFormats]);

  // Shared Filter Sections
  const renderFilterSections = () => (
    <div className="space-y-6">
      {/* Quick Special Badges */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-atelier-muted mb-2.5">
          Специальные подборки
        </h3>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={onToggleNewOnly}
            className={`inline-flex items-center space-x-1.5 px-2.5 py-1.5 text-xs font-medium rounded-sm border transition-all ${
              isNewOnly
                ? "bg-sky-700 text-white border-sky-700 shadow-xs"
                : "bg-white text-atelier-charcoal border-atelier-border hover:border-sky-500"
            }`}
          >
            <Sparkles className="w-3 h-3 text-sky-400" />
            <span>Новинки</span>
          </button>

          <button
            type="button"
            onClick={onToggleBestsellerOnly}
            className={`inline-flex items-center space-x-1.5 px-2.5 py-1.5 text-xs font-medium rounded-sm border transition-all ${
              isBestsellerOnly
                ? "bg-amber-600 text-white border-amber-600 shadow-xs"
                : "bg-white text-atelier-charcoal border-atelier-border hover:border-amber-500"
            }`}
          >
            <Flame className="w-3 h-3 text-amber-300" />
            <span>Хиты продаж</span>
          </button>

          <button
            type="button"
            onClick={onToggleDiscountOnly}
            className={`inline-flex items-center space-x-1.5 px-2.5 py-1.5 text-xs font-medium rounded-sm border transition-all ${
              hasDiscountOnly
                ? "bg-rose-600 text-white border-rose-600 shadow-xs"
                : "bg-white text-atelier-charcoal border-atelier-border hover:border-rose-500"
            }`}
          >
            <Tag className="w-3 h-3 text-rose-300" />
            <span>Со скидкой</span>
          </button>
        </div>
      </div>

      {/* Categories */}
      <div className="pt-4 border-t border-atelier-border/60">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-atelier-muted mb-2.5">
          Категории
        </h3>
        <ul className="space-y-1 text-sm">
          <li>
            <button
              type="button"
              onClick={() => onSelectCategorySlug("")}
              className={`w-full text-left px-2.5 py-1.5 rounded-sm transition-colors text-xs flex items-center justify-between ${
                !selectedCategorySlug
                  ? "bg-brand-900 font-semibold text-white"
                  : "text-atelier-charcoal hover:bg-atelier-subtle"
              }`}
            >
              <span>Все категории</span>
              {!selectedCategorySlug && <Check className="w-3.5 h-3.5" />}
            </button>
          </li>
          {categories.map((cat) => {
            const catLabel = cat.title || cat.name || "Категория";
            const isDressSlug = (s: string) => s === "platya" || s === "plate";
            const isParentSelected =
              selectedCategorySlug === cat.slug ||
              (isDressSlug(selectedCategorySlug) &&
                (isDressSlug(cat.slug) || (cat.title || "").toLowerCase().includes("плать")));

            const hasChildren = Boolean(cat.children && cat.children.length > 0);
            const hasSelectedChild = Boolean(
              hasChildren &&
                cat.children!.some(
                  (ch) =>
                    selectedCategorySlug === ch.slug ||
                    (isDressSlug(selectedCategorySlug) &&
                      (isDressSlug(ch.slug) || (ch.title || "").toLowerCase().includes("плать")))
                )
            );

            return (
              <li key={cat.id} className="space-y-0.5">
                <button
                  type="button"
                  onClick={() => onSelectCategorySlug(isParentSelected ? "" : cat.slug)}
                  className={`w-full text-left px-2.5 py-1.5 rounded-sm transition-colors text-xs flex items-center justify-between ${
                    isParentSelected
                      ? "bg-brand-900 font-semibold text-white"
                      : hasSelectedChild
                      ? "bg-brand-50 text-brand-900 font-semibold"
                      : "text-atelier-charcoal hover:bg-atelier-subtle font-medium"
                  }`}
                >
                  <span className="truncate pr-2">{catLabel}</span>
                  {isParentSelected && <Check className="w-3.5 h-3.5 shrink-0" />}
                </button>

                {hasChildren && (
                  <ul className="pl-3.5 border-l-2 border-brand-100/80 my-1 space-y-0.5">
                    {cat.children!.map((child) => {
                      const childLabel = child.title || child.name || child.slug;
                      const isChildSelected =
                        selectedCategorySlug === child.slug ||
                        (isDressSlug(selectedCategorySlug) &&
                          (isDressSlug(child.slug) ||
                            (child.title || "").toLowerCase().includes("плать")));

                      return (
                        <li key={child.id}>
                          <button
                            type="button"
                            onClick={() =>
                              onSelectCategorySlug(isChildSelected ? "" : child.slug)
                            }
                            className={`w-full text-left px-2 py-1 rounded-sm transition-colors text-[11px] flex items-center justify-between ${
                              isChildSelected
                                ? "bg-brand-900 font-semibold text-white"
                                : "text-atelier-muted hover:text-brand-950 hover:bg-atelier-subtle"
                            }`}
                          >
                            <span className="truncate pr-1">{childLabel}</span>
                            {isChildSelected && <Check className="w-3 h-3 shrink-0" />}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {/* Sewing Difficulty Level */}
      <div className="pt-4 border-t border-atelier-border/60">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-atelier-muted mb-2.5">
          Уровень сложности
        </h3>
        <div className="space-y-1.5">
          {availableDifficulties.map((level) => {
            const isSelected = selectedDifficulties.includes(level);
            const conf = DIFFICULTY_MAP[level] || {
              label: level,
              activeClass: "bg-brand-900 text-white border-brand-900",
            };
            return (
              <button
                key={level}
                type="button"
                onClick={() => onToggleDifficulty(level)}
                className={`w-full text-left px-2.5 py-1.5 text-xs rounded-sm border transition-all flex items-center justify-between ${
                  isSelected
                    ? `${conf.activeClass} font-semibold shadow-xs`
                    : "border-atelier-border bg-white text-atelier-charcoal hover:bg-atelier-subtle"
                }`}
              >
                <span>{conf.label}</span>
                {isSelected && <Check className="w-3.5 h-3.5" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Sizes (RU) */}
      <div className="pt-4 border-t border-atelier-border/60">
        <div className="flex items-center justify-between mb-2.5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-atelier-muted">
            Размер (RU)
          </h3>
          {selectedSizes.length > 0 && (
            <span className="text-[10px] text-brand-700 font-mono">
              Выбрано: {selectedSizes.length}
            </span>
          )}
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {cleanSizes.map(({ code, label }) => {
            const isSelected = selectedSizes.includes(code);
            return (
              <button
                key={code}
                type="button"
                onClick={() => onToggleSize(code)}
                className={`h-8 px-1 text-xs font-medium border rounded-sm transition-all truncate text-center ${
                  isSelected
                    ? "bg-brand-900 text-white border-brand-900 font-bold shadow-xs"
                    : "border-atelier-border bg-white text-atelier-charcoal hover:border-brand-500"
                }`}
                title={label}
              >
                {code}
              </button>
            );
          })}
        </div>
      </div>

      {/* Heights */}
      <div className="pt-4 border-t border-atelier-border/60">
        <div className="flex items-center justify-between mb-2.5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-atelier-muted">
            Ростовая группа
          </h3>
          {selectedHeights.length > 0 && (
            <span className="text-[10px] text-brand-700 font-mono">
              {selectedHeights.length}
            </span>
          )}
        </div>
        <div className="space-y-1.5">
          {cleanHeights.map(({ code, label }) => {
            const isSelected = selectedHeights.includes(code);
            const displayLabel = label.includes("см") ? label : `${label} см`;
            return (
              <button
                key={code}
                type="button"
                onClick={() => onToggleHeight(code)}
                className={`w-full text-left px-2.5 py-1.5 text-xs rounded-sm border transition-all flex items-center justify-between ${
                  isSelected
                    ? "bg-brand-900 text-white border-brand-900 font-semibold shadow-xs"
                    : "border-atelier-border bg-white text-atelier-charcoal hover:bg-atelier-subtle"
                }`}
              >
                <span>{displayLabel}</span>
                {isSelected && <Check className="w-3.5 h-3.5" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Formats */}
      <div className="pt-4 border-t border-atelier-border/60">
        <div className="flex items-center justify-between mb-2.5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-atelier-muted">
            Формат печати
          </h3>
          {selectedFormats.length > 0 && (
            <span className="text-[10px] text-brand-700 font-mono">
              {selectedFormats.length}
            </span>
          )}
        </div>
        <div className="space-y-1.5">
          {cleanFormats.map(({ code, label }) => {
            const isSelected = selectedFormats.includes(code);
            return (
              <button
                key={code}
                type="button"
                onClick={() => onToggleFormat(code)}
                className={`w-full text-left px-2.5 py-1.5 text-xs rounded-sm border transition-all flex items-center justify-between ${
                  isSelected
                    ? "bg-brand-900 text-white border-brand-900 font-semibold shadow-xs"
                    : "border-atelier-border bg-white text-atelier-charcoal hover:bg-atelier-subtle"
                }`}
              >
                <span>{label}</span>
                {isSelected && <Check className="w-3.5 h-3.5" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* DESKTOP SIDEBAR (hidden on mobile < lg) */}
      <aside className="hidden lg:block w-full bg-white p-5 border border-atelier-border rounded-sm sticky top-28 shadow-xs">
        <div className="flex items-center justify-between border-b border-atelier-border pb-3.5 mb-5">
          <div className="flex items-center space-x-2">
            <Filter className="w-4 h-4 text-atelier-charcoal" />
            <h2 className="text-xs font-bold tracking-widest uppercase text-atelier-charcoal">
              Фильтры
            </h2>
            {activeCount > 0 && (
              <span className="px-1.5 py-0.2 text-[10px] font-mono font-bold bg-brand-100 text-brand-900 rounded-sm">
                {activeCount}
              </span>
            )}
          </div>
          {activeCount > 0 && (
            <button
              type="button"
              onClick={onReset}
              className="text-xs text-brand-700 hover:text-brand-950 flex items-center space-x-1 font-medium transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Сбросить</span>
            </button>
          )}
        </div>

        {renderFilterSections()}
      </aside>

      {/* MOBILE DRAWER / SLIDE-OVER (Visible on screens < lg when opened) */}
      {isMobileDrawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50 overflow-hidden">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
            onClick={onCloseMobileDrawer}
            aria-hidden="true"
          />

          {/* Drawer Panel */}
          <div className="fixed inset-y-0 right-0 max-w-full w-full sm:max-w-md bg-white shadow-2xl flex flex-col z-50 transform transition-transform animate-in slide-in-from-right duration-300">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-atelier-border bg-atelier-surface shrink-0">
              <div className="flex items-center space-x-2">
                <Filter className="w-4 h-4 text-atelier-charcoal" />
                <h2 className="text-sm font-serif font-bold text-brand-950">
                  Фильтры каталога
                </h2>
                {activeCount > 0 && (
                  <span className="px-2 py-0.5 text-xs font-mono font-bold bg-brand-900 text-white rounded-full">
                    {activeCount}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={onCloseMobileDrawer}
                className="p-1.5 text-atelier-muted hover:text-brand-950 rounded-sm hover:bg-white transition-colors"
                aria-label="Закрыть фильтры"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-5 pb-24">
              {renderFilterSections()}
            </div>

            {/* Sticky Footer */}
            <div className="p-4 border-t border-atelier-border bg-white flex items-center gap-3 shrink-0">
              {activeCount > 0 && (
                <button
                  type="button"
                  onClick={onReset}
                  className="w-1/3 py-2.5 px-3 border border-atelier-border text-xs font-semibold uppercase tracking-wider text-atelier-charcoal hover:bg-atelier-surface rounded-sm transition-colors text-center"
                >
                  Сбросить
                </button>
              )}
              <button
                type="button"
                onClick={onCloseMobileDrawer}
                className={`py-2.5 px-4 bg-brand-900 text-white text-xs font-semibold uppercase tracking-wider hover:bg-brand-950 rounded-sm transition-colors shadow-sm text-center ${
                  activeCount > 0 ? "w-2/3" : "w-full"
                }`}
              >
                Применить
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
