const fs = require("node:fs/promises");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");

async function copyFile(relativePath) {
  const source = path.join(root, relativePath);
  const target = path.join(dist, relativePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.copyFile(source, target);
}

async function copyDir(relativePath) {
  const source = path.join(root, relativePath);
  const target = path.join(dist, relativePath);
  await fs.mkdir(target, { recursive: true });
  await fs.cp(source, target, { recursive: true });
}

async function build() {
  await fs.rm(dist, { recursive: true, force: true });
  await fs.mkdir(dist, { recursive: true });
  await copyFile("index.html");
  await copyFile("manifest.webmanifest");
  await copyFile("service-worker.js");
  await copyDir("icons");
  console.log("Static build complete: dist/");
}

build().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
