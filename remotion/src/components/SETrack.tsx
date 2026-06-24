import React from "react";
import { Audio, Sequence, useVideoConfig } from "remotion";
import { SEProps } from "../types";

type Props = {
  se: SEProps[];
};

export const SETrack: React.FC<Props> = ({ se }) => {
  const { fps } = useVideoConfig();
  if (!se || se.length === 0) return null;

  return (
    <>
      {se.map((s, i) => (
        <Sequence key={i} from={Math.max(0, Math.round(s.at * fps))}>
          <Audio src={s.src} volume={s.volume ?? 0.7} />
        </Sequence>
      ))}
    </>
  );
};
