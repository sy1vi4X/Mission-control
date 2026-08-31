const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const index = read("index.html");
const manifest = JSON.parse(read("manifest.webmanifest"));
const sw = read("service-worker.js");
const vercel = JSON.parse(read("vercel.json"));

assert.match(index, /<title>MISSION CONTROL<\/title>/);
assert.match(index, /viewport-fit=cover/);
assert.match(index, /apple-mobile-web-app-capable/);
assert.match(index, /rel="manifest" href="\/manifest\.webmanifest"/);
assert.match(index, /navigator\.serviceWorker\.register\("\/service-worker\.js"\)/);
assert.match(index, /mission-control\.tasks\.v1/);
assert.match(index, /mission-control\.initialized\.v1/);
assert.match(index, /mission-control\.settings\.v1/);
assert.match(index, /env\(safe-area-inset-bottom\)/);
assert.match(index, /overflow-x:\s*hidden/);
assert.match(index, /data-setting-accent="lavender"/);
assert.match(index, /data-setting-theme="dark"/);
assert.match(index, /data-setting-density="compact"/);
assert.match(index, /role="switch"/);
assert.match(index, /completingIds/);
assert.match(index, /setTimeout\(\(\) => finishCompletion\(id\), 680\)/);

assert.equal(manifest.name, "MISSION CONTROL");
assert.equal(manifest.short_name, "Mission");
assert.equal(manifest.display, "standalone");
assert.equal(manifest.start_url, "/");
assert.equal(manifest.scope, "/");
assert.equal(manifest.theme_color, "#f7f7f5");
assert.ok(manifest.icons.some((icon) => icon.sizes === "192x192" && icon.src === "/icons/icon-192.png"));
assert.ok(manifest.icons.some((icon) => icon.sizes === "512x512" && icon.src === "/icons/icon-512.png"));
assert.ok(manifest.icons.some((icon) => icon.purpose === "maskable"));

assert.match(sw, /CACHE_NAME = "mission-control-shell-v2"/);
assert.match(sw, /caches\.match\("\/index\.html"\)/);
assert.match(sw, /self\.skipWaiting/);
assert.equal(vercel.outputDirectory, "dist");
assert.equal(vercel.buildCommand, "npm run build");
assert.ok(vercel.rewrites.some((rewrite) => rewrite.destination === "/index.html"));

for (const icon of ["icons/icon-192.png", "icons/icon-512.png", "icons/maskable-512.png"]) {
  assert.ok(fs.statSync(path.join(root, icon)).size > 1000, `${icon} should exist`);
}

for (const file of ["dist/index.html", "dist/manifest.webmanifest", "dist/service-worker.js", "dist/icons/icon-192.png"]) {
  assert.ok(fs.existsSync(path.join(root, file)), `${file} should be present after build`);
}

console.log("Static PWA checks passed.");
