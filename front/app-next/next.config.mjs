/** @type {import('next').NextConfig} */
const nextConfig = {
  /* config options here */
  reactCompiler: true,
  async redirects() {
    return [
      { source: "/verify", destination: "/#verify", permanent: true },
      { source: "/wallet-signin", destination: "/login", permanent: true },
    ];
  },
};

export default nextConfig;
