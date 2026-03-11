/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    typedRoutes: true
  },
  webpack: (config, { dev }) => {
    if (dev) {
      // Avoid intermittent stale server chunk references on Windows during `next dev`.
      config.cache = false;
    }

    return config;
  }
};

export default nextConfig;
