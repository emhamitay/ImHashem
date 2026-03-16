import { join, basename } from "node:path";
import type { Route } from "./router";
import { generateEntry, cleanGeneratedEntries } from "./entry-generator";

export interface BundleResult {
  route: Route;
  // Full absolute path to the generated JS file on disk.
  // We return this so the renderer knows exactly which file
  // was generated and can derive the public URL from it.
  outFile: string;
  // The public URL path the browser uses to download this bundle.
  // e.g. "/bundles/page.client-a1b2c3.js"
  // Renderer injects this into the <script> tag.
  publicUrl: string;
}

export async function bundleRoutes(
  routes: Route[],
  outDir: string, // where on disk to write files
  publicPath: string = "/bundles", // what URL prefix to use
  layoutDir: string | null = null, // path to layout folder if exists
  // PROFESSIONAL: appRoot tells the bundler where the developer's app lives.
  // Generated entry files and .gitignore are placed here, not in the framework.
  // Simple alternative: hardcode a path — breaks for every different project.
  appRoot: string
): Promise<BundleResult[]> {
  const results: BundleResult[] = [];

  // PROFESSIONAL: derive environment once outside the loop —
  // process.env.NODE_ENV never changes during a single build run.
  // Simple alternative: inline ternary inside Bun.build() — works but
  // repeating the check per route is wasteful and harder to read.
  const isDev: boolean = process.env.NODE_ENV !== "production";

  for (const route of routes) {
    // Skip routes with no client file — server-only pages
    // send zero JS to the browser which is the best possible performance.
    // Simple alternative would be to always bundle something — wasteful.
    if (!route.hasClient) continue;

    // check if this route's layout has a client file
    // layout client is optional — not every layout needs interactivity
    const hasLayoutClient = layoutDir
      ? await Bun.file(join(layoutDir, "layout.client.tsx")).exists()
      : false;

    // PROFESSIONAL: generate a real entry file that handles hydrateRoot,
    // HMR, StrictMode, and layout merging — developer never writes this.
    // Simple alternative: bundle page.client.tsx directly — loses HMR
    // state preservation and layout client support.
    const { entryFile } = await generateEntry(
      route,
      hasLayoutClient,
      hasLayoutClient ? layoutDir : null,
      appRoot
    );

    const result = await Bun.build({
      entrypoints: [entryFile],
      outdir: outDir,
      target: "browser",

      // PROFESSIONAL: content hashing in the filename.
      // Simple alternative: just "page.client.js" — but two routes would
      // overwrite each other since every client file is named page.client.tsx.
      // Hashing gives every bundle a unique name AND enables cache busting —
      // when the file content changes, the hash changes, so browsers
      // automatically re-download instead of serving stale cached JS.
      // This is what Next.js, Vite, and every serious bundler does.
      naming: "[name]-[hash].[ext]",

      // PROFESSIONAL: minify automatically based on environment.
      // Simple alternative: hardcode false — but then production
      // ships unminified JS which is larger and slower to download.
      minify: !isDev,

      // PROFESSIONAL: source maps in development only.
      // Simple alternative: no source maps — but then browser devtools
      // show minified/bundled code instead of your original TypeScript.
      // In production we skip them to reduce bundle size.
      sourcemap: isDev ? "inline" : "none",
    });

    if (!result.success) {
      // Log each build error clearly so the developer knows exactly
      // which route failed and why — professional error reporting.
      console.error(`[ImHashem] Failed to bundle route: ${route.urlPath}`);
      for (const log of result.logs) {
        console.error(log);
      }
      continue;
    }

    // Bun.build() returns the output files it generated.
    // We take the first one — each route has one entry point
    // so there will always be exactly one output file.
    const outFile = result.outputs[0]!.path;

    // PROFESSIONAL: basename() handles both Windows (\) and Unix (/) paths.
    // Simple alternative: split("/").at(-1) — breaks on Windows.
    const fileName = basename(outFile);

    // Derive the public URL from the output filename.
    // The browser doesn't know about the filesystem — it only
    // knows URLs. So "/bundles/page.client-a1b2c3.js" is what
    // gets injected into the <script> tag.
    const publicUrl = `${publicPath}/${fileName}`;

    results.push({ route, outFile, publicUrl });
  }

  // PROFESSIONAL: in dev keep generated entries for faster HMR rebuilds.
  // In production clean up immediately — no leftover files in deployment.
  await cleanGeneratedEntries(isDev, appRoot);

  return results;
}