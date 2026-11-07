import { initializeApp, getApps } from 'firebase/app'
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore'
import { getAuth } from 'firebase/auth'

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
}

// Initialize once (Next.js re-evaluates modules during dev / SSR)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0]

/**
 * Firestore with a persistent offline cache in the browser:
 *  • changes made while the Wi-Fi blips are saved locally and sync when it's back —
 *    even if the page is refreshed in between (the default memory cache loses them)
 *  • screens open faster from the local cache
 * Several open tabs (cashier + kitchen on one PC) share the cache safely.
 * On the server (SSR) there's no IndexedDB, so it uses the default memory cache.
 */
function createDb(): Firestore {
  if (typeof window === 'undefined') return getFirestore(app)
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    })
  } catch {
    // Already initialized (hot reload) — reuse the existing instance
    return getFirestore(app)
  }
}

export const db = createDb()
export const auth = getAuth(app)
