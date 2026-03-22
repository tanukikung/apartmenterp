/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  env: {},
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
  experimental: {
    // Enable the instrumentation.ts hook (server startup + job scheduler).
    instrumentationHook: true,
  },
  output: 'standalone',
  // Ensure Node.js built-in modules (crypto, fs, etc.) are treated as externals
  // on the server side, so webpack does not try to polyfill them.
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externalsPresets = { ...config.externalsPresets, node: true };
    }
    return config;
  },
};

module.exports = nextConfig;
