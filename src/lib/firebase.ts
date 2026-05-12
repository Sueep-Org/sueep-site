'use client';

import { getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Initialize Firebase only in the browser environment
const initializeFirebase = () => {
  if (typeof window === 'undefined') {
    // Server environment - return null
    return null;
  }
  
  // Client environment - initialize Firebase
  try {
    const apps = getApps();
    return apps.length === 0 ? initializeApp(firebaseConfig) : apps[0];
  } catch (error) {
    console.error('Failed to initialize Firebase:', error);
    return null;
  }
};

const app = initializeFirebase();
export const auth = app ? getAuth(app) : null;
