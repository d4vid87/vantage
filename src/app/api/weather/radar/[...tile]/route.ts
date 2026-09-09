import { radar } from "@/lib/dashboard/weather";
import { asRecord } from "@/lib/dashboard/types";
export const dynamic = "force-dynamic";
// ponytail: process-local tile cache/budget; share these if the app gains multiple replicas.
const cache = new Map<string, { body: ArrayBuffer; at: number }>();
const pending = new Map<string, Promise<Response>>();
let attempts: number[] = [];
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ tile: string[] }> },
) {
  const { tile } = await params;
  if (tile.length !== 4 || !tile.every((v) => /^\d+$/.test(v)))
    return new Response("Invalid radar tile", { status: 400 });
  const [time, z, x, y] = tile.map(Number);
  if (z > 7 || x >= 2 ** z || y >= 2 ** z || !Number.isSafeInteger(time))
    return new Response("Invalid radar coordinates", { status: 400 });
  const key = tile.join("/"),
    now = Date.now(),
    stored = cache.get(key);
  const response = (body: ArrayBuffer) =>
    new Response(body, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "private, max-age=3600",
      },
    });
  if (stored && now - stored.at < 3600000)
    return response(stored.body.slice(0));
  const inflight = pending.get(key);
  if (inflight) return (await inflight).clone();
  const load = (async () => {
    const meta = await radar();
    const frames = Array.isArray(meta.data?.frames) ? meta.data.frames : [];
    const frame = frames.map(asRecord).find((f) => f.time === time);
    if (!frame) return new Response("Radar frame unavailable", { status: 404 });
    const attemptAt = Date.now();
    attempts = attempts.filter((t) => attemptAt - t < 60000);
    if (attempts.length >= 80)
      return new Response("Radar budget reached; pause playback", {
        status: 429,
        headers: { "Retry-After": "60" },
      });
    attempts.push(attemptAt);
    try {
      const result = await fetch(
        `${meta.data!.host}${frame.path}/256/${z}/${x}/${y}/2/1_1.png`,
        { signal: AbortSignal.timeout(12000) },
      );
      if (!result.ok) throw new Error("Radar tile unavailable");
      const body = await result.arrayBuffer();
      if (body.byteLength > 1000000)
        throw new Error("Unexpected radar tile size");
      cache.set(key, { body, at: now });
      while (cache.size > 256) cache.delete(cache.keys().next().value!);
      return response(body.slice(0));
    } catch {
      return new Response("Radar tile unavailable", { status: 502 });
    }
  })();
  pending.set(key, load);
  try {
    return (await load).clone();
  } finally {
    pending.delete(key);
  }
}
