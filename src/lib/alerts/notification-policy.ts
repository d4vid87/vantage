export interface NotificationPolicy {
  enabled: boolean;
  start: string;
  end: string;
  timezone: string;
  severeWeatherBypass: boolean;
  grouped: boolean;
}
export const DEFAULT_NOTIFICATION_POLICY: NotificationPolicy = {
  enabled: false,
  start: "22:00",
  end: "07:00",
  timezone: "UTC",
  severeWeatherBypass: false,
  grouped: false,
};
export function validateNotificationPolicy(value: unknown): NotificationPolicy {
  if (value === undefined) return { ...DEFAULT_NOTIFICATION_POLICY };
  if (!value || typeof value !== "object")
    throw new Error("Invalid notification preferences.");
  const p = value as NotificationPolicy;
  if (
    ![p.enabled, p.severeWeatherBypass, p.grouped].every(
      (v) => typeof v === "boolean",
    ) ||
    ![p.start, p.end].every(
      (v) => typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v),
    ) ||
    typeof p.timezone !== "string"
  )
    throw new Error("Choose valid quiet hours.");
  try {
    new Intl.DateTimeFormat("en", { timeZone: p.timezone }).format();
  } catch {
    throw new Error("Choose a valid quiet-hours timezone.");
  }
  if (p.enabled && p.start === p.end)
    throw new Error("Quiet hours must have different start and end times.");
  return {
    enabled: p.enabled,
    start: p.start,
    end: p.end,
    timezone: p.timezone,
    severeWeatherBypass: p.severeWeatherBypass,
    grouped: p.grouped,
  };
}
export function isSevereWeather(alert: {
  severity: string;
  payload?: unknown;
}) {
  const p = alert.payload as {
    event?: unknown;
    severeWeather?: boolean;
  } | null;
  return (
    ["CRITICAL", "HIGH"].includes(alert.severity) &&
    (!!p?.event || p?.severeWeather === true)
  );
}
export function notificationAllowed(
  policy: NotificationPolicy,
  alert: { severity: string; payload?: unknown },
  now = new Date(),
) {
  if (!policy.enabled || (policy.severeWeatherBypass && isSevereWeather(alert)))
    return true;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: policy.timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const time =
    parts.find((p) => p.type === "hour")!.value +
    ":" +
    parts.find((p) => p.type === "minute")!.value;
  return !(policy.start < policy.end
    ? time >= policy.start && time < policy.end
    : time >= policy.start || time < policy.end);
}
