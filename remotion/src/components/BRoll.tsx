import React from "react";
import {
  AbsoluteFill,
  Img,
  Sequence,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { BRollProps } from "../types";

type Props = {
  bRolls: BRollProps[];
};

const BRollItem: React.FC<{ b: BRollProps }> = ({ b }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const durFrames = Math.max(1, Math.round(b.duration * fps));
  const t = Math.min(1, Math.max(0, frame / durFrames));

  const fade = interpolate(
    frame,
    [0, 6, durFrames - 6, durFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  const scale = b.kenBurns ? interpolate(t, [0, 1], [1.05, 1.18]) : 1;
  const tx = b.kenBurns ? interpolate(t, [0, 1], [-1.5, 1.5]) : 0;

  return (
    <AbsoluteFill style={{ background: "black", opacity: fade }}>
      <Img
        src={b.src}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: `scale(${scale}) translateX(${tx}%)`,
          transformOrigin: "center",
        }}
      />
    </AbsoluteFill>
  );
};

export const BRoll: React.FC<Props> = ({ bRolls }) => {
  const { fps } = useVideoConfig();
  if (!bRolls || bRolls.length === 0) return null;

  return (
    <>
      {bRolls.map((b, i) => (
        <Sequence
          key={i}
          from={Math.max(0, Math.round(b.at * fps))}
          durationInFrames={Math.max(1, Math.round(b.duration * fps))}
        >
          <BRollItem b={b} />
        </Sequence>
      ))}
    </>
  );
};
