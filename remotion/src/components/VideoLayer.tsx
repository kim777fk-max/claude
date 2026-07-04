import React from "react";
import { AbsoluteFill, OffthreadVideo, Series, useVideoConfig } from "remotion";
import { ClipProps } from "../types";

type Props = {
  clips: ClipProps[];
};

const clipDurationSec = (c: ClipProps): number => {
  if (c.keep && c.keep.length > 0) {
    return c.keep.reduce((sum, [a, b]) => sum + Math.max(0, b - a), 0);
  }
  if (c.trimStart != null || c.trimEnd != null) {
    return Math.max(0.1, (c.trimEnd ?? 9999) - (c.trimStart ?? 0));
  }
  return 8;
};

export const VideoLayer: React.FC<Props> = ({ clips }) => {
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      <Series>
        {clips.flatMap((clip, i) => {
          if (clip.keep && clip.keep.length > 0) {
            return clip.keep.map(([a, b], j) => {
              const dur = Math.max(0.1, b - a);
              return (
                <Series.Sequence
                  key={`${i}-${j}`}
                  durationInFrames={Math.max(1, Math.round(dur * fps))}
                >
                  <OffthreadVideo
                    src={clip.src}
                    startFrom={Math.round(a * fps)}
                    endAt={Math.round(b * fps)}
                    volume={clip.volume ?? 1}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                    }}
                  />
                </Series.Sequence>
              );
            });
          }
          const dur = clipDurationSec(clip);
          const a = clip.trimStart ?? 0;
          return [
            <Series.Sequence
              key={`${i}-whole`}
              durationInFrames={Math.max(1, Math.round(dur * fps))}
            >
              <OffthreadVideo
                src={clip.src}
                startFrom={Math.round(a * fps)}
                endAt={
                  clip.trimEnd != null
                    ? Math.round(clip.trimEnd * fps)
                    : undefined
                }
                volume={clip.volume ?? 1}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                }}
              />
            </Series.Sequence>,
          ];
        })}
      </Series>
    </AbsoluteFill>
  );
};
