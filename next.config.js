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
    // Prevent webpack from bundling server-only packages that rely on Node.js
    // built-in modules (net, tls, etc.). Without this, the redis barrel export
    // is silently broken and every named export becomes undefined.
    serverComponentsExternalPackages: ['redis'],
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
