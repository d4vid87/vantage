import { validateHost } from '../ssrf-guard';
import { validateRule } from './validation';

export async function validateWatchInput(value: unknown) {
  const input = validateRule(value);
  if (input.webhookUrl) {
    const check = await validateHost(new URL(input.webhookUrl).hostname);
    if (!check.ok) throw new Error(`Webhook target is not allowed: ${check.reason}`);
  }
  return input;
}
