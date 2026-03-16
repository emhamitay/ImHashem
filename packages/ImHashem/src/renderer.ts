import { renderToReadableStream } from "react-dom/server";
import { join } from "node:path";
import type { Route } from "./router";
import type { BundleResult } from "./bundler";

// PROFESSIONAL: we accept the full BundleResult map so the renderer
// knows exactly which public URL to inject per route.
// Simple alternative: derive the URL inside the renderer — but then
// the renderer needs to know about bundling logic, violating separation
// of concerns. Each module should do one thing.
type BundleMap = Map<string, BundleResult>;

export async function renderRoute(
  route: Route,
  bundleMap: BundleMap,
  // params extracted from the URL by the HTTP server
  // e.g. /blog/123 → { id: "123" }
  params: Record<string, string> = {}
): Promise<Response> {

  // PROFESSIONAL: dynamic import of the page module at request time.
  // Simple alternative: import all pages at startup — but then a syntax
  // error in one page crashes the whole server. Dynamic import isolates
  // failures per route and also allows hot reloading later.
  const serverFile = join(route.dir, "page.server.tsx");
  const pageModule = await import(serverFile);
  const Page = pageModule.default;

  if (!Page) {
    // clear error message telling the developer exactly what's wrong
    throw new Error(
      `[ImHashem] Route ${route.urlPath} — page.server.tsx must have a default export`
    );
  }

  // get the bundle for this route if it has a client file
  const bundle = bundleMap.get(route.urlPath);

  // PROFESSIONAL: server data bridge — inject server data as JSON
  // into the HTML so the client can pick it up without an extra API call.
  // Simple alternative: no data bridge — client has to fetch data again
  // after hydration causing a flash of empty content.
  // The framework hides this from the developer completely —
  // they never write script tags or JSON.parse manually.
  const dataScript = `
    <script id="__IMHASHEM_DATA__" type="application/json">
      ${JSON.stringify({ params })}
    </script>
  `;

  // PROFESSIONAL: inject the client bundle script only when it exists.
  // Simple alternative: always inject a script tag — but server-only
  // pages would get a 404 on the script which shows errors in devtools.
  const bundleScript = bundle
    ? `<script type="module" src="${bundle.publicUrl}"></script>`
    : "";

  // call the page component — it can be async so we await it
  const pageElement = await Page({ params });

  // PROFESSIONAL: renderToReadableStream uses Web Streams API —
  // Bun supports this natively with zero extra code.
  // Simple alternative: renderToString — but that waits for the entire
  // page to render before sending anything. Streams send HTML chunks
  // as they're ready so the browser starts rendering immediately.
  const stream = await renderToReadableStream(pageElement, {
    // bootstrapScripts tells React which JS file to load on the client
    // for hydration. Without this the page is static HTML forever.
    bootstrapScripts: bundle ? [bundle.publicUrl] : [],

    onError(error) {
      // PROFESSIONAL: log SSR errors with route context so developer
      // knows exactly which page threw and why.
      console.error(`[ImHashem] SSR error on route ${route.urlPath}:`, error);
    },
  });

  // wrap the stream in a full HTML document
  // PROFESSIONAL: we use a TransformStream to inject our scripts
  // into the HTML shell around the React stream.
  // Simple alternative: renderToString + string concatenation —
  // loses all streaming benefits.
  const html = new Response(
    new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();

        // send the HTML shell before the React stream
        controller.enqueue(
          encoder.encode(`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>ImHashem</title>
  </head>
  <body>
    <div id="root">`)
        );

        // pipe the React SSR stream into our response
        const reader = stream.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(value);
        }

        // inject data bridge + bundle script after the React content
        controller.enqueue(
          encoder.encode(`</div>
    ${dataScript}
    ${bundleScript}
  </body>
</html>`)
        );

        controller.close();
      },
    }),
    {
      headers: {
        // PROFESSIONAL: explicit content type with charset.
        // Simple alternative: omit headers — browser has to guess
        // the encoding which can cause character rendering bugs.
        "Content-Type": "text/html; charset=utf-8",
      },
    }
  );

  return html;
}