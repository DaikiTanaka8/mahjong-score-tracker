import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 静的エクスポート: `next build` で out/ に HTML・CSS・JS を書き出し、Nginx から配信する
  output: "export",
  // /players -> /players/index.html の形で書き出す(Nginx で配信しやすい)
  trailingSlash: true,
};

export default nextConfig;
