/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@evalboard/core", "@evalboard/stats", "@evalboard/db"],
};

export default nextConfig;

