"use client";

import { Upload } from "tus-js-client";

import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/env";
import type { Supabase } from "@/lib/supabase/client";

export type VideoKind = "training_video" | "practical_video";

/**
 * Resumable upload to Cloudflare Stream through asah-be's stream-tus-upload
 * function: the function creates the upload and the media_files row (RLS
 * decides who may), then the file goes straight from the browser to
 * Cloudflare in 50 MB chunks. A dropped connection resumes where it stopped.
 *
 * Resolves with the media_files id to store on a content block.
 */
export async function uploadVideo(
  supabase: Supabase,
  file: File,
  kind: VideoKind,
  opts: { onProgress?: (fraction: number) => void; signal?: AbortSignal } = {},
): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Not signed in");

  return new Promise((resolve, reject) => {
    let mediaId: string | null = null;
    const upload = new Upload(file, {
      endpoint: `${SUPABASE_URL}/functions/v1/stream-tus-upload?kind=${kind}`,
      headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_KEY },
      chunkSize: 50 * 1024 * 1024,
      retryDelays: [0, 3000, 10000, 30000],
      metadata: { name: file.name, filetype: file.type },
      onAfterResponse(_req, res) {
        // Only the creation response carries it.
        mediaId ??= res.getHeader("X-Media-File-Id") ?? null;
      },
      onProgress(sent, total) {
        opts.onProgress?.(total ? sent / total : 0);
      },
      onError: reject,
      onSuccess() {
        if (mediaId) resolve(mediaId);
        else reject(new Error("Upload finished but the server did not return a media id"));
      },
    });
    opts.signal?.addEventListener("abort", () => {
      void upload.abort(true);
      reject(new DOMException("Upload cancelled", "AbortError"));
    });
    upload.start();
  });
}
