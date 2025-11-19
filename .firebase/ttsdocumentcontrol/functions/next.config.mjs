// next.config.mjs
import withPWAInit from "@ducanh2912/next-pwa";
var withPWA = withPWAInit({
  dest: "public",
  // ✅✅✅ เพิ่ม 2 บรรทัดนี้ครับ ✅✅✅
  register: false,
  // 👈 สำคัญที่สุด! ปิดการลงทะเบียนอัตโนมัติ เพื่อให้ useAuth.tsx ทำงานแทน
  skipWaiting: true,
  // 👈 ให้ SW ตัวใหม่ทำงานทันทีที่มีการอัปเดต (ไม่ต้องรอปิดแอป)
  // ✅✅✅ ----------------------- ✅✅✅
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  swcMinify: true,
  disable: false,
  workboxOptions: {
    disableDevLogs: true
  },
  // บรรทัดนี้ปล่อยไว้ได้ครับ แม้เราจะไม่ได้ใช้ sw.js หลัก แต่มันไม่มีผลเสีย
  importScripts: ["/firebase-messaging-sw.js"]
});
var nextConfig = {
  experimental: {
    missingSuspenseWithCSRBailout: false
  },
  eslint: {
    ignoreDuringBuilds: true
  }
};
var next_config_default = withPWA(nextConfig);
export {
  next_config_default as default
};
