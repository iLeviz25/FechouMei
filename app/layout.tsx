import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";
import { PwaServiceWorkerRegistration } from "@/components/pwa/pwa-service-worker-registration";
import "./globals.css";

const plusJakartaSans = Plus_Jakarta_Sans({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-sans",
});

const jetBrainsMono = JetBrains_Mono({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  applicationName: "FechouMEI",
  title: "FechouMEI",
  description: "Controle financeiro simples para MEIs fecharem o mês com clareza.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "FechouMEI",
    statusBarStyle: "default",
  },
  formatDetection: {
    telephone: false,
  },
  other: {
    "apple-mobile-web-app-capable": "yes",
  },
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#178554",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      className={`${plusJakartaSans.variable} ${jetBrainsMono.variable}`}
      lang="pt-BR"
      suppressHydrationWarning
    >
      <body>
        {children}
        <PwaServiceWorkerRegistration />
      </body>
    </html>
  );
}
