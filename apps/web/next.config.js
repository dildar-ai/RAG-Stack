/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        // The embeddable widget is designed to be iframed on any customer
        // domain, so it must not inherit frame-nesting restrictions.
        source: '/widget/:path*',
        headers: [
          { key: 'X-Frame-Options', value: '' },
          { key: 'Content-Security-Policy', value: 'frame-ancestors *' },
        ],
      },
      {
        // Everything else (dashboard, auth) refuses to be framed anywhere.
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
