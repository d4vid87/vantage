export const IDLE_ROTATION_DELAY_MS = 20_000;

export function shouldRotateGlobe(options: {
  enabled: boolean;
  zoom: number;
  idleMs: number;
  hidden: boolean;
  reducedMotion: boolean;
  lowPower: boolean;
  blocked: boolean;
  moving: boolean;
}) {
  return options.enabled
    && options.zoom <= 3
    && options.idleMs >= IDLE_ROTATION_DELAY_MS
    && !options.hidden
    && !options.reducedMotion
    && !options.lowPower
    && !options.blocked
    && !options.moving;
}
