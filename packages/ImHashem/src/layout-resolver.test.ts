import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { resolveLayout } from "./layout-resolver";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";

// Directory structure we're simulating:
//
// TEST_DIR/
//   layout.server.tsx
//   layout.client.tsx
//   routes/
//     index/page.server.tsx
//     about/page.server.tsx
//     blog/
//       layout.server.tsx      ← server only, no client
//       [id]/page.server.tsx
//     dashboard/
//       layout.server.tsx
//       layout.client.tsx
//       settings/page.server.tsx
//
// NO_LAYOUT_ROOT/              ← completely separate root with no layouts
//   routes/
//     nolayout/page.server.tsx

const TEST_DIR = join(import.meta.dir, "__test_layout__");
const ROUTES_DIR = join(TEST_DIR, "routes");

// separate isolated root — no layout files anywhere inside it
const NO_LAYOUT_ROOT = join(import.meta.dir, "__test_nolayout_root__");
const NO_LAYOUT_ROUTES_DIR = join(NO_LAYOUT_ROOT, "routes");

beforeAll(async () => {
  await mkdir(TEST_DIR, { recursive: true });
  await writeFile(join(TEST_DIR, "layout.server.tsx"), "export default function RootLayout({ children }: any) { return children; }");
  await writeFile(join(TEST_DIR, "layout.client.tsx"), "export default function RootLayoutClient({ children }: any) { return children; }");

  await mkdir(join(ROUTES_DIR, "index"), { recursive: true });
  await writeFile(join(ROUTES_DIR, "index", "page.server.tsx"), "export default function Page() { return null; }");

  await mkdir(join(ROUTES_DIR, "about"), { recursive: true });
  await writeFile(join(ROUTES_DIR, "about", "page.server.tsx"), "export default function Page() { return null; }");

  await mkdir(join(ROUTES_DIR, "blog", "[id]"), { recursive: true });
  await writeFile(join(ROUTES_DIR, "blog", "layout.server.tsx"), "export default function BlogLayout({ children }: any) { return children; }");
  await writeFile(join(ROUTES_DIR, "blog", "[id]", "page.server.tsx"), "export default function Page() { return null; }");

  await mkdir(join(ROUTES_DIR, "dashboard", "settings"), { recursive: true });
  await writeFile(join(ROUTES_DIR, "dashboard", "layout.server.tsx"), "export default function DashLayout({ children }: any) { return children; }");
  await writeFile(join(ROUTES_DIR, "dashboard", "layout.client.tsx"), "export default function DashLayoutClient({ children }: any) { return children; }");
  await writeFile(join(ROUTES_DIR, "dashboard", "settings", "page.server.tsx"), "export default function Page() { return null; }");

  // nolayout route lives inside NO_LAYOUT_ROOT — completely isolated from TEST_DIR
  await mkdir(join(NO_LAYOUT_ROUTES_DIR, "nolayout"), { recursive: true });
  await writeFile(join(NO_LAYOUT_ROUTES_DIR, "nolayout", "page.server.tsx"), "export default function Page() { return null; }");
});

afterAll(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
  await rm(NO_LAYOUT_ROOT, { recursive: true, force: true });
});

describe("resolveLayout", () => {
  it("finds the root layout.server.tsx for a top-level route", async () => {
    const result = await resolveLayout(join(ROUTES_DIR, "about"), ROUTES_DIR, TEST_DIR);
    expect(result.serverLayout).toBe(join(TEST_DIR, "layout.server.tsx"));
  });

  it("finds a route-level layout.server.tsx when one exists", async () => {
    const result = await resolveLayout(join(ROUTES_DIR, "blog", "[id]"), ROUTES_DIR, TEST_DIR);
    expect(result.serverLayout).toBe(join(ROUTES_DIR, "blog", "layout.server.tsx"));
  });

  it("closest layout wins — dashboard/settings gets dashboard layout not root", async () => {
    const result = await resolveLayout(join(ROUTES_DIR, "dashboard", "settings"), ROUTES_DIR, TEST_DIR);
    expect(result.serverLayout).toBe(join(ROUTES_DIR, "dashboard", "layout.server.tsx"));
  });

  it("returns null for serverLayout when no layout exists anywhere", async () => {
    const result = await resolveLayout(
      join(NO_LAYOUT_ROUTES_DIR, "nolayout"),
      NO_LAYOUT_ROUTES_DIR,
      NO_LAYOUT_ROOT
    );
    expect(result.serverLayout).toBeNull();
  });

  it("finds the root layout.client.tsx when it exists", async () => {
    const result = await resolveLayout(join(ROUTES_DIR, "about"), ROUTES_DIR, TEST_DIR);
    expect(result.clientLayout).toBe(join(TEST_DIR, "layout.client.tsx"));
  });

  it("finds a route-level layout.client.tsx when one exists", async () => {
    const result = await resolveLayout(join(ROUTES_DIR, "dashboard", "settings"), ROUTES_DIR, TEST_DIR);
    expect(result.clientLayout).toBe(join(ROUTES_DIR, "dashboard", "layout.client.tsx"));
  });

  it("returns null for clientLayout when server layout has no client counterpart", async () => {
    const result = await resolveLayout(join(ROUTES_DIR, "blog", "[id]"), ROUTES_DIR, TEST_DIR);
    expect(result.clientLayout).toBeNull();
  });

  it("returns null for clientLayout when no layout exists anywhere", async () => {
    const result = await resolveLayout(
      join(NO_LAYOUT_ROUTES_DIR, "nolayout"),
      NO_LAYOUT_ROUTES_DIR,
      NO_LAYOUT_ROOT
    );
    expect(result.clientLayout).toBeNull();
  });

  it("returns the directory of the resolved layout as layoutDir", async () => {
    const result = await resolveLayout(join(ROUTES_DIR, "blog", "[id]"), ROUTES_DIR, TEST_DIR);
    expect(result.layoutDir).toBe(join(ROUTES_DIR, "blog"));
  });

  it("layoutDir is appRoot when root layout is used", async () => {
    const result = await resolveLayout(join(ROUTES_DIR, "about"), ROUTES_DIR, TEST_DIR);
    expect(result.layoutDir).toBe(TEST_DIR);
  });

  it("layoutDir is null when no layout exists", async () => {
    const result = await resolveLayout(
      join(NO_LAYOUT_ROUTES_DIR, "nolayout"),
      NO_LAYOUT_ROUTES_DIR,
      NO_LAYOUT_ROOT
    );
    expect(result.layoutDir).toBeNull();
  });
});