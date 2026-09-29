/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep production verification from overwriting the running dev preview.
  distDir: process.env.NODE_ENV === 'production' ? '.next-production' : '.next',
};

export default nextConfig;
