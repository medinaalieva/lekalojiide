import React from "react";
import Link from "next/link";
import { Product } from "../../types";
import { DifficultyBadge } from "../ui/Badge";
import { Scissors } from "lucide-react";

interface ProductCardProps {
  product: Product;
}

export function ProductCard({ product }: ProductCardProps) {
  const price = product.basePrice ?? product.priceFromKgs ?? 0;
  const priceDisplay =
    price > 0
      ? `${price.toLocaleString("ru-RU")} KGS`
      : "Бесплатно";

  const categoryName = (product.category as any)?.title || product.category?.name;
  const difficulty = product.difficulty || (product as any).difficultyLevel || product.complexity;

  // Resolve cover image safely
  let coverImageUrl: string | undefined = product.coverImage;
  if (!coverImageUrl && product.images && product.images.length > 0) {
    const firstImg = product.images[0];
    coverImageUrl = typeof firstImg === "string" ? firstImg : firstImg.imageUrl;
  }

  return (
    <Link
      href={`/catalog/${product.slug}`}
      className="group flex flex-col bg-white border border-atelier-border rounded-sm overflow-hidden hover:shadow-md transition-all duration-300"
    >
      {/* Image container */}
      <div className="relative aspect-[3/4] bg-atelier-subtle overflow-hidden flex items-center justify-center">
        {coverImageUrl ? (
          <img
            src={coverImageUrl}
            alt={product.title}
            className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="flex flex-col items-center justify-center p-6 text-atelier-muted">
            <Scissors className="w-12 h-12 stroke-[1.2] mb-2 text-atelier-accent/60" />
            <span className="text-xs uppercase tracking-wider text-center font-medium">
              {categoryName || "Цифровая выкройка"}
            </span>
          </div>
        )}

        {/* Difficulty badge overlay */}
        <div className="absolute top-3 left-3">
          <DifficultyBadge difficulty={difficulty} />
        </div>
      </div>

      {/* Content */}
      <div className="p-4 flex flex-col flex-1 justify-between">
        <div>
          {categoryName && (
            <p className="text-[11px] uppercase tracking-widest text-atelier-muted mb-1 font-medium">
              {categoryName}
            </p>
          )}
          <h3 className="font-medium text-sm text-atelier-charcoal group-hover:text-brand-800 transition-colors line-clamp-2">
            {product.title}
          </h3>
        </div>

        <div className="mt-4 pt-3 border-t border-atelier-border/60 flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[10px] text-atelier-muted uppercase tracking-wider">
              Цена
            </span>
            <span className="font-semibold text-brand-950 text-sm">
              {priceDisplay}
            </span>
          </div>
          <span className="text-xs font-medium text-brand-700 group-hover:underline">
            Выбрать размер →
          </span>
        </div>
      </div>
    </Link>
  );
}
