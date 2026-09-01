# Self-Hosting VANTAGE with Docker

VANTAGE ships as a self-contained Next.js standalone build. This guide covers
running it with Docker / Docker Compose, deploying it as a [CasaOS](https://casaos.io)
app, and configuring the optional API keys.

> **TL;DR:** VANTAGE runs fully **without any API keys**. All core feeds
> (aviation, satellites, fires, earthquakes, weather, news, CVEs) use public
> keyless sources. Keys only matter for the optional RECON scanner backend and
> for raising rate limits on a few feeds.

---

## 1. Docker Compose (recommended)

```bash
git clone https://github.com/d4vid87/vantage.git
cd vantage

# optional: configure keys / scanner backend
cp .env.template .env        # then edit .env

docker compose up -d
```

Open <http://localhost:3000>.

What the compose file does:

- **`build:`** — compose builds the image locally from the `Dockerfile`, so
  you always run the code you just cloned. To run the prebuilt registry image
  instead, add `image: ghcr.io/d4vid87/vantage:latest` to the `vantage`
  service and drop the `build:` block.
- **`env_file: .env` (`required: false`)** — if a `.env` file exists its
  values are injected into the container; if it's missing, VANTAGE still starts
  with the keyless feeds.
- **`ports: ${VANTAGE_PORT:-3000}:3000`** — the web UI. The container always
  listens on 3000; the published **host** port is `VANTAGE_PORT` (default
  `3000`). Set `VANTAGE_PORT` in `.env` to remap it, e.g. `VANTAGE_PORT=3005`
  when 3000 is already in use — no need to edit the compose file.
- **`restart: unless-stopped`** — survives reboots.

Common commands:

```bash
docker compose logs -f          # follow logs
docker compose up -d --build    # rebuild locally after pulling new code
docker compose down             # stop & remove
```

### Pull the prebuilt image from GHCR

A prebuilt image for `linux/amd64` and `linux/arm64` is published to the GitHub
Container Registry on every push to `master` and every `v*.*.*` tag, so you can
run VANTAGE without building anything:

```bash
docker pull ghcr.io/d4vid87/vantage:latest   # or a pinned tag, e.g. :0.1.0
docker run -d --name vantage \
  -p 3005:3000 --env-file .env --restart unless-stopped \
  ghcr.io/d4vid87/vantage:latest
```

The package is public — no `docker login` is required to pull it.

### Plain `docker run`

```bash
docker build -t vantage:latest .
docker run -d --name vantage -p 3000:3000 --env-file .env --restart unless-stopped vantage:latest
```

### Image details

Multi-stage build on `node:22-alpine`, runs as a non-root user (`nextjs`,
uid 1001), serves Next.js standalone via `node server.js` on port 3000.
Final image is ~220 MB. Build excludes `node_modules`, `.next`, `.git` and the
repo's large `*.diff` artifacts via `.dockerignore`.

---

## 2. CasaOS

The compose file includes an `x-casaos:` metadata block (title, description,
icon, port map, env descriptions) that plain Docker Compose ignores but CasaOS
reads.

**Install:**

1. On the CasaOS host, clone the repo somewhere persistent (e.g.
   `/DATA/AppData/vantage`).
2. CasaOS dashboard → **`+`** → **Install a customized app** → paste the
   contents of `docker-compose.yml`.
   *(or simply run `docker compose up -d` from the cloned directory).*
3. VANTAGE appears on the dashboard with its icon, reachable on host port
   `3000` (or whatever `VANTAGE_PORT` you set in `.env`).

The app icon is the gold Eye-of-Horus mark in
`public/casaos-icon.png` (512×512 PNG), referenced by the `icon:` URL in the
metadata.

> CasaOS stores imported compose files under `/var/lib/casaos/apps/`, so a
> relative `build:` context may not resolve there. If importing the YAML
> directly, either build/tag `vantage:latest` first
> (`docker build -t vantage:latest /path/to/vantage`) or replace the `build:`
> block with `image: ghcr.io/d4vid87/vantage:latest`.

---

## 3. API keys & data sources

Copy `.env.template` to `.env` and fill in only what you need.

### What the code actually reads today

| Variable | Purpose | Required for |
|----------|---------|--------------|
| `SCANNER_URL` | RECON scanner backend base URL (e.g. `http://scanner:7700`) | RECON toolkit (quick/ssl/headers/rdns/subdomains/tech/whois/geoloc/vuln) |
| `SCANNER_KEY` | Shared secret; **must equal the backend's `VANTAGE_KEY`** | RECON toolkit |

Without `SCANNER_URL`/`SCANNER_KEY` the RECON endpoints return `503` and the
rest of VANTAGE works normally. Generate a key with `openssl rand -hex 32`.

### Optional keys (reserved / for higher rate limits)

These are documented for completeness and forward-compatibility. The current
data routes use **keyless** public feeds, so these are not consumed yet — set
them only if you extend the relevant route or hit rate limits.

| Variable | Service | How to get it (all free) |
|----------|---------|--------------------------|
| `FIRMS_API_KEY` | NASA FIRMS active fires | Enter an email at <https://firms.modaps.eosdis.nasa.gov/api/map_key/> — the `MAP_KEY` is emailed instantly. Limit 5000 req / 10 min. |
| `OPENSKY_CLIENT_ID` / `OPENSKY_CLIENT_SECRET` | OpenSky aviation | Create an account at <https://opensky-network.org/>, open **Account → API client**, create a client and copy id/secret. **OAuth2 only since March 2025** (username/password auth removed). |
| `N2YO_API_KEY` | N2YO satellites | Register at <https://www.n2yo.com/login/register/>, then **Profile → generate API key**. Limit 1000 req / hour; key can't be regenerated. |
| `AIS_API_KEY` | aisstream.io maritime | Sign up at <https://aisstream.io/>, create a key on the **API Keys** page. Used over `wss://stream.aisstream.io/v0/stream`. |

> Keep `.env` out of version control — it is already in `.gitignore`. Only
> `.env.template` (no secrets) is committed.

### Optional runtime overrides

| Variable | Purpose | Default |
|----------|---------|---------|
| `VANTAGE_TELEGRAM_CHANNELS` | Comma-separated list of public Telegram channel usernames (no `@`) to scrape for the **Telegram OSINT** map layer. Overrides the curated default set. | `osintdefender,insiderpaper,aljazeeraenglish,nexta_live,war_monitor` |
| `VANTAGE_PORT` | Host port the compose file publishes (container itself always listens on 3000). | `3000` |

### Keyless sources (no configuration needed)

Aviation → `adsb.lol` · Satellites → `celestrak.org` (TLE) · Fires →
NASA FIRMS open-data CSV · Earthquakes → USGS · Weather → NASA EONET · Space
weather → NOAA SWPC · CVEs → NVD · News → public RSS / HLS streams · CCTV →
public traffic-authority feeds · Crypto (BTC) → `blockstream.info` · Crypto
(ETH) → `eth.blockscout.com` ([Blockscout](https://github.com/blockscout/blockscout)
open-source explorer) · OFAC SDN sanctions → [OpenSanctions](https://www.opensanctions.org)
mirror (CC-BY 4.0) · Telegram OSINT → public `t.me/s/<channel>` web preview.


---

## Vantage additions

### Persistent data

Watchlists, fired alerts, saved investigations and the RECON audit trail live
in a single SQLite file. In Docker it sits on the `vantage-data` volume at
`/data/vantage.db`.

```bash
# Back up
docker run --rm -v vantage_vantage-data:/data -v "$PWD:/out" alpine \
  cp /data/vantage.db /out/vantage-backup.db
```

Outside Docker, set `VANTAGE_DATA_DIR` (defaults to `./data`).

### AI provider

Vantage defaults to a local Ollama brain, so nothing leaves the machine.

```bash
# On the host
ollama serve
ollama pull llama3.1
```

From inside the container, reach it through the gateway alias the compose file
already sets up:

```env
VANTAGE_AI_PROVIDER=ollama
OLLAMA_URL=http://host.docker.internal:11434
OLLAMA_MODEL=llama3.1
```

Hosted alternatives:

```env
VANTAGE_AI_PROVIDER=claude
ANTHROPIC_API_KEY=sk-ant-...      # https://console.anthropic.com/settings/keys

VANTAGE_AI_PROVIDER=gemini
GEMINI_API_KEY=...                 # https://aistudio.google.com/apikey
```

Check what the running instance sees:

```bash
curl -s localhost:3000/api/ai/chat | jq
# { "selected": "ollama", "configured": { "ollama": true, "claude": false, "gemini": false } }
```

An unconfigured provider returns `503` with code `NO_AI_PROVIDER`. Every other
layer keeps working.

### Alert delivery

Configure only the channels you want; each watch rule picks its own subset.

| Channel | Variables | Where to get it |
|---|---|---|
| Discord | `VANTAGE_DISCORD_WEBHOOK` | Server Settings → Integrations → Webhooks |
| ntfy | `VANTAGE_NTFY_URL`, `VANTAGE_NTFY_TOPIC`, `VANTAGE_NTFY_TOKEN` | ntfy.sh or self-hosted |
| Email | `VANTAGE_SMTP_HOST`, `_PORT`, `_SECURE`, `_USER`, `_PASS`, `_FROM`, `_TO` | your mail provider |
| Webhook | `VANTAGE_WEBHOOK_URL`, or a per-rule URL in the UI | your own endpoint |

Which channels are ready:

```bash
curl -s localhost:3000/api/watchlist | jq .channels
```

If the instance is reachable from outside your network, set
`VANTAGE_TICK_SECRET` and send it as `x-vantage-tick-key` on
`POST /api/alerts/tick` — otherwise anyone who can reach the port can drive
your evaluator.

### RECON toolkit

Off by default. Read [AUTHORIZED_USE.md](AUTHORIZED_USE.md), then:

```env
VANTAGE_RECON_ENABLED=1
SCANNER_URL=http://scanner:7700
SCANNER_KEY=<openssl rand -hex 32>
```

Every attempt, permitted or blocked, is recorded:

```bash
curl -s localhost:3000/api/recon-audit | jq
```

### Telemetry

There is none. Vantage makes no outbound analytics call unless you point
`VANTAGE_ANALYTICS_URL` at an ingest endpoint you control.
