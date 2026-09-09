/**
 * ═══════════════════════════════════════════════════════════════
 *  VANTAGE — Alert delivery
 *
 *  Four channels, each independently configured and each failing soft: a
 *  broken Discord webhook must never stop the email from going out, and a
 *  delivery failure must never lose the alert (it is already persisted before
 *  dispatch runs).
 * ═══════════════════════════════════════════════════════════════
 */

import { safeFetch } from '../ssrf-guard';
import type { Alert, Channel } from './types';

const SEVERITY_COLORS: Record<string, number> = {
  CRITICAL: 0xff3b30,
  HIGH: 0xff9500,
  ELEVATED: 0xffcc00,
  INFO: 0x00e5ff,
};

const NTFY_PRIORITY: Record<string, string> = {
  CRITICAL: 'urgent',
  HIGH: 'high',
  ELEVATED: 'default',
  INFO: 'low',
};

export interface DispatchResult {
  /** channel -> 'ok' or an error string. */
  results: Record<string, string>;
}

function locationLine(alert: Alert): string {
  if (alert.lat == null || alert.lng == null) return '';
  return `\nLocation: ${alert.lat.toFixed(4)}, ${alert.lng.toFixed(4)}`;
}

async function sendDiscord(alert: Alert): Promise<void> {
  const url = process.env.VANTAGE_DISCORD_WEBHOOK?.trim();
  if (!url) throw new Error('VANTAGE_DISCORD_WEBHOOK not set');

  const res = await fetch(url, {
    method: 'POST',
    signal: AbortSignal.timeout(15_000),
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'Vantage',
      embeds: [
        {
          title: alert.title,
          description: alert.body.slice(0, 4000),
          color: SEVERITY_COLORS[alert.severity] ?? SEVERITY_COLORS.INFO,
          timestamp: alert.createdAt,
          footer: { text: `VANTAGE · ${alert.severity}` },
          ...(alert.lat != null && alert.lng != null
            ? { fields: [{ name: 'Location', value: `${alert.lat.toFixed(4)}, ${alert.lng.toFixed(4)}` }] }
            : {}),
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Discord webhook ${res.status}`);
}

/**
 * ntfy carries the title in an HTTP header, and headers are ByteString: any
 * character above U+00FF throws before the request is even sent. Real alert
 * titles contain em-dashes and curly quotes routinely — a news headline is
 * enough — so the header is transliterated to ASCII rather than trusted.
 */
export function asciiHeader(value: string): string {
  return value
    .replace(/[\u2010-\u2015]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2026/g, '...')
    .normalize('NFKD')

    .replace(/[^\x00-\x7F]/g, '');
}

async function sendNtfy(alert: Alert): Promise<void> {
  const base = process.env.VANTAGE_NTFY_URL?.trim() || 'https://ntfy.sh';
  const topic = process.env.VANTAGE_NTFY_TOPIC?.trim();
  if (!topic) throw new Error('VANTAGE_NTFY_TOPIC not set');

  const headers: Record<string, string> = {
    Title: asciiHeader(alert.title).slice(0, 200),
    Priority: NTFY_PRIORITY[alert.severity] ?? 'default',
    Tags: `warning,${asciiHeader(alert.severity).toLowerCase()}`,
  };
  const token = process.env.VANTAGE_NTFY_TOKEN?.trim();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${base.replace(/\/+$/, '')}/${encodeURIComponent(topic)}`, {
    method: 'POST',
    signal: AbortSignal.timeout(15_000),
    headers,
    body: alert.body + locationLine(alert),
  });
  if (!res.ok) throw new Error(`ntfy ${res.status}`);
}

async function sendEmail(alert: Alert): Promise<void> {
  const host = process.env.VANTAGE_SMTP_HOST?.trim();
  const to = process.env.VANTAGE_SMTP_TO?.trim();
  if (!host || !to) throw new Error('VANTAGE_SMTP_HOST / VANTAGE_SMTP_TO not set');

  // Imported lazily so instances that never enable email don't pay for it.
  const nodemailer = (await import('nodemailer')).default;
  const transport = nodemailer.createTransport({
    host,
    connectionTimeout: 15_000, greetingTimeout: 15_000, socketTimeout: 15_000,
    port: Number(process.env.VANTAGE_SMTP_PORT || 587),
    secure: process.env.VANTAGE_SMTP_SECURE === 'true',
    ...(process.env.VANTAGE_SMTP_USER
      ? {
          auth: {
            user: process.env.VANTAGE_SMTP_USER,
            pass: process.env.VANTAGE_SMTP_PASS || '',
          },
        }
      : {}),
  });

  await transport.sendMail({
    from: process.env.VANTAGE_SMTP_FROM || `vantage@${host}`,
    to,
    subject: `[VANTAGE ${alert.severity}] ${alert.title}`,
    text: alert.body + locationLine(alert) + `\n\nDTG: ${alert.createdAt}`,
  });
}

async function sendWebhook(alert: Alert, overrideUrl?: string): Promise<void> {
  const url = (overrideUrl || process.env.VANTAGE_WEBHOOK_URL || '').trim();
  if (!url) throw new Error('no webhook URL configured for this rule');

  // The per-rule URL is operator input that the *server* dials, so it is an
  // SSRF vector: safeFetch resolves the host and refuses loopback, RFC1918,
  // link-local (cloud metadata) and other reserved ranges, on redirects too.
  const res = await safeFetch(url, {
    method: 'POST',
    signal: AbortSignal.timeout(15_000),
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'Vantage' },
    body: JSON.stringify(alert),
  });
  if (!res.ok) throw new Error(`webhook ${res.status}`);
}

/**
 * Fan the alert out to every requested channel. Never throws — each channel's
 * outcome is reported so the caller can persist a delivery record.
 */
export async function dispatchAlert(
  alert: Alert,
  channels: Channel[],
  opts: { webhookUrl?: string } = {}
): Promise<DispatchResult> {
  const results: Record<string, string> = {};

  await Promise.all(
    channels.map(async (channel) => {
      try {
        switch (channel) {
          case 'discord':
            await sendDiscord(alert);
            break;
          case 'ntfy':
            await sendNtfy(alert);
            break;
          case 'email':
            await sendEmail(alert);
            break;
          case 'webhook':
            await sendWebhook(alert, opts.webhookUrl);
            break;
          default:
            throw new Error(`unknown channel "${channel}"`);
        }
        results[channel] = 'ok';
      } catch (err) {
        results[channel] = err instanceof Error ? err.message : 'unknown error';
      }
    })
  );

  return { results };
}

/** Which channels have enough environment configuration to be usable. */
export function channelStatus(): Record<Channel, boolean> {
  return {
    discord: Boolean(process.env.VANTAGE_DISCORD_WEBHOOK),
    ntfy: Boolean(process.env.VANTAGE_NTFY_TOPIC),
    email: Boolean(process.env.VANTAGE_SMTP_HOST && process.env.VANTAGE_SMTP_TO),
    webhook: Boolean(process.env.VANTAGE_WEBHOOK_URL),
  };
}
