import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders Mission Control", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>MISSION CONTROL<\/title>/i);
  assert.match(html, /Personal assignment dashboard/);
  assert.match(html, /Current missions/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Your site is taking shape/i);
});

test("keeps local task persistence explicit", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");

  assert.match(page, /mission-control\.tasks\.v1/);
  assert.match(page, /mission-control\.initialized\.v1/);
  assert.match(page, /localStorage/);
  assert.match(page, /createDemoTasks/);
  assert.match(page, /window\.confirm/);
  assert.match(layout, /title:\s*"MISSION CONTROL"/);
  assert.doesNotMatch(layout, /next\/font\/google|codex-preview/);
});
