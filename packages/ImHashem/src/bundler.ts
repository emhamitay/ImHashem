import { join, basename } from "node:path";
import type { Route } from "./router";

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
): Promise<BundleResult[]> {
  const results: BundleResult[] = [];

  // Professional: derive it from a named variable — self documenting,
  // reusable across the whole bundler, change it in one place
  const isDev: boolean = process.env.NODE_ENV !== "production";

  for (const route of routes) {
    // Skip routes with no client file — server-only pages
    // send zero JS to the browser which is the best possible performance.
    // Simple alternative would be to always bundle something — wasteful.
    if (!route.hasClient) continue;

    const clientFile = join(route.dir, "page.client.tsx");

    const result = await Bun.build({
      entrypoints: [clientFile],
      outdir: outDir,
      target: "browser",

      // PROFESSIONAL: content hashing in the filename.
      // Simple alternative: just "page.client.js" — but two routes would
      // overwrite each other since every client file is named page.client.tsx.
      // Hashing gives every bundle a unique name AND enables cache busting —
      // when the file content changes, the hash changes, so browsers
      // automatically re-download instead of serving stale cached JS.
      // also this helps security by making it impossible to guess the URL of a bundle without first building it, so attackers can't target specific bundles with attacks like cache poisoning.
      // This is what Next.js, Vite, and every serious bundler does.
      naming: {
        // [name]  = original filename without extension (page.client)
        // [hash]  = content hash, changes when file content changes
        // [ext]   = extension (js)
        // result: page.client-a1b2c3.js
        entry: "[name]-[hash].[ext]",
        chunk: "[name]-[hash].[ext]",
        asset: "[name]-[hash].[ext]",
      },

      // PROFESSIONAL: minify automatically based on environment.
      // Simple alternative: hardcode false — but then production
      // ships unminified JS which is larger and slower to download.
      // process.env.NODE_ENV is "production" when running bun start,
      // and undefined/development when running bun dev.
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

    // Derive the public URL from the output filename.
    // The browser doesn't know about the filesystem — it only
    // knows URLs. So "/bundles/page.client-a1b2c3.js" is what
    // gets injected into the <script> tag.
    // Simple alternative: hardcode the path — breaks if outDir changes.
    const fileName = basename(outFile);

    const publicUrl = `${publicPath}/${fileName}`; // e.g. "/bundles/page.client-a1b2c3.js"

    results.push({ route, outFile, publicUrl });
  }

  return results;
}
