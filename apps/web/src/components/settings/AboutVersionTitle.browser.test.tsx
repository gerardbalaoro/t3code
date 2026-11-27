import { expect, it, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";

import { render } from "../../../test/render";
import { APP_VERSION } from "../../branding";
import { AnchoredToastProvider } from "../ui/toast";
import { AboutVersionTitle } from "./AboutVersionTitle";

vi.mock("@t3tools/shared/buildProvenance", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@t3tools/shared/buildProvenance")>()),
  T3_CODE_UPSTREAM_TAG: "v0.1.13-nightly.20261125.5358",
}));

it("links to the T3 Code release used for this build", async () => {
  await using screen = await render(
    <AnchoredToastProvider>
      <AboutVersionTitle />
    </AnchoredToastProvider>,
  );

  await expect
    .element(screen.getByRole("link", { name: "Based on T3 Code v0.1.13-nightly.20261125.5358" }))
    .toHaveAttribute(
      "href",
      "https://github.com/pingdotgg/t3code/releases/tag/v0.1.13-nightly.20261125.5358",
    );
});

it("copies the version without a notification", async () => {
  await using screen = await render(
    <AnchoredToastProvider>
      <AboutVersionTitle />
    </AnchoredToastProvider>,
  );
  using write = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);

  await screen.getByRole("button", { name: `Copy version ${APP_VERSION}` }).click();

  expect(write).toHaveBeenCalledWith(APP_VERSION);
  await expect.element(page.getByText(/^Copied!?$/)).not.toBeInTheDocument();
});
