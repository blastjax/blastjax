import type { NextConfig } from "next";

const staticExport = process.env.STATIC_EXPORT === "1";
/** Slug only (e.g. ``blastjax``); leading ``/`` is added here so Git Bash does not rewrite ``/repo`` paths. */
const basePathRaw = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").trim().replace(/^\/+/, "").replace(/\/+$/, "");
const basePath = basePathRaw ? `/${basePathRaw}` : "";

const nextConfig: NextConfig = {
  ...(staticExport
    ? {
        output: "export" as const,
        /** Static hosts often map directories as ``/path/index.html``; trailing slashes avoid 404 on refresh. */
        trailingSlash: true,
      }
    : {
        /** Minimal runtime for Docker (`docker/Dockerfile.web` runner stage). */
        output: "standalone" as const,
      }),
  ...(basePath ? { basePath, assetPrefix: basePath } : {}),
  /**
   * On Windows, webpack’s default filesystem cache often hits ENOENT/rename races
   * (PackFileCacheStrategy, missing routes-manifest). Memory cache avoids that.
   * Turbopack (`--turbopack` sets TURBOPACK=1) ignores this hook, and Next warns
   * "Webpack is configured while Turbopack is not" if it is present, so omit it there.
   */
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
