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
  // ✅ เพิ่ม fabric ด้วย
  transpilePackages: ['react-pdf', 'pdfjs-dist', 'fabric'], 

  experimental: {
    missingSuspenseWithCSRBailout: false,
  },
  
  eslint: {
    ignoreDuringBuilds: true,
  },
  
  swcMinify: false,

  webpack: (config, { dev, isServer }) => {
      // ✅ แก้ปัญหา canvas และ encoding (สำหรับ browser เท่านั้น)
      if (!isServer) {
        config.resolve.alias = {
          ...config.resolve.alias,
          canvas: false,
          encoding: false,
        };
        
        // ✅ เพิ่ม fallback สำหรับ Node.js modules
        config.resolve.fallback = {
          ...config.resolve.fallback,
          canvas: false,
          encoding: false,
          fs: false,
          path: false,
          stream: false,
          crypto: false,
        };
      }
      
      config.module.rules.push({
        test: /\.node$/,
        use: 'node-loader',
      });

      // ✅ Ignore warnings จาก heavy dependencies
      config.ignoreWarnings = [
        { module: /node_modules\/fabric/ },
        { module: /node_modules\/pdfjs-dist/ },
        { module: /node_modules\/pdf-lib/ },
      ];

      // ✅ บังคับใช้ source-map
      if (dev) {
        config.devtool = 'source-map';
      }

      return config;
  },
};

// ✅ เปิด PWA กลับมา (ถ้า comment ไว้)
export default withPWA(nextConfig);