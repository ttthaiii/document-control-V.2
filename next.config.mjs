/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    missingSuspenseWithCSRBailout: false,
  },
  
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;