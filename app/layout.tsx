import type { Metadata } from "next";
import { IBM_Plex_Serif, Mona_Sans, Caveat, Marhey, Kalam, Playpen_Sans_Arabic } from "next/font/google";
import "katex/dist/katex.min.css";
import "./globals.css";
import Navbar from "@/components/Navbar";
import { ClerkProvider } from "@clerk/nextjs";
import { Toaster } from "@/components/ui/sonner";

const ibmPlexSerif = IBM_Plex_Serif({
    variable: "--font-ibm-plex-serif",
    subsets: ['latin'],
    weight: ['400', '500', '600', '700'],
    display: 'swap',
    adjustFontFallback: false,
});

const monaSans = Mona_Sans({
    variable: '--font-mona-sans',
    subsets: ['latin'],
    display: 'swap',
    adjustFontFallback: false,
});

const caveat = Caveat({
    variable: '--font-caveat',
    subsets: ['latin'],
    display: 'swap',
    adjustFontFallback: false,
});

const marhey = Marhey({
    variable: '--font-marhey',
    subsets: ['arabic', 'latin'],
    display: 'swap',
    adjustFontFallback: false,
});

const kalam = Kalam({
    variable: '--font-kalam',
    subsets: ['latin'],
    weight: ['400', '700'],
    display: 'swap',
    adjustFontFallback: false,
});

const playpenArabic = Playpen_Sans_Arabic({
    variable: '--font-playpen-arabic',
    subsets: ['arabic', 'latin'],
    display: 'swap',
    adjustFontFallback: false,
});


const SITE_URL = "https://www.ascleon.app";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: "Ascleon",
  title: {
    default: "Ascleon | AI Study Companion for Medical Students",
    template: "%s | Ascleon",
  },
  description:
    "Your AI study companion for medical lectures and textbooks. Study side-by-side with a live bilingual voice mentor, diagnostic roadmaps, physiology simulators, and case-based QBanks.",
  keywords: [
    "Ascleon",
    "AI medical study companion",
    "medical lectures AI",
    "medical textbooks AI",
    "bilingual medical voice tutor",
    "USMLE study tool",
    "physiology simulator",
    "medical QBank",
    "clinical case roadmaps",
  ],
  authors: [{ name: "Ascleon", url: SITE_URL }],
  creator: "Ascleon",
  publisher: "Ascleon",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: SITE_URL,
    siteName: "Ascleon",
    title: "Ascleon | AI Study Companion for Medical Students",
    description:
      "Study medical lectures and textbooks side-by-side with a live bilingual voice mentor, diagnostic roadmaps, physiology simulators, and case-based QBanks.",
    images: [
      {
        url: "/assets/desktop-banner.png",
        width: 1200,
        height: 630,
        alt: "Ascleon — AI Study Companion for Medical Students",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Ascleon | AI Study Companion for Medical Students",
    description:
      "Study medical lectures and textbooks side-by-side with a live bilingual voice mentor, diagnostic roadmaps, physiology simulators, and case-based QBanks.",
    images: ["/assets/desktop-banner.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/favicon.svg', type: 'image/svg+xml' },
    ],
    apple: [
      { url: '/assets/ascleon-logo.svg' },
    ],
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: SITE_URL,
      name: "Ascleon",
      description:
        "AI study companion for medical lectures and textbooks with a live bilingual voice mentor, diagnostic roadmaps, physiology simulators, and case-based QBanks.",
      inLanguage: ["en", "ar"],
    },
    {
      "@type": "SoftwareApplication",
      "@id": `${SITE_URL}/#app`,
      name: "Ascleon",
      url: SITE_URL,
      applicationCategory: "EducationalApplication",
      operatingSystem: "Web",
      description:
        "AI study companion for medical students featuring a live bilingual voice mentor, interactive PDF textbook reader, diagnostic roadmaps, physiology simulators, and case-based medical QBanks.",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${ibmPlexSerif.variable} ${monaSans.variable} ${caveat.variable} ${marhey.variable} ${kalam.variable} ${playpenArabic.variable} relative font-sans antialiased`}
      >
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <ClerkProvider
          appearance={{
            options: {
              unsafe_disableDevelopmentModeWarnings: true,
            },
          }}
        >
          <Navbar />
          {children}
          <Toaster />
        </ClerkProvider>
      </body>
    </html>
  );
}
