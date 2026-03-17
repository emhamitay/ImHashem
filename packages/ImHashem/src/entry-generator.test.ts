import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { generateEntry, cleanGeneratedEntries } from "./entry-generator";
import { mkdir, writeFile, rm, access } from "node:fs/promises";
import { join } from "node:path";
import type { Route } from "./router";

const TEST_DIR = join(import.meta.dir, "__test_entry__");

const makeRoute = (urlPath: string, dir: string): Route => ({
  urlPath,
  dir,
  hasClient: true,
  hasShared: false,
  params: [],
});

beforeAll(async () => {
  await mkdir(join(TEST_DIR, "index"), { recursive: true });
  await mkdir(join(TEST_DIR, "about"), { recursive: true });
  await mkdir(join(TEST_DIR, "blog-id"), { recursive: true });

  // minimal page client files so imports in the generated content are valid paths
  await writeFile(join(TEST_DIR, "index", "page.client.tsx"), "export default function Page() { return null; }");
  await writeFile(join(TEST_DIR, "about", "page.client.tsx"), "export default function Page() { return null; }");
  await writeFile(join(TEST_DIR, "blog-id", "page.client.tsx"), "export default function Page() { return null; }");
});

afterAll(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
});

// ─── generateEntry ────────────────────────────────────────────────────────────

describe("generateEntry", () => {
  it("returns the correct route back", async () => {
    const route = makeRoute("/", join(TEST_DIR, "index"));
    const result = await generateEntry(route, TEST_DIR);
    expect(result.route).toBe(route);
  });

  it("creates the .imhashem/generated directory", async () => {
    const route = makeRoute("/", join(TEST_DIR, "index"));
    await generateEntry(route, TEST_DIR);
    let exists = true;
    try { await access(join(TEST_DIR, ".imhashem", "generated")); } catch { exists = false; }
    expect(exists).toBe(true);
  });

  it("names the entry file 'index.entry.tsx' for the root route", async () => {
    const route = makeRoute("/", join(TEST_DIR, "index"));
    const result = await generateEntry(route, TEST_DIR);
    expect(result.entryFile).toEndWith("index.entry.tsx");
  });

  it("names the entry file after the url path for non-root routes", async () => {
    const route = makeRoute("/about", join(TEST_DIR, "about"));
    const result = await generateEntry(route, TEST_DIR);
    expect(result.entryFile).toEndWith("about.entry.tsx");
  });

  it("converts slashes to dashes and strips colons for dynamic routes", async () => {
    const route = makeRoute("/blog/:id", join(TEST_DIR, "blog-id"));
    const result = await generateEntry(route, TEST_DIR);
    expect(result.entryFile).toEndWith("blog-id.entry.tsx");
  });

  it("writes the entry file to disk", async () => {
    const route = makeRoute("/about", join(TEST_DIR, "about"));
    const result = await generateEntry(route, TEST_DIR);
    const exists = await Bun.file(result.entryFile).exists();
    expect(exists).toBe(true);
  });

  it("generated content imports PageClient", async () => {
    const route = makeRoute("/", join(TEST_DIR, "index"));
    const result = await generateEntry(route, TEST_DIR);
    const content = await Bun.file(result.entryFile).text();
    expect(content).toContain('import PageClient from');
  });

  it("generated content does NOT import LayoutClient", async () => {
    const route = makeRoute("/", join(TEST_DIR, "index"));
    const result = await generateEntry(route, TEST_DIR);
    const content = await Bun.file(result.entryFile).text();
    expect(content).not.toContain("LayoutClient");
  });

  it("generated content uses hydrateRoot", async () => {
    const route = makeRoute("/", join(TEST_DIR, "index"));
    const result = await generateEntry(route, TEST_DIR);
    const content = await Bun.file(result.entryFile).text();
    expect(content).toContain("hydrateRoot");
  });

  it("generated content wraps PageClient in StrictMode", async () => {
    const route = makeRoute("/", join(TEST_DIR, "index"));
    const result = await generateEntry(route, TEST_DIR);
    const content = await Bun.file(result.entryFile).text();
    expect(content).toContain("createElement(StrictMode");
    expect(content).toContain("createElement(PageClient");
  });

  it("generated content uses forward slashes in import paths on Windows", async () => {
    const route = makeRoute("/", join(TEST_DIR, "index"));
    const result = await generateEntry(route, TEST_DIR);
    const content = await Bun.file(result.entryFile).text();
    // import path must never contain backslashes
    const importLine = content.split("\n").find(l => l.startsWith("import PageClient"));
    expect(importLine).not.toContain("\\");
  });
});

// ─── cleanGeneratedEntries ────────────────────────────────────────────────────

describe("cleanGeneratedEntries", () => {
  it("does NOT delete the .imhashem directory in dev mode", async () => {
    const root = join(TEST_DIR, "clean-dev");
    await mkdir(join(root, ".imhashem", "generated"), { recursive: true });

    await cleanGeneratedEntries(true, root);

    let exists = true;
    try { await access(join(root, ".imhashem")); } catch { exists = false; }
    expect(exists).toBe(true);
  });

  it("deletes the .imhashem directory in production mode", async () => {
    const root = join(TEST_DIR, "clean-prod");
    await mkdir(join(root, ".imhashem", "generated"), { recursive: true });

    await cleanGeneratedEntries(false, root);

    let threw = false;
    try {
      await access(join(root, ".imhashem"));
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });
});
