// Remove the previous NetworkFirst cache, which could contain private API data.
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then(names => Promise.all(
    names.filter(name => name === "offlineCache").map(name => caches.delete(name))
  )));
});
