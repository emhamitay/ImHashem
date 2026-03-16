import { describe, it, expect, beforeAll } from "bun:test";
import { buildRouteMap } from "./router";
import { join } from "node:path";
import { mkdir, writeFile, rm } from "node:fs/promises";

// we create a fake routes folder for testing
// so we don't depend on example-app existing
const TEST_ROUTES_DIR = join(import.meta.dir, "__test_routes__");

beforeAll(async () => {
  // build fake route structure
  await mkdir(join(TEST_ROUTES_DIR, "index"), { recursive: true });
  await mkdir(join(TEST_ROUTES_DIR, "about"), { recursive: true });
  await mkdir(join(TEST_ROUTES_DIR, "blog", "[id]"), { recursive: true });

  // index — server + client
  await writeFile(
    join(TEST_ROUTES_DIR, "index", "page.server.tsx"),
    "export default function Page() { return <div /> }",
  );
  await writeFile(join(TEST_ROUTES_DIR, "index", "page.client.tsx"), "");

  // about — server only
  await writeFile(
    join(TEST_ROUTES_DIR, "about", "page.server.tsx"),
    "export default function Page() { return <div /> }",
  );

  // blog/[id] — server only
  await writeFile(
    join(TEST_ROUTES_DIR, "blog", "[id]", "page.server.tsx"),
    "export default function Page() { return <div /> }",
  );
});

// clean up after all tests
import { afterAll } from "bun:test";
afterAll(async () => {
  await rm(TEST_ROUTES_DIR, { recursive: true, force: true });
});

describe("buildRouteMap", () => {
  it("finds all routes", async () => {
    const routes = await buildRouteMap(TEST_ROUTES_DIR);
    expect(routes.length).toBe(3);
  });

  it("maps index folder to /", async () => {
    const routes = await buildRouteMap(TEST_ROUTES_DIR);
    const index = routes.find((r) => r.urlPath === "/");
    expect(index).toBeDefined();
  });

  it("maps about folder to /about", async () => {
    const routes = await buildRouteMap(TEST_ROUTES_DIR);
    const about = routes.find((r) => r.urlPath === "/about");
    expect(about).toBeDefined();
  });

  it("maps [id] folder to /blog/:id", async () => {
    const routes = await buildRouteMap(TEST_ROUTES_DIR);
    const blog = routes.find((r) => r.urlPath === "/blog/:id");
    expect(blog).toBeDefined();
  });

  it("detects client file when it exists", async () => {
    const routes = await buildRouteMap(TEST_ROUTES_DIR);
    const index = routes.find((r) => r.urlPath === "/");
    expect(index?.hasClient).toBe(true);
  });

  it("returns null for client file when it doesn't exist", async () => {
    const routes = await buildRouteMap(TEST_ROUTES_DIR);
    const about = routes.find((r) => r.urlPath === "/about");
    expect(about?.hasClient).toBe(false);
  });

  it("always has a dir path", async () => {
    const routes = await buildRouteMap(TEST_ROUTES_DIR);
    for (const route of routes) {
      expect(route.dir).toBeDefined();
    }
  });

  it("extracts params from dynamic routes", async () => {
    const routes = await buildRouteMap(TEST_ROUTES_DIR);
    const blog = routes.find((r) => r.urlPath === "/blog/:id");
    expect(blog?.params).toEqual(["id"]);
  });

  it("returns empty params for static routes", async () => {
    const routes = await buildRouteMap(TEST_ROUTES_DIR);
    const about = routes.find((r) => r.urlPath === "/about");
    expect(about?.params).toEqual([]);
  });
});
