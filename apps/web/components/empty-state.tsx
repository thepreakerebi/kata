"use client";

import { motion, useReducedMotion } from "motion/react";

const EMOJI_SRC: Record<string, string> = {
  brain:
    "https://cdn.jsdelivr.net/gh/microsoft/fluentui-emoji@main/assets/Brain/3D/brain_3d.png",
  inbox:
    "https://cdn.jsdelivr.net/gh/microsoft/fluentui-emoji@main/assets/Open%20mailbox%20with%20lowered%20flag/3D/open_mailbox_with_lowered_flag_3d.png",
  chat: "https://cdn.jsdelivr.net/gh/microsoft/fluentui-emoji@main/assets/Speech%20balloon/3D/speech_balloon_3d.png",
  sparkles:
    "https://cdn.jsdelivr.net/gh/microsoft/fluentui-emoji@main/assets/Sparkles/3D/sparkles_3d.png",
};

/**
 * Shared page-level empty state: 3D fluent emoji with a gentle entrance,
 * no background, no border.
 */
export function EmptyState({
  emoji,
  title,
  description,
}: {
  emoji: keyof typeof EMOJI_SRC;
  title: string;
  description: string;
}) {
  const reduce = useReducedMotion();
  return (
    <figure className="flex flex-col items-center gap-3 py-16 text-center">
      <motion.img
        src={EMOJI_SRC[emoji]}
        alt=""
        width={72}
        height={72}
        initial={reduce ? false : { opacity: 0, scale: 0.8, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 20 }}
      />
      <figcaption className="flex max-w-sm flex-col gap-1">
        <strong className="text-base font-medium">{title}</strong>
        <span className="text-sm text-muted-foreground">{description}</span>
      </figcaption>
    </figure>
  );
}
