import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppShell } from "@/components/AppShell";
import { getOfficeSummaries, type OfficeSummary } from "@/lib/offices";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Vちゃんねる",
  description: "VTuberの配信スケジュール・ニュース・ランキング",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  let offices: OfficeSummary[] = [];
  try {
    offices = await getOfficeSummaries();
  } catch {
    // 取得失敗時はフィルター/オンボーディングなしで続行
  }

  return (
    <html
      lang="ja"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AppShell offices={offices}>{children}</AppShell>
      </body>
    </html>
  );
}
