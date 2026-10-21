import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // Native Node deps for the PDF lane: bundling breaks pdfjs's worker
  // resolution and can interfere with puppeteer's runtime requires.
  serverExternalPackages: ["pdfjs-dist", "puppeteer-core"],
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
