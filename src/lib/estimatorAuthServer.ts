import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getEstimatorAdminAuth } from "@/lib/estimatorAdmin";
import { estimatorSessionCookieName, verifyEstimatorSessionToken } from "@/lib/estimatorSession";

export async function getEstimatorUserFromSession() {
  const token = (await cookies()).get(estimatorSessionCookieName)?.value;
  if (!token) return null;

  try {
    const session = await verifyEstimatorSessionToken(token);
    const user = await prisma.estimatorUser.findUnique({ where: { id: session.userId } });
    if (!user || user.firebaseUid !== session.firebaseUid) return null;
    return user;
  } catch {
    return null;
  }
}

export async function verifyEstimatorIdToken(idToken: string) {
  return getEstimatorAdminAuth().verifyIdToken(idToken);
}