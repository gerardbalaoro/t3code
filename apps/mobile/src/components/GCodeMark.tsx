import type { ColorValue } from "react-native";
import Svg, { Path } from "react-native-svg";
import { withUniwind } from "uniwind";

const ThemedPath = withUniwind(Path);
const BRAND_NAME = "G Code";

export function GCodeMark(props: {
  readonly height: number;
  readonly color?: ColorValue;
  readonly colorClassName?: string;
}) {
  const aspectRatio = 8 / 10;
  return (
    <Svg
      accessibilityLabel={BRAND_NAME}
      height={props.height}
      width={props.height * aspectRatio}
      viewBox="1 2 8 10"
    >
      <ThemedPath
        d="M1 2L9 2L9 4L3 4L3 10L7 10L7 8L5 8L5 6L9 6L9 12L1 12Z"
        color={props.color}
        colorClassName={props.colorClassName}
        fill="currentColor"
      />
    </Svg>
  );
}
