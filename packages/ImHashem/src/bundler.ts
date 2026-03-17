import { join, basename } from "node:path";
import type { Route } from "./router";
import { generateEntry, cleanGeneratedEntries } from "./entry-generator";

export interface BundleResult {
  route: Route;
  outFile: string;  // absolute path to the generated JS file on disk
  publicUrl: string; // URL the browser uses to download this bundle, e.g. "/bundles/index.entry-a1b2c3.js"
}

export async function bundleRoutes(
  routes: Route[],
  outDir: string,              // where on disk to write the bundle files
  publicPath: string = "/bundles", // URL prefix injected into the <script> tag
  appRoot: string              // developer's app root — generated entries go here
): Promise<BundleResult[]> {
  const results: BundleResult[] = [];

  // read once outside the loop — doesn't change during a build run
  const isDev: boolean = process.env.NODE_ENV !== "production";

  for (const route of routes) {
    // server-only routes have no client file — skip them, send zero JS to the browser
    if (!route.hasClient) continue;

    // generate the entry file that wraps the developer's component with
    // hydrateRoot, HMR, and StrictMode — developer never writes this
    const { entryFile } = await generateEntry(route, appRoot);

    const result = await Bun.build({
      entrypoints: [entryFile],
      outdir: outDir,
      target: "browser",

      // content hash in the filename — gives each bundle a unique name
      // and forces browsers to re-download when the file changes
      naming: "[name]-[hash].[ext]",

      minify: !isDev,                          // minify in production only
      sourcemap: isDev ? "inline" : "none",    // source maps in dev only
    });

    if (!result.success) {
      console.error(`[ImHashem] Failed to bundle route: ${route.urlPath}`);
      for (const log of result.logs) {
        console.error(log);
      }
      continue;
    }

    const outFile = result.outputs[0]!.path;

    // basename() handles both Windows and Unix paths safely
    const fileName = basename(outFile);
    const publicUrl = `${publicPath}/${fileName}`;

    results.push({ route, outFile, publicUrl });
  }

  // keep generated entries in dev, clean up in production
  await cleanGeneratedEntries(isDev, appRoot);

  return results;
}
