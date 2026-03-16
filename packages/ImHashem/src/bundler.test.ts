import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { bundleRoutes } from "./bundler";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import type { Route } from "./router";

const TEST_DIR = join(import.meta.dir, "__test_bundle__");
const OUT_DIR = join(TEST_DIR, "bundles");

// a minimal real React client file — Bun.build() needs real valid TSX
const CLIENT_FILE_CONTENT = `
import { hydrateRoot } from "react-dom/client";
import { createElement } from "react";

const elem = document.getElementById("root")!;
hydrateRoot(elem, createElement("div", null, "Hello"));
`;

// fake routes — one with client, one without
const routes: Route[] = [
  {
    urlPath: "/",
    dir: join(TEST_DIR, "index"),
    hasClient: true,
    hasShared: false,
    params: [],
  },
  {
    urlPath: "/about",
    dir: join(TEST_DIR, "about"),
    hasClient: false,
    hasShared: false,
    params: [],
  },
];

beforeAll(async () => {
  // create fake route folders with real TSX files
  await mkdir(join(TEST_DIR, "index"), { recursive: true });
  await mkdir(join(TEST_DIR, "about"), { recursive: true });
  await mkdir(OUT_DIR, { recursive: true });

  // only index has a client file
  await writeFile(
    join(TEST_DIR, "index", "page.client.tsx"),
    CLIENT_FILE_CONTENT
  );
});

afterAll(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
});

describe("bundleRoutes", () => {
  it("only bundles routes that have a client file", async () => {
    const results = await bundleRoutes(routes, OUT_DIR);
    // only index has hasClient: true — about is skipped
    expect(results.length).toBe(1);
  });

  it("result contains the correct route", async () => {
    const results = await bundleRoutes(routes, OUT_DIR);
    expect(results[0]!.route.urlPath).toBe("/");
  });

  it("outFile exists on disk after bundling", async () => {
    const results = await bundleRoutes(routes, OUT_DIR);
    const exists = await Bun.file(results[0]!.outFile).exists();
    expect(exists).toBe(true);
  });

  it("outFile is a .js file", async () => {
    const results = await bundleRoutes(routes, OUT_DIR);
    expect(results[0]!.outFile.endsWith(".js")).toBe(true);
  });

  it("publicUrl starts with /bundles", async () => {
    const results = await bundleRoutes(routes, OUT_DIR);
    expect(results[0]!.publicUrl.startsWith("/bundles")).toBe(true);
  });

  it("publicUrl contains a hash", async () => {
    const results = await bundleRoutes(routes, OUT_DIR);
    // hashed filename looks like: page.client-a1b2c3.js
    // simple name without hash would be: page.client.js
    // we check there's a dash before the extension
    expect(results[0]!.publicUrl).toMatch(/page\.client-[a-z0-9]+\.js$/);
  });

  it("respects custom publicPath", async () => {
    const results = await bundleRoutes(routes, OUT_DIR, "/static/js");
    expect(results[0]!.publicUrl.startsWith("/static/js")).toBe(true);
  });
});