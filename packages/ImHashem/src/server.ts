import { join } from "node:path";
import { buildRouteMap } from "./router";
import { bundleRoutes } from "./bundler";
import { renderRoute } from "./renderer";
import type { BundleResult } from "./bundler";
import type { Route } from "./router";

export interface ImHashemOptions {
  routesDir: string;
  appRoot: string;
  outDir?: string;           // where to write bundle files, default: appRoot/.imhashem/bundles
  publicPath?: string;       // URL prefix for bundles, default: /bundles
}

export interface ImHashemApp {
  // pass this directly to Bun.serve({ routes })
  routes: Record<string, (req: Request) => Response | Promise<Response>>;
  // the resolved bundle for each route URL — useful for debugging
  bundleMap: Map<string, BundleResult>;
  // raw route list from the router
  routeList: Route[];
}

export async function imhashem(options: ImHashemOptions): Promise<ImHashemApp> {
  const {
    routesDir,
    appRoot,
    outDir = join(appRoot, ".imhashem", "bundles"),
    publicPath = "/bundles",
  } = options;

  // scan the filesystem and get all routes
  const routeList = await buildRouteMap(routesDir);

  // bundle client files and get back the public URLs
  const bundleResults = await bundleRoutes(routeList, outDir, publicPath, null, appRoot);
  const bundleMap = new Map<string, BundleResult>(
    bundleResults.map((b) => [b.route.urlPath, b])
  );

  // build one handler per route
  const routeHandlers: Record<string, (req: Request) => Response | Promise<Response>> = {};

  for (const route of routeList) {
    // capture route in closure so each handler refers to the right route
    const captured = route;

    routeHandlers[captured.urlPath] = (req: Request) => {
      // Bun attaches matched dynamic params to req.params automatically
      const params = (req as any).params ?? {};
      return renderRoute(captured, bundleMap, params, routesDir, appRoot);
    };
  }

  // static file handler — serves the bundled JS files to the browser
  // the URL pattern matches what we injected into the <script> tags
  const staticPattern = publicPath + "/:file";
  routeHandlers[staticPattern] = async (req: Request) => {
    const file = (req as any).params?.file;
    if (!file) return new Response("Not found", { status: 404 });

    const filePath = join(outDir, file);
    const bunFile = Bun.file(filePath);

    if (!(await bunFile.exists())) {
      return new Response("Not found", { status: 404 });
    }

    return new Response(bunFile, {
      headers: {
        "Content-Type": "application/javascript",
        // tell the browser to cache bundles aggressively — the hash in the
        // filename means a new file name = new content, so this is safe
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  };

  return { routes: routeHandlers, bundleMap, routeList };
}