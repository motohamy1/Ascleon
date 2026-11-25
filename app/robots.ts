import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/subscriptions/admin", "/books/new", "/progress", "/study-hub", "/space/"],
      },
      {
        userAgent: ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "PerplexityBot", "Google-Extended"],
        allow: "/",
        disallow: ["/api/", "/subscriptions/admin", "/books/new", "/progress", "/study-hub", "/space/"],
      },
    ],
    sitemap: "https://www.ascleon.app/sitemap.xml",
    host: "https://www.ascleon.app",
  };
}
