declare const __GCODE_UPSTREAM_TAG__: string | undefined;

export const G_CODE_REPOSITORY = "https://github.com/gerardbalaoro/t3code";
export const T3_CODE_REPOSITORY = "https://github.com/pingdotgg/t3code";
export const T3_CODE_UPSTREAM_TAG =
  typeof __GCODE_UPSTREAM_TAG__ === "undefined" ? "" : __GCODE_UPSTREAM_TAG__;
