import React from "react";
import Link from "next/link";
import { ShieldCheck, Download, Sparkles, HelpCircle } from "lucide-react";

export function Footer() {
  return (
    <footer className="bg-brand-950 text-white mt-auto border-t border-brand-900/40">
      {/* Value props banner */}
      <div className="border-b border-brand-900/60 bg-brand-900/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div className="flex items-start space-x-4">
              <Download className="w-6 h-6 text-brand-300 shrink-0 mt-1" />
              <div>
                <h4 className="font-medium text-sm text-brand-100">Мгновенный доступ</h4>
                <p className="text-xs text-brand-300/80 mt-1 leading-relaxed">
                  Файлы PDF для печати доступны в личном кабинете сразу после успешной оплаты.
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-4">
              <Sparkles className="w-6 h-6 text-brand-300 shrink-0 mt-1" />
              <div>
                <h4 className="font-medium text-sm text-brand-100">Точная посадка</h4>
                <p className="text-xs text-brand-300/80 mt-1 leading-relaxed">
                  Профессиональные лекала с припусками на швы и детальной градацией ростовок.
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-4">
              <ShieldCheck className="w-6 h-6 text-brand-300 shrink-0 mt-1" />
              <div>
                <h4 className="font-medium text-sm text-brand-100">Безопасная оплата</h4>
                <p className="text-xs text-brand-300/80 mt-1 leading-relaxed">
                  Приём платежей в KGS через защищенные национальные платежные шлюзы Кыргызстана.
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-4">
              <HelpCircle className="w-6 h-6 text-brand-300 shrink-0 mt-1" />
              <div>
                <h4 className="font-medium text-sm text-brand-100">Инструкции по пошиву</h4>
                <p className="text-xs text-brand-300/80 mt-1 leading-relaxed">
                  К каждому изделию прилагается пошаговый PDF-гид и схема сборки выкройки.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main footer links */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="space-y-4">
            <div className="flex flex-col">
              <span className="font-serif text-xl tracking-[0.2em] font-bold text-white uppercase">
                Lekalo Zhiide
              </span>
              <span className="text-[10px] tracking-[0.25em] uppercase text-brand-400">
                Digital Pattern Atelier
              </span>
            </div>
            <p className="text-xs text-brand-300/70 leading-relaxed max-w-xs">
              Онлайн-ателье цифровых выкроек женской, мужской и детской одежды. Превращаем кройку и шитье в удовольствие.
            </p>
          </div>

          <div>
            <h5 className="text-xs font-semibold uppercase tracking-wider text-brand-200 mb-4">
              Каталог
            </h5>
            <ul className="space-y-2 text-xs text-brand-300/80">
              <li>
                <Link href="/catalog" className="hover:text-white transition-colors">
                  Все выкройки
                </Link>
              </li>
              <li>
                <Link href="/catalog?categorySlug=platya" className="hover:text-white transition-colors">
                  Платья и сарафаны
                </Link>
              </li>
              <li>
                <Link href="/catalog?categorySlug=yubki" className="hover:text-white transition-colors">
                  Юбки
                </Link>
              </li>
              <li>
                <Link href="/catalog?categorySlug=bryuki-shorty" className="hover:text-white transition-colors">
                  Брюки и шорты
                </Link>
              </li>
              <li>
                <Link href="/catalog?categorySlug=bluzy" className="hover:text-white transition-colors">
                  Блузки и топы
                </Link>
              </li>
              <li>
                <Link href="/catalog?categorySlug=zhakety-verkhnyaya-odezhda" className="hover:text-white transition-colors">
                  Жакеты и пальто
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h5 className="text-xs font-semibold uppercase tracking-wider text-brand-200 mb-4">
              Покупателям
            </h5>
            <ul className="space-y-2 text-xs text-brand-300/80">
              <li>
                <Link href="/cabinet" className="hover:text-white transition-colors">
                  Личный кабинет
                </Link>
              </li>
              <li>
                <Link href="/cabinet/library" className="hover:text-white transition-colors">
                  Моя библиотека выкроек
                </Link>
              </li>
              <li>
                <Link href="/cart" className="hover:text-white transition-colors">
                  Корзина
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h5 className="text-xs font-semibold uppercase tracking-wider text-brand-200 mb-4">
              Информация
            </h5>
            <ul className="space-y-2 text-xs text-brand-300/80">
              <li>
                <span>Валюта расчетов: KGS (сом)</span>
              </li>
              <li>
                <span>Бишкек, Кыргызская Республика</span>
              </li>
              <li>
                <span>Форматы: A4 / Плоттер (600 / 900 мм)</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-6 border-t border-brand-900/60 flex flex-col sm:flex-row items-center justify-between text-xs text-brand-400">
          <p>© {new Date().getFullYear()} LEKALO ZHIIDE. Все права защищены.</p>
          <p className="mt-2 sm:mt-0">Цифровые лекала одежды для профессионалов и любителей.</p>
        </div>
      </div>
    </footer>
  );
}
