"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { usePathname, useRouter } from "next/navigation";
import { estimatorAuth } from "@/lib/estimatorFirebase";

type EstimatorUser = { id: string; email: string; displayName: string | null };
type EstimatorAuthContextValue = { user: EstimatorUser | null; loading: boolean; signOut: () => Promise<void> };
const EstimatorAuthContext = createContext<EstimatorAuthContextValue | undefined>(undefined);

async function establishSession(firebaseUser: User) {
  const idToken = await firebaseUser.getIdToken();
  const response = await fetch("/api/estimator/auth/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ idToken }) });
  if (!response.ok) throw new Error("Could not establish estimator session");
  return ((await response.json()) as { user: EstimatorUser }).user;
}

export function EstimatorAuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<EstimatorUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!estimatorAuth) { setLoading(false); return; }
    return onAuthStateChanged(estimatorAuth, async (firebaseUser) => {
      try { setUser(firebaseUser ? await establishSession(firebaseUser) : null); }
      catch { setUser(null); }
      finally { setLoading(false); }
    });
  }, []);

  useEffect(() => {
    if (!loading && !user && !["/estimator/login", "/estimator/signup", "/estimator/forgot-password"].includes(pathname)) router.replace("/estimator/login");
  }, [loading, pathname, router, user]);

  async function signOut() {
    await fetch("/api/estimator/auth/logout", { method: "POST" });
    await estimatorAuth?.signOut();
    setUser(null);
    router.replace("/estimator/login");
  }

  return <EstimatorAuthContext.Provider value={{ user, loading, signOut }}>{children}</EstimatorAuthContext.Provider>;
}

export function useEstimatorAuth() {
  const context = useContext(EstimatorAuthContext);
  if (!context) throw new Error("useEstimatorAuth must be used within EstimatorAuthProvider");
  return context;
}