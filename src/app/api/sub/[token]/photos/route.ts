import { NextResponse } from "next/server";
import { requireSignedInSub } from "@/lib/erp/subPortalAccess";
import { parsePosition } from "@/lib/erp/subCheckIns";
import { MAX_PHOTO_UPLOAD_BYTES, parsePhotoKind, savePhoto } from "@/lib/erp/subPhotos";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ token: string }> };

/**
 * One before/after photo from the Today tab. Form data: file, jobKey, kind
 * (before | after), area?, takenAt? (photos sent late from the phone's queue),
 * latitude?, longitude?, accuracy?
 */
export async function POST(req: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  const access = await requireSignedInSub(token);
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid request", code: "INVALID" }, { status: 400 });
  }
  const file = form.get("file");
  const jobKey = String(form.get("jobKey") ?? "");
  const kind = parsePhotoKind(form.get("kind"));
  if (!(file instanceof File) || !kind || !/^(p|co):[\w-]+$/.test(jobKey)) {
    return NextResponse.json({ error: "Invalid request", code: "INVALID" }, { status: 400 });
  }
  if (file.size > MAX_PHOTO_UPLOAD_BYTES) return NextResponse.json({ error: "Photo too large", code: "TOO_BIG" }, { status: 413 });

  const text = (k: string) => {
    const v = form.get(k);
    return typeof v === "string" ? v : undefined;
  };
  const result = await savePhoto(access.sub, {
    jobKey,
    kind,
    area: text("area"),
    takenAt: text("takenAt"),
    position: parsePosition({ latitude: text("latitude"), longitude: text("longitude"), accuracy: text("accuracy") }),
    bytes: Buffer.from(await file.arrayBuffer()),
  });
  if ("error" in result) {
    const status = result.code === "BAD_IMAGE" ? 415 : result.code === "TOO_BIG" ? 413 : 409;
    return NextResponse.json(result, { status });
  }
  return NextResponse.json(result);
}
