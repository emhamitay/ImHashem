import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { imhashem } from "./server";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";

// Directory structure:
//
// TEST_DIR/
//   layout.server.tsx
//   routes/
//     index/
//       page.server.tsx
//       page.client.tsx      ← has client bundle
//     about/
//       page.server.tsx      ← server only
//     blog/
//       [id]/
//         page.server.tsx    ← dynamic route

const TEST_DIR = join(import.meta.dir, "__test_server__");
const ROUTES_DIR = join(TEST_DIR, "routes");
const OUT_DIR = join(TEST_DIR, "bundles");

beforeAll(async () => {
  await mkdir(join(ROUTES_DIR, "index"), { recursive: true });
  await mkdir(join(ROUTES_DIR, "about"), { recursive: true });
  await mkdir(join(ROUTES_DIR, "blog", "[id]"), { recursive: true });
  await mkdir(OUT_DIR, { recursive: true });

  await writeFile(
    join(TEST_DIR, "layout.server.tsx"),
    `export default function Layout({ children }: any) {
  const { createElement } = require("react");
  return createElement("div", { id: "layout" }, children);
}`
  );

  await writeFile(
    join(ROUTES_DIR, "index", "page.server.tsx"),
    `export default async function Page() {
  const { createElement } = require("react");
  return createElement("h1", null, "Home");
}`
  );

  await writeFile(
    join(ROUTES_DIR, "index", "page.client.tsx"),
    `import { useState } from "react";
export default function PageClient() {
  const [n, setN] = useState(0);
  return <button onClick={() => setN(n + 1)}>{n}</button>;
}`
  );

  await writeFile(
    join(ROUTES_DIR, "about", "page.server.tsx"),
    `export default async function Page() {
  const { createElement } = require("react");
  return createElement("p", null, "About");
}`
  );

  await writeFile(
    join(ROUTES_DIR, "blog", "[id]", "page.server.tsx"),
    `export default async function Page({ params }: any) {
  const { createElement } = require("react");
  return createElement("p", null, "Post " + params.id);
}`
  );
});

afterAll(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
});

describe("imhashem", () => {
  // ── return shape ───────────────────────────────────────────────────────────

  it("returns a routes object", async () => {
    const app = await imhashem({ routesDir: ROUTES_DIR, outDir: OUT_DIR, appRoot: TEST_DIR });
    expect(app.routes).toBeDefined();
    expect(typeof app.routes).toBe("object");
  });

  it("returns a bundleMap", async () => {
    const app = await imhashem({ routesDir: ROUTES_DIR, outDir: OUT_DIR, appRoot: TEST_DIR });
    expect(app.bundleMap).toBeInstanceOf(Map);
  });

  it("returns the raw route list", async () => {
    const app = await imhashem({ routesDir: ROUTES_DIR, outDir: OUT_DIR, appRoot: TEST_DIR });
    expect(Array.isArray(app.routeList)).toBe(true);
    expect(app.routeList.length).toBe(3);
  });

  // ── routes object ──────────────────────────────────────────────────────────

  it("routes object has a handler for each discovered route", async () => {
    const app = await imhashem({ routesDir: ROUTES_DIR, outDir: OUT_DIR, appRoot: TEST_DIR });
    expect(app.routes["/"]).toBeDefined();
    expect(app.routes["/about"]).toBeDefined();
    expect(app.routes["/blog/:id"]).toBeDefined();
  });

  it("each handler is a function", async () => {
    const app = await imhashem({ routesDir: ROUTES_DIR, outDir: OUT_DIR, appRoot: TEST_DIR });
    for (const handler of Object.values(app.routes)) {
      expect(typeof handler).toBe("function");
    }
  });

  // ── bundleMap ──────────────────────────────────────────────────────────────

  it("bundleMap contains only routes with client files", async () => {
    const app = await imhashem({ routesDir: ROUTES_DIR, outDir: OUT_DIR, appRoot: TEST_DIR });
    expect(app.bundleMap.has("/")).toBe(true);
    expect(app.bundleMap.has("/about")).toBe(false);
  });

  // ── route handlers ─────────────────────────────────────────────────────────

  it("calling a route handler returns a Response", async () => {
    const app = await imhashem({ routesDir: ROUTES_DIR, outDir: OUT_DIR, appRoot: TEST_DIR });
    const req = new Request("http://localhost/");
    const res = await app.routes["/"](req);
    expect(res).toBeInstanceOf(Response);
  });

  it("route handler response contains the page content", async () => {
    const app = await imhashem({ routesDir: ROUTES_DIR, outDir: OUT_DIR, appRoot: TEST_DIR });
    const req = new Request("http://localhost/");
    const res = await app.routes["/"](req);
    const text = await res.text();
    expect(text).toContain("Home");
  });

  it("dynamic route handler receives params from the request", async () => {
    const app = await imhashem({ routesDir: ROUTES_DIR, outDir: OUT_DIR, appRoot: TEST_DIR });
    const req = new Request("http://localhost/blog/42");
    (req as any).params = { id: "42" };
    const res = await app.routes["/blog/:id"](req);
    const text = await res.text();
    expect(text).toContain("Post 42");
  });

  it("static file route is included for the bundles directory", async () => {
    const app = await imhashem({ routesDir: ROUTES_DIR, outDir: OUT_DIR, appRoot: TEST_DIR });
    expect(app.routes["/bundles/:file"]).toBeDefined();
  });

  // ── options ────────────────────────────────────────────────────────────────

  it("respects a custom publicPath", async () => {
    const app = await imhashem({
      routesDir: ROUTES_DIR,
      outDir: OUT_DIR,
      appRoot: TEST_DIR,
      publicPath: "/static/js",
    });
    const bundleEntry = app.bundleMap.get("/");
    expect(bundleEntry?.publicUrl.startsWith("/static/js")).toBe(true);
  });
});