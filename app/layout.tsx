import type { Metadata } from "next";
import { JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";
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
  title: "FechouMEI",
  description: "Controle financeiro simples para MEIs fecharem o mes com clareza.",
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
      <body>{children}</body>
    </html>
  );
}
