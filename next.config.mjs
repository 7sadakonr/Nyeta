/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow the dev server to accept requests proxied through tunnels / LAN.
  // Required so phones opening the cloudflared HTTPS URL are not blocked.
  allowedDevOrigins: [
    '*.trycloudflare.com',
    '*.ngrok-free.app',
    '*.ngrok.io',
    // LAN testing from phones (adjust IP if yours differs)
    '192.168.1.6:3000',
    '192.168.1.6:3001',
    '192.168.1.13:3000',
    '192.168.1.13',
  ],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Permissions-Policy',
            value: 'camera=*, microphone=*'
          }
        ],
      },
      {
        source: '/sw.js',
        headers: [
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ]
  },
};

export default nextConfig;
