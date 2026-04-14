import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FechouMEI",
  description: "Controle financeiro simples para MEIs fecharem o mês com clareza.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
