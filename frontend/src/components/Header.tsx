"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const MENU = [
  { href: "/", label: "成績", match: (path: string) => path === "/" },
  { href: "/games/", label: "対局", match: (path: string) => path.startsWith("/games") },
  { href: "/players/", label: "プレイヤー", match: (path: string) => path.startsWith("/players") },
];

/** 全画面で共通の上部メニュー。今開いている画面のメニューを強調する。 */
export default function Header() {
  const pathname = usePathname();

  return (
    <header className="nav">
      <span className="brand">麻雀成績管理</span>
      {MENU.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={item.match(pathname) ? "active" : undefined}
        >
          {item.label}
        </Link>
      ))}
    </header>
  );
}
