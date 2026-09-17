export async function clearSessionCaches(): Promise<void> {
  if (typeof caches === "undefined") return;
  const names = await caches.keys();
  await Promise.all(names.map(name => caches.delete(name)));
}
