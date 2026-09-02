<div align="center">

# ⬡ VANTAGE

### Situational awareness from open sources, on your own hardware

[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=for-the-badge&logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://typescriptlang.org)
[![MapLibre](https://img.shields.io/badge/MapLibre_GL-GPU_Rendered-396CB2?style=for-the-badge)](https://maplibre.org)
[![License](https://img.shields.io/badge/License-MIT-D4AF37?style=for-the-badge)](LICENSE)

**A self-hosted intelligence dashboard that pulls live flight tracking, maritime traffic, CCTV networks, seismic activity, wildfires, conflict zones, cyber threats and 24/7 news into one GPU-accelerated map — then lets an AI analyst reason over it, alerts you when something you care about changes, and exports the result as a dossier.**

[Report Bug](https://github.com/d4vid87/vantage/issues) · [Request Feature](https://github.com/d4vid87/vantage/issues) · [Authorized Use](AUTHORIZED_USE.md)

</div>

---

## What Vantage is

Vantage is a fork of [`simplifaisoul/osiris`](https://github.com/simplifaisoul/osiris), rebuilt around three things the original does not do:

| | Osiris | Vantage |
|---|---|---|
| **AI brain** | Gemini, hardcoded | **Pluggable** — Ollama (local, default), Claude, or Gemini |
| **Analyst copilot** | — | **Chat grounded in the live map** — ask about what is on screen, get cited answers |
| **Alerts** | In-tab toasts only | **Persistent watchlists** → Discord, ntfy push, email, webhook, evaluated by a **server-side scheduler** (no browser needed) |
| **Investigations** | — | **Link-analysis graph** saved server-side, exported as Markdown / PDF dossiers |
| **State** | Stateless | **SQLite** — one file holds watchlists, alerts, investigations, audit trail |
| **Telemetry** | Hardcoded phone-home | **None by default**, opt-in to a server you control |
| **Auth** | None | **Optional single-password gate** on the UI and every sensitive route |
| **RECON toolkit** | On by default | **Off by default**, gated and fully audited |

Everything else — the 16 intelligence layers, ~70 API routes, WebGL rendering — comes from the upstream project and is carried forward intact.

---

## Intelligence layers

| Domain | Coverage | Sources |
|--------|----------|---------|
| **Aviation** | Commercial, private, military, jets | adsb.lol (keyless), OpenSky |
| **Maritime** | 39 ports, 10 chokepoints, AIS vessels | Static naval intel, aisstream.io |
| **CCTV** | 17,000+ public cameras | TfL, WSDOT, Caltrans, ODOT, MDOT, HK Transport, Taiwan THB, NZTA + more |
| **Seismic** | Real-time M2.5+ | USGS |
| **Fires** | Active hotspots | NASA FIRMS |
| **Weather** | Severe events | NASA EONET |
| **Air quality** | PM2.5 across 116 cities | Open-Meteo (keyless), OpenAQ |
| **Radiation** | Citizen-science dose readings | Safecast (CC0) |
| **Volcanoes** | Weekly activity report | Smithsonian GVP / USGS |
| **Disease** | Outbreak alerts by country | WHO Disease Outbreak News |
| **Power** | US outages by county | DOE / Oak Ridge ODIN |
| **Balloons** | Radiosondes in flight | SondeHub |
| **Space** | Solar weather, orbital objects | NOAA SWPC, Celestrak, N2YO |
| **News** | 33 RSS feeds across wire/regional/OSINT tiers, 25 live broadcasters, 4 Telegram channels | BBC, Al Jazeera, Reuters-class desks, Kyiv Independent, Bellingcat, ReliefWeb + more |
| **Cyber** | CVEs, malware, attack origins | NVD, CISA KEV, Cloudflare Radar |
| **Ransomware** | Victim claims by group and country | ransomware.live |
| **Tor** | Exit-node distribution | Onionoo |
| **Internet** | Macroscopic outages and shutdowns | IODA (keyless) + Cloudflare Radar |
| **GPS** | GNSS interference and jamming | gpsjam.org |
| **Advisories** | State Dept levels 1-4 choropleth | US Department of State |
| **Conflict** | 13 zones, Ukraine frontline control | DeepStateMap + live incident joins |
| **Conflict events** | Battles, protests, violence (optional key) | ACLED |
| **Prediction markets** | Geopolitical odds as early warning | Polymarket |
| **Crypto** | BTC / ETH / SOL tracing, OFAC screening | mempool.space, Blockscout, Solana RPC |
| **Sanctions** | Persons, orgs, vessels, aircraft | OpenSanctions (OFAC SDN mirror) |
| **Telegram** | Geoparsed public-channel posts | `t.me/s/<channel>` web preview |

Every layer is rendered through MapLibre GL on the GPU, loaded on demand, and clipped to the viewport.

---

## The differentiators

### 1. AI analyst copilot

A chat docked into the HUD that receives the **current layer data** with every turn, so answers cite real records instead of the model's priors. Ask *"what's the most significant development on screen?"* or *"correlate the seismic and news feeds"* and it works from what is actually loaded — and tells you which layer to enable when the data isn't there.

Replies **stream token by token**, and the copilot can propose **view actions** — toggle a layer, fly to a cited event, highlight an entity. Actions render as chips and only run when you click one; the model never drives the map on its own, and every proposed layer name is validated server-side against the real layer keys.

The brain is pluggable:

```env
VANTAGE_AI_PROVIDER=ollama   # local, private, free — the default
VANTAGE_AI_PROVIDER=claude   # best reasoning, needs ANTHROPIC_API_KEY
VANTAGE_AI_PROVIDER=gemini   # parity with upstream, needs GEMINI_API_KEY
```

Ollama is the default deliberately: the operational picture never leaves your machine. Every AI surface — copilot, briefings, correlation, dossier narrative — routes through the same adapter, and degrades to a clean `503` when its provider is unconfigured. Nothing else breaks.

### 2. Watchlists and alerts

Three kinds of watch, all persisted server-side so they keep firing whether or not a browser tab is open:

- **Geofence** — draw a polygon, get alerted when a new aircraft / vessel / quake / event enters it
- **Entity** — watch an ICAO24, MMSI, wallet address, Telegram channel or sanctioned name
- **Threshold** — *any M5+ quake*, optionally constrained to a bounding box

Rules are evaluated by an **in-process scheduler** (`instrumentation.ts`) that fetches the feeds itself every `VANTAGE_ALERT_INTERVAL_MS` — so alerts fire with no browser tab open, which is the entire point of persisting them server-side. Matching is **edge-triggered**: a record alerts once per rule, however often the evaluator runs. Delivery fans out to any combination of four channels, each failing independently — a dead Discord webhook never stops the email:

```env
VANTAGE_DISCORD_WEBHOOK=https://discord.com/api/webhooks/...
VANTAGE_NTFY_TOPIC=my-vantage-alerts
VANTAGE_SMTP_HOST=smtp.example.com
VANTAGE_WEBHOOK_URL=https://my-automation/inbox
```

Alerts are written to SQLite **before** dispatch, so a delivery outage costs you a notification, never the alert.

### 3. Investigations and dossiers

Seed a link-analysis graph from any entity, expand nodes against the intel layer, and save the whole thing as a named investigation. Then export it:

- **Markdown** — a structured dossier: BLUF, entity table, relationships, OFAC screening, analyst notes
- **PDF** — the same document as print-ready HTML; Ctrl+P → Save as PDF

Pass `assess: true` and the configured AI provider writes the BOTTOM LINE UP FRONT from the graph itself. Sanctioned entities are flagged in the table and called out in their own screening section.

---

## Quick start

```bash
git clone https://github.com/d4vid87/vantage.git
cd vantage
npm install
cp .env.example .env    # optional — Vantage runs without any keys
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

**Vantage works with zero API keys.** Aviation, maritime, satellites, fires, earthquakes, weather, news, CVEs and sanctions all use public keyless feeds. Keys only buy you higher rate limits, the AI features, and alert delivery.

### Docker / self-hosting

```bash
cp .env.example .env
docker compose up -d
```

Multi-stage `node:22-alpine` standalone build, non-root, with CasaOS metadata for one-click install. The `data/` volume holds the SQLite file — back that up and you have backed up Vantage. See [DOCKER.md](DOCKER.md).

### Local AI in one command

```bash
ollama serve
ollama pull llama3.1
# VANTAGE_AI_PROVIDER=ollama is already the default
```

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router, Turbopack) |
| Language | TypeScript 5 |
| Map engine | MapLibre GL JS (WebGL) |
| Graph | react-force-graph-2d |
| Store | SQLite (better-sqlite3, WAL) |
| AI | Ollama / Anthropic Messages API / Gemini |
| Alerts | Discord webhooks, ntfy, nodemailer, generic webhook |
| Auth | HMAC-signed session cookies (Web Crypto) |
| Tests | Vitest — 580 passing |

---

## Security posture

Vantage is built for **defensive** situational awareness and **authorized** security work.

- **Optional password gate.** Set `VANTAGE_AUTH_PASSWORD` and the UI plus every sensitive route (`/api/investigations`, `/api/alerts`, `/api/watchlist`, `/api/scanner`, `/api/recon-audit`, `/api/report`, `/api/ai`, `/api/osint`) require a session. Sessions are HMAC-signed cookies; rotating the password invalidates them all. Public feed routes stay open — they carry only upstream public data and the scheduler reads them over loopback. Put a reverse proxy in front to gate those too.
- **RECON is off by default.** Scanner routes return `503` until `VANTAGE_RECON_ENABLED=1`. Read [AUTHORIZED_USE.md](AUTHORIZED_USE.md) before you flip it.
- **Outbound webhooks are SSRF-guarded.** A watch rule's webhook URL is a target the *server* dials, so it is resolved against the same guard at both create time and dispatch time — internal, loopback and cloud-metadata addresses are refused.
- **Every scan is audited** — tool, target, actor IP, outcome, timestamp — readable at `GET /api/recon-audit`.
- **SSRF-guarded.** Loopback, RFC1918, CGNAT, link-local (including cloud metadata), multicast and reserved IPv6 are refused, and hostnames are resolved before the decision so a DNS record pointing at a reserved range is blocked too.
- **No telemetry.** Vantage makes no outbound analytics call unless you set `VANTAGE_ANALYTICS_URL` to a server you control.
- **Dangerous scan types are absent** — no 65k-port sweeps, banner grabbing, or traceroute.

Vantage assumes a single trusted operator and has no multi-user model. Before exposing it, set `VANTAGE_AUTH_PASSWORD` and `VANTAGE_TICK_SECRET`.

---

## Scheduled intelligence brief

Set a time and Vantage writes itself a daily read-out of the live picture and
pushes it to your alert channels — no tab open, no cloud round-trip:

```bash
VANTAGE_DAILY_BRIEF=07:00     # local time; unset disables it
```

The brief is written by whichever `VANTAGE_AI_PROVIDER` is configured, so with
the default Ollama the operational picture never leaves the machine. Past briefs
are stored in SQLite and readable from the BRIEFS panel, or `GET /api/briefs`.

---

## Instability index

A country score built from an editorial baseline plus five live signals — travel
advisories, internet disruption, ransomware claims, conflict reporting and
seismicity. Every component is returned with the score, and any source that
failed to load is named rather than silently counted as zero, because a single
opaque number is not an assessment.

Rendered as a choropleth and a ranked panel, and fed to the daily brief.

---

## Operations at a glance

Running an always-on box means knowing when it degrades:

- **Feed health panel** — every upstream fetch reports its status; a source
  that dies shows as a red row (with *failing since* and whether a stale cached
  copy is still being served) instead of a quietly empty map layer.
- **Anomaly detection** — each layer's count is baselined over a trailing 24h;
  a doubling that moves ≥10 items fires an `ELEVATED` alert through the normal
  channels, once per layer per 6h. Works with zero watch rules configured;
  `VANTAGE_ANOMALY=off` disables.
- **What changed** — each scheduled brief ends with a deterministic
  *Changes since last brief* section: new outbreaks, new ransomware victims,
  layer counts that moved ±25%.
- **Browser notifications** — the zero-config channel. Grant permission once
  and fired alerts pop as system notifications while a tab is open, no
  Discord/ntfy setup needed.
- **Saved views** — bookmark a layer set + camera ("Ukraine watch", "cyber
  overview") and return to it in one click.
- **Command palette** — `Ctrl+K` jumps to any country or city, toggles layers
  and opens panels from the keyboard. All matching is local.
- **Retention & backup** — machine-generated history is pruned daily
  (`VANTAGE_RETENTION_DAYS`, default 90; audit trail keeps 180); a consistent
  SQLite snapshot downloads from the feed-health panel. Restore = stop the
  server, replace `vantage.db` in `VANTAGE_DATA_DIR`, start again.
- **Update badge** — the HUD shows when `main` carries a newer version.
  `VANTAGE_UPDATE_CHECK=off` silences the once-daily check.

### Self-hosted basemap

By default the basemap comes from CARTO's CDN (proxied server-side). To keep
map pans entirely off third-party CDNs, self-host a
[Protomaps](https://protomaps.com/) basemap — one `.pmtiles` file — and point
the build at your style JSON:

```env
NEXT_PUBLIC_VANTAGE_BASEMAP_STYLE=https://your-host/style.json
```

The `pmtiles://` protocol is registered, so the style can reference the
archive directly. This is a build-time variable.

## MCP server

Point an AI agent at your own instance instead of somebody's cloud:

```bash
claude mcp add --transport http vantage http://localhost:3000/api/mcp \
  --header "Authorization: Bearer $VANTAGE_AUTH_PASSWORD"
```

Nine tools: `list_layers`, `get_layer_data`, `search_news`, `get_country_risk`,
`get_alerts`, `list_watch_rules`, `get_investigations`, `get_briefs`, and
`create_watch_rule`. Everything but the last is read-only; `create_watch_rule`
writes and validates its webhook target through the same SSRF guard as the HTTP
route. With `VANTAGE_AUTH_PASSWORD` set, that password is the bearer token and
the endpoint answers `401` rather than redirecting — a programmatic client
cannot follow a login page.

---

## API

Every route is documented in-app at **`/docs`** — a searchable catalog with parameters, response keys, required environment variables and failure modes, generated from [`src/app/docs/apiCatalog.ts`](src/app/docs/apiCatalog.ts).

---

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| `F` | Toggle flight layers |
| `E` | Toggle earthquakes |
| `S` | Toggle satellites |
| `D` | Toggle day/night cycle |
| `Escape` | Close panels |

---

## Credits

Vantage is a fork of [**OSIRIS**](https://github.com/simplifaisoul/osiris) by [simplifaisoul](https://github.com/simplifaisoul) — the intelligence layers, map rendering and API surface are their work, carried forward under MIT.

## License

MIT — see [LICENSE](LICENSE).
