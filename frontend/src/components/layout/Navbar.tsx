"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShoppingBag, User, Menu, X, BookOpen, Layers } from "lucide-react";
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
    { href: "/cabinet/library", label: "Мои выкройки", authRequired: true },
    { href: "/cabinet/downloads", label: "Центр загрузок", authRequired: true },
  ];

  return (
    <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-atelier-border transition-all">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          {/* Logo */}
          <Link href="/" className="flex flex-col group">
            <span className="font-serif text-2xl tracking-[0.2em] font-semibold text-brand-950 uppercase group-hover:text-brand-700 transition-colors">
              Lekalo Zhiide
            </span>
            <span className="text-[10px] tracking-[0.3em] uppercase text-atelier-muted">
              Digital Pattern Atelier
            </span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center space-x-8">
            {navLinks.map((link) => {
              if (link.authRequired && !user) return null;
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`text-sm tracking-wider uppercase transition-colors ${
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
          <div className="flex items-center space-x-5">
            {/* Cart Link */}
            <Link
              href="/cart"
              className="relative p-2 text-atelier-charcoal hover:text-brand-800 transition-colors"
              aria-label="Корзина"
            >
              <ShoppingBag className="w-5 h-5 stroke-[1.5]" />
              {itemsCount > 0 && (
                <span className="absolute top-1 right-1 flex items-center justify-center w-4 h-4 text-[10px] font-bold text-white bg-brand-800 rounded-full">
                  {itemsCount}
                </span>
              )}
            </Link>

            {/* Auth / Cabinet */}
            {user ? (
              <div className="relative group" ref={userMenuRef}>
                <button
                  type="button"
                  onClick={() => setUserMenuOpen((prev) => !prev)}
                  className="flex items-center space-x-2 text-sm text-atelier-charcoal hover:text-brand-800 py-1 focus:outline-none"
                  aria-expanded={userMenuOpen}
                >
                  <User className="w-5 h-5 stroke-[1.5]" />
                  <span className="hidden sm:inline-block font-medium">
                    {user?.firstName || user?.email?.split("@")?.[0] || "Кабинет"}
                  </span>
                </button>

                {/* Dropdown Menu */}
                <div
                  className={`absolute right-0 top-full pt-2 w-48 animate-in fade-in z-50 ${
                    userMenuOpen ? "block" : "hidden md:group-hover:block"
                  }`}
                >
                  <div className="bg-white border border-atelier-border rounded-sm shadow-lg py-2 text-sm">
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
                className="inline-flex items-center space-x-1 text-sm tracking-wider uppercase text-atelier-charcoal hover:text-brand-900 font-medium"
              >
                <User className="w-4 h-4 mr-1 stroke-[1.5]" />
                <span>Войти</span>
              </Link>
            )}

            {/* Mobile menu button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 text-atelier-charcoal"
              aria-label="Меню"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-white border-b border-atelier-border px-4 pt-3 pb-6 space-y-3">
          <Link
            href="/catalog"
            onClick={() => setMobileMenuOpen(false)}
            className="block text-sm uppercase tracking-wider text-atelier-charcoal py-2 border-b border-atelier-border/50"
          >
            Каталог выкроек
          </Link>
          {user ? (
            <>
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
                Центр скачивания
              </Link>
              <Link
                href="/cabinet"
                onClick={() => setMobileMenuOpen(false)}
                className="block text-sm uppercase tracking-wider text-atelier-charcoal py-2 border-b border-atelier-border/50"
              >
                Личный кабинет ({user.email})
              </Link>
              <button
                onClick={() => {
                  logout();
                  setMobileMenuOpen(false);
                }}
                className="block w-full text-left text-sm uppercase tracking-wider text-red-600 py-2"
              >
                Выйти
              </button>
            </>
          ) : (
            <Link
              href="/login"
              onClick={() => setMobileMenuOpen(false)}
              className="block text-sm uppercase tracking-wider text-brand-900 py-2 font-medium"
            >
              Войти в аккаунт
            </Link>
          )}
        </div>
      )}
    </header>
  );
}
