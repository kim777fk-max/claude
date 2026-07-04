import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { CaptionProps } from "../types";

type Props = {
  caption: CaptionProps;
  startOffsetSec?: number;
  bottomPct?: number;
};

const WINDOW = 5;

export const KaraokeCaption: React.FC<Props> = ({
  caption,
  startOffsetSec = 0,
  bottomPct = 28,
}) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const tSec = frame / fps - startOffsetSec;

  const words = caption.words ?? [];
  if (words.length === 0) return null;

  let activeIdx = words.findIndex((w) => tSec >= w.start && tSec < w.end);
  if (activeIdx === -1) {
    const next = words.findIndex((w) => tSec < w.start);
    activeIdx = next === -1 ? words.length - 1 : Math.max(0, next - 1);
  }

  const half = Math.floor(WINDOW / 2);
  const lo = Math.max(0, activeIdx - half);
  const hi = Math.min(words.length, lo + WINDOW);
  const visible = words.slice(lo, hi);

  const fontSize = (width * (caption.fontSizePct ?? 7)) / 100;
  const stroke = `${Math.round(fontSize / 16)}px ${
    caption.strokeColor ?? "#000"
  }`;

  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-end",
        alignItems: "center",
        paddingBottom: `${bottomPct}%`,
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          alignItems: "baseline",
          gap: `${fontSize * 0.25}px`,
          maxWidth: "88%",
          textAlign: "center",
        }}
      >
        {visible.map((w, i) => {
          const globalI = lo + i;
          const isActive = globalI === activeIdx;
          const isPast = globalI < activeIdx;

          const popFrame = Math.round(w.start * fps);
          const enter = spring({
            frame: frame - popFrame,
            fps,
            config: { damping: 12, stiffness: 220, mass: 0.6 },
          });
          const scale = isActive
            ? interpolate(enter, [0, 1], [0.78, 1.18])
            : 1;
          const color = isActive
            ? caption.accentColor ?? "#FFD43B"
            : caption.baseColor ?? "#FFFFFF";
          const opacity = isPast ? 0.55 : 1;

          return (
            <span
              key={`${globalI}-${w.text}`}
              style={{
                fontSize: `${fontSize}px`,
                fontWeight: 900,
                color,
                opacity,
                transform: `scale(${scale})`,
                textShadow: `${stroke}, 0 ${fontSize * 0.05}px ${
                  fontSize * 0.1
                }px rgba(0,0,0,0.6)`,
                WebkitTextStroke: stroke,
                fontFamily:
                  "'Noto Sans CJK JP', 'Hiragino Sans', 'Yu Gothic', sans-serif",
                letterSpacing: "0.02em",
                display: "inline-block",
                transition: "color 60ms linear",
              }}
            >
              {w.text}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
