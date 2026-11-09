import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'

/**
 * ─── User Roles ──────────────────────────────────────────────────────────────
 *
 * admin    → /dashboard, /admin/*, /pos, /kitchen   (full access)
 * cashier  → /pos (/cashier)
 * kitchen  → /kitchen
 * customer → /menu, /status/*  (public, no login — anonymous Firebase session)
 *
 * Staff accounts are managed by the owner in Admin → Staff. Each person has a
 * Firebase Auth login (Firebase stores and checks the password) plus a profile
 * in Firestore `staff/{uid}` with their name, role and active flag.
 */
export type UserRole = 'admin' | 'cashier' | 'kitchen'

/** Role → default landing page */
export const ROLE_LANDING: Record<UserRole, string> = {
  admin:   '/dashboard',
  cashier: '/pos',
  kitchen: '/kitchen',
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Staff',
      credentials: {
        idToken: { label: 'Firebase ID token', type: 'text' },
      },
      /**
       * The login page signs in to Firebase first and sends the ID token.
       * We verify it with Google and look up the person's staff profile.
       * No passwords ever reach this code.
       */
      async authorize(credentials) {
        if (!credentials?.idToken) return null
        // Imported lazily so the edge/proxy bundle never pulls in jose/fetch helpers
        const { verifyFirebaseIdToken, fetchStaffProfile } = await import('./staffAuth')
        try {
          const { uid, email } = await verifyFirebaseIdToken(credentials.idToken)
          const profile = await fetchStaffProfile(uid, credentials.idToken)

          if (profile) {
            if (!profile.active) return null // deactivated by the owner
            return { id: uid, email, name: profile.name || email, role: profile.role, demo: profile.demo }
          }
          // No staff profile = not staff. (The owner account is created with
          // `npm run create-owner`; everyone else in Admin → Staff.)
          return null
        } catch (err) {
          console.error('[auth] staff login rejected:', (err as Error).message)
          return null
        }
      },
    }),
  ],

  session: { strategy: 'jwt', maxAge: 12 * 60 * 60 }, // one long shift

  pages: {
    signIn: '/login',
    error:  '/login',
  },

  callbacks: {
    /** Persist the user's role inside the JWT token */
    async jwt({ token, user }) {
      if (user) { token.role = user.role; token.demo = user.demo === true }
      return token
    },
    /** Expose the role on the client-side session object */
    async session({ session, token }) {
      if (session.user) { session.user.role = token.role; session.user.demo = token.demo === true }
      return session
    },
  },

  secret: process.env.NEXTAUTH_SECRET || 'dev-secret-change-me-in-production',
}
