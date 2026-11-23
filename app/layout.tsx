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
    display: 'swap'
});

const monaSans = Mona_Sans({
    variable: '--font-mona-sans',
    subsets: ['latin'],
    display: 'swap'
});

const caveat = Caveat({
    variable: '--font-caveat',
    subsets: ['latin'],
    weight: ['500', '600', '700'],
    display: 'swap'
});

const marhey = Marhey({
    variable: '--font-marhey',
    subsets: ['arabic', 'latin'],
    weight: ['400', '500', '600', '700'],
    display: 'swap'
});

const kalam = Kalam({
    variable: '--font-kalam',
    subsets: ['latin'],
    weight: ['400', '700'],
    display: 'swap'
});

const playpenArabic = Playpen_Sans_Arabic({
    variable: '--font-playpen-arabic',
    subsets: ['arabic', 'latin'],
    display: 'swap',
    adjustFontFallback: false
});


export const metadata: Metadata = {
  title: "Ascleon",
  description: "Your AI study companion for medical lectures and textbooks. Study side-by-side with a live bilingual voice mentor, diagnostic roadmaps, physiology simulators, and case-based QBanks.",
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
