import React from "react";
import { Shorts } from "./Shorts";
import { YouTubeLongProps } from "../types";

export const YouTubeLong: React.FC<YouTubeLongProps> = (props) => {
  return <Shorts {...props} />;
};
