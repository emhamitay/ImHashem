import { renderToReadableStream } from "react-dom/server";
import { createElement } from "react";
import { join } from "node:path";
import type { Route } from "./router";
import type { BundleResult } from "./bundler";
import { resolveLayout } from "./layout-resolver";

type BundleMap = Map<string, BundleResult>;

export async function renderRoute(
  route: Route,
  bundleMap: BundleMap,
  params: Record<string, string> = {}, // e.g. /blog/123 → { id: "123" }
  routesDir: string,
  appRoot: string
): Promise<Response> {

  // dynamic import at request time — isolates failures per route
  const serverFile = join(route.dir, "page.server.tsx");
  const pageModule = await import(serverFile);
  const Page = pageModule.default;

  if (!Page) {
    throw new Error(
      `[ImHashem] Route ${route.urlPath} — page.server.tsx must have a default export`
    );
  }

  const bundle = bundleMap.get(route.urlPath);

  const pageElement = await Page({ params });

  // find the closest layout and wrap the page inside it
  const layout = await resolveLayout(route.dir, routesDir, appRoot);
  let rootElement = pageElement;

  if (layout.serverLayout) {
    const layoutModule = await import(layout.serverLayout);
    const Layout = layoutModule.default;
    if (Layout) {
      rootElement = createElement(Layout, { children: pageElement });
    }
  }

  // data script always injected — client needs params even on server-only pages
  const dataScript = `
    <script id="__IMHASHEM_DATA__" type="application/json">
      ${JSON.stringify({ params })}
    </script>`;

  // bundle script only injected when this route has a client file
  const bundleScript = bundle
    ? `\n    <script type="module" src="${bundle.publicUrl}"></script>`
    : "";

  // renderToReadableStream sends HTML chunks as ready — browser starts rendering immediately
  const stream = await renderToReadableStream(rootElement, {
    onError(error) {
      console.error(`[ImHashem] SSR error on route ${route.urlPath}:`, error);
    },
  });

  const html = new Response(
    new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();

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

        const reader = stream.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(value);
        }

        // client mount point lives outside #root so createRoot never touches the SSR tree
        const clientDiv = bundle ? `\n    <div id="__imhashem_client__"></div>` : "";

        controller.enqueue(
          encoder.encode(`</div>${clientDiv}${dataScript}${bundleScript}
  </body>
</html>`)
        );

        controller.close();
      },
    }),
    {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    }
  );

  return html;
}