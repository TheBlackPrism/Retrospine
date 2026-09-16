"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

const HUES = [22, 40, 60, 95, 150, 195, 250, 290, 330];

function hueFor(title: string): number {
  let hash = 0;
  for (const char of title) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return HUES[hash % HUES.length];
}

type BookCoverProps = {
  src: string | null;
  title: string;
  author?: string | null;
  className?: string;
  priority?: boolean;
};

/** Cover image with a generated, title-based fallback when no artwork exists. */
export function BookCover({ src, title, author, className, priority }: BookCoverProps) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(src) && !failed;
  const hue = hueFor(title);

  return (
    <div className={cn("book-cover aspect-[2/3] w-full", className)}>
      {showImage ? (
        // Covers come from third-party hosts with their own caching; a plain
        // element avoids proxying every image through the app server.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src ?? undefined}
          alt={`Cover of ${title}`}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          draggable={false}
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <div
          role="img"
          aria-label={`Cover of ${title}`}
          className="flex h-full w-full flex-col justify-between p-3"
          style={{
            background: `linear-gradient(160deg, oklch(0.62 0.11 ${hue}) 0%, oklch(0.38 0.09 ${hue}) 100%)`,
          }}
        >
          <span className="line-clamp-4 font-heading text-[13px] leading-snug font-semibold text-white/95">
            {title}
          </span>
          {author ? (
            <span className="line-clamp-2 text-[10px] text-white/75">{author}</span>
          ) : null}
        </div>
      )}
    </div>
  );
}
