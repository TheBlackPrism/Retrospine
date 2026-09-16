"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { BookCover } from "@/components/book-cover";

export type BookCardProps = {
  href: string;
  title: string;
  authors: string[];
  coverUrl: string | null;
  badge?: string | null;
  progress?: number | null;
  priority?: boolean;
};

export function BookCard({
  href,
  title,
  authors,
  coverUrl,
  badge,
  progress,
  priority,
}: BookCardProps) {
  return (
    <motion.div
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: "spring", stiffness: 420, damping: 28 }}
    >
      <Link
        href={href}
        className="group block rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <div className="relative">
          <BookCover
            src={coverUrl}
            title={title}
            author={authors[0]}
            priority={priority}
          />
          {badge ? (
            <span className="absolute top-1.5 left-1.5 rounded-md bg-background/90 px-1.5 py-0.5 text-[10px] font-semibold text-foreground shadow-sm backdrop-blur">
              {badge}
            </span>
          ) : null}
        </div>
        {progress !== undefined && progress !== null ? (
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-amber transition-[width] duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        ) : null}
        <h3 className="mt-2 line-clamp-2 text-[13px] leading-snug font-medium text-foreground">
          {title}
        </h3>
        {authors.length ? (
          <p className="line-clamp-1 text-xs text-muted-foreground">
            {authors.join(", ")}
          </p>
        ) : null}
      </Link>
    </motion.div>
  );
}
