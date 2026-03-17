import { readdir } from "node:fs/promises";
import { join } from "node:path";

export interface Route {
  urlPath: string; // e.g. "/", "/about", "/blog/:id"
  dir: string; // absolute path to the route folder
  hasClient: boolean;
  hasShared: boolean;
  params: string[]; // e.g. ["id"] for /blog/:id
}

async function fileExists(path: string): Promise<boolean> {
  return Bun.file(path).exists();
}

// scans the routes directory recursively and returns a list of routes
export async function buildRouteMap(routesDir: string): Promise<Route[]> {
  const routes: Route[] = [];

  // inner recursive function — has direct access to `routes` so we don't need to pass it around
  // dir = current folder on disk, urlPrefix = URL built so far (starts as "/")
  async function scanDir(dir: string, urlPrefix: string) {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      // routes live in folders — ignore any loose files
      if (!entry.isDirectory()) continue;

      const folderName = entry.name; // e.g. "index", "about", "[id]"
      const folderPath = join(dir, folderName);

      // convert [id] → :id for dynamic segments
      const urlSegment =
        folderName.startsWith("[") && folderName.endsWith("]")
          ? `:${folderName.slice(1, -1)}`
          : folderName;

      // build the URL path — "index" folder is special, it maps to "/"
      const urlPath =
        urlPrefix === "/"
          ? folderName === "index"
            ? "/"
            : `/${urlSegment}`
          : `${urlPrefix}/${urlSegment}`;

      // only register this folder as a route if it has a page.server.tsx
      const serverExists = await fileExists(join(folderPath, "page.server.tsx"));
      if (!serverExists) {
        await scanDir(folderPath, urlPath);
        continue;
      }

      // extract param names from the URL — "/blog/:id/:slug" → ["id", "slug"]
      const params = urlPath
        .split("/")
        .filter((segment) => segment.startsWith(":"))
        .map((segment) => segment.slice(1));

      routes.push({
        urlPath,
        dir: folderPath,
        hasClient: await fileExists(join(folderPath, "page.client.tsx")),
        hasShared: await fileExists(join(folderPath, "page.shared.tsx")),
        params,
      });

      await scanDir(folderPath, urlPath);
    }
  }

  await scanDir(routesDir, "/");
  return routes;
}