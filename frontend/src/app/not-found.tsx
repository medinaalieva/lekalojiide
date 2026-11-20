import React from "react";
import Link from "next/link";
import { Scissors } from "lucide-react";
import { Button } from "../components/ui/Button";

export default function NotFound() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4 sm:px-6 lg:px-8 py-20 text-center">
      <div className="max-w-md mx-auto">
        <div className="w-16 h-16 rounded-full bg-brand-50 border border-brand-200/60 flex items-center justify-center mx-auto mb-6 text-brand-800">
          <Scissors className="w-8 h-8 stroke-[1.4]" />
        </div>
        <p className="text-xs uppercase tracking-widest text-brand-800 font-semibold mb-2">
          Ошибка 404
        </p>
        <h1 className="text-2xl sm:text-3xl font-serif font-bold text-brand-950 mb-3">
          Выкройка не найдена
        </h1>
        <p className="text-sm text-atelier-muted mb-8 leading-relaxed">
          Запрашиваемая модель не существует, была удалена или ссылка устарела.
        </p>
        <Link href="/catalog">
          <Button variant="primary" size="lg">
            Перейти в каталог выкроек →
          </Button>
        </Link>
      </div>
    </div>
  );
}
