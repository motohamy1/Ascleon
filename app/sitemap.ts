import type { MetadataRoute } from "next";

const SITE_URL = "https://www.ascleon.app";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return [
    {
      url: SITE_URL,
      lastModified,
      changeFrequency: "weekly",
      priority: 1.0,
    },
    {
      url: `${SITE_URL}/library`,
      lastModified,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/subscriptions`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.7,
    },
  ];
}
