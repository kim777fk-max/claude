import React from "react";
import { Composition } from "remotion";
import { Shorts } from "./compositions/Shorts";
import { YouTubeLong } from "./compositions/YouTubeLong";
import {
  shortsPropsSchema,
  youTubeLongPropsSchema,
  ShortsProps,
  YouTubeLongProps,
} from "./types";

const FPS = 30;

const defaultShorts: ShortsProps = {
  clips: [
    {
      src: "https://res.cloudinary.com/dftjmz7l5/video/upload/v1781704682/claude-edits/s2jcramvj8sluvodvs9u.mov",
    },
  ],
  totalSeconds: 8,
  se: [],
  bRolls: [],
};

const defaultYouTubeLong: YouTubeLongProps = {
  ...defaultShorts,
  totalSeconds: 30,
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="Shorts"
        component={Shorts}
        width={1080}
        height={1920}
        fps={FPS}
        durationInFrames={Math.round(defaultShorts.totalSeconds * FPS)}
        schema={shortsPropsSchema}
        defaultProps={defaultShorts}
        calculateMetadata={({ props }) => ({
          durationInFrames: Math.max(
            FPS,
            Math.round((props.totalSeconds ?? 8) * FPS),
          ),
        })}
      />
      <Composition
        id="YouTubeLong"
        component={YouTubeLong}
        width={1920}
        height={1080}
        fps={FPS}
        durationInFrames={Math.round(defaultYouTubeLong.totalSeconds * FPS)}
        schema={youTubeLongPropsSchema}
        defaultProps={defaultYouTubeLong}
        calculateMetadata={({ props }) => ({
          durationInFrames: Math.max(
            FPS,
            Math.round((props.totalSeconds ?? 30) * FPS),
          ),
        })}
      />
    </>
  );
};
