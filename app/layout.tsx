import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "FechouMEI - Controle Financeiro para MEI",
  description:
    "Gerencie suas finanças como MEI de forma simples e inteligente. Acompanhe receitas, despesas e obrigações fiscais em um só lugar.",
  keywords: ["MEI", "controle financeiro", "microempreendedor", "DAS", "DASN"],
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#1a9963",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className={`${inter.variable} bg-background`} suppressHydrationWarning>
      <body className="font-sans">{children}</body>
    </html>
  );
}
