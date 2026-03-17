import { imhashem } from "imhashem";
import { join } from "node:path";

const app = await imhashem({
  routesDir: join(import.meta.dir, "routes"),
  appRoot: import.meta.dir,
});

const server = Bun.serve({
  routes: app.routes,
  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

console.log(`🚀 ImHashem running at ${server.url}`);