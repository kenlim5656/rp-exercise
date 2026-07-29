import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  outputFileTracingIncludes: {
    "/**/*": ["./db/rp.db", "./db/schema.sql", "./data/runs/**/*"],
  },
};

export default nextConfig;
