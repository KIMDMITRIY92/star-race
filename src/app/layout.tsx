import type { Metadata, Viewport } from "next";
import { Manrope, Unbounded } from "next/font/google";
import "./globals.css";

const unbounded = Unbounded({ subsets: ["latin", "cyrillic"], weight: ["500", "700"], variable: "--font-unbounded" });
const manrope = Manrope({ subsets: ["latin", "cyrillic"], weight: ["400", "500", "700"], variable: "--font-manrope" });

export const metadata: Metadata = {
  title: "Звёздная гонка",
  description: "Твой путь с 18 лет рядом со средним человеком страны, верхними 10% и друзьями.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#060a18" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" className={`${unbounded.variable} ${manrope.variable}`}>
      <body>{children}</body>
    </html>
  );
}
