import React from "react";
import { Audio, interpolate, useVideoConfig } from "remotion";
import { BGMProps } from "../types";

type Props = {
  bgm: BGMProps;
};

export const BGMTrack: React.FC<Props> = ({ bgm }) => {
  const { fps, durationInFrames } = useVideoConfig();
  const fadeInFrames = Math.round((bgm.fadeIn ?? 0.8) * fps);
  const fadeOutFrames = Math.round((bgm.fadeOut ?? 2.5) * fps);
  const baseVol = bgm.volume ?? 0.15;

  const volume = (f: number) => {
    const fadeIn = interpolate(f, [0, fadeInFrames], [0, baseVol], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    const fadeOut = interpolate(
      f,
      [durationInFrames - fadeOutFrames, durationInFrames],
      [baseVol, 0],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
    );
    return Math.min(fadeIn, fadeOut);
  };

  return <Audio src={bgm.src} volume={volume} loop />;
};
