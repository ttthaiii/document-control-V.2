// next.config.mjs
var nextConfig = {
  experimental: {
    missingSuspenseWithCSRBailout: false
  },
  eslint: {
    ignoreDuringBuilds: true
  }
};
var next_config_default = nextConfig;
export {
  next_config_default as default
};
