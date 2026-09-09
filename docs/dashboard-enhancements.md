# Finance, weather, and globe controls

The existing MapLibre 3D Earth, 2D switch, terrain, feeds, investigations, and tools remain in place. The top ticker and collapsible Stocks, Weather, and Globe controls add a personal dashboard. Setup stores preferences in the existing SQLite volume, shared across devices. Concurrent saves use a revision check; reload after a conflict rather than overwrite someone else's changes.

## Setup

1. Open **Stocks → Setup**. Add US stock/ETF symbols directly or use search. The watchlist and armed market rules together support 20 distinct symbols.
2. Set `FINNHUB_API_KEY` in the server environment and restart for quotes, news, company metrics, and earnings. No browser-visible credential is used. An absent key, unsupported field, unavailable endpoint, and delayed/stale data remain explicit. Free account endpoint entitlements must be checked with your key.
3. Add up to 10 weather places by city search or save the globe center with an IANA timezone. Choose Fahrenheit/mph or Celsius/km/h.
4. Enable only the weather overlays you want. The original Severe Weather layer still contains global major events.

The broader existing Markets panel and chart history remain available. Personal quotes refresh approximately once a minute while visible; the server's shared caches and a conservative 40-request/minute Finnhub budget avoid multiplying calls across tabs. Quote timestamps and regular-session state are separate from request time. Polling is not a promise of real-time exchange data. Company fields that the provider does not supply are unavailable, not zero; ETF company-earnings fields are not synthesized.

## Alerts

Create a price or percentage-change alert in Finance. It fires on the first fresh regular-session quote satisfying the condition, including one already past it. It then disables itself atomically with the stored alert. Use **Rearm** to enable another notification. Stale, missing, closed-session, or invalid quotes cannot trigger it.

Weather creates a watch for a saved place or an existing drawn polygon. Defaults are official warnings and watches; advisories remain visible. NWS point matching can cover alerts without published polygons. Area watches resolve affected-zone geometry; unresolved geometry never counts as a match. Expired warnings leave the active map; a successful national refresh marks prior inbox events as expired or no longer active. Failed refreshes do not clear alerts.

Every alert uses the existing inbox, acknowledgement, snooze, and delivery machinery. Use the existing Watchlists panel to edit criteria, configure channels, preview matches, or explicitly send a test. Browser notifications retain their existing opt-in controls. The default server scheduler interval is now 60 seconds; `VANTAGE_ALERT_INTERVAL_MS` still overrides it, with a 60-second minimum for finance/weather, and `VANTAGE_SCHEDULER=off` disables it. Server monitoring continues while the browser is closed or viewing historical data.

## Globe controls

- Built-in Severe Weather, Aviation, Markets, and All Intelligence presets; custom presets preserve camera, projection, layers, styles, and order.
- The existing Saved Views panel reads old browser-local views and saves shared presets. Old exports without style/projection fields remain valid. Dashboard exports include shared preferences; no API keys are included.
- Opacity and label density apply to supported native overlay groups. Higher stack order moves a group above lower groups while keeping interaction layers accessible. Custom satellite rendering and base-map layers retain their native controls.
- Native clustering covers static earthquakes, cameras, and infrastructure at wide zoom. Moving tracked entities remain separate. Click clusters to expand them. Full source data remains available to server-side rules.
- Financial geography supports adding, editing, and removing sourced locations and contains a small, sourced exchange catalog and optional operator-added facilities. Default pins are approximate street locations, not trading-system locations. Every facility needs a source and verification date. Matching warnings are geographic overlap, not asserted business or price impacts.

## Weather sources and time

NWS provides US observations, forecasts, and official alerts. Open-Meteo supplies a labeled model fallback and forecast grids. NHC provides current track/cone/past-track geometry for its covered basins. The hurricane cone represents track uncertainty rather than the footprint of all hazards.

RainViewer provides past radar. Native detail is capped at zoom 7; higher map zoom does not create more detail. Tiles pass through a bounded shared cache with an 80-new-tile/minute budget; playback pauses on tile failure. Blank tiles may mean unavailable coverage, not clear weather. Attribution remains visible.

Wind arrows and temperature/rainfall cells are a coarse **2° sampled forecast grid**, not a high-resolution weather simulation. Load a region explicitly around the globe center. One region per installation per hour and at most 64 sample points limit free API usage. The actual loaded center, units, source status, and feature valid times are shown. Grid values use °C, km/h, and mm/hour independent of place display units.

**Recorded** mode displays available radar history and hides live-only feeds. **Forecast** mode displays forecast overlays and their valid times; the hours-ahead slider controls the sampled grid. NHC tracks retain their own advisory times. **Return to live** restores the current layer selection. Neither mode invents historical aircraft, vessel, or satellite positions.

## API additions

All new endpoints respect the existing optional password gate. Existing public feeds retain their existing behavior.

- `GET/PUT /api/dashboard/settings`: versioned settings with optimistic `revision`; stale writes return 409, validation failures 400. Imports have a 200 KB limit.
- `GET /api/finance`: configured watchlist quotes. `action=search&q=…`, `action=company&symbol=…`, and `action=news[&symbol=…]` provide related data.
- `GET /api/weather/details`: official alerts; optional saved `place` ID and `geometry=1` to resolve its affected zones. Actions `forecast&place=…`, `search&q=…`, `radar`, `hurricanes`, and `grid&lat=…&lng=…` provide weather data.
- `GET /api/weather/radar/{time}/{z}/{x}/{y}`: validated, cached tiles for available radar frames; unavailable/budget-limited tiles return errors rather than fabricated imagery.
- Existing HTTP and MCP watch creation now accept `market` (`symbol`, `field: price|changePercent`, `comparator: above|below`, `threshold`) and `weather` (`place` or closed `ring`, `events`) alongside existing kinds. The same validation/evaluator serves both interfaces.

New feed envelopes include data, provider, sourceTime (when supplied), receivedAt, status, and error. Status is ready, stale, unavailable, or unconfigured. No new database engine or application dependency was added. The cache and scheduler remain single-process designs; multi-replica deployments need shared budgets/leadership.

Sources: [Finnhub](https://finnhub.io/docs/api), [NWS](https://www.weather.gov/documentation/services-web-api), [Open-Meteo](https://open-meteo.com/en/docs), [RainViewer transition limits](https://www.rainviewer.com/api/transition-faq.html), [NHC GIS](https://www.nhc.noaa.gov/gis/).

## Verification and remaining provider setup

The implementation preserves the existing data volume and uses no schema replacement. Automated tests use temporary SQLite databases and mocked delivery. Production builds and desktop/mobile browser checks cover the new panels, globe projection, layer styling, return to live, and radar initialization. The initial empty-raster-source browser error was fixed by creating the raster source only after valid metadata supplies a tile URL.

Read-only live checks returned NWS warnings, RainViewer past frames, NHC geometry, and a 64-point Open-Meteo forecast grid. Finnhub is not configured on the development installation: live free-account quote, news, and financial endpoint entitlements still require your server key. No credentials were exported and no external alert was sent.

A headless Chromium stress check with 10,000 synthetic static points completed without browser errors. Across two alternating passes, p95 frame times were 66.7/83.4 ms without clustering and 83.4/66.7 ms with clustering. This is a variable software-rendered environment, not proof of a speed gain or the plan's ordinary-interaction regression target. Native clustering improves inspectability; benchmark on the deployment GPU before making performance claims. Existing low-power behavior remains available, and new ticker/radar animation pauses in low power or reduced motion.

## Streamlined workspace

The desktop layer library replaces hover flyouts with searchable, clickable controls, an enabled-only filter, and per-group actions. Enabling a child overlay also enables its parent. Conflict Zones and SDK link overlays have explicit controls; conflict markers no longer bypass the layer selection or history mode.

The Workspace dock shows common actions first; **More** exposes every existing tool with a visible label. Opening a personal dashboard closes competing workspace panels, and opening a workspace tool closes that dashboard. **Overview** and the R shortcut return to a whole-Earth view without changing selected layers. Browser modifier shortcuts and editable text no longer trigger map shortcuts. Feed request failures are visible above retained data, with a refresh action.

Panels use readable contrast, larger controls, stable positioning, and mobile bottom sheets. Layer search receives keyboard focus on opening and keeps focus when cleared, so Escape closes it reliably. The globe, projections, terrain, original feeds, and investigation tools remain available.
