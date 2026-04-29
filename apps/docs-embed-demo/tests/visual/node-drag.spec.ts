import { expect, test } from "@playwright/test";

function edgePaths(page: import("@playwright/test").Page) {
  return page.locator("path.react-flow__edge-path");
}

async function pathData(page: import("@playwright/test").Page): Promise<string[]> {
  return edgePaths(page).evaluateAll((paths) =>
    paths.map((path) => path.getAttribute("d") ?? ""),
  );
}

function changedPathCount(before: string[], after: string[]): number {
  const count = Math.max(before.length, after.length);
  let changed = 0;
  for (let i = 0; i < count; i += 1) {
    if ((before[i] ?? "") !== (after[i] ?? "")) changed += 1;
  }
  return changed;
}

test("editor drag keeps connected edge geometry attached without a follow-up click", async ({ page }) => {
  await page.goto("/editor");
  await expect(page.getByTestId("editor-page")).toBeVisible();
  await expect(page.getByTestId("rf-state-active")).toBeVisible();
  await expect.poll(async () => (await pathData(page)).filter(Boolean).length).toBeGreaterThan(0);

  const active = page.locator(".react-flow__node").filter({ has: page.getByTestId("rf-state-active") }).first();
  const box = await active.boundingBox();
  expect(box).not.toBeNull();
  const startX = box!.x + box!.width / 2;
  const startY = box!.y + box!.height / 2;

  const before = await pathData(page);

  await active.dragTo(page.getByTestId("workflow-canvas"), {
    targetPosition: { x: startX - 160, y: startY + 20 },
    force: true,
  });

  const afterBox = await active.boundingBox();
  expect(afterBox?.x).toBeLessThan(box!.x - 40);
  await expect.poll(async () => changedPathCount(before, await pathData(page))).toBeGreaterThan(0);
});
