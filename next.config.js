/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: [],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
  webpack: (config, { isServer }) => {
    // Exclude test files and dev dependencies from client bundle
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      }
    }
    
    // Ignore test files and dev dependencies
    config.resolve.alias = {
      ...config.resolve.alias,
      'tap': false,
      'tape': false,
      'why-is-node-running': false,
    }
    
    // Ignore test files in node_modules
    config.module.rules.push({
      test: /\.test\.(js|jsx|ts|tsx)$/,
      use: 'ignore-loader',
    })
    
    return config
  },
}

module.exports = nextConfig

