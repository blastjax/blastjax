import type { NextConfig } from "next";

const staticExport = process.env.STATIC_EXPORT === "1";
const basePathRaw = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").trim().replace(/^\/+/, "").replace(/\/+$/, "");
const basePath = basePathRaw ? `/${basePathRaw}` : "";

const nextConfig: NextConfig = {
  ...(staticExport
    ? {
        output: "export" as const,
        trailingSlash: true,
      }
    : {
        output: "standalone" as const,
      }),
  ...(basePath ? { basePath, assetPrefix: basePath } : {}),
  ...(process.env.TURBOPACK
    ? {}
    : {
        webpack: (config, { dev }) => {
          if (dev && process.platform === "win32") {
            config.cache = { type: "memory" };
          }
          return config;
        },
      }),
};

export default nextConfig;
