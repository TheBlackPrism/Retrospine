"use client";

import { motion, type Variants } from "motion/react";
import { BookCard, type BookCardProps } from "@/components/book-card";

export type ShelfGridItem = BookCardProps & { id: string };

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.035, delayChildren: 0.04 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.38, ease: [0.22, 1, 0.36, 1] },
  },
};

export function ShelfGrid({ items }: { items: ShelfGridItem[] }) {
  return (
    <motion.ul
      variants={container}
      initial="hidden"
      animate="show"
      className="grid grid-cols-3 gap-x-3 gap-y-6 sm:grid-cols-4 sm:gap-x-4 md:grid-cols-5 lg:grid-cols-6"
    >
      {items.map((entry, index) => (
        <motion.li key={entry.id} variants={item}>
          <BookCard {...entry} priority={index < 6} />
        </motion.li>
      ))}
    </motion.ul>
  );
}
