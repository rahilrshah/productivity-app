/** @type {import('next').NextConfig} */

// Get Ollama URL from environment (defaults to localhost)
const ollamaUrl = process.env.NEXT_PUBLIC_OLLAMA_BASE_URL || 'http://localhost:11434'

// Build CSP based on environment
const isDev = process.env.NODE_ENV !== 'production'

// CSP directives - more restrictive in production
const cspDirectives = {
  'default-src': ["'self'"],
  'script-src': isDev
    ? ["'self'", "'unsafe-inline'"] // Dev: allow inline for hot reload
    : ["'self'"], // Prod: strict, no inline scripts
  'style-src': ["'self'", "'unsafe-inline'"], // Next.js requires inline styles
  'img-src': ["'self'", 'data:', 'blob:'],
  'font-src': ["'self'"],
  'connect-src': [
    "'self'",
    'https://*.supabase.co',
    ollamaUrl,
    'http://localhost:11434', // Fallback for local dev
  ],
  'frame-ancestors': ["'none'"],
  'form-action': ["'self'"],
  'base-uri': ["'self'"],
  'object-src': ["'none'"],
}

const cspString = Object.entries(cspDirectives)
  .map(([key, values]) => `${key} ${values.join(' ')}`)
  .join('; ')

const nextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,

  // Security headers
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block'
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin'
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()'
          },
          {
            key: 'Content-Security-Policy',
            value: cspString
          }
        ]
      }
    ];
  }
};

module.exports = nextConfig;
