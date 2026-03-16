//import { serve } from "bun";
//import index from "./index.html";
import { buildRouteMap } from "../../ImHashem/src/index"
import { join } from "node:path";

const routes = await buildRouteMap(join(import.meta.dir, "routes"));

//console.log(`🚀 Server running at ${server.url}`);
