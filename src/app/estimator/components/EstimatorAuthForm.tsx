"use client";

import { useState } from "react";
import { createUserWithEmailAndPassword, sendPasswordResetEmail, signInWithEmailAndPassword, updateProfile } from "firebase/auth";
import { useRouter } from "next/navigation";
import { estimatorAuth } from "@/lib/estimatorFirebase";

type Mode = "signin" | "signup" | "reset";

export function EstimatorAuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(""); setMessage(""); setLoading(true);
    if (!estimatorAuth) { setError("Estimator authentication is not configured"); setLoading(false); return; }
    try {
      if (mode === "reset") {
        await sendPasswordResetEmail(estimatorAuth, email);
        setMessage("Check your email for a password reset link.");
      } else {
        const credential = mode === "signup"
          ? await createUserWithEmailAndPassword(estimatorAuth, email, password)
          : await signInWithEmailAndPassword(estimatorAuth, email, password);
        if (mode === "signup" && displayName) await updateProfile(credential.user, { displayName });
        await credential.user.getIdToken(true);
        router.replace("/estimator");
      }
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Authentication failed"); }
    finally { setLoading(false); }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {mode === "signup" ? <input aria-label="Display name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Display name" autoComplete="name" className="w-full rounded-md border border-slate-300 px-3 py-2" required /> : null}
      <input aria-label="Email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" autoComplete="email" className="w-full rounded-md border border-slate-300 px-3 py-2" required />
      {mode !== "reset" ? <input aria-label="Password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" autoComplete={mode === "signup" ? "new-password" : "current-password"} className="w-full rounded-md border border-slate-300 px-3 py-2" minLength={6} required /> : null}
      {error ? <p className="text-sm text-red-600" role="alert">{error}</p> : null}
      {message ? <p className="text-sm text-emerald-700" role="status">{message}</p> : null}
      <button type="submit" disabled={loading} className="w-full rounded-md bg-pink-600 px-3 py-2 font-medium text-white disabled:opacity-50">{loading ? "Working..." : mode === "signup" ? "Create estimator account" : mode === "reset" ? "Send reset email" : "Sign in"}</button>
    </form>
  );
}