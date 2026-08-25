import { createHmac } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { isMissingTable } from "@/lib/pg-errors";
import { LIMITS, dayAgo } from "@/lib/limits";

export const dynamic = "force-dynamic";

const MAX_BYTES = 512 * 1024;

/**
 * Who is calling, as a number rather than a name.
 *
 * A rolling count has to recognise a repeat caller, which a keyed digest does,
 * and nothing beyond that needs to know whose address it was. Keying it means
 * the stored value cannot be walked back to an IP by anyone who later reads
 * the table, and salting it with a server-only secret means it cannot be
 * confirmed by guessing either.
 */
function callerId(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || req.headers.get("x-real-ip") || "unknown";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  return createHmac("sha256", key).update(ip).digest("hex");
}

/**
 * Magic bytes, not the Content-Type header.
 *
 * A browser will happily label anything image/png, and the header is chosen by
 * the caller. Reading the actual signature is what keeps this from becoming a
 * general-purpose file host with an image-shaped door.
 */
function sniff(bytes: Uint8Array): { ext: string; mime: string } | null {
  const b = bytes;
  if (b.length < 12) return null;

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    return { ext: "png", mime: "image/png" };
  }
  // JPEG: FF D8 FF
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    return { ext: "jpg", mime: "image/jpeg" };
  }
  // GIF: "GIF8"
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) {
    return { ext: "gif", mime: "image/gif" };
  }
  // WEBP: "RIFF" .... "WEBP"
  if (
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  ) {
    return { ext: "webp", mime: "image/webp" };
  }
  return null;
}

/**
 * Upload an avatar and hand back its public URL.
 *
 * The URL is not identity on its own — it becomes part of a profile only when
 * the member signs it in the next step, and that signature is what binds an
 * image to an address. So this endpoint stays deliberately dumb: it accepts a
 * small image, stores it under a name nobody can guess, and returns where it
 * landed. It cannot overwrite anyone else's avatar because it never writes to
 * a path derived from an address.
 */
export async function POST(req: NextRequest) {
  try {
    const db = supabaseAdmin();
    const caller = callerId(req);

    // Counted before the body is read: a caller past its ceiling should not
    // get to hand us half a megabyte first.
    const { count, error: countErr } = await db
      .from("avatar_uploads")
      .select("id", { count: "exact", head: true })
      .eq("caller", caller)
      .gte("created_at", dayAgo());

    // A deployment that has not run migration 007 has no ledger to count in.
    // Uploads keep working there, unthrottled, exactly as they did before —
    // the alternative is a missing table silently disabling avatars, which is
    // how the follows endpoint learned this lesson the first time.
    const throttled = !isMissingTable(countErr);

    if (throttled && (count ?? 0) >= LIMITS.avatarsPerCallerPerDay) {
      return NextResponse.json(
        { error: "Too many avatar uploads from here today. Try again tomorrow." },
        { status: 429 }
      );
    }

    const form = await req.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No image was sent." }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "That image is larger than 512 KB. Try a smaller one." },
        { status: 413 }
      );
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const kind = sniff(bytes);
    if (!kind) {
      return NextResponse.json(
        { error: "That file is not a PNG, JPEG, GIF or WebP image." },
        { status: 415 }
      );
    }

    const key = `${crypto.randomUUID()}.${kind.ext}`;
    const { error } = await db.storage.from("avatars").upload(key, bytes, {
      contentType: kind.mime,
      cacheControl: "31536000",
      upsert: false,
    });

    if (error) {
      const missing = /bucket not found/i.test(error.message);
      return NextResponse.json(
        {
          error: missing
            ? "Avatar uploads are not enabled yet on this deployment."
            : error.message,
        },
        { status: missing ? 503 : 500 }
      );
    }

    // Counted only once the bytes are actually stored, so a rejected image
    // never spends part of someone's allowance.
    if (throttled) await db.from("avatar_uploads").insert({ caller });

    const { data } = db.storage.from("avatars").getPublicUrl(key);
    return NextResponse.json({ url: data.publicUrl });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Could not upload the image.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
