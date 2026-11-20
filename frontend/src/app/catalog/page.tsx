import type { Metadata } from "next";
import { CatalogView } from "./CatalogView";

export const metadata: Metadata = {
  title: "Каталог цифровых выкроек одежды в PDF — Платья, Юбки, Жакеты",
  description:
    "Большой каталог электронных выкроек одежды от ателье LEKALO ZHIIDE. Выкройки платьев, юбок, брюк, жакетов и верхней одежды. Удобный выбор ростовки, размера и формата печати A4/плоттер. Оплата в сомах (KGS).",
  alternates: {
    canonical: "/catalog",
  },
  openGraph: {
    title: "Каталог цифровых выкроек одежды — LEKALO ZHIIDE",
    description:
      "Электронные выкройки платьев, юбок, брюк и жакетов в формате PDF для печати на бытовом принтере и плоттере.",
    url: "/catalog",
    siteName: "LEKALO ZHIIDE",
    locale: "ru_RU",
    type: "website",
  },
};

export default function CatalogPage() {
  return <CatalogView />;
}
