import type { UserRole } from './auth'
import 'next-auth'
import 'next-auth/jwt'

/**
 * Module augmentation so TypeScript knows about session.user.role
 * and token.role throughout the codebase.
 */
declare module 'next-auth' {
  interface Session {
    user: {
      name?: string | null
      email?: string | null
      image?: string | null
      role: UserRole
      /** true only for the public demo accounts (portfolio site) */
      demo?: boolean
    }
  }

  interface User {
    role: UserRole
    demo?: boolean
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    role: UserRole
    demo?: boolean
  }
}
