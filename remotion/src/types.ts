import { z } from "zod";

export const clipSchema = z.object({
  src: z.string().url(),
  trimStart: z.number().nonnegative().optional(),
  trimEnd: z.number().positive().optional(),
  volume: z.number().min(0).max(2).default(1).optional(),
  keep: z
    .array(z.tuple([z.number().nonnegative(), z.number().nonnegative()]))
    .optional(),
});

export const captionWordSchema = z.object({
  text: z.string(),
  start: z.number().nonnegative(),
  end: z.number().nonnegative(),
});

export const captionSchema = z.object({
  style: z.enum(["karaoke", "subtitle"]).default("karaoke"),
  words: z.array(captionWordSchema).default([]),
  fontSizePct: z.number().positive().default(7).optional(),
  accentColor: z.string().default("#FFD43B").optional(),
  baseColor: z.string().default("#FFFFFF").optional(),
  strokeColor: z.string().default("#000000").optional(),
});

export const titleCardSchema = z.object({
  text: z.string(),
  subText: z.string().optional(),
  duration: z.number().positive().default(1.5),
  bg: z.string().default("#0b1020"),
  fg: z.string().default("#FFFFFF"),
  accent: z.string().default("#6ea8fe"),
});

export const bgmSchema = z.object({
  src: z.string().url(),
  volume: z.number().min(0).max(1).default(0.15),
  fadeIn: z.number().nonnegative().default(0.8),
  fadeOut: z.number().nonnegative().default(2.5),
});

export const seSchema = z.object({
  src: z.string().url(),
  at: z.number().nonnegative(),
  volume: z.number().min(0).max(2).default(0.7),
});

export const bRollSchema = z.object({
  src: z.string().url(),
  at: z.number().nonnegative(),
  duration: z.number().positive(),
  kenBurns: z.boolean().default(true),
});

export const shortsPropsSchema = z.object({
  clips: z.array(clipSchema).min(1),
  totalSeconds: z.number().positive(),
  intro: titleCardSchema.optional(),
  outro: titleCardSchema.optional(),
  caption: captionSchema.optional(),
  bgm: bgmSchema.optional(),
  se: z.array(seSchema).default([]),
  bRolls: z.array(bRollSchema).default([]),
});

export const youTubeLongPropsSchema = shortsPropsSchema;

export type ClipProps = z.infer<typeof clipSchema>;
export type CaptionWord = z.infer<typeof captionWordSchema>;
export type CaptionProps = z.infer<typeof captionSchema>;
export type TitleCardProps = z.infer<typeof titleCardSchema>;
export type BGMProps = z.infer<typeof bgmSchema>;
export type SEProps = z.infer<typeof seSchema>;
export type BRollProps = z.infer<typeof bRollSchema>;
export type ShortsProps = z.infer<typeof shortsPropsSchema>;
export type YouTubeLongProps = z.infer<typeof youTubeLongPropsSchema>;
