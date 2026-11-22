import type { Metadata } from "next";

import Header from "@/components/Header";

import "./globals.css";

export const metadata: Metadata = {
  title: "麻雀成績管理",
  description: "麻雀の成績を記録・管理する Web アプリ",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <Header />
        <main>{children}</main>
      </body>
    </html>
  );
}
