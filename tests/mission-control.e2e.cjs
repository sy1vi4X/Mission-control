const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const indexPath = path.join(root, "index.html");
const screenshotsDir = path.join(root, "outputs");
const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
};

function serve() {
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url || "/", "http://127.0.0.1");
    const filePath = url.pathname === "/" ? indexPath : path.join(root, url.pathname);
    try {
      const content = await fs.readFile(filePath);
      response.writeHead(200, { "content-type": contentTypes[path.extname(filePath)] || "application/octet-stream" });
      response.end(content);
    } catch {
      response.writeHead(404);
      response.end("Not found");
    }
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({ server, url: `http://127.0.0.1:${address.port}` });
    });
  });
}

async function addTask(page, title, level, deadlineLabel = "No Deadline") {
  await page.getByRole("button", { name: /Add Task/ }).first().click();
  await page.getByPlaceholder("Physics quiz").fill(title);
  await page.locator("#levelChoices").getByRole("button", { name: level }).click();
  await page.locator("#deadlineChoices").getByRole("button", { name: deadlineLabel }).click();
  await page.locator("#submitButton").click();
}

(async () => {
  await fs.mkdir(screenshotsDir, { recursive: true });
  const { server, url } = await serve();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  try {
    await page.goto(url);
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    await assert.doesNotReject(() => page.getByText("MISSION CONTROL").waitFor());
    await assert.doesNotReject(() => page.getByText("Economics HW").waitFor());
    await assert.doesNotReject(() => page.getByRole("heading", { name: /TODAY|TOMORROW|OVERDUE/ }).waitFor());

    await addTask(page, "Physics Quiz E2E", "MUST", "Today");
    await addTask(page, "Portfolio checkpoint", "SHOULD", "Tomorrow");
    await addTask(page, "Long side quest title that should wrap gently without breaking the card layout", "SIDE QUEST");

    await page.getByRole("button", { name: "SIDE QUEST" }).first().click();
    await assert.doesNotReject(() => page.getByText("Long side quest title").waitFor());
    assert.equal(await page.getByText("Physics Quiz E2E").count(), 0);
    await page.getByLabel("Level filter").getByRole("button", { name: "All" }).click();

    await page.getByText("Physics Quiz E2E").click();
    const physicsCard = page.locator(".card", { hasText: "Physics Quiz E2E" });
    await physicsCard.getByRole("button", { name: "Edit" }).click();
    await page.getByPlaceholder("Physics quiz").fill("Physics Quiz Edited");
    await page.getByRole("button", { name: "Pick Date" }).click();
    await page.locator("#dateInput").fill("2026-08-29");
    await page.getByRole("button", { name: "Save Changes" }).click();
    await assert.doesNotReject(() => page.getByText("OVERDUE").waitFor());

    await page.locator(".card", { hasText: "Physics Quiz Edited" }).getByRole("button", { name: "Complete task" }).click();
    await page.waitForTimeout(850);
    await page.getByRole("button", { name: "DONE" }).click();
    await assert.doesNotReject(() => page.getByText("Physics Quiz Edited").waitFor());

    await page.reload();
    await page.getByRole("button", { name: "DONE" }).click();
    await assert.doesNotReject(() => page.getByText("Physics Quiz Edited").waitFor());

    await page.locator(".card", { hasText: "Physics Quiz Edited" }).getByRole("button", { name: "Restore task" }).click();
    await page.getByRole("button", { name: "TO DO" }).click();
    await assert.doesNotReject(() => page.getByText("Physics Quiz Edited").waitFor());

    page.once("dialog", (dialog) => dialog.accept());
    await page.locator(".card", { hasText: "Portfolio checkpoint" }).getByRole("button", { name: "Delete" }).click();
    assert.equal(await page.getByText("Portfolio checkpoint").count(), 0);

    await page.getByRole("button", { name: "Open settings" }).click();
    await page.locator("[data-setting-accent='blue']").click();
    await page.locator("[data-setting-theme='dark']").click();
    await page.locator("[data-setting-density='compact']").click();
    await page.getByRole("switch").click();
    await page.reload();
    assert.equal(await page.evaluate(() => document.documentElement.dataset.accent), "blue");
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), "dark");
    assert.equal(await page.evaluate(() => document.documentElement.dataset.density), "compact");
    assert.equal(await page.evaluate(() => document.documentElement.dataset.motion), "reduced");

    await page.evaluate(() => localStorage.setItem("mission-control.tasks.v1", "{broken"));
    await page.reload();
    await assert.doesNotReject(() => page.getByText("MISSION CONTROL").waitFor());

    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await assert.doesNotReject(() => page.getByText("Economics HW").waitFor());

    await page.screenshot({ path: path.join(screenshotsDir, "mission-control-desktop.png"), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(screenshotsDir, "mission-control-mobile.png"), fullPage: true });
    await page.setViewportSize({ width: 1180, height: 820 });
    await page.screenshot({ path: path.join(screenshotsDir, "mission-control-ipad-landscape.png"), fullPage: true });

    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    server.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
