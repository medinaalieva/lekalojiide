import "./globals.css";
import type { Metadata } from "next";
import { Navbar } from "../components/layout/Navbar";
import { Footer } from "../components/layout/Footer";
import { AuthProvider } from "../lib/auth-context";
import { CartProvider } from "../lib/cart-context";

export const metadata: Metadata = {
  title: "LEKALO ZHIIDE — Цифровые выкройки одежды",
  description:
    "Интернет-магазин и ателье профессиональных цифровых выкроек одежды в PDF. Выкройки с припусками на швы, инструкции по пошиву, форматы A4 и плоттер. Оплата в KGS (сом).",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru">
      <body className="antialiased flex flex-col min-h-screen selection:bg-brand-200 selection:text-brand-900">
        <AuthProvider>
          <CartProvider>
            <Navbar />
            <main className="flex-1">{children}</main>
            <Footer />
          </CartProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
