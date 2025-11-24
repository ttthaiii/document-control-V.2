// next.config.mjs
import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  register: false,
  skipWaiting: true,
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  swcMinify: true,
  disable: process.env.NODE_ENV === "development",
  workboxOptions: {
    disableDevLogs: true,
  },
  importScripts: ["/firebase-messaging-sw.js"], 
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  // ✅ เพิ่มบรรทัดนี้ช่วยเรื่อง ESM Packages
  transpilePackages: ['react-pdf', 'pdfjs-dist'], 

  experimental: {
    missingSuspenseWithCSRBailout: false,
  },
  
  eslint: {
    ignoreDuringBuilds: true,
  },
  
  swcMinify: false,

  webpack: (config, { dev }) => {
      config.resolve.alias.canvas = false;
      config.resolve.alias.encoding = false;
      
      config.module.rules.push({
        test: /\.node$/,
        use: 'node-loader',
      });

      // ✅ บังคับใช้ source-map
      if (dev) {
        config.devtool = 'source-map';
      }

      return config;
  },
};

// ❌ ของเดิม: export default withPWA(nextConfig);
// ✅ แก้เป็น: ส่งออก config เพียวๆ เพื่อเทสว่าหาย Error ไหม
export default nextConfig;