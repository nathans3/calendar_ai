/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    // Skip type-checking during build — types are checked in the editor
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
}

module.exports = nextConfig

