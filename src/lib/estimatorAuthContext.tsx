"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { usePathname, useRouter } from "next/navigation";
import { estimatorAuth } from "@/lib/estimatorFirebase";

type EstimatorUser = {
  id: string;
  email: string;
  displayName: string | null;
  companyId: string | null;
};
type EstimatorAuthContextValue = {
  user: EstimatorUser | null;
  loading: boolean;
  signOut: () => Promise<void>;
  /** Re-pulls the current user from the server, e.g. after creating/joining
   * a company, so the in-memory user.companyId catches up without a full
   * page reload. */
  refreshUser: () => Promise<void>;
};
const EstimatorAuthContext = createContext<
  EstimatorAuthContextValue | undefined
>(undefined);

async function establishSession(firebaseUser: User) {
  const idToken = await firebaseUser.getIdToken();
  const response = await fetch("/api/estimator/auth/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  if (!response.ok) throw new Error("Could not establish estimator session");
  return ((await response.json()) as { user: EstimatorUser }).user;
}

export function EstimatorAuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<EstimatorUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!estimatorAuth) {
      setLoading(false);
      return;
    }
    return onAuthStateChanged(estimatorAuth, async (firebaseUser) => {
      try {
        setUser(firebaseUser ? await establishSession(firebaseUser) : null);
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    });
  }, []);

  useEffect(() => {
    const isEstimatorPublicPath = [
      "/estimator/login",
      "/estimator/signup",
      "/estimator/forgot-password",
    ].includes(pathname);
    const isCompanySetupPath = pathname === "/estimator/company/setup";

    if (loading) return;

    if (user && isEstimatorPublicPath) {
      router.replace(user.companyId ? "/estimator" : "/estimator/company/setup");
      return;
    }

    if (!user && !isEstimatorPublicPath) {
      router.replace("/estimator/login");
      return;
    }

    // Logged in but not attached to a company yet (brand new signup, or a
    // removed member) — gate everything behind setting that up first,
    // except the setup page itself.
    if (user && !user.companyId && !isCompanySetupPath && !isEstimatorPublicPath) {
      router.replace("/estimator/company/setup");
      return;
    }

    // Already has a company, no reason to linger on the setup page.
    if (user && user.companyId && isCompanySetupPath) {
      router.replace("/estimator");
    }
  }, [loading, pathname, router, user]);

  async function signOut() {
    await fetch("/api/estimator/auth/logout", { method: "POST" });
    await estimatorAuth?.signOut();
    setUser(null);
    router.replace("/estimator/login");
  }

  async function refreshUser() {
    try {
      const response = await fetch("/api/estimator/auth/me");
      if (!response.ok) return;
      const { user: refreshed } = (await response.json()) as { user: EstimatorUser };
      setUser(refreshed);
    } catch {
      // Leave the current user state as-is, whatever triggered the refresh
      // can surface its own error.
    }
  }

  return (
    <EstimatorAuthContext.Provider value={{ user, loading, signOut, refreshUser }}>
      {children}
    </EstimatorAuthContext.Provider>
  );
}

export function useEstimatorAuth() {
  const context = useContext(EstimatorAuthContext);
  if (!context)
    throw new Error(
      "useEstimatorAuth must be used within EstimatorAuthProvider",
    );
  return context;
}
