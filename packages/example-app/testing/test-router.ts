import { buildRouteMap } from "imhashem";
import { join } from "path";

const routes = await buildRouteMap(join(import.meta.dir, "routes"));

console.log("Routes found:");
for (const route of routes) {
  console.log(`  ${route.urlPath}`);
  console.log(`    server: ${route.serverFile}`);
  console.log(`    client: ${route.clientFile ?? "none"}`);
}