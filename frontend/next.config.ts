import withSerwistInit from "@serwist/next";
import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";
import { randomUUID } from "node:crypto";
import path from "path";

const revision = process.env.GIT_SHA ?? randomUUID();

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const withSerwist = withSerwistInit({
  swSrc: "src/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
  additionalPrecacheEntries: [{ url: "/~offline", revision }],
});

const nextConfig: NextConfig = {
  // Use standalone in Docker/Linux or when explicitly requested; Windows dev builds omit standalone to avoid symlink EPERM
  output: process.platform === "win32" && !process.env.STANDALONE ? undefined : "standalone",
  outputFileTracingRoot: path.resolve(__dirname),
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: "http://localhost:8000/api/v1/:path*",
      },
    ];
  },
};

export default withSerwist(withNextIntl(nextConfig));
