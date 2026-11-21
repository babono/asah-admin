"use client";

import type { Enums } from "@/lib/database.types";
import { unwrap } from "@/lib/errors";
import type { Supabase } from "@/lib/supabase/client";

export const MEDIA_BUCKET = "asah-media";

/**
 * Uploads an SOP photo or a PDF to the private asah-media bucket under
 * training/, then records it in media_files. asah-be's storage policies
 * allow training/ uploads only with module.author. Returns the media id.
 */
export async function uploadTrainingFile(
  supabase: Supabase,
  file: File,
  kind: Extract<Enums<"media_kind">, "training_document" | "training_image">,
  uploadedBy: string,
): Promise<string> {
  const ext = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "bin";
  const key = `training/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(key, file, { contentType: file.type || undefined });
  if (error) throw error;
  const row = unwrap(
    await supabase
      .from("media_files")
      .insert({
        bucket: MEDIA_BUCKET,
        object_key: key,
        kind,
        mime_type: file.type || null,
        size_bytes: file.size,
        status: "ready",
        uploaded_by: uploadedBy,
      })
      .select("id")
      .single(),
  );
  return row.id;
}

/** Short-lived link to view a Storage-backed media file. */
export async function signedMediaUrl(supabase: Supabase, mediaId: string): Promise<string> {
  const m = unwrap(await supabase.from("media_files").select("bucket, object_key").eq("id", mediaId).single());
  const { data, error } = await supabase.storage.from(m.bucket).createSignedUrl(m.object_key, 3600);
  if (error) throw error;
  return data.signedUrl;
}
