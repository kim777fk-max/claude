import React from "react";
import { AbsoluteFill, Sequence, useVideoConfig } from "remotion";
import { ShortsProps } from "../types";
import { VideoLayer } from "../components/VideoLayer";
import { KaraokeCaption } from "../components/KaraokeCaption";
import { TitleCard } from "../components/TitleCard";
import { EndCard } from "../components/EndCard";
import { BGMTrack } from "../components/BGMTrack";
import { SETrack } from "../components/SETrack";
import { BRoll } from "../components/BRoll";

export const Shorts: React.FC<ShortsProps> = (props) => {
  const { fps, durationInFrames } = useVideoConfig();

  const introSec = props.intro?.duration ?? 0;
  const outroSec = props.outro?.duration ?? 0;
  const introFrames = Math.round(introSec * fps);
  const outroFrames = Math.round(outroSec * fps);
  const bodyFrames = Math.max(
    1,
    durationInFrames - introFrames - outroFrames,
  );

  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      {props.intro ? (
        <Sequence durationInFrames={introFrames}>
          <TitleCard title={props.intro} />
        </Sequence>
      ) : null}

      <Sequence from={introFrames} durationInFrames={bodyFrames}>
        <AbsoluteFill>
          <VideoLayer clips={props.clips} />
          <BRoll bRolls={props.bRolls ?? []} />
          {props.caption ? (
            <KaraokeCaption caption={props.caption} startOffsetSec={0} />
          ) : null}
        </AbsoluteFill>
      </Sequence>

      {props.outro ? (
        <Sequence
          from={introFrames + bodyFrames}
          durationInFrames={Math.max(1, outroFrames)}
        >
          <EndCard title={props.outro} />
        </Sequence>
      ) : null}

      {props.bgm ? <BGMTrack bgm={props.bgm} /> : null}
      <SETrack se={props.se ?? []} />
    </AbsoluteFill>
  );
};
