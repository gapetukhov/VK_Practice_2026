/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'backend',
        port: '5000',
        pathname: '/uploads/**',
      },
      {
        protocol: 'http',
        hostname: '127.0.0.1',
        port: '5000',
        pathname: '/uploads/**',
      },
    ],
    // Для Next.js версии ниже 12.3.0 используйте domains вместо remotePatterns:
    // domains: ['localhost', '127.0.0.1'],
  },
}

module.exports = nextConfig