import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getEstimatorUserFromSession } from "@/lib/estimatorAuthServer";

// Same size/type rules as EmployeeDocument's file upload
// (src/app/api/erp/employees/[id]/documents/route.ts), minus PDF since an
// avatar has to be an image.
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export async function GET() {
  const user = await getEstimatorUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const record = await prisma.estimatorUser.findUnique({
    where: { id: user.id },
    select: { avatarData: true, avatarMimeType: true },
  });

  if (!record?.avatarData) {
    return NextResponse.json({ error: "No avatar set" }, { status: 404 });
  }

  // No caching: this URL is the same for every user ("/api/estimator/avatar",
  // not per-user), so letting the browser cache it would show whichever
  // account's photo happened to load first to everyone after a sign-out/
  // sign-in on the same device. Small image, low cost to always refetch.
  return new NextResponse(record.avatarData as unknown as BodyInit, {
    headers: {
      "Content-Type": record.avatarMimeType ?? "application/octet-stream",
      "Cache-Control": "private, no-store",
    },
  });
}

export async function POST(request: Request) {
  const user = await getEstimatorUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }

  let fd: FormData;
  try {
    fd = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "Image must be 2 MB or smaller" }, { status: 413 });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Only JPEG, PNG, or WEBP images are allowed" }, { status: 415 });
  }

  const avatarData = Buffer.from(await file.arrayBuffer());

  await prisma.estimatorUser.update({
    where: { id: user.id },
    data: { avatarData, avatarMimeType: file.type, avatarUpdatedAt: new Date() },
  });

  return NextResponse.json({ ok: true, avatarUpdatedAt: new Date().toISOString() });
}

export async function DELETE() {
  const user = await getEstimatorUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await prisma.estimatorUser.update({
    where: { id: user.id },
    data: { avatarData: null, avatarMimeType: null, avatarUpdatedAt: null },
  });

  return NextResponse.json({ ok: true });
}
