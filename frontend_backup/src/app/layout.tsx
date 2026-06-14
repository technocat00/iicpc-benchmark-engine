import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "IICPC Benchmark Engine — Live Leaderboard",
  description: "Real-time High-Frequency Trading engine benchmarking platform. Live TPS, latency percentiles, and correctness scoring for all contestant trading engines.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>{children}</body>
    </html>
  );
}
