/** @type {import('next').NextConfig} */
const nextConfig = {
  // เราจะลบ output: 'export' ออกไป

  // แต่จะยังคงการตั้งค่านี้ไว้ เพื่อปิด ESLint ตอน Build
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;