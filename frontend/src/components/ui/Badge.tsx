import React from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { DifficultyLevel } from "../../types";

function cn(...inputs: any[]) {
  return twMerge(clsx(inputs));
}

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "secondary" | "outline" | "success" | "warning";
}

export function Badge({
  className,
  variant = "default",
  children,
  ...props
}: BadgeProps) {
  const variants = {
    default: "bg-brand-100 text-brand-900 border-transparent",
    secondary: "bg-atelier-subtle text-atelier-charcoal border-atelier-border",
    outline: "text-atelier-charcoal border border-atelier-border bg-transparent",
    success: "bg-emerald-50 text-emerald-800 border-emerald-200",
    warning: "bg-amber-50 text-amber-800 border-amber-200",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 text-xs font-medium uppercase tracking-wider rounded-sm border",
        variants[variant],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}

export function DifficultyBadge({ difficulty }: { difficulty?: DifficultyLevel | string }) {
  if (!difficulty) return null;

  const map: Record<
    string,
    { label: string; variant: "default" | "secondary" | "success" | "warning" }
  > = {
    BEGINNER: { label: "Для начинающих", variant: "success" },
    EASY: { label: "Простой", variant: "default" },
    MEDIUM: { label: "Средний", variant: "warning" },
    ADVANCED: { label: "Продвинутый", variant: "secondary" },
    EXPERT: { label: "Сложный", variant: "secondary" },
  };

  const item = map[difficulty] || { label: difficulty, variant: "secondary" };

  return <Badge variant={item.variant}>{item.label}</Badge>;
}
