"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShoppingBag, User, Menu, X, Search, Sparkles, BookOpen, Layers } from "lucide-react";
import { useAuth } from "../../lib/auth-context";
import { useCart } from "../../lib/cart-context";

export function Navbar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { itemsCount } = useCart();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    setUserMenuOpen(false);
    setMobileMenuOpen(false);
  }, [pathname]);

  const navLinks = [
    { href: "/catalog", label: "Каталог выкроек" },
    { href: "/catalog?categorySlug=platya", label: "Платья" },
    { href: "/cabinet/library", label: "Мои выкройки", authRequired: true },
    { href: "/cabinet/downloads", label: "Центр загрузок", authRequired: true },
  ];

  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-atelier-border transition-all">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          {/* Logo - Protected from mobile clipping & wrapping */}
          <Link href="/" className="flex flex-col group shrink-0 py-1">
            <span className="font-serif text-lg sm:text-2xl tracking-[0.16em] sm:tracking-[0.2em] font-semibold text-brand-950 uppercase group-hover:text-brand-700 transition-colors whitespace-nowrap leading-tight">
              Lekalo Zhiide
            </span>
            <span className="text-[8px] sm:text-[10px] tracking-[0.22em] sm:tracking-[0.3em] uppercase text-atelier-muted whitespace-nowrap">
              Digital Pattern Atelier
            </span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center space-x-6 lg:space-x-8">
            {navLinks.map((link) => {
              if (link.authRequired && !user) return null;
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`text-xs lg:text-sm tracking-wider uppercase transition-colors whitespace-nowrap ${
                    isActive
                      ? "text-brand-900 font-semibold border-b-2 border-brand-900 pb-1"
                      : "text-atelier-muted hover:text-brand-900"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>

          {/* Right Action Icons */}
          <div className="flex items-center space-x-1 sm:space-x-3">
            {/* Quick Search Button (desktop/tablet) */}
            <Link
              href="/catalog"
              className="hidden sm:inline-flex p-2 text-atelier-charcoal hover:text-brand-800 transition-colors rounded-sm hover:bg-atelier-subtle"
              aria-label="Поиск по каталогу"
              title="Поиск выкроек"
            >
              <Search className="w-5 h-5 stroke-[1.5]" />
            </Link>

            {/* Cart Link */}
            <Link
              href="/cart"
              className="relative p-2 text-atelier-charcoal hover:text-brand-800 transition-colors rounded-sm hover:bg-atelier-subtle"
              aria-label="Корзина"
              title="Корзина"
            >
              <ShoppingBag className="w-5 h-5 stroke-[1.5]" />
              {itemsCount > 0 && (
                <span className="absolute top-1 right-1 flex items-center justify-center w-4 h-4 text-[10px] font-bold text-white bg-brand-800 rounded-full">
                  {itemsCount}
                </span>
              )}
            </Link>

            {/* Auth / Cabinet (desktop shows user/login, mobile accesses via drawer) */}
            {user ? (
              <div className="relative group hidden sm:block" ref={userMenuRef}>
                <button
                  type="button"
                  onClick={() => setUserMenuOpen((prev) => !prev)}
                  className="flex items-center space-x-2 text-xs sm:text-sm text-atelier-charcoal hover:text-brand-800 py-1 px-2 rounded-sm hover:bg-atelier-subtle focus:outline-none"
                  aria-expanded={userMenuOpen}
                >
                  <User className="w-5 h-5 stroke-[1.5]" />
                  <span className="font-medium truncate max-w-[120px]">
                    {user?.firstName || user?.email?.split("@")?.[0] || "Кабинет"}
                  </span>
                </button>

                {/* Dropdown Menu */}
                <div
                  className={`absolute right-0 top-full pt-2 w-52 animate-in fade-in z-50 ${
                    userMenuOpen ? "block" : "hidden md:group-hover:block"
                  }`}
                >
                  <div className="bg-white border border-atelier-border rounded-sm shadow-xl py-2 text-xs">
                    {user.role === "ADMIN" && (
                      <Link
                        href="/admin"
                        onClick={() => setUserMenuOpen(false)}
                        className="block px-4 py-2.5 text-brand-900 bg-brand-50 hover:bg-brand-100 font-semibold border-b border-brand-100"
                      >
                        ⚙️ Панель администратора
                      </Link>
                    )}
                    <Link
                      href="/cabinet"
                      onClick={() => setUserMenuOpen(false)}
                      className="block px-4 py-2 text-atelier-charcoal hover:bg-atelier-subtle"
                    >
                      Личный кабинет
                    </Link>
                    <Link
                      href="/cabinet/library"
                      onClick={() => setUserMenuOpen(false)}
                      className="block px-4 py-2 text-atelier-charcoal hover:bg-atelier-subtle"
                    >
                      Купленные выкройки
                    </Link>
                    <Link
                      href="/cabinet/downloads"
                      onClick={() => setUserMenuOpen(false)}
                      className="block px-4 py-2 text-atelier-charcoal hover:bg-atelier-subtle"
                    >
                      Центр скачивания
                    </Link>
                    <hr className="my-1 border-atelier-border" />
                    <button
                      onClick={() => {
                        setUserMenuOpen(false);
                        logout();
                      }}
                      className="w-full text-left px-4 py-2 text-red-600 hover:bg-atelier-subtle"
                    >
                      Выйти
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <Link
                href="/login"
                className="hidden sm:inline-flex items-center space-x-1 text-xs tracking-wider uppercase text-atelier-charcoal hover:text-brand-900 font-medium px-2 py-1.5 rounded-sm hover:bg-atelier-subtle"
              >
                <User className="w-4 h-4 mr-1 stroke-[1.5]" />
                <span>Войти</span>
              </Link>
            )}

            {/* Mobile menu button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 text-atelier-charcoal rounded-sm hover:bg-atelier-subtle focus:outline-none"
              aria-label="Меню навигации"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-white border-b border-atelier-border px-5 pt-3 pb-6 space-y-3 animate-in slide-in-from-top-2">
          <div className="text-[10px] uppercase tracking-widest text-atelier-muted font-bold pt-1">
            Навигация
          </div>
          <Link
            href="/catalog"
            onClick={() => setMobileMenuOpen(false)}
            className="block text-sm uppercase tracking-wider text-atelier-charcoal py-2 border-b border-atelier-border/50 font-medium"
          >
            Все выкройки каталога
          </Link>
          <Link
            href="/catalog?categorySlug=platya"
            onClick={() => setMobileMenuOpen(false)}
            className="block text-sm uppercase tracking-wider text-atelier-charcoal py-2 border-b border-atelier-border/50"
          >
            Платья и сарафаны
          </Link>
          <Link
            href="/catalog?categorySlug=yubki"
            onClick={() => setMobileMenuOpen(false)}
            className="block text-sm uppercase tracking-wider text-atelier-charcoal py-2 border-b border-atelier-border/50"
          >
            Юбки и брюки
          </Link>

          {user ? (
            <>
              <div className="text-[10px] uppercase tracking-widest text-atelier-muted font-bold pt-2">
                Личный кабинет
              </div>
              {user.role === "ADMIN" && (
                <Link
                  href="/admin"
                  onClick={() => setMobileMenuOpen(false)}
                  className="block text-sm uppercase tracking-wider text-brand-900 bg-brand-50 px-3 py-2.5 rounded-sm font-bold border border-brand-200"
                >
                  ⚙️ Панель администратора
                </Link>
              )}
              <Link
                href="/cabinet/library"
                onClick={() => setMobileMenuOpen(false)}
                className="block text-sm uppercase tracking-wider text-atelier-charcoal py-2 border-b border-atelier-border/50"
              >
                Мои выкройки
              </Link>
              <Link
                href="/cabinet/downloads"
                onClick={() => setMobileMenuOpen(false)}
                className="block text-sm uppercase tracking-wider text-atelier-charcoal py-2 border-b border-atelier-border/50"
              >
                Центр скачивания PDF
              </Link>
              <Link
                href="/cabinet"
                onClick={() => setMobileMenuOpen(false)}
                className="block text-sm uppercase tracking-wider text-atelier-charcoal py-2 border-b border-atelier-border/50 text-brand-950 font-semibold"
              >
                Профиль ({user.email})
              </Link>
              <button
                onClick={() => {
                  logout();
                  setMobileMenuOpen(false);
                }}
                className="block w-full text-left text-sm uppercase tracking-wider text-red-600 py-2.5 font-medium"
              >
                Выйти из профиля
              </button>
            </>
          ) : (
            <div className="pt-2">
              <Link
                href="/login"
                onClick={() => setMobileMenuOpen(false)}
                className="block w-full text-center py-2.5 bg-brand-900 text-white rounded-sm text-xs uppercase tracking-wider font-semibold shadow-sm"
              >
                Войти в личный кабинет
              </Link>
            </div>
          )}
        </div>
      )}
    </header>
  );
}
