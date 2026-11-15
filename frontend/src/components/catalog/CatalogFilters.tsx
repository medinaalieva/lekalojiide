"use client";

import React from "react";
import { Category, FilterItem } from "../../types";
import { Filter, RotateCcw } from "lucide-react";

interface CatalogFiltersProps {
  categories: Category[];
  selectedCategory: string;
  onSelectCategory: (categoryId: string) => void;
  selectedSize: string;
  onSelectSize: (size: string) => void;
  selectedHeight: string;
  onSelectHeight: (height: string) => void;
  selectedFormat: string;
  onSelectFormat: (format: string) => void;
  availableSizes?: Array<FilterItem | string>;
  availableHeights?: Array<FilterItem | string>;
  availableFormats?: Array<FilterItem | string>;
  onReset: () => void;
}

const getFilterCode = (item: any): string =>
  typeof item === "object" ? item?.code || item?.id || "" : String(item);

const getFilterLabel = (item: any): string =>
  typeof item === "object" ? item?.label || item?.code || "" : String(item);

export function CatalogFilters({
  categories,
  selectedCategory,
  onSelectCategory,
  selectedSize,
  onSelectSize,
  selectedHeight,
  onSelectHeight,
  selectedFormat,
  onSelectFormat,
  availableSizes = ["40", "42", "44", "46", "48", "50", "52", "54"],
  availableHeights = ["158-164", "164-170", "170-176"],
  availableFormats = ["A4", "PLOTTER_900", "PLOTTER_600"],
  onReset,
}: CatalogFiltersProps) {
  const hasActiveFilters =
    Boolean(selectedCategory) ||
    Boolean(selectedSize) ||
    Boolean(selectedHeight) ||
    Boolean(selectedFormat);

  return (
    <aside className="w-full space-y-6 bg-white p-5 border border-atelier-border rounded-sm">
      <div className="flex items-center justify-between border-b border-atelier-border pb-3">
        <div className="flex items-center space-x-2">
          <Filter className="w-4 h-4 text-atelier-charcoal" />
          <h2 className="text-sm font-semibold tracking-wider uppercase text-atelier-charcoal">
            Фильтры
          </h2>
        </div>
        {hasActiveFilters && (
          <button
            onClick={onReset}
            className="text-xs text-brand-700 hover:text-brand-950 flex items-center space-x-1"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Сбросить</span>
          </button>
        )}
      </div>

      {/* Categories */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-atelier-muted mb-3">
          Категория
        </h3>
        <ul className="space-y-1.5 text-sm">
          <li>
            <button
              onClick={() => onSelectCategory("")}
              className={`w-full text-left px-2 py-1.5 rounded-sm transition-colors text-xs ${
                !selectedCategory
                  ? "bg-brand-100 font-semibold text-brand-900"
                  : "text-atelier-charcoal hover:bg-atelier-subtle"
              }`}
            >
              Все категории
            </button>
          </li>
          {categories.map((cat) => {
            const catLabel = cat.title || cat.name || "Категория";
            return (
              <li key={cat.id}>
                <button
                  onClick={() => onSelectCategory(cat.id)}
                  className={`w-full text-left px-2 py-1.5 rounded-sm transition-colors text-xs ${
                    selectedCategory === cat.id
                      ? "bg-brand-100 font-semibold text-brand-900"
                      : "text-atelier-charcoal hover:bg-atelier-subtle"
                  }`}
                >
                  {catLabel}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Sizes */}
      <div className="pt-4 border-t border-atelier-border/60">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-atelier-muted mb-3">
          Размер (RU)
        </h3>
        <div className="grid grid-cols-4 gap-1.5">
          {availableSizes.map((item) => {
            const code = getFilterCode(item);
            const label = getFilterLabel(item);
            const isSelected = selectedSize === code;
            return (
              <button
                key={code}
                onClick={() => onSelectSize(isSelected ? "" : code)}
                className={`h-8 px-1 text-xs font-medium border rounded-sm transition-all truncate ${
                  isSelected
                    ? "bg-brand-900 text-white border-brand-900"
                    : "border-atelier-border text-atelier-charcoal hover:border-brand-500"
                }`}
                title={label}
              >
                {label.split(" ")[0]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Heights */}
      <div className="pt-4 border-t border-atelier-border/60">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-atelier-muted mb-3">
          Ростовая группа (см)
        </h3>
        <div className="space-y-1.5">
          {availableHeights.map((item) => {
            const code = getFilterCode(item);
            const label = getFilterLabel(item);
            const isSelected = selectedHeight === code;
            const displayLabel = label.includes("см") ? label : `${label} см`;
            return (
              <button
                key={code}
                onClick={() => onSelectHeight(isSelected ? "" : code)}
                className={`w-full text-left px-2 py-1.5 text-xs rounded-sm border transition-all ${
                  isSelected
                    ? "bg-brand-900 text-white border-brand-900 font-medium"
                    : "border-atelier-border text-atelier-charcoal hover:bg-atelier-subtle"
                }`}
              >
                {displayLabel}
              </button>
            );
          })}
        </div>
      </div>

      {/* Formats */}
      <div className="pt-4 border-t border-atelier-border/60">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-atelier-muted mb-3">
          Формат печати
        </h3>
        <div className="space-y-1.5">
          {availableFormats.map((item) => {
            const code = getFilterCode(item);
            const label = getFilterLabel(item);
            const isSelected = selectedFormat === code;
            return (
              <button
                key={code}
                onClick={() => onSelectFormat(isSelected ? "" : code)}
                className={`w-full text-left px-2 py-1.5 text-xs rounded-sm border transition-all ${
                  isSelected
                    ? "bg-brand-900 text-white border-brand-900 font-medium"
                    : "border-atelier-border text-atelier-charcoal hover:bg-atelier-subtle"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
