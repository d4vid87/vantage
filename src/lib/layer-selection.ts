/** Apply a layer group atomically; enabled child overlays require their parent. */
export function toggleLayerSelection(
  current: Record<string, boolean>,
  layers: { key: string; parent?: string }[],
) {
  const enabled = !layers.some((layer) => current[layer.key]);
  const next = { ...current };
  for (const layer of layers) {
    next[layer.key] = enabled;
    if (enabled && layer.parent) next[layer.parent] = true;
  }
  return next;
}
