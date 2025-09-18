// next.config.mjs
var nextConfig = {
  // เราจะลบ output: 'export' ออกไป
  // แต่จะยังคงการตั้งค่านี้ไว้ เพื่อปิด ESLint ตอน Build
  eslint: {
    ignoreDuringBuilds: true
  }
};
var next_config_default = nextConfig;
export {
  next_config_default as default
};
