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
  webpack: (config) => {
    // Ignore optional Solana dependencies that Privy tries to import
    config.resolve.alias = {
      ...config.resolve.alias,
      '@solana-program/system': false,
      '@solana/web3.js': false,
    }
    return config
  },
}

module.exports = nextConfig

