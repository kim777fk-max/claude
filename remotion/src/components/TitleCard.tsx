import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { TitleCardProps } from "../types";

type Props = {
  title: TitleCardProps;
};

export const TitleCard: React.FC<Props> = ({ title }) => {
  const frame = useCurrentFrame();
  const { fps, width, height, durationInFrames } = useVideoConfig();

  const enter = spring({
    frame,
    fps,
    config: { damping: 14, stiffness: 180, mass: 0.7 },
  });
  const exitStart = Math.max(0, durationInFrames - Math.round(fps * 0.4));
  const exit = interpolate(
    frame,
    [exitStart, durationInFrames],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const scale = interpolate(enter, [0, 1], [0.86, 1]);
  const opacity = enter * exit;

  const titleSize = Math.round(Math.min(width, height) * 0.11);
  const subSize = Math.round(titleSize * 0.42);

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(135deg, ${title.bg} 0%, #1a2244 100%)`,
        justifyContent: "center",
        alignItems: "center",
        padding: "10%",
      }}
    >
      <div
        style={{
          opacity,
          transform: `scale(${scale})`,
          textAlign: "center",
          color: title.fg,
          fontFamily:
            "'Noto Sans CJK JP', 'Hiragino Sans', 'Yu Gothic', sans-serif",
        }}
      >
        <div
          style={{
            display: "inline-block",
            padding: `${titleSize * 0.18}px ${titleSize * 0.5}px`,
            borderRadius: titleSize * 0.4,
            background: `${title.accent}22`,
            border: `2px solid ${title.accent}`,
            marginBottom: titleSize * 0.3,
            fontSize: subSize * 0.7,
            fontWeight: 700,
            letterSpacing: "0.18em",
            color: title.accent,
          }}
        >
          OPEN
        </div>
        <div
          style={{
            fontSize: titleSize,
            fontWeight: 900,
            lineHeight: 1.15,
            textShadow: `0 ${titleSize * 0.04}px ${
              titleSize * 0.1
            }px rgba(0,0,0,0.45)`,
          }}
        >
          {title.text}
        </div>
        {title.subText ? (
          <div
            style={{
              marginTop: titleSize * 0.3,
              fontSize: subSize,
              fontWeight: 500,
              color: `${title.fg}cc`,
            }}
          >
            {title.subText}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};
