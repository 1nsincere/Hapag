import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions, UserRole } from '@/lib/auth'

/**
 * Helper for server-side API route protection.
 *
 * Usage in any API route:
 * ```ts
 * import { requireRole } from '@/lib/auth-guard'
 *
 * export async function GET() {
 *   const guard = await requireRole('admin')
 *   if (guard) return guard  // 401 or 403 response
 *   // … safe to proceed
 * }
 * ```
 *
 * Returns `null` if the user has one of the allowed roles,
 * or an appropriate error NextResponse if not.
 */
export async function requireRole(
  ...allowedRoles: UserRole[]
): Promise<NextResponse | null> {
  const session = await getServerSession(authOptions)

  if (!session) {
    return NextResponse.json(
      { error: 'Unauthorized — not signed in' },
      { status: 401 },
    )
  }

  const role: UserRole | undefined = session.user?.role

  if (!role || !allowedRoles.includes(role)) {
    return NextResponse.json(
      { error: `Forbidden — requires role: ${allowedRoles.join(' or ')}` },
      { status: 403 },
    )
  }

  return null // access granted
}
