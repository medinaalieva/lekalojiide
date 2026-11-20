import { Metadata } from "next";
import { notFound } from "next/navigation";
import ProductDetailView from "./ProductDetailView";
import { Product } from "../../../types";

interface PageProps {
  params: { slug: string };
}

type ProductFetchResult =
  | { kind: "success"; product: Product }
  | { kind: "not_found" }
  | { kind: "error"; error: string; status?: number };

async function getProduct(slug: string): Promise<ProductFetchResult> {
  const baseUrl =
    process.env.INTERNAL_API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://127.0.0.1:4000";

  try {
    const res = await fetch(`${baseUrl}/api/v1/catalog/products/${slug}`, {
      next: { revalidate: 60 },
    });

    if (res.status === 404) {
      return { kind: "not_found" };
    }

    if (!res.ok) {
      return {
        kind: "error",
        error: `Ошибка API каталога (${res.status})`,
        status: res.status,
      };
    }

    const json = await res.json();
    if (json.success && json.data) {
      return { kind: "success", product: json.data };
    }

    if (json.error?.code === "PRODUCT_NOT_FOUND") {
      return { kind: "not_found" };
    }

    return {
      kind: "error",
      error: json.error?.message || "Не удалось получить данные выкройки",
    };
  } catch (err: any) {
    return {
      kind: "error",
      error: err.message || "Сервер временно недоступен. Проверьте сетевое подключение.",
    };
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "https://lekalojiide.vercel.app");

  const result = await getProduct(params.slug);

  if (result.kind === "success") {
    const product = result.product;
    const title = `${product.title} — Выкройка PDF`;
    const description =
      product.shortDescription ||
      product.description?.slice(0, 160) ||
      "Электронная выкройка одежды в формате PDF для печати на бытовом принтере и плоттере от профессионального конструктора LEKALO ZHIIDE.";

    const foundCover = product.images?.find(
      (img: any) => typeof img === "object" && img?.isCover
    );
    const coverImage =
      (typeof foundCover === "object" ? (foundCover as any).imageUrl : null) ||
      (product.images && product.images.length > 0
        ? typeof product.images[0] === "string"
          ? product.images[0]
          : (product.images[0] as any)?.imageUrl
        : product.coverImage || null);

    return {
      title,
      description,
      alternates: {
        canonical: `/catalog/${params.slug}`,
      },
      openGraph: {
        title,
        description,
        url: `${siteUrl}/catalog/${params.slug}`,
        siteName: "LEKALO ZHIIDE",
        locale: "ru_RU",
        type: "website",
        images: coverImage
          ? [
              {
                url: coverImage,
                width: 1200,
                height: 1600,
                alt: product.title,
              },
            ]
          : undefined,
      },
      twitter: {
        card: "summary_large_image",
        title,
        description,
        images: coverImage ? [coverImage] : undefined,
      },
    };
  }

  if (result.kind === "not_found") {
    return {
      title: "Выкройка не найдена — LEKALO ZHIIDE",
      description: "Запрашиваемая выкройка не найдена или была удалена.",
    };
  }

  return {
    title: "Каталог выкроек — LEKALO ZHIIDE",
    description: "Сервер временно недоступен. Пожалуйста, повторите попытку позже.",
  };
}

export default async function ProductPage({ params }: PageProps) {
  const result = await getProduct(params.slug);

  if (result.kind === "not_found") {
    notFound();
  }

  if (result.kind === "error") {
    return (
      <ProductDetailView
        key={params.slug}
        slug={params.slug}
        initialProduct={null}
        initialError={result.error}
      />
    );
  }

  return (
    <ProductDetailView
      key={params.slug}
      slug={params.slug}
      initialProduct={result.product}
    />
  );
}
