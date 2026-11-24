import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // 짧은 팸 초대 주소: /f/7K2Q -> 팸 참여 화면 (QR · NFC 태그 · 카톡 링크)
  async redirects() {
    return [{ source: "/f/:code", destination: "/fam/join?code=:code", permanent: false }];
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
