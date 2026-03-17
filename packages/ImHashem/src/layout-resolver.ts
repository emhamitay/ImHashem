import { join, dirname } from "node:path";

export interface LayoutResult {
  serverLayout: string | null; // absolute path to layout.server.tsx, or null
  clientLayout: string | null; // absolute path to layout.client.tsx, or null
  layoutDir: string | null;    // the folder where the layout was found, or null
}

async function fileExists(path: string): Promise<boolean> {
  return Bun.file(path).exists();
}

// walks up from the route's folder toward appRoot looking for a layout.server.tsx
// never walks past appRoot — closest layout wins
export async function resolveLayout(
  routeDir: string,
  routesDir: string,
  appRoot: string
): Promise<LayoutResult> {
  // build the list of dirs to check: one above routeDir up to and including appRoot
  // we stop adding once we reach appRoot so we never walk outside the project
  const dirs: string[] = [];
  let current = dirname(routeDir);

  while (true) {
    dirs.push(current);
    if (current === appRoot) break;         // stop here — don't go further up
    const parent = dirname(current);
    if (parent === current) break;          // filesystem root guard
    current = parent;
  }

  for (const dir of dirs) {
    const serverLayout = join(dir, "layout.server.tsx");
    const clientLayout = join(dir, "layout.client.tsx");

    if (await fileExists(serverLayout)) {
      return {
        serverLayout,
        clientLayout: await fileExists(clientLayout) ? clientLayout : null,
        layoutDir: dir,
      };
    }
  }

  return { serverLayout: null, clientLayout: null, layoutDir: null };
}