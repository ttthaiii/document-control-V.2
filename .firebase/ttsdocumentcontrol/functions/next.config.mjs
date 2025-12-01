// next.config.mjs
import withPWAInit from "@ducanh2912/next-pwa";
var withPWA = withPWAInit({
  dest: "public",
  register: false,
  skipWaiting: true,
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  swcMinify: true,
  disable: process.env.NODE_ENV === "development",
  workboxOptions: {
    disableDevLogs: true
  },
  importScripts: ["/firebase-messaging-sw.js"]
});
var nextConfig = {
  // ✅ เพิ่ม fabric ด้วย
  transpilePackages: ["react-pdf", "pdfjs-dist", "fabric"],
  experimental: {
    missingSuspenseWithCSRBailout: false
  },
  eslint: {
    ignoreDuringBuilds: true
  },
  swcMinify: false,
  webpack: (config, { dev, isServer }) => {
    if (!isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        canvas: false,
        encoding: false
      };
      config.resolve.fallback = {
        ...config.resolve.fallback,
        canvas: false,
        encoding: false,
        fs: false,
        path: false,
        stream: false,
        crypto: false
      };
    }
    config.module.rules.push({
      test: /\.node$/,
      use: "node-loader"
    });
    config.ignoreWarnings = [
      { module: /node_modules\/fabric/ },
      { module: /node_modules\/pdfjs-dist/ },
      { module: /node_modules\/pdf-lib/ }
    ];
    if (dev) {
      config.devtool = "source-map";
    }
    return config;
  }
};
var next_config_default = withPWA(nextConfig);
export {
  next_config_default as default
};
