import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { bundleRoutes } from "./bundler";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import type { Route } from "./router";

const TEST_DIR = join(import.meta.dir, "__test_bundle__");
const OUT_DIR = join(TEST_DIR, "bundles");

// minimal valid React client file — developer only exports a default component
// framework handles hydrateRoot internally via entry-generator
const CLIENT_FILE_CONTENT = `
import { useState } from "react";

export default function PageClient() {
  const [count, setCount] = useState(0);
  return (
    <button onClick={() => setCount(count + 1)}>
      {count}
    </button>
  );
}
`.trim();

const LAYOUT_CLIENT_CONTENT = `
export default function LayoutClient({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <nav>Nav</nav>
      {children}
    </div>
  );
}
`.trim();

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
  {
    urlPath: "/blog",
    dir: join(TEST_DIR, "blog"),
    hasClient: true,
    hasShared: false,
    params: [],
  },
];

beforeAll(async () => {
  await mkdir(join(TEST_DIR, "index"), { recursive: true });
  await mkdir(join(TEST_DIR, "about"), { recursive: true });
  await mkdir(join(TEST_DIR, "blog"), { recursive: true });
  await mkdir(join(TEST_DIR, "layout"), { recursive: true });
  await mkdir(OUT_DIR, { recursive: true });

  await writeFile(join(TEST_DIR, "index", "page.client.tsx"), CLIENT_FILE_CONTENT);
  await writeFile(join(TEST_DIR, "blog", "page.client.tsx"), CLIENT_FILE_CONTENT);
  await writeFile(join(TEST_DIR, "layout", "layout.client.tsx"), LAYOUT_CLIENT_CONTENT);
});

afterAll(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
  await rm(join(TEST_DIR, ".imhashem"), { recursive: true, force: true });
});

describe("bundleRoutes", () => {
  it("only bundles routes that have a client file", async () => {
    const results = await bundleRoutes(routes, OUT_DIR, "/bundles", null, TEST_DIR);
    expect(results.length).toBe(2);
  });

  it("result contains correct routes", async () => {
    const results = await bundleRoutes(routes, OUT_DIR, "/bundles", null, TEST_DIR);
    const urlPaths = results.map(r => r.route.urlPath);
    expect(urlPaths).toContain("/");
    expect(urlPaths).toContain("/blog");
    expect(urlPaths).not.toContain("/about");
  });

  it("outFile exists on disk after bundling", async () => {
    const results = await bundleRoutes(routes, OUT_DIR, "/bundles", null, TEST_DIR);
    for (const result of results) {
      const exists = await Bun.file(result.outFile).exists();
      expect(exists).toBe(true);
    }
  });

  it("outFile is a .js file", async () => {
    const results = await bundleRoutes(routes, OUT_DIR, "/bundles", null, TEST_DIR);
    for (const result of results) {
      expect(result.outFile.endsWith(".js")).toBe(true);
    }
  });

  it("publicUrl starts with /bundles by default", async () => {
    const results = await bundleRoutes(routes, OUT_DIR, "/bundles", null, TEST_DIR);
    for (const result of results) {
      expect(result.publicUrl.startsWith("/bundles")).toBe(true);
    }
  });

  it("publicUrl contains a hash", async () => {
    const results = await bundleRoutes(routes, OUT_DIR, "/bundles", null, TEST_DIR);
    for (const result of results) {
      // hashed: index.entry-a1b2c3.js
      // simple: index.entry.js
      expect(result.publicUrl).toMatch(/\.entry-[a-z0-9]+\.js$/);
    }
  });

  it("each route gets a unique bundle", async () => {
    const results = await bundleRoutes(routes, OUT_DIR, "/bundles", null, TEST_DIR);
    const urls = results.map(r => r.publicUrl);
    // PROFESSIONAL: Set removes duplicates — if sizes match, all are unique
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("respects custom publicPath", async () => {
    const results = await bundleRoutes(routes, OUT_DIR, "/static/js", null, TEST_DIR);
    for (const result of results) {
      expect(result.publicUrl.startsWith("/static/js")).toBe(true);
    }
  });

  it("bundles layout client when layoutDir is provided", async () => {
    const results = await bundleRoutes(
      routes,
      OUT_DIR,
      "/bundles",
      join(TEST_DIR, "layout"),
      TEST_DIR
    );
    expect(results.length).toBe(2);
  });
});