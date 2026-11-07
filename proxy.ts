import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'

/**
 * ─── Role-Based Proxy (formerly middleware) ───────────────────────────────────────────────────
 *
 * Intercepts protected routes and checks the JWT token's role before allowing
 * access.  Unauthenticated users are sent to /login; authenticated users
 * visiting routes outside their role land on /unauthorized.
 *
 * Public routes (/menu, /order, /status, /) are excluded via the matcher
 * config below — customers access them freely via QR without logging in.
 */
export async function proxy(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET || 'dev-secret-change-me-in-production' })
  const { pathname } = req.nextUrl

  // ── Not authenticated → redirect to login ──────────────────────────────────
  if (!token) {
    const loginUrl = new URL('/login', req.url)
    loginUrl.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(loginUrl)
  }

  const role = token.role as string

  // ── /pos — cashier and admin only ──────────────────────────────────────────
  if (pathname.startsWith('/pos') && role !== 'cashier' && role !== 'admin') {
    return NextResponse.redirect(new URL('/unauthorized', req.url))
  }

  // ── /cashier — cashier and admin only (legacy alias) ───────────────────────
  if (pathname.startsWith('/cashier') && role !== 'cashier' && role !== 'admin') {
    return NextResponse.redirect(new URL('/unauthorized', req.url))
  }

  // ── /kitchen — kitchen and admin only ──────────────────────────────────────
  if (pathname.startsWith('/kitchen') && role !== 'kitchen' && role !== 'admin') {
    return NextResponse.redirect(new URL('/unauthorized', req.url))
  }

  // ── /dashboard — admin only ────────────────────────────────────────────────
  if (pathname.startsWith('/dashboard') && role !== 'admin') {
    return NextResponse.redirect(new URL('/unauthorized', req.url))
  }

  // ── /admin — admin only ────────────────────────────────────────────────────
  if (pathname.startsWith('/admin') && role !== 'admin') {
    return NextResponse.redirect(new URL('/unauthorized', req.url))
  }

  return NextResponse.next()
}

/**
 * Only intercept protected routes.  Everything else (public customer pages,
 * static assets, API routes, etc.) passes through unguarded.
 */
export const config = {
  matcher: [
    '/pos/:path*',
    '/cashier/:path*',
    '/kitchen/:path*',
    '/dashboard/:path*',
    '/admin/:path*',
  ],
}
