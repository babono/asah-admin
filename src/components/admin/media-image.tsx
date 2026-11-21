"use client";

import { useQuery } from "@tanstack/react-query";
import { ImageOff, Loader2 } from "lucide-react";

import { useSupabase } from "@/components/providers";
import { signedMediaUrl } from "@/lib/storage-upload";

/** A private Storage photo shown through a short-lived signed URL (RLS decides who can see it). */
export function MediaImage({ mediaId, alt, className }: { mediaId: string; alt: string; className?: string }) {
  const supabase = useSupabase();
  const url = useQuery({
    queryKey: ["media-url", mediaId],
    staleTime: 50 * 60_000,
    queryFn: () => signedMediaUrl(supabase, mediaId),
  });
  return (
    <div className={`bg-muted flex h-44 items-center justify-center overflow-hidden rounded-xl ${className ?? ""}`}>
      {url.isPending ? (
        <Loader2 className="text-muted-foreground size-5 animate-spin" />
      ) : url.isError ? (
        <ImageOff className="text-muted-foreground size-6" aria-label={alt} />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- signed, short-lived URL; next/image would need the host configured
        <img src={url.data} alt={alt} className="h-full w-full object-cover" />
      )}
    </div>
  );
}
