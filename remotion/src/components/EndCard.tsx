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

export const EndCard: React.FC<Props> = ({ title }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  const enter = spring({
    frame,
    fps,
    config: { damping: 18, stiffness: 160, mass: 0.8 },
  });
  const scale = interpolate(enter, [0, 1], [0.92, 1]);
  const opacity = interpolate(enter, [0, 1], [0, 1]);

  const titleSize = Math.round(Math.min(width, height) * 0.1);

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle at 50% 60%, #1a2244 0%, ${title.bg} 75%)`,
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
            background: title.accent,
            color: title.bg,
            marginBottom: titleSize * 0.3,
            fontSize: titleSize * 0.32,
            fontWeight: 800,
            letterSpacing: "0.16em",
          }}
        >
          THANKS FOR WATCHING
        </div>
        <div
          style={{
            fontSize: titleSize,
            fontWeight: 900,
            lineHeight: 1.2,
            textShadow: `0 ${titleSize * 0.04}px ${
              titleSize * 0.1
            }px rgba(0,0,0,0.55)`,
          }}
        >
          {title.text}
        </div>
        {title.subText ? (
          <div
            style={{
              marginTop: titleSize * 0.25,
              fontSize: titleSize * 0.42,
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
