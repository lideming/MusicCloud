// /// <reference no-default-lib="true"/>
// /// <reference lib="es2015" />
/// <reference lib="webworker" />

const sw = self as unknown as ServiceWorkerGlobalScope;

const func = <T>(obj: T) => {};

const selfOrigin = self.location.origin;

sw.addEventListener("fetch", function (event) {
  const url = new URL(event.request.url);
  // Handle same-origin requests only
  if (url.origin === selfOrigin && event.request.method === "GET") {
    event.respondWith(
      caches.match(event.request).then(async (response) => {
        if (url.pathname.startsWith("/api/")) {
          // Always try fetching first for API requests.
          try {
            return await fetchAndSave(event.request);
          } catch (error) {
            // Try get cached response if API request failed.
            var response = await caches.match(event.request);
            if (response) {
              ((this.self as any).clients as Clients)
                .get(event.clientId)
                .then((client) => {
                  client?.postMessage({
                    type: "cached_api",
                    url: event.request.url,
                  });
                });
              console.info("cached api after failed", event.request.url);
              return response;
            }
            console.info("api uncached and retrying", event.request.url);
            return fetchAndSave(event.request);
          }
        } else if (response !== undefined) {
          console.info("cached", event.request.url);
          // when it's cached, return the cached response and update cache.
          fetch(event.request).then(async (response) => {
            if (response.ok) {
              var cache = await caches.open("v1");
              cache.put(event.request, response);
            }
          });
          return response;
        } else {
          console.info("uncached", event.request.url);
          return fetchAndSave(event.request);
        }
      })
    );
  }
});

function fetchAndSave(request: Request) {
  return fetch(request).then(function (response) {
    if (response.ok) {
      var responseClone = response.clone();
      caches.open("v1").then(function (cache) {
        cache.put(request, responseClone);
      });
    }
    return response;
  });
}
