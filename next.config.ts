import type { NextConfig } from "next";

// LAN IPs allowed to load the dev server (e.g. phones scanning table QR codes).
// Set DEV_ORIGINS=192.168.1.18,192.168.1.20 in .env.local when your IP changes.
const devOrigins = (process.env.DEV_ORIGINS ?? "192.168.1.18")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  allowedDevOrigins: devOrigins,
};

export default nextConfig;
