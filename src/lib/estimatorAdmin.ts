import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

function getEstimatorAdminApp() {
  const existing = getApps().find((app) => app.name === "estimator");
  if (existing) return existing;

  const privateKey = process.env.ESTIMATOR_FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const projectId = process.env.ESTIMATOR_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.ESTIMATOR_FIREBASE_CLIENT_EMAIL;
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("Estimator Firebase Admin credentials are not configured");
  }

  return initializeApp(
    { credential: cert({ projectId, clientEmail, privateKey }) },
    "estimator",
  );
}

export function getEstimatorAdminAuth() {
  return getAuth(getEstimatorAdminApp());
}