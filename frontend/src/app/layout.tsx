import "./globals.css";
import type { Metadata } from "next";
import { Navbar } from "../components/layout/Navbar";
import { Footer } from "../components/layout/Footer";
import { AuthProvider } from "../lib/auth-context";
import { CartProvider } from "../lib/cart-context";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "https://lekalojiide.vercel.app");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "LEKALO ZHIIDE — Цифровые выкройки одежды в PDF",
    template: "%s | LEKALO ZHIIDE",
  },
  description:
    "Интернет-магазин и ателье профессиональных цифровых выкроек одежды в PDF. Выкройки с припусками на швы, инструкции по пошиву, форматы A4 и плоттер. Оплата в KGS (сом).",
  keywords: [
    "выкройки",
    "выкройки одежды",
    "цифровые выкройки PDF",
    "купить выкройки",
    "лекала женской одежды",
    "LEKALO ZHIIDE",
    "выкройки платьев",
    "выкройки Бишкек",
    "выкройки Кыргызстан",
  ],
  authors: [{ name: "LEKALO ZHIIDE" }],
  creator: "LEKALO ZHIIDE",
  publisher: "LEKALO ZHIIDE",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  openGraph: {
    type: "website",
    locale: "ru_RU",
    url: siteUrl,
    siteName: "LEKALO ZHIIDE",
    title: "LEKALO ZHIIDE — Цифровые выкройки одежды в PDF",
    description:
      "Интернет-магазин и ателье профессиональных цифровых выкроек одежды в PDF. Выкройки с припусками на швы, инструкции по пошиву, форматы A4 и плоттер.",
  },
  twitter: {
    card: "summary_large_image",
    title: "LEKALO ZHIIDE — Цифровые выкройки одежды в PDF",
    description:
      "Интернет-магазин и ателье профессиональных цифровых выкроек одежды в PDF. Выкройки с припусками на швы, форматы A4 и плоттер.",
  },
  robots: {
    index: true,
    follow: true,
  },
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
