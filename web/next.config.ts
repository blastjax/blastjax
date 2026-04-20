import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * On Windows, webpack’s default filesystem cache often hits ENOENT/rename races
   * (PackFileCacheStrategy, missing routes-manifest). Memory cache avoids that.
   * Turbopack (`next dev --turbopack`) does not use this hook.
   */
  webpack: (config, { dev }) => {
    if (dev && process.platform === "win32") {
      config.cache = { type: "memory" };
    }
    return config;
  },
};

export default nextConfig;
