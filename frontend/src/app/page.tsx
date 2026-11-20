import type { Metadata } from "next";
import { HomeView } from "./HomeView";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: {
    absolute: "LEKALO ZHIIDE — Профессиональные цифровые выкройки одежды в PDF",
  },
  description:
    "Купить готовые электронные выкройки женской, мужской и детской одежды в PDF. Точная посадка, припуски на швы, пошаговые инструкции по пошиву, печать на A4 и плоттере от ателье LEKALO ZHIIDE.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "LEKALO ZHIIDE — Профессиональные цифровые выкройки одежды в PDF",
    description:
      "Купить готовые электронные выкройки одежды в PDF. Точная посадка, припуски на швы, инструкции по пошиву, форматы A4 и плоттер.",
    url: "/",
    siteName: "LEKALO ZHIIDE",
    locale: "ru_RU",
    type: "website",
  },
};

export default function HomePage() {
  return <HomeView />;
}
