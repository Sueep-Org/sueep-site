"use client";

import { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase";

export function ErpLoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (!auth) {
      setError("Firebase authentication is not initialized");
      setLoading(false);
      return;
    }

    try {
      // Sign in with Firebase
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      
      // Get the Firebase ID token
      const idToken = await userCredential.user.getIdToken();

      // Exchange Firebase token for ERP session
      const res = await fetch("/api/erp/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idToken }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error || "ERP session creation failed");
        setLoading(false);
        return;
      }

      // On app.sueep.com, `/` is the ERP home (middleware rewrites to /erp). Else use /erp on the main site.
      const { hostname } = window.location;
      const appHost =
        hostname === "app.sueep.com" ||
        (process.env.NODE_ENV === "development" && hostname.startsWith("app.localhost"));
      window.location.href = appHost ? "/" : "/erp";
    } catch (err: unknown) {
      setError((err as Error).message || "Sign-in failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-4">
      <div>
        <label htmlFor="erp-email" className="block text-xs font-medium text-zinc-400">
          Email
        </label>
        <input
          id="erp-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
          placeholder="you@example.com"
          required
        />
      </div>
      <div>
        <label htmlFor="erp-pw" className="block text-xs font-medium text-zinc-400">
          Password
        </label>
        <input
          id="erp-pw"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
          placeholder="••••••••"
          required
        />
      </div>
      {error ? (
        <p className="text-xs text-red-400" role="alert">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-md bg-pink-600 px-3 py-2 text-sm font-medium text-white hover:bg-pink-500 disabled:opacity-50"
      >
        {loading ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
