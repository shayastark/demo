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
  // Use webpack (Turbopack doesn't support all webpack features yet)
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Polyfills for Solana web3.js (needed by Daimo Pay)
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: require.resolve('crypto-browserify'),
        stream: require.resolve('stream-browserify'),
        http: require.resolve('stream-http'),
        https: require.resolve('https-browserify'),
        zlib: require.resolve('browserify-zlib'),
        url: require.resolve('url'),
      }
    }
    return config
  },
}

module.exports = nextConfig
