import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'

/**
 * ─── User Roles ──────────────────────────────────────────────────────────────
 *
 * admin    → /dashboard, /admin/*, /pos, /kitchen   (full access)
 * cashier  → /pos only  (formerly /cashier)
 * kitchen  → /kitchen only
 * customer → /menu, /order, /status/*  (public, no login required)
 */
export type UserRole = 'admin' | 'cashier' | 'kitchen'

/**
 * ─── Credentials Store ──────────────────────────────────────────────────────
 *
 * In production, replace this with a real database (Firebase Firestore,
 * PostgreSQL, etc.).  Passwords should be hashed with bcrypt.
 *
 * For now, seeded demo accounts make it easy to test all roles.
 */
const USERS: { id: string; email: string; password: string; name: string; role: UserRole }[] = [
  { id: '1', email: 'admin@restaurant.com',   password: 'admin123',   name: 'Admin',       role: 'admin' },
  { id: '2', email: 'cashier@restaurant.com', password: 'cashier123', name: 'Cashier',     role: 'cashier' },
  { id: '3', email: 'kitchen@restaurant.com', password: 'kitchen123', name: 'Kitchen Chef', role: 'kitchen' },
]

/** Role → default landing page */
export const ROLE_LANDING: Record<UserRole, string> = {
  admin:   '/dashboard',
  cashier: '/pos',
  kitchen: '/kitchen',
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email:    { label: 'Email',    type: 'email'    },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        const user = USERS.find(
          u => u.email === credentials.email && u.password === credentials.password,
        )

        if (!user) return null

        // Return only serialisable fields — NextAuth stores this in the JWT
        return { id: user.id, email: user.email, name: user.name, role: user.role }
      },
    }),
  ],

  session: { strategy: 'jwt' },

  pages: {
    signIn: '/login',
    error:  '/login',
  },

  callbacks: {
    /** Persist the user's role inside the JWT token */
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role
      }
      return token
    },

    /** Expose the role on the client-side session object */
    async session({ session, token }) {
      if (session.user) {
        session.user.role = token.role
      }
      return session
    },
  },

  secret: process.env.NEXTAUTH_SECRET || 'dev-secret-change-me-in-production',
}
