"use client";

import { getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const estimatorFirebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_ESTIMATOR_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_ESTIMATOR_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_ESTIMATOR_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_ESTIMATOR_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_ESTIMATOR_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_ESTIMATOR_FIREBASE_APP_ID,
};

const estimatorApp =
  typeof window === "undefined"
    ? null
    : getApps().find((app) => app.name === "estimator") ??
      initializeApp(estimatorFirebaseConfig, "estimator");

export const estimatorAuth = estimatorApp ? getAuth(estimatorApp) : null;