'use client';

import { memo, useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import {Network, Plane, Ship, Satellite, Camera, CloudLightning, AlertTriangle, Crosshair, Megaphone, Sun, Layers, Search, X} from 'lucide-react';
import StyleStudio from './StyleStudio';
import { usePanel } from '@/hooks/usePanel';
import { toggleLayerSelection } from '@/lib/layer-selection';

interface LayerPanelProps {
  data: any;
  activeLayers: any;
  setActiveLayers: React.Dispatch<React.SetStateAction<any>>;
  isMobile?: boolean;
  theme?: 'core' | 'ghost';
  setTheme?: (theme: 'core' | 'ghost') => void;
  /** Server-side capabilities, e.g. { cloudflare: true }. Layers declaring a
   *  `requires` key stay hidden until the matching capability is present. */
  capabilities?: Record<string, boolean>;
}

interface LayerDef {
  key: string;
  label: string;
  dataKey: string;
  /** Reads a bucket out of data.category_counts instead of a top-level array. */
  catKey?: string;
  /** Capability that must be configured server-side for this layer to appear. */
  requires?: string;
  /** Key of the layer this one modifies. Renders indented beneath it, and reads
   *  as inert while that parent is off — it has nothing to act on. */
  parent?: string;
}

interface LayerGroupDef {
  label: string;
  fullLabel: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  layers: LayerDef[];
}

export const LAYER_GROUPS: LayerGroupDef[] = [
  {
    label: 'SDK',
    fullLabel: 'VANTAGE SDK',
    icon: Network,
    layers: [
      { key: 'sdk_sea', label: 'Maritime Lines', dataKey: 'sdk_entities' },
      { key: 'sdk_air', label: 'Aviation Links', dataKey: '' },
      { key: 'sdk_naval', label: 'Intelligence Links', dataKey: '' },
    ],
  },
  {
    label: 'AVIATION',
    fullLabel: 'AVIATION',
    icon: Plane,
    layers: [
      { key: 'flights', label: 'Commercial', dataKey: 'commercial_flights' },
      { key: 'private', label: 'Private', dataKey: 'private_flights' },
      { key: 'jets', label: 'Private Jets', dataKey: 'private_jets' },
      { key: 'military', label: 'Military', dataKey: 'military_flights' },
    ],
  },
  {
    label: 'MARITIME',
    fullLabel: 'MARITIME',
    icon: Ship,
    layers: [
      { key: 'maritime', label: 'Maritime / Naval', dataKey: 'maritime_ships,maritime_ports,maritime_chokepoints' },
    ],
  },
  {
    label: 'SPACE',
    fullLabel: 'SPACE TRACKING',
    icon: Satellite,
    layers: [
      { key: 'satellites', label: 'All Satellites', dataKey: 'satellites' },
      { key: 'sat_comms', label: 'Starlink / Comms', dataKey: 'satellites', catKey: 'comms' },
      { key: 'sat_military', label: 'Military / Intel', dataKey: 'satellites', catKey: 'military' },
      { key: 'sat_navigation', label: 'GPS / Navigation', dataKey: 'satellites', catKey: 'navigation' },
      { key: 'sat_earth', label: 'Earth Observation', dataKey: 'satellites', catKey: 'earth_obs' },
      { key: 'sat_science', label: 'Stations / Telescopes', dataKey: 'satellites', catKey: 'science' },
    ],
  },
  {
    label: 'SURVEIL',
    fullLabel: 'SURVEILLANCE',
    icon: Camera,
    layers: [
      { key: 'cctv', label: 'CCTV Cameras', dataKey: 'cameras' },
      { key: 'cctv_previews', label: 'Live Previews', dataKey: '', parent: 'cctv' },
      { key: 'live_news', label: 'Live News Feeds', dataKey: 'live_feeds' },
    ],
  },
  {
    label: 'HAZARD',
    fullLabel: 'NATURAL HAZARDS',
    icon: CloudLightning,
    layers: [
      { key: 'earthquakes', label: 'Earthquakes', dataKey: 'earthquakes' },
      { key: 'fires', label: 'Active Fires', dataKey: 'fires' },
      { key: 'weather', label: 'Severe Weather', dataKey: 'weather_events' },
      { key: 'radiation', label: 'Radiation', dataKey: 'radiation' },
      { key: 'air_quality', label: 'Air Quality', dataKey: 'air_quality' },
      { key: 'balloons', label: 'Radiosondes', dataKey: 'balloons' },
      { key: 'volcanoes', label: 'Volcanic Activity', dataKey: 'volcanoes' },
      { key: 'disease', label: 'Disease Outbreaks', dataKey: 'disease' },
      { key: 'power_outages', label: 'Power Outages (US)', dataKey: 'power_outages' },
    ],
  },
  {
    label: 'THREAT',
    fullLabel: 'THREATS & INTEL',
    icon: AlertTriangle,
    layers: [
      { key: 'infrastructure', label: 'Nuclear Facilities', dataKey: 'infrastructure' },
      { key: 'global_incidents', label: 'Global Incidents', dataKey: 'gdelt' },
      { key: 'conflict_zones', label: 'Conflict Zones', dataKey: '' },
      { key: 'gdelt_events', label: 'GDELT Events', dataKey: 'gdelt_events' },
      { key: 'frontlines', label: 'Ukraine Frontline', dataKey: 'frontlines' },
    ],
  },
  {
    label: 'GEO',
    fullLabel: 'GEOPOLITICAL',
    icon: Crosshair,
    layers: [
      { key: 'travel_advisories', label: 'Travel Advisories', dataKey: 'travel_advisories' },
      { key: 'gps_jamming', label: 'GPS Interference', dataKey: 'gps_jamming' },
      { key: 'acled', label: 'ACLED Conflict Events', dataKey: 'acled', requires: 'acled' },
    ],
  },
  {
    label: 'NETWORK',
    fullLabel: 'NETWORK INTEL',
    icon: Network,
    layers: [
      { key: 'malware', label: 'Live Malware', dataKey: 'malware_threats' },
      { key: 'cyber_attacks', label: 'C2 Indicators', dataKey: 'cyber_attacks' },
      { key: 'ransomware', label: 'Ransomware Victims', dataKey: 'ransomware' },
      { key: 'tor_exits', label: 'Tor Exit Nodes', dataKey: 'tor_exits' },
    ],
  },
  {
    label: 'NETINTEL',
    fullLabel: 'NET & EVENT INTEL',
    icon: Megaphone,
    layers: [
      { key: 'cf_outages', label: 'Internet Disruptions', dataKey: 'cf_outages' },
      { key: 'cf_attacks', label: 'Attack Origins', dataKey: 'cf_attack_origins', requires: 'cloudflare' },
    ],
  },
  {
    label: 'DISPLAY',
    fullLabel: 'DISPLAY',
    icon: Sun,
    layers: [
      { key: 'day_night', label: 'Day / Night Cycle', dataKey: '' },
      { key: 'terrain_3d', label: '3D Terrain & Buildings', dataKey: '' },
    ],
  },
];

/* ── Minimal Toggle Switch ── */
/**
 * Presentational only. The row around it is the button, and a button inside a
 * button is invalid HTML — the browser reparents it, which breaks hydration and
 * silently drops the click handler on the inner control.
 */
function ToggleSwitch({ active }: { active: boolean }) {
  return (
    <span
      role="presentation"
      className="relative flex-shrink-0 block"
      style={{ width: 28, height: 14 }}
    >
      <div
        className="absolute inset-0 rounded-full transition-all duration-300"
        style={{
          background: active ? 'rgba(255,255,255,0.2)' : 'transparent',
          border: active ? '1px solid rgba(255,255,255,0.35)' : '1px solid rgba(255,255,255,0.12)',
          boxShadow: active ? '0 0 8px rgba(255,255,255,0.1)' : 'none',
        }}
      />
      <motion.div
        className="absolute top-[2px] rounded-full"
        style={{
          width: 10,
          height: 10,
          background: active ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.2)',
          boxShadow: active ? '0 0 6px rgba(255,255,255,0.4)' : 'none',
        }}
        animate={{ left: active ? 16 : 2 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      />
    </span>
  );
}

function LayerPanel({
  data,
  activeLayers,
  setActiveLayers,
  isMobile,
  theme = "core",
  setTheme,
  capabilities = {},
}: LayerPanelProps) {
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(()=>{const close=()=>setOpen(false);window.addEventListener('vantage-close-layers',close);return()=>window.removeEventListener('vantage-close-layers',close);},[]);
  const [query, setQuery] = useState("");
  const [activeOnly, setActiveOnly] = useState(false);
  const [studioOpen, setStudioOpen] = useState(false);
  const panel = usePanel<HTMLDivElement>(open && !isMobile, () =>
    setOpen(false),
  );
  const groups = LAYER_GROUPS.map((g) => ({
    ...g,
    layers: g.layers.filter(
      (l) =>
        (!l.requires || capabilities[l.requires]) &&
        (!activeOnly || activeLayers[l.key]) &&
        `${g.fullLabel} ${l.label}`
          .toLowerCase()
          .includes(query.toLowerCase().trim()),
    ),
  })).filter((g) => g.layers.length);
  const count = LAYER_GROUPS.flatMap((g) => g.layers).filter(
    (l) =>
      !l.parent &&
      activeLayers[l.key] &&
      (!l.requires || capabilities[l.requires]),
  ).length;
  const toggle = (layer: LayerDef) =>
    setActiveLayers((prev: Record<string, boolean>) =>
      toggleLayerSelection(prev, [layer]),
    );
  const content = (
    <>
      <div className="layer-library-heading">
        <div>
          <h2>Map layers</h2>
          <p>{count} enabled · your live picture</p>
        </div>
        {!isMobile && (
          <button aria-label="Close layers" onClick={() => setOpen(false)}>
            <X size={18} />
          </button>
        )}
      </div>
      <label className="layer-search">
        <Search size={17} />
        <input
          ref={searchRef}
          data-panel-autofocus
          aria-label="Search layers"
          placeholder="Find a layer…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button aria-label="Clear layer search" onClick={() => {setQuery("");searchRef.current?.focus();}}>
            <X size={15} />
          </button>
        )}
      </label>
      <div className="layer-filters">
        <button aria-pressed={!activeOnly} onClick={() => setActiveOnly(false)}>
          All layers
        </button>
        <button aria-pressed={activeOnly} onClick={() => setActiveOnly(true)}>
          Enabled only
        </button>
      </div>
      {!groups.length && (
        <p className="layer-empty">
          No matching layers. Try another search or choose All layers.
        </p>
      )}
      {groups.map((group) => (
        <section key={group.label} className="layer-category">
          <header>
            <group.icon className="size-4" />
            <h3>{group.fullLabel}</h3>
            <button
              onClick={() =>
                setActiveLayers((prev: Record<string, boolean>) =>
                  toggleLayerSelection(prev, group.layers),
                )
              }
            >
              {group.layers.some((l) => activeLayers[l.key]) ? "Hide" : "Show"}
            </button>
          </header>
          {group.layers.map((layer) => {
            const values = layer.dataKey.split(",").map((k) => data[k]);
            const total =
              layer.catKey && data.category_counts
                ? data.category_counts[layer.catKey]
                : values.some(Array.isArray)
                  ? values.reduce(
                      (n: number, v: unknown) =>
                        n + (Array.isArray(v) ? v.length : 0),
                      0,
                    )
                  : null;
            return (
              <button
                key={layer.key}
                className={
                  "layer-choice" + (layer.parent ? " layer-child" : "")
                }
                aria-pressed={!!activeLayers[layer.key]}
                onClick={() => toggle(layer)}
                title={
                  layer.parent && !activeLayers[layer.parent]
                    ? "Enabling also turns on the parent layer"
                    : undefined
                }
              >
                <ToggleSwitch active={!!activeLayers[layer.key]} />
                <span>{layer.label}</span>
                {total != null && (
                  <small title="Records received, not necessarily visible in this view">
                    {Number(total).toLocaleString()}
                  </small>
                )}
              </button>
            );
          })}
        </section>
      ))}
      <div className="layer-personalize">
        <button
          aria-expanded={studioOpen}
          onClick={() => setStudioOpen((v) => !v)}
        >
          Map appearance
        </button>
        {setTheme && (
          <button
            aria-pressed={theme === "ghost"}
            onClick={() => setTheme(theme === "core" ? "ghost" : "core")}
          >
            Violet theme
          </button>
        )}
      </div>
      {studioOpen && (
        <StyleStudio isMobile onClose={() => setStudioOpen(false)} />
      )}
    </>
  );
  if (isMobile) return <div className="layer-library-mobile">{content}</div>;
  return (
    <div className="layer-launcher">
      <button
        className="layer-launch-button"
        aria-expanded={open}
        onClick={() => {setOpen((v) => !v);window.dispatchEvent(new Event('vantage-close-home'));}}
      >
        <Layers size={18} />
        Layers<span>{count}</span>
      </button>
      {open && (
        <div
          className="layer-library"
          ref={panel}
          role="dialog"
          aria-label="Map layers"
        >
          {content}
        </div>
      )}
    </div>
  );
}
export default memo(LayerPanel);
