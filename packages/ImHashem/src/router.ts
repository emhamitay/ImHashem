import { readdir } from "node:fs/promises";
import { join } from "node:path";

export interface Route {
  urlPath: string; // e.g. "/", "/about", "/blog/:id"
  dir: string; // absolute path to the route folder for bunlder to watch
  hasClient: boolean;
  hasShared: boolean;
  params: string[]; // e.g. ["id"] for /blog/:id
}

// helper to check if a file exists without throwing
// (Bun.file(path).exists() is not reliable because it returns false for directories, so we need to check if it's a file)
// this is used to check for page.client.tsx and page.shared.tsx
async function fileExists(path: string): Promise<boolean> {
  return Bun.file(path).exists();
}

// recursively scan the routes directory and build a route map
// routesDir — the caller passes in the path to their routes folder, e.g. "./src/routes".
export async function buildRouteMap(routesDir: string): Promise<Route[]> {
  const routes: Route[] = [];

  /*
    Inner function defined inside buildRouteMap. 
    Being inside means it has direct access to routes — it 
    can push into it without us passing it around. 
    dir is the current folder on disk. urlPrefix is the URL built 
    so far — starts as "/" and grows as we go deeper.
  */
  async function scanDir(dir: string, urlPrefix: string) {
    const entries = await readdir(dir, { withFileTypes: true }); // readdir lists everything in dir

    for (const entry of entries) {
      //We only care about folders because routes live in folders. Files sitting directly in the routes folder (like maybe a utils.ts) are ignored.
      if (!entry.isDirectory()) continue;

      const folderName = entry.name; // e.g. "index", "about", "[id]"
      const folderPath = join(dir, folderName); // absolute path to the folder on disk

      // dynamic route: [id] → :id
      const urlSegment =
        folderName.startsWith("[") && folderName.endsWith("]")
          ? `:${folderName.slice(1, -1)}`
          : folderName;

      // e.g. urlPrefix = "/" + urlSegment = "about" → "/about"
      /// special case for index: urlPrefix = "/" + urlSegment = "index" → "/"
      const urlPath =
        urlPrefix === "/"
          ? folderName === "index"
            ? "/"
            : `/${urlSegment}`
          : `${urlPrefix}/${urlSegment}`;

      // only register route if page.server.tsx exists
      const serverExists = await fileExists(
        join(folderPath, "page.server.tsx"),
      );
      if (!serverExists) {
        await scanDir(folderPath, urlPath);
        continue;
      }

      // "/blog/:id/:slug" → ["id", "slug"]
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
