import type { Metadata, Viewport } from "next";

import { Providers } from "@/components/providers";
import { THEME_BOOT_SCRIPT } from "@/lib/theme-boot";

import "./globals.css";

export const metadata: Metadata = {
  title: "EduNazorat",
  description: "Xususiy maktab va o'quv markazlari uchun nazorat platformasi",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/favicon-32.png", apple: "/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "EduNazorat", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f4ef" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1221" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="uz" className="h-full antialiased" suppressHydrationWarning>
      <head>
        {/* Mavzu sahifa chizilishidan oldin qo'yiladi (miltillash bo'lmasin) */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Onest:wght@400;500;600;700;800&family=Unbounded:wght@600;700&display=swap"
        />
      </head>
      <body className="min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
