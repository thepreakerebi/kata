"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

/** Mount animation for sections and list items; still under reduced motion. */
export function FadeIn({
  children,
  delay = 0,
  as = "section",
}: {
  children: ReactNode;
  delay?: number;
  as?: "section" | "article" | "li" | "figure";
}) {
  const reduce = useReducedMotion();
  const Tag = motion[as];
  return (
    <Tag
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay, ease: "easeOut" }}
    >
      {children}
    </Tag>
  );
}
