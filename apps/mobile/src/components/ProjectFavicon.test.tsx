import type { ReactNode } from "react";
import { act, Profiler } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";

const harness = vi.hoisted(() => ({
  Passthrough: ({ children }: { children?: unknown }) => children,
}));

vi.mock("react-native", () => ({ View: harness.Passthrough }));
vi.mock("expo-image", () => ({
  Image: (props: { source: { uri: string } }) => <img alt="" src={props.source.uri} />,
}));
vi.mock("./ui/AppSymbol", () => ({ SymbolView: () => null }));
vi.mock("./ui/AppText", () => ({
  AppText: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
}));
vi.mock("../features/settings/appearance/AppearancePreferencesProvider", () => ({
  useAppearancePreferences: () => ({ themeAppearance: "light" }),
}));
vi.mock("../state/assets", async () => {
  const { Atom } = await import("effect/reactivity");
  const url = Atom.make<string | null>("https://example.test/favicon.png");
  const svg = Atom.make<string | null>("data:image/svg+xml;base64,PHN2Zy8+");
  const missing = Atom.make<string | null>(null);
  return {
    projectFaviconUrlAtom: (target: { readonly cwd: string; icon?: { name: string } }) => {
      if (target.icon) {
        return target.icon.name === "rocket" ? svg : missing;
      }
      return target.cwd === "/repo-without-icon" ? missing : url;
    },
  };
});

import { EnvironmentId } from "@t3tools/contracts";

import { ProjectFavicon } from "./ProjectFavicon";

it("mounts the favicon image in the first commit", async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div");
  const root = createRoot(container);
  const commits: string[] = [];
  try {
    await act(async () =>
      root.render(
        <Profiler id="favicon" onRender={(_id, phase) => commits.push(phase)}>
          <ProjectFavicon
            environmentId={EnvironmentId.make("env-1")}
            projectTitle="Project"
            workspaceRoot="/repo"
          />
        </Profiler>,
      ),
    );
    expect(container.querySelector("img")).not.toBeNull();
    expect(commits).toEqual(["mount"]);
  } finally {
    await act(async () => root.unmount());
  }
});

it("shows the next project's icon when a group's own project has none", async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div");
  const root = createRoot(container);
  const environmentId = EnvironmentId.make("env-1");
  try {
    await act(async () =>
      root.render(
        <ProjectFavicon
          environmentId={environmentId}
          projectTitle="Project"
          workspaceRoot="/repo-without-icon"
          fallbackProjects={[
            {
              environmentId,
              workspaceRoot: "/repo/apps/web",
              faviconPath: null,
              projectIcon: null,
            },
          ]}
        />,
      ),
    );
    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "https://example.test/favicon.png",
    );
  } finally {
    await act(async () => root.unmount());
  }
});

it("renders a downloaded Lucide icon and keeps a colored monogram when it is unavailable", async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div");
  const root = createRoot(container);
  const environmentId = EnvironmentId.make("env-1");
  const renderIcon = (name: string) =>
    act(async () =>
      root.render(
        <ProjectFavicon
          environmentId={environmentId}
          projectTitle="Sample Project"
          workspaceRoot="/repo"
          projectIcon={{ kind: "lucide", name, color: "purple" }}
        />,
      ),
    );
  try {
    await renderIcon("rocket");
    expect(container.querySelector("img")).not.toBeNull();
    expect(container.textContent).toBe("");
    await renderIcon("unknown-icon");
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toBe("SP");
  } finally {
    await act(async () => root.unmount());
  }
});
