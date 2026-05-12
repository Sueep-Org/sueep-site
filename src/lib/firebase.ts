import { getApps, initializeApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";

function createAuth(): Auth | null {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim();
  if (!apiKey) return null;

  try {
    const firebaseConfig = {
      apiKey,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "",
      messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "",
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "",
    };
    const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0]!;
    return getAuth(app);
  } catch {
    // Invalid/misconfigured key (e.g. build env missing vars) — avoid crashing SSR/prerender.
    return null;
  }
}

/** Null when Firebase web env is missing or invalid (ERP and other routes still build and run). */
export const auth: Auth | null = createAuth();
