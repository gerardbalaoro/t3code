import type { SVGProps } from "react";

export function GCodeMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} viewBox="1 2 8 10" xmlns="http://www.w3.org/2000/svg">
      <path d="M1 2L9 2L9 4L3 4L3 10L7 10L7 8L5 8L5 6L9 6L9 12L1 12Z" fill="currentColor" />
    </svg>
  );
}
