# Feed verification ledger

Updated 2026-09-16. This inventory covers network sources referenced by API routes, dashboard helpers, browser components, scheduled alerts, briefs, map styles, and streaming clients. “Fixture” means the parser and contract are covered without relying on the network. “Live” means an opt-in check contacted the provider during this verification pass. A successful response proves reachability and shape, not the correctness of every upstream observation.

The 2026-09-16 live pass completed 833 tests. It reached Hong Kong TD, Utah UDOT, Oregon ODOT (1,130 cameras), New Zealand NZTA (253), Michigan MDOT (806), Skyline/YouTube resolution, URLhaus conditional downloads, and Feodo Tracker (5 current source records). Other providers are classified below from deterministic contracts or left explicitly unverified when credentials were absent.

## Operational feeds

| Domain | Provider / consumer | Credentials | Refresh | Time, units, coverage and transformation | Evidence / status |
|---|---|---:|---:|---|---|
| Aviation | adsb.lol and OpenSky → flights, aircraft detail, alerts, briefs | OpenSky optional | 5 min | Provider observation time; WGS84 degrees, altitude normalized by route; global but provider sampling varies | Parser fixtures; live availability checked through app route |
| Maritime | AISStream plus static ports/chokepoints → map and alerts | AISStream key for live vessels | 10 sec | AIS observation time; WGS84; global reception is incomplete | Static references verified; credentialed stream unverified when key absent |
| Earthquakes | USGS GeoJSON → map, alerts, briefs, AI | None | 15 min | Provider event time; coordinates converted GeoJSON `[lng,lat]`; magnitude preserved | Fixtures and route live check |
| Fires | NASA FIRMS → map and briefs | FIRMS key may be required | 15 min | Acquisition time; WGS84; brightness is provider value | Missing key is reported as unverified; no synthetic hotspots |
| Severe weather | NASA EONET, NWS, GDACS → map and Weather | None | 15 min | Provider event/issue time; NWS units retained and forecast model units labeled | Deterministic fixtures; US coverage for NWS, global for EONET/GDACS |
| Personal weather | Open-Meteo, NWS, NHC, RainViewer → Weather and globe overlays | None | 5–60 min | Observation/model time separated from retrieval; requested unit system retained | Fixtures and live checks where reachable |
| Air quality | Open-Meteo and optional OpenAQ → map | OpenAQ optional | 30 min | Current provider time; PM2.5 µg/m³ and US AQI remain distinct fields; configured cities | Parser fixtures; optional OpenAQ unverified without key |
| Radiation | Safecast → map | None | 5 min | Provider observation time; dose values remain in provider units | Parser fixtures; worldwide citizen sensor coverage is uneven |
| Volcanoes | Smithsonian/USGS reports → map | None | 60 min | Report publication time; static volcano coordinates plus report status | Parser fixtures |
| Disease | WHO Disease Outbreak News → map | None | 60 min | Publication time; country geocoding is approximate and labeled by source record | Parser fixtures |
| Power | ORNL/DOE ODIN → map | None | 5 min | Provider update time; customer/outage counts; United States only | Parser fixtures |
| Balloons | SondeHub → map | None | 5 min | Telemetry time; WGS84 and provider altitude | Parser fixtures |
| Satellites | CelesTrak/Space-Track/N2YO-related catalog data → map | Provider-dependent | 5 min | TLE epoch is observation basis; positions are calculated estimates at render time | Orbit tests; emergency fallback is labeled, not current telemetry |
| Space weather | NOAA SWPC → status and Markets | None | 15 min | Provider issue/observation times and native scales | Route contract covered by suite |
| News | Configured RSS publishers, ReliefWeb and live broadcaster links → news, briefs, AI | None | 30–60 min | Publisher publication time; duplicates normalized by canonical URL/title | Feed parser fixtures; individual publishers may throttle or retire feeds |
| GDELT | GDELT event exports/API → incidents and alerts | None | 5 min | Provider event date; WGS84; global media-derived coverage | Parser/route handling covered; HTTP source availability checked at runtime |
| ACLED | ACLED API → conflict events | Required | 15 min | Event date; WGS84; coverage follows account permissions | Explicitly unverified without configured credentials |
| Frontlines | DeepStateMap-derived source → conflict overlay | None | 15 min | Source snapshot time; polygon geometry preserved | Parser fixtures; attribution shown |
| Advisories | US State Department → country choropleth | None | 6 hr | Provider publication time; level 1–4 | Parser fixtures |
| GPS interference | gpsjam.org daily H3 files → map | None | 60 min | Dataset date; H3 cells, not point observations | Fixtures; date fallback is reported |
| Internet | IODA and optional Cloudflare Radar → map | Cloudflare optional | 5 min | Provider event windows; overlapping reports deduplicated, never summed as observations | Merge tests; Cloudflare unverified without token |
| C2 indicators | abuse.ch Feodo Tracker → map | None | 60 sec | `last_online`/`first_seen`; IP/port/malware preserved; country centroid is explicitly approximate | Fixture added; live route checked. No attack path, origin, action, severity, jitter, or cloned rows |
| Malware | abuse.ch URLhaus plus ip-api geolocation → SSE map | None | Stream/poll | URLhaus observation time; IP geolocation is approximate | Extensive fixtures; live network remains opt-in |
| CVEs | NVD and CISA KEV → cyber views and briefs | NVD optional | Provider-specific | Publication/update time; CVSS and KEV state kept distinct | Fixtures; throttling shown as unavailable/stale |
| Ransomware | ransomware.live → map | None | 15 min | Claim publication time; claims are allegations, not confirmed incidents | Parser fixtures and explicit terminology |
| Tor | Onionoo → country distribution | None | 60 min | Provider consensus/update time; country aggregates | Parser fixtures |
| Sanctions | OpenSanctions OFAC mirror → search/OSINT | None | Dataset cadence | Dataset snapshot; entities are source records, not findings | Parser path inventoried; download availability checked at runtime |
| Markets | Yahoo chart endpoint and optional Finnhub → Finance/Markets | Finnhub required for company extras | 15 min | Exchange timestamps/currencies; session change uses previous close; no invented quotes | 16 route tests; unavailable instruments are omitted/labeled |
| Prediction markets | Polymarket → early-warning cards | None | Route cadence | Market update time; probabilities are market prices, not forecasts by Vantage | Parser fixtures |
| Crypto | mempool.space, Blockscout, Solana RPC, CoinGecko, DefiLlama → chain tools | None/provider limits | On demand | Chain time, native units and USD conversions labeled | Deterministic parsing tests; provider rate limits remain operational constraints |
| CCTV | TfL, US state 511 systems, NZTA, HK TD, ASFINAG, Skyline/EarthCam/YouTube and curated catalogs → map/viewer | Mostly none | Catalog 30 min | Catalog coordinates and provider update time where supplied; camera presence does not imply playable video | Catalog parser tests plus opt-in HK/NZ/UT/MI/OR live checks; viewer reports external-only/unplayable media |
| Geocoding/routing | Nominatim, Open-Meteo geocoder, configured routing providers → search/directions | Provider-dependent | On demand | WGS84 and provider labels; routes are calculated estimates | Route/search fixtures; browser geolocation remains device-dependent |
| Map assets | CARTO/OpenFreeMap, ArcGIS imagery, PMTiles/static GeoJSON → base maps/overlays | None | Tile/cache policy | Tiles and static references, not observations | Browser smoke check; attribution retained |

## Application-only integrations

AI providers (Ollama, Anthropic, Gemini), notifications (Discord, ntfy, SMTP, webhook), ArcGIS imports, update checks, optional analytics, and MCP are integrations rather than situational feeds. Diagnostics report each as ready, unconfigured, or unavailable. Missing credentials never produce substitute data. Local Ollama and loopback services remain private-network exceptions controlled by their own configuration.

## Integrity rules

- `observed_at` or a provider timestamp describes the event. `retrieved_at` describes Vantage’s fetch. If the provider supplies neither, the UI says “observation time unavailable.”
- `availability=current|stale|unavailable` describes delivery state. A failed refresh may serve the last good payload only as `stale`.
- Catalog caches treat unexpected empty responses as failures. Event caches may opt into valid-empty semantics so resolved events disappear.
- Static locations, country centroids, geocoding, orbital propagation and forecasts are labeled reference or calculated data. They are excluded from claims of direct observation.
- Credentialed sources without keys and sources unreachable during the live pass remain **unverified**, with the blocker shown in setup diagnostics.

## Verification commands

```bash
npm test
npm run test:live
npx tsc --noEmit
npm run lint
npm run build
```

Live checks are opt-in and must tolerate provider unavailability without changing deterministic test results. Notification tests use mocks and isolated temporary databases; they do not contact configured delivery targets.
