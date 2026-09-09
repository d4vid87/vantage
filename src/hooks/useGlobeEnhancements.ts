"use client";

import { useEffect, type RefObject } from "react";
import maplibregl, {
  type Map,
  type GeoJSONSource,
  type ExpressionSpecification,
} from "maplibre-gl";
import { MAP_FEEDS, type MapFeedStatus } from "@/lib/map-feeds";
import { SOURCE_GROUPS, type GlobeEnhancements } from "@/lib/dashboard/globe";
const empty: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [],
};
/** Additional overlays live on the existing globe. No second map or render loop. */
export function useGlobeEnhancements(
  ref: RefObject<Map | null>,
  ready: boolean,
  state: GlobeEnhancements,
  active: Record<string, boolean>,
  feedStatuses: MapFeedStatus[],
) {
  useEffect(() => {
    const map = ref.current;
    if (!map || !ready) return;
    const inspect = (event: maplibregl.MapMouseEvent) => {
      const feature = map
        .queryRenderedFeatures(event.point)
        .find(
          (f) =>
            Object.values(SOURCE_GROUPS).flat().includes(f.source),
        );
      if (!feature || feature.source.startsWith("enh-") || feature.layer.id.startsWith("cluster-")) return;
      const group = Object.entries(SOURCE_GROUPS).find(([, sources]) =>
        sources.includes(feature.source),
      )?.[0];
      const feed = MAP_FEEDS.find(
        (f) => f.key === group || f.layers?.includes(group || ""),
      );
      if (!feed) return;
      queueMicrotask(() => {
        const popup = map
          .getContainer()
          .querySelector(".maplibregl-popup-content");
        if (!popup) return;
        popup.querySelector(".enh-provenance")?.remove();
        const info = document.createElement("section");
        info.className = "enh-provenance";
        info.style.cssText =
          "margin-top:8px;border-top:1px solid #777;padding-top:8px;font-size:11px";
        const status = feedStatuses.find((f) => f.key === feed.key);
        const line = document.createElement("p");
        line.textContent = `${feed.key} · inspection snapshot · received ${status?.lastSuccess ? new Date(status.lastSuccess).toLocaleString() : "unknown"} · ${status?.error ? "refresh failed: " + status.error : !status?.lastSuccess || Date.now() - status.lastSuccess > (status.interval || feed.interval) ? "overdue" : "current"}`;
        info.append(line);
        const source = document.createElement("a");
        source.href = feed.url;
        source.target = "_blank";
        source.rel = "noopener noreferrer";
        source.textContent = "Source data ↗";
        info.append(source);
        const health = document.createElement("button");
        health.textContent = "Feed health / retry";
        health.onclick = () =>
          window.dispatchEvent(new Event("vantage-feed-health"));
        info.append(health);
        popup.append(info);
      });
    };
    map.on("click", inspect);
    return () => {
      map.off("click", inspect);
    };
  }, [ref, ready, feedStatuses]);
  useEffect(() => {
    const map = ref.current;
    if (!map || !ready) return;
    const tileError = (event: { sourceId?: string }) => {
      if (event.sourceId?.startsWith("enh-radar"))
        window.dispatchEvent(
          new CustomEvent("vantage-radar-error", {
            detail:
              "Some radar tiles are unavailable or rate limited. Playback paused; missing tiles are not evidence of clear weather.",
          }),
        );
    };
    map.on("error", tileError);
    const handlers: Array<{
      id: string;
      fn: (e: maplibregl.MapLayerMouseEvent) => void;
    }> = [];
    for (const name of [
      "warnings",
      "hurricanes",
      "wind",
      "temperature",
      "rainfall",
      "financial",
    ]) {
      const id = "enh-" + name;
      map.addSource(id, {
        type: "geojson",
        data: empty,
      });
      const color =
        name === "warnings"
          ? "#ff6868"
          : name === "hurricanes"
            ? "#ef9ef8"
            : name === "financial"
              ? "#d4af37"
              : "#63b5ef";
      map.addLayer({
        id: id + "-fill",
        type: "fill",
        source: id,
        filter: ["==", ["geometry-type"], "Polygon"],
        paint: {
          "fill-color":
            name === "temperature"
              ? [
                  "interpolate",
                  ["linear"],
                  ["coalesce", ["get", "value"], 0],
                  -10,
                  "#549be7",
                  20,
                  "#eed779",
                  40,
                  "#e87062",
                ]
              : name === "rainfall"
                ? [
                    "interpolate",
                    ["linear"],
                    ["coalesce", ["get", "value"], 0],
                    0,
                    "#202e3c",
                    2,
                    "#57b9d9",
                    15,
                    "#977be2",
                  ]
                : color,
          "fill-opacity": 0.28,
        },
      });
      map.addLayer({
        id: id + "-line",
        type: "line",
        source: id,
        filter: ["!=", ["geometry-type"], "Point"],
        paint: {
          "line-color": color,
          "line-width": 2,
        },
      });
      map.addLayer({
        id: id + "-point",
        type: "circle",
        source: id,
        filter: ["==", ["geometry-type"], "Point"],
        paint: {
          "circle-color": color,
          "circle-radius": 5,
          "circle-stroke-width": 1,
          "circle-stroke-color": "#121628",
        },
      });
      map.addLayer({
        id: id + "-label",
        type: "symbol",
        source: id,
        layout: {
          "text-field":
            name === "wind"
              ? "↑"
              : name === "warnings"
                ? ["get", "event"]
                : ["coalesce", ["get", "name"], ["get", "title"], ""],
          "text-size": name === "wind" ? 22 : 12,
          "text-offset": name === "wind" ? [0, 0] : [0, 1.3],
          "text-allow-overlap": false,
          ...(name === "wind"
            ? {
                "text-rotate": ["get", "direction"] as ExpressionSpecification,
              }
            : {}),
        },
        paint: {
          "text-color": color,
          "text-halo-color": "#06060c",
          "text-halo-width": 1,
        },
      });
      for (const layer of [id + "-fill", id + "-line", id + "-point"]) {
        const fn = (e: maplibregl.MapLayerMouseEvent) => {
          const p = e.features?.[0]?.properties;
          if (!p) return;
          const box = document.createElement("section");
          box.style.cssText =
            "color:#e8e6e0;background:#101621;padding:12px;max-width:290px";
          const title = document.createElement("strong");
          title.textContent = String(p.title || p.name || name);
          box.append(title);
          for (const key of [
            "event",
            "severity",
            "value",
            "units",
            "validTime",
            "receivedAt",
            "expires",
            "instruction",
            "symbol",
            "kind",
            "verifiedAt",
            "nearby",
          ])
            if (p[key] != null) {
              const line = document.createElement("p");
              line.textContent = key + ": " + String(p[key]);
              box.append(line);
            }
          if (typeof p.source === "string" && /^https?:\/\//.test(p.source)) {
            const a = document.createElement("a");
            a.textContent = "Original source ↗";
            a.href = p.source;
            a.target = "_blank";
            a.rel = "noopener noreferrer";
            box.append(a);
          }
          if (p.symbol) {
            const button = document.createElement("button");
            button.textContent = "Company news & watches";
            button.onclick = () =>
              window.dispatchEvent(
                new CustomEvent("vantage-open-company", {
                  detail: String(p.symbol),
                }),
              );
            box.append(button);
          }
          new maplibregl.Popup({
            maxWidth: "320px",
          })
            .setLngLat(e.lngLat)
            .setDOMContent(box)
            .addTo(map);
        };
        map.on("click", layer, fn);
        handlers.push({
          id: layer,
          fn,
        });
      }
    }
    return () => {
      map.off("error", tileError);
      for (const h of handlers) map.off("click", h.id, h.fn);
      if (!map.getStyle()) return;
      for (const l of [...map.getStyle().layers].reverse())
        if (l.id.startsWith("enh-")) map.removeLayer(l.id);
      for (const s of Object.keys(map.getStyle().sources))
        if (s.startsWith("enh-")) map.removeSource(s);
    };
  }, [ref, ready]);
  useEffect(() => {
    const map = ref.current;
    if (!map || !ready) return;
    for (const name of [
      "warnings",
      "hurricanes",
      "wind",
      "temperature",
      "rainfall",
      "financial",
    ]) {
      const src = map.getSource("enh-" + name) as GeoJSONSource | undefined;
      src?.setData(state.overlays[name] || empty);
      for (const suffix of ["fill", "line", "point", "label"])
        if (map.getLayer("enh-" + name + "-" + suffix))
          map.setLayoutProperty(
            "enh-" + name + "-" + suffix,
            "visibility",
            state.visible.includes(name) ? "visible" : "none",
          );
    }
    if (state.radarUrl && !map.getSource("enh-radar-a")) {
      const slot = "a";
      map.addSource("enh-radar-" + slot, {
        type: "raster",
        tiles: [state.radarUrl],
        tileSize: 256,
        maxzoom: 7,
        attribution: '<a href="https://www.rainviewer.com/">RainViewer</a>',
      });
      map.addLayer(
        {
          id: "enh-radar-" + slot,
          type: "raster",
          source: "enh-radar-" + slot,
          paint: {
            "raster-opacity": 0,
            "raster-fade-duration": 150,
          },
        },
        map
          .getStyle()
          .layers.find(
            (l) =>
              "source" in l &&
              Object.values(SOURCE_GROUPS).flat().includes(String(l.source)),
          )?.id,
      );
    }
    if (map.getSource("enh-radar-a")) {
      const source = map.getSource(
        "enh-radar-a",
      ) as maplibregl.RasterTileSource;
      if (state.radarUrl && source.tiles?.[0] !== state.radarUrl)
        source.setTiles([state.radarUrl]);
      map.setLayoutProperty(
        "enh-radar-a",
        "visibility",
        state.visible.includes("radar") && state.radarUrl ? "visible" : "none",
      );
      map.setPaintProperty(
        "enh-radar-a",
        "raster-opacity",
        state.visible.includes("radar") && !!state.radarUrl
          ? (state.styles.radar?.opacity ?? 0.55)
          : 0,
      );
    }
  }, [ref, ready, state.overlays, state.visible, state.radarUrl, state.styles]);
  useEffect(() => {
    const map = ref.current;
    if (!map || !ready) return;
    const original: Array<{
      id: string;
      prop: string;
      value: unknown;
      layout: boolean;
    }> = [];
    const oldOrder = map.getStyle().layers.map((l) => l.id);
    const managed = Object.entries(SOURCE_GROUPS).sort(
      ([a], [b]) =>
        (state.styles[a]?.order ?? 0) - (state.styles[b]?.order ?? 0),
    );
    for (const [key, sources] of managed) {
      const style = state.styles[key];
      for (const l of map.getStyle().layers) {
        if (
          !("source" in l) ||
          typeof l.source !== "string" ||
          !sources.includes(l.source)
        )
          continue;
        const set = (prop: string, value: unknown, layout = false) => {
          original.push({
            id: l.id,
            prop,
            value: layout
              ? map.getLayoutProperty(l.id, prop)
              : map.getPaintProperty(l.id, prop),
            layout,
          });
          if (layout) map.setLayoutProperty(l.id, prop, value);
          else map.setPaintProperty(l.id, prop, value);
        };
        if (!l.id.startsWith("enh-") && state.mode !== "live")
          set("visibility", "none", true);
        if (style) {
          if (l.type === "symbol") {
            if (style.labels === "off" && !l.id.startsWith("cluster-"))
              set("text-opacity", 0);
            else {
              set(
                "text-opacity",
                style.labels === "key" && !l.id.startsWith("cluster-")
                  ? ["step", ["zoom"], 0, 4, style.opacity]
                  : style.opacity,
              );
              set("text-allow-overlap", false, true);
              if (style.labels === "key") set("text-optional", true, true);
            }
            set("icon-opacity", style.opacity);
          } else if (
            [
              "fill",
              "line",
              "circle",
              "raster",
              "heatmap",
              "fill-extrusion",
            ].includes(l.type) &&
            !l.id.startsWith("enh-radar")
          ) {
            set(l.type + "-opacity", [
              "*",
              map.getPaintProperty(l.id, l.type + "-opacity") ?? 1,
              style.opacity,
            ]);
            if (l.type === "circle")
              set("circle-stroke-opacity", style.opacity);
          }
        }
        // Keep base-map and interaction overlays in their original bands.
        if (style) {
          const anchor = map
            .getStyle()
            .layers.find((x) =>
              /^(draw|route|user-location|scan-target)/.test(x.id),
            );
          if (anchor && anchor.id !== l.id) map.moveLayer(l.id, anchor.id);
        }
      }
    }
    return () => {
      if (!map.getStyle()) return;
      for (const item of original)
        if (map.getLayer(item.id)) {
          if (item.layout)
            map.setLayoutProperty(item.id, item.prop, item.value ?? null);
          else map.setPaintProperty(item.id, item.prop, item.value ?? null);
        }
      for (let i = oldOrder.length - 2; i >= 0; i--)
        if (map.getLayer(oldOrder[i]) && map.getLayer(oldOrder[i + 1]))
          map.moveLayer(oldOrder[i], oldOrder[i + 1]);
    };
  }, [ref, ready, state.styles, state.mode, active]);
  useEffect(() => {
    const map = ref.current;
    if (!map || !ready) return;
    const sources = ["earthquakes", "cctv", "infrastructure"];
    const cleanups: (() => void)[] = [];
    for (const id of sources) {
      const src = map.getSource(id) as GeoJSONSource | undefined;
      if (!src) continue;
      src.setClusterOptions({
        cluster: state.clusters,
        clusterRadius: 45,
        clusterMaxZoom: 7,
      });
      const layers = map
        .getStyle()
        .layers.filter((l) => "source" in l && l.source === id);
      const filters = layers.map((l) => ({
        id: l.id,
        filter: map.getFilter(l.id),
      }));
      for (const l of filters)
        map.setFilter(l.id, [
          "all",
          ...(l.filter ? [l.filter] : []),
          ["!", ["has", "point_count"]],
        ] as maplibregl.FilterSpecification);
      const cid = "cluster-" + id;
      map.addLayer({
        id: cid,
        type: "circle",
        source: id,
        filter: ["has", "point_count"],
        paint: {
          "circle-radius": 18,
          "circle-color": "#243b4e",
          "circle-stroke-color": "#d4af37",
          "circle-stroke-width": 1,
        },
      });
      map.addLayer({
        id: cid + "-count",
        type: "symbol",
        source: id,
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-size": 12,
        },
        paint: {
          "text-color": "#ffffff",
        },
      });
      const click = async (e: maplibregl.MapLayerMouseEvent) => {
        const f = e.features?.[0];
        if (f?.geometry.type !== "Point") return;
        try {
          const zoom = await src.getClusterExpansionZoom(
            Number(f.properties?.cluster_id),
          );
          map.easeTo({
            center: f.geometry.coordinates as [number, number],
            zoom,
          });
        } catch {
          /* source refreshed */
        }
      };
      map.on("click", cid, click);
      cleanups.push(() => {
        if (!map.getStyle()) return;
        map.off("click", cid, click);
        if (map.getLayer(cid + "-count")) map.removeLayer(cid + "-count");
        if (map.getLayer(cid)) map.removeLayer(cid);
        for (const f of filters)
          if (map.getLayer(f.id)) map.setFilter(f.id, f.filter ?? null);
        src.setClusterOptions({
          cluster: false,
        });
      });
    }
    return () => cleanups.forEach((fn) => fn());
  }, [ref, ready, state.clusters]);
  useEffect(() => {
    const map = ref.current;
    if (!map || !ready) return;
    for (const [key, source] of [
      ["earthquakes", "earthquakes"],
      ["cctv", "cctv"],
      ["infrastructure", "infrastructure"],
    ])
      for (const suffix of ["", "-count"])
        if (map.getLayer("cluster-" + source + suffix))
          map.setLayoutProperty(
            "cluster-" + source + suffix,
            "visibility",
            active[key] && state.mode === "live" ? "visible" : "none",
          );
  }, [ref, ready, state.clusters, state.mode, active]);
}
