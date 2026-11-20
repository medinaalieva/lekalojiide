import { MetadataRoute } from "next";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "https://lekalojiide.vercel.app");

  const apiBaseUrl =
    process.env.INTERNAL_API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://127.0.0.1:4000";

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: `${siteUrl}/`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1.0,
    },
    {
      url: `${siteUrl}/catalog`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.9,
    },
  ];

  let productRoutes: MetadataRoute.Sitemap = [];
  let categoryRoutes: MetadataRoute.Sitemap = [];

  try {
    const [prodRes, catRes] = await Promise.allSettled([
      fetch(`${apiBaseUrl}/api/v1/catalog/products?limit=100`, {
        next: { revalidate: 3600 },
      }),
      fetch(`${apiBaseUrl}/api/v1/catalog/categories`, {
        next: { revalidate: 3600 },
      }),
    ]);

    if (prodRes.status === "fulfilled" && prodRes.value.ok) {
      const prodJson = await prodRes.value.json();
      if (prodJson.success && Array.isArray(prodJson.data)) {
        productRoutes = prodJson.data.map((p: any) => ({
          url: `${siteUrl}/catalog/${p.slug}`,
          lastModified: p.updatedAt ? new Date(p.updatedAt) : new Date(),
          changeFrequency: "weekly",
          priority: 0.8,
        }));
      }
    }

    if (catRes.status === "fulfilled" && catRes.value.ok) {
      const catJson = await catRes.value.json();
      if (catJson.success && Array.isArray(catJson.data)) {
        categoryRoutes = catJson.data
          .filter((cat: any) => cat.isActive !== false && cat.slug)
          .map((cat: any) => ({
            url: `${siteUrl}/catalog?categorySlug=${cat.slug}`,
            lastModified: new Date(),
            changeFrequency: "weekly",
            priority: 0.7,
          }));
      }
    }
  } catch (err) {
    console.error("[Sitemap] Ошибка при формировании динамического sitemap:", err);
  }

  return [...staticRoutes, ...categoryRoutes, ...productRoutes];
}
