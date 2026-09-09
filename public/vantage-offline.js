/* Opt-in, read-only situation snapshot. Never cache API responses or sign-in pages. */
const CACHE = "vantage-offline-v1";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim()),
);
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === "/api/auth/logout") {
    event.respondWith(
      (async () => {
        for (const client of await self.clients.matchAll())
          client.postMessage({ type: "vantage-offline-clear" });
        await caches.delete(CACHE);
        return fetch(event.request);
      })(),
    );
    return;
  }
  if (event.request.mode !== "navigate" || url.pathname !== "/") return;
  event.respondWith(
    (async () => {
      try {
        const response = await fetch(event.request);
        if (
          response.status === 401 ||
          response.status === 403 ||
          new URL(response.url).pathname === "/login"
        )
          await caches.delete(CACHE);
        return response;
      } catch {
        return (
          (await caches.match("/__vantage_offline_snapshot", {
            cacheName: CACHE,
          })) ||
          new Response(
            "No offline snapshot saved. Reconnect to open Vantage.",
            { status: 503, headers: { "Content-Type": "text/plain" } },
          )
        );
      }
    })(),
  );
});
