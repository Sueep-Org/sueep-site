"use client";

import { getApps, initializeApp } from "firebase/app";
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";

function getFirebaseApp() {
  const existing = getApps()[0];
  if (existing) return existing;
  return initializeApp({
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  });
}

export async function uploadCandidateFile(
  token: string,
  label: string,
  file: File,
  onProgress?: (pct: number) => void
): Promise<string> {
  const app = getFirebaseApp();
  const storage = getStorage(app);

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const safeLabel = label.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `candidate-paperwork/${token}/${safeLabel}/${safeName}`;
  const storageRef = ref(storage, path);

  return new Promise((resolve, reject) => {
    const task = uploadBytesResumable(storageRef, file);
    task.on(
      "state_changed",
      (snap) => {
        if (onProgress) {
          onProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100));
        }
      },
      reject,
      () => {
        getDownloadURL(task.snapshot.ref).then(resolve).catch(reject);
      }
    );
  });
}

export async function uploadChecklistSectionPhoto(
  projectId: string,
  sectionId: string,
  photoType: "before" | "after",
  file: File,
  onProgress?: (pct: number) => void
): Promise<string> {
  const app = getFirebaseApp();
  const storage = getStorage(app);

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `checklist-photos/${projectId}/${sectionId}/${photoType}/${Date.now()}-${safeName}`;
  const storageRef = ref(storage, path);

  return new Promise((resolve, reject) => {
    const task = uploadBytesResumable(storageRef, file);
    task.on(
      "state_changed",
      (snap) => {
        if (onProgress) onProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100));
      },
      reject,
      () => { getDownloadURL(task.snapshot.ref).then(resolve).catch(reject); }
    );
  });
}

export async function uploadQualityCheckEvidenceFile(
  qualityCheckKey: string,
  file: File,
  onProgress?: (pct: number) => void
): Promise<string> {
  const app = getFirebaseApp();
  const storage = getStorage(app);

  const safeKey = qualityCheckKey.replace(/[^a-zA-Z0-9._-]/g, "_");
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `quality-check-evidence/${safeKey}/${Date.now()}-${safeName}`;
  const storageRef = ref(storage, path);

  return new Promise((resolve, reject) => {
    const task = uploadBytesResumable(storageRef, file);
    task.on(
      "state_changed",
      (snap) => {
        if (onProgress) {
          onProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100));
        }
      },
      reject,
      () => {
        getDownloadURL(task.snapshot.ref).then(resolve).catch(reject);
      }
    );
  });
}
