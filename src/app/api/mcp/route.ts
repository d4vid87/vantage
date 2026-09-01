import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';
import { authEnabled, checkPassword } from '@/lib/auth';
import {
  listLayers, getLayerData, searchNews, getCountryRisk, createWatchRule, readTools, MAX_RECORDS,
} from '@/lib/mcp-tools';

/**
 * VANTAGE — MCP server.
 *
 * Exposes this instance's live picture to an agent over streamable HTTP, so
 * Claude Code can query your own feeds, alerts and investigations rather than
 * a vendor's cloud.
 *
 * Auth: when VANTAGE_AUTH_PASSWORD is set, a bearer token is required and
 * checked here rather than in middleware — a programmatic client must get a 401,
 * never a redirect to a login page. With no password set the endpoint is open,
 * matching the LAN posture of the rest of the app.
 */

export const dynamic = 'force-dynamic';

const json = (v: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(v, null, 2) }] });
const fail = (e: unknown) => ({
  content: [{ type: 'text' as const, text: `Error: ${e instanceof Error ? e.message : String(e)}` }],
  isError: true,
});

function buildServer(): McpServer {
  const server = new McpServer(
    { name: 'vantage', version: '3.0.0' },
    { capabilities: { tools: {} } },
  );

  server.tool('list_layers', 'List every intelligence layer this Vantage instance can serve.',
    {}, async () => json(listLayers()));

  server.tool('get_layer_data', 'Fetch current records for one intelligence layer.',
    { layer: z.string().describe('Layer key, e.g. earthquakes, ransomware, disease'),
      limit: z.number().int().min(1).max(MAX_RECORDS).optional() },
    async ({ layer, limit }) => {
      try { return json(await getLayerData(layer, limit)); } catch (e) { return fail(e); }
    });

  server.tool('search_news', 'Search the aggregated OSINT news feed.',
    { query: z.string().describe('Substring matched against headline and summary'),
      limit: z.number().int().min(1).max(MAX_RECORDS).optional() },
    async ({ query, limit }) => {
      try { return json(await searchNews(query, limit)); } catch (e) { return fail(e); }
    });

  server.tool('get_country_risk', 'Instability index with its component breakdown.',
    { country: z.string().length(2).optional().describe('ISO 3166-1 alpha-2; omit for the ranked list') },
    async ({ country }) => {
      try { return json(await getCountryRisk(country)); } catch (e) { return fail(e); }
    });

  server.tool('get_alerts', 'Alerts the watchlist evaluator has fired.',
    { limit: z.number().int().min(1).max(MAX_RECORDS).optional() },
    async ({ limit }) => {
      try { return json(readTools.listAlerts(limit ?? 25)); } catch (e) { return fail(e); }
    });

  server.tool('list_watch_rules', 'Configured watchlist rules.',
    {}, async () => { try { return json(readTools.listRules()); } catch (e) { return fail(e); } });

  server.tool('get_investigations', 'Saved link-analysis investigations.',
    {}, async () => { try { return json(readTools.listInvestigations()); } catch (e) { return fail(e); } });

  server.tool('get_briefs', 'Stored AI intelligence briefs, newest first.',
    { limit: z.number().int().min(1).max(20).optional() },
    async ({ limit }) => { try { return json(readTools.listBriefs(limit ?? 5)); } catch (e) { return fail(e); } });

  server.tool('create_watch_rule',
    'Create a watchlist rule. This writes to the instance and can send outbound notifications — confirm with the operator before calling.',
    {
      name: z.string(),
      kind: z.enum(['aoi', 'entity', 'threshold']),
      spec: z.record(z.string(), z.unknown()).describe('Rule body: geometry for aoi, match for entity, field/op/value for threshold'),
      channels: z.array(z.enum(['discord', 'ntfy', 'email', 'webhook'])).default([]),
      webhookUrl: z.string().optional(),
    },
    { destructiveHint: false, readOnlyHint: false, openWorldHint: true },
    async (args) => {
      try { return json(await createWatchRule(args as never)); } catch (e) { return fail(e); }
    });

  return server;
}

async function authorized(req: Request): Promise<boolean> {
  if (!authEnabled()) return true;
  const header = req.headers.get('authorization') ?? '';
  const token = header.replace(/^Bearer\s+/i, '').trim();
  if (!token) return false;
  return checkPassword(token);
}

async function handle(req: Request): Promise<Response> {
  if (!(await authorized(req))) {
    return new Response(JSON.stringify({ error: 'Unauthorized — send Authorization: Bearer <VANTAGE_AUTH_PASSWORD>' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', 'WWW-Authenticate': 'Bearer' },
    });
  }

  // Stateless: a fresh server and transport per request, so no session state is
  // held between calls and concurrent clients cannot collide.
  const server = buildServer();
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);
  const res = await transport.handleRequest(req);
  res.headers.set('Cache-Control', 'no-store');
  return res;
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
