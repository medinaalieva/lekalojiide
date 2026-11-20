import React, { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Product } from "../../types";
import { DifficultyBadge, Badge } from "../ui/Badge";
import { Scissors, Sparkles, Flame, Star, Tag } from "lucide-react";

interface ProductCardProps {
  product: Product;
  priority?: boolean;
}

export function ProductCard({ product, priority = false }: ProductCardProps) {
  const [imgError, setImgError] = useState(false);
  const basePrice = product.basePrice ?? product.priceFromKgs ?? 0;
  const currentPrice = product.currentPrice ?? (product.isDiscountActive && product.discountPrice ? product.discountPrice : basePrice);
  const isDiscount = Boolean(product.isDiscountActive && product.discountPrice && product.discountPrice < basePrice);
  const discountPercent = product.discountPercent ?? (isDiscount ? Math.round(((basePrice - product.discountPrice!) / basePrice) * 100) : 0);

  const categoryName = (product.category as any)?.title || product.category?.name;
  const difficulty = product.difficulty || (product as any).difficultyLevel || product.complexity;

  // Resolve cover image safely
  let coverImageUrl: string | undefined = product.coverImage;
  if (!coverImageUrl && product.images && product.images.length > 0) {
    const coverObj = (product.images as any[]).find((img) => typeof img === "object" && img?.isCover);
    const firstImg = product.images[0];
    coverImageUrl = coverObj
      ? (coverObj.imageUrl || coverObj)
      : (typeof firstImg === "string" ? firstImg : firstImg?.imageUrl);
  }

  return (
    <Link
      href={`/catalog/${product.slug}`}
      className="group flex flex-col bg-white border border-atelier-border rounded-sm overflow-hidden hover:shadow-lg hover:border-brand-300 transition-all duration-300"
    >
      {/* Image container */}
      <div className="relative aspect-[3/4] bg-atelier-subtle overflow-hidden flex items-center justify-center">
        {coverImageUrl && !imgError ? (
          <img
            src={coverImageUrl}
            alt={product.title}
            className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500"
            loading={priority ? "eager" : "lazy"}
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="flex flex-col items-center justify-center p-6 text-atelier-muted bg-gradient-to-b from-brand-50/40 to-atelier-subtle w-full h-full">
            <div className="w-12 h-12 rounded-full bg-brand-100/60 flex items-center justify-center mb-2">
              <Scissors className="w-6 h-6 stroke-[1.4] text-brand-800" />
            </div>
            <span className="text-[11px] tracking-wider uppercase text-center font-medium text-atelier-muted">
              Цифровая выкройка
            </span>
          </div>
        )}

        {/* Top Badges */}
        <div className="absolute top-2.5 left-2.5 flex flex-col gap-1 items-start z-10">
          <DifficultyBadge difficulty={difficulty} />
          {product.isNew && (
            <span className="inline-flex items-center space-x-1 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider bg-sky-700 text-white rounded-sm shadow-sm">
              <Sparkles className="w-2.5 h-2.5" />
              <span>Новинка</span>
            </span>
          )}
          {product.isBestseller && (
            <span className="inline-flex items-center space-x-1 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider bg-amber-600 text-white rounded-sm shadow-sm">
              <Flame className="w-2.5 h-2.5" />
              <span>Хит</span>
            </span>
          )}
          {product.isPopular && !product.isBestseller && (
            <span className="inline-flex items-center space-x-1 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider bg-purple-700 text-white rounded-sm shadow-sm">
              <Star className="w-2.5 h-2.5" />
              <span>Популярно</span>
            </span>
          )}
        </div>

        {/* Discount badge top-right */}
        {isDiscount && (
          <div className="absolute top-2.5 right-2.5 z-10">
            <span className="inline-flex items-center px-2 py-0.5 text-[11px] font-bold tracking-tight bg-rose-600 text-white rounded-sm shadow-sm">
              -{discountPercent}%
            </span>
          </div>
        )}

        {/* Format hint pill bottom-right */}
        <div className="absolute bottom-2 right-2 bg-white/90 backdrop-blur-xs text-[10px] text-brand-950 px-1.5 py-0.5 rounded-xs border border-atelier-border/80 font-mono">
          PDF A4 / Плоттер
        </div>
      </div>

      {/* Content */}
      <div className="p-4 flex flex-col flex-1 justify-between">
        <div>
          {categoryName && (
            <p className="text-[11px] uppercase tracking-widest text-brand-800/80 mb-1 font-semibold truncate">
              {categoryName}
            </p>
          )}
          <h3 className="font-serif font-semibold text-sm text-brand-950 group-hover:text-brand-800 transition-colors line-clamp-2 leading-snug">
            {product.title}
          </h3>
        </div>

        <div className="mt-4 pt-3 border-t border-atelier-border/60">
          <div className="flex items-baseline justify-between">
            <div className="flex flex-col">
              <span className="text-[10px] text-atelier-muted uppercase tracking-wider">
                {isDiscount ? "Акция" : "Цена"}
              </span>
              <div className="flex items-baseline space-x-2">
                <span className="font-bold text-brand-950 text-base">
                  {currentPrice > 0 ? `${currentPrice.toLocaleString("ru-RU")} KGS` : "Бесплатно"}
                </span>
                {isDiscount && (
                  <span className="text-xs text-atelier-muted line-through font-normal">
                    {basePrice.toLocaleString("ru-RU")} KGS
                  </span>
                )}
              </div>
            </div>

            {product.bundlePrice && (
              <div className="text-right">
                <span className="text-[9px] text-atelier-muted uppercase tracking-wider block">
                  Комплект ALL
                </span>
                <span className="text-xs font-semibold text-brand-800">
                  {Number(product.bundlePrice).toLocaleString("ru-RU")} KGS
                </span>
              </div>
            )}
          </div>

          <div className="mt-2 text-right">
            <span className="text-xs font-medium text-brand-800 group-hover:text-brand-950 group-hover:translate-x-0.5 transition-transform inline-flex items-center">
              Выбрать размер →
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
