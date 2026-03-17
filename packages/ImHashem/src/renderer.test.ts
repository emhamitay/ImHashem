import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { renderRoute } from "./renderer";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import type { Route } from "./router";
import type { BundleResult } from "./bundler";

const TEST_DIR = join(import.meta.dir, "__test_renderer__");
const ROUTES_DIR = join(TEST_DIR, "routes");

const makeRoute = (urlPath: string, dir: string, hasClient = false): Route => ({
  urlPath,
  dir,
  hasClient,
  hasShared: false,
  params: [],
});

const makeBundleMap = (entries: [string, string][]): Map<string, BundleResult> => {
  return new Map(
    entries.map(([urlPath, publicUrl]) => [
      urlPath,
      { route: makeRoute(urlPath, ""), outFile: "/fake/path.js", publicUrl },
    ])
  );
};

beforeAll(async () => {
  await mkdir(join(ROUTES_DIR, "index"), { recursive: true });
  await mkdir(join(ROUTES_DIR, "about"), { recursive: true });
  await mkdir(join(ROUTES_DIR, "error"), { recursive: true });

  // root layout wraps content in <main> so we can assert it's present
  await writeFile(
    join(TEST_DIR, "layout.server.tsx"),
    `export default function Layout({ children }: any) {
  const { createElement } = require("react");
  return createElement("main", null, children);
}`
  );

  await writeFile(
    join(ROUTES_DIR, "index", "page.server.tsx"),
    `export default async function Page({ params }: any) {
  const { createElement } = require("react");
  return createElement("h1", null, "Hello ImHashem");
}`
  );

  await writeFile(
    join(ROUTES_DIR, "about", "page.server.tsx"),
    `export default async function Page({ params }: any) {
  const { createElement } = require("react");
  return createElement("p", null, "About page");
}`
  );

  await writeFile(
    join(ROUTES_DIR, "error", "page.server.tsx"),
    `export function notDefault() { return null; }`
  );
});

afterAll(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
});

describe("renderRoute", () => {
  it("returns a Response object", async () => {
    const route = makeRoute("/", join(ROUTES_DIR, "index"), true);
    const result = await renderRoute(route, new Map(), {}, ROUTES_DIR, TEST_DIR);
    expect(result).toBeInstanceOf(Response);
  });

  it("response has Content-Type text/html", async () => {
    const route = makeRoute("/", join(ROUTES_DIR, "index"));
    const result = await renderRoute(route, new Map(), {}, ROUTES_DIR, TEST_DIR);
    expect(result.headers.get("Content-Type")).toContain("text/html");
  });

  it("response body contains <!DOCTYPE html>", async () => {
    const route = makeRoute("/", join(ROUTES_DIR, "index"));
    const result = await renderRoute(route, new Map(), {}, ROUTES_DIR, TEST_DIR);
    const text = await result.text();
    expect(text).toContain("<!DOCTYPE html>");
  });

  it("response body contains a #root div", async () => {
    const route = makeRoute("/", join(ROUTES_DIR, "index"));
    const result = await renderRoute(route, new Map(), {}, ROUTES_DIR, TEST_DIR);
    const text = await result.text();
    expect(text).toContain('id="root"');
  });

  it("response body contains the page component output", async () => {
    const route = makeRoute("/", join(ROUTES_DIR, "index"));
    const result = await renderRoute(route, new Map(), {}, ROUTES_DIR, TEST_DIR);
    const text = await result.text();
    expect(text).toContain("Hello ImHashem");
  });

  it("wraps page output in layout when layout.server.tsx exists", async () => {
    const route = makeRoute("/", join(ROUTES_DIR, "index"));
    const result = await renderRoute(route, new Map(), {}, ROUTES_DIR, TEST_DIR);
    const text = await result.text();
    expect(text).toContain("<main");
    expect(text).toContain("<h1");
  });

  it("renders without layout when no layout.server.tsx exists", async () => {
    const noLayoutRoot = join(import.meta.dir, "__test_renderer_nolayout__");
    await mkdir(join(noLayoutRoot, "routes", "about"), { recursive: true });
    await writeFile(
      join(noLayoutRoot, "routes", "about", "page.server.tsx"),
      `export default async function Page() {
  const { createElement } = require("react");
  return createElement("p", null, "No layout");
}`
    );

    const route = makeRoute("/about", join(noLayoutRoot, "routes", "about"));
    const result = await renderRoute(route, new Map(), {}, join(noLayoutRoot, "routes"), noLayoutRoot);
    const text = await result.text();
    expect(text).toContain("No layout");
    expect(text).not.toContain("<main");

    await rm(noLayoutRoot, { recursive: true, force: true });
  });

  it("injects a script tag when route has a bundle", async () => {
    const route = makeRoute("/", join(ROUTES_DIR, "index"), true);
    const bundleMap = makeBundleMap([["/", "/bundles/index.entry-abc123.js"]]);
    const result = await renderRoute(route, bundleMap, {}, ROUTES_DIR, TEST_DIR);
    const text = await result.text();
    expect(text).toContain('<script type="module"');
    expect(text).toContain("/bundles/index.entry-abc123.js");
  });

  it("does not inject a bundle script tag when route has no bundle", async () => {
    const route = makeRoute("/about", join(ROUTES_DIR, "about"));
    const result = await renderRoute(route, new Map(), {}, ROUTES_DIR, TEST_DIR);
    const text = await result.text();
    expect(text).not.toContain('<script type="module"');
  });

  it("injects params into __IMHASHEM_DATA__ script", async () => {
    const route = makeRoute("/", join(ROUTES_DIR, "index"), true);
    const bundleMap = makeBundleMap([["/", "/bundles/index.entry-abc123.js"]]);
    const result = await renderRoute(route, bundleMap, { id: "123" }, ROUTES_DIR, TEST_DIR);
    const text = await result.text();
    expect(text).toContain("__IMHASHEM_DATA__");
    expect(text).toContain('"id":"123"');
  });

  it("throws a clear error when page.server.tsx has no default export", async () => {
    const route = makeRoute("/error", join(ROUTES_DIR, "error"));
    expect(
      renderRoute(route, new Map(), {}, ROUTES_DIR, TEST_DIR)
    ).rejects.toThrow("[ImHashem]");
  });
});