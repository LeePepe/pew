import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: {
    root: path.join(__dirname, "../.."),
  },
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
