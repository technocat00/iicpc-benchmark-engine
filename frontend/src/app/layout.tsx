import type { Metadata } from "next";
import { PT_Serif, IBM_Plex_Mono, Inter } from "next/font/google";
import "./globals.css";

const ptSerif = PT_Serif({
  weight: ["400", "700"],
  variable: "--font-pt-serif",
  subsets: ["latin"],
});

const plexMono = IBM_Plex_Mono({
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "IICPC Benchmark Engine",
  description: "High-Signal Evaluation of Quantitative Thinking",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${ptSerif.variable} ${plexMono.variable} ${inter.variable} h-full antialiased bg-[#fdfdfd]`}
    >
      <body className="min-h-full flex flex-col font-sans text-slate-900">{children}</body>
    </html>
  );
}
