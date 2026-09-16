"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export function Description({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > 420;
  return (
    <div>
      <p
        className={cn(
          "text-sm leading-relaxed whitespace-pre-line text-pretty text-foreground/85",
          !expanded && isLong && "line-clamp-6",
        )}
      >
        {text}
      </p>
      {isLong ? (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="mt-2 text-sm font-medium text-amber-foreground underline-offset-4 hover:underline dark:text-amber"
        >
          {expanded ? "Show less" : "Read more"}
        </button>
      ) : null}
    </div>
  );
}
