import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Simple in-memory rate limiter for development/MVP
 * For production, use Redis-based rate limiting (Upstash, etc.)
 */

interface RateLimitEntry {
  count: number
  resetTime: number
}

// In-memory store for rate limiting
// Note: This is per-instance and will reset on server restart
// For production, use a distributed cache like Redis
const rateLimitStore = new Map<string, RateLimitEntry>()

// Rate limit configuration
const RATE_LIMIT_CONFIG = {
  windowMs: 60 * 1000, // 1 minute window
  maxRequests: 60, // 60 requests per minute per IP
  // Stricter limits for certain endpoints
  strictEndpoints: {
    '/api/agent/interact': { windowMs: 60 * 1000, maxRequests: 20 },
    '/api/claude': { windowMs: 60 * 1000, maxRequests: 10 },
    '/api/webhooks': { windowMs: 60 * 1000, maxRequests: 30 },
  } as Record<string, { windowMs: number; maxRequests: number }>
}

function getClientId(request: NextRequest): string {
  // Get IP from various headers (handles proxies)
  const forwardedFor = request.headers.get('x-forwarded-for')
  const realIp = request.headers.get('x-real-ip')
  const cfIp = request.headers.get('cf-connecting-ip')

  return cfIp || realIp || forwardedFor?.split(',')[0]?.trim() || '127.0.0.1'
}

function checkRateLimit(
  clientId: string,
  path: string
): { allowed: boolean; remaining: number; resetIn: number } {
  const now = Date.now()

  // Determine which config to use
  let config = { windowMs: RATE_LIMIT_CONFIG.windowMs, maxRequests: RATE_LIMIT_CONFIG.maxRequests }
  for (const [endpoint, endpointConfig] of Object.entries(RATE_LIMIT_CONFIG.strictEndpoints)) {
    if (path.startsWith(endpoint)) {
      config = endpointConfig
      break
    }
  }

  const key = `${clientId}:${path.split('/').slice(0, 3).join('/')}`
  const entry = rateLimitStore.get(key)

  if (!entry || now > entry.resetTime) {
    // Create new window
    rateLimitStore.set(key, {
      count: 1,
      resetTime: now + config.windowMs
    })
    return { allowed: true, remaining: config.maxRequests - 1, resetIn: config.windowMs }
  }

  if (entry.count >= config.maxRequests) {
    return { allowed: false, remaining: 0, resetIn: entry.resetTime - now }
  }

  entry.count++
  return { allowed: true, remaining: config.maxRequests - entry.count, resetIn: entry.resetTime - now }
}

// Cleanup old entries periodically
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now > entry.resetTime) {
      rateLimitStore.delete(key)
    }
  }
}, 60 * 1000) // Cleanup every minute

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname

  // Only rate limit API routes
  if (!path.startsWith('/api')) {
    return NextResponse.next()
  }

  // Skip rate limiting for health check
  if (path === '/api/health') {
    return NextResponse.next()
  }

  const clientId = getClientId(request)
  const { allowed, remaining, resetIn } = checkRateLimit(clientId, path)

  if (!allowed) {
    return NextResponse.json(
      {
        error: 'Too many requests',
        retryAfter: Math.ceil(resetIn / 1000)
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil(resetIn / 1000)),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Math.ceil(resetIn / 1000))
        }
      }
    )
  }

  // Add rate limit headers to response
  const response = NextResponse.next()
  response.headers.set('X-RateLimit-Remaining', String(remaining))
  response.headers.set('X-RateLimit-Reset', String(Math.ceil(resetIn / 1000)))

  return response
}

export const config = {
  matcher: '/api/:path*'
}
