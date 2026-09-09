'use client';

import { useHydrated } from '@/hooks/useHydrated';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronDown, ChevronUp, MapPin, ExternalLink, AlertTriangle,
  Newspaper, Clock, Radio, Maximize2, Minimize2
} from 'lucide-react';
import AlertInbox from './AlertInbox';
import AiOverview from './AiOverview';
import { BUILTIN_FEEDS as SHARED_FEEDS } from '@/lib/news-feeds';

interface LiveAlertsProps {
  data: any;
  onLocate: (lat: number, lng: number) => void;
  onWatchFeed?: (url: string, name: string) => void;
}

const RISK_COLORS: Record<string, string> = {
  HIGH: '#FF3D3D',
  CRITICAL: '#FF1744',
  ELEVATED: '#FF9500',
  MODERATE: '#FFD700',
  LOW: '#00E676',
};

export default function LiveAlerts({ data, onLocate, onWatchFeed }: LiveAlertsProps) {
  const [expanded, setExpanded] = useState(true);
  const [maximized, setMaximized] = useState(false);
  const [filter, setFilter] = useState<'inbox' | 'all' | 'news' | 'quakes' | 'feeds'>('inbox');

  // One shared registry — this list used to diverge from /api/live-news.
  const BUILTIN_FEEDS = SHARED_FEEDS;


  // Build unified alert feed
  const alerts: any[] = [];

  // OSINT Telegram News Feed (from /api/news)
  if (data.news) {
    data.news.forEach((a: any) => {
      alerts.push({
        type: 'news', title: a.title, description: a.description, source: a.source,
        lat: a.coords?.[0], lng: a.coords?.[1], time: a.published,
        severity: (a.risk_score ?? 1) >= 8 ? 'CRITICAL' : (a.risk_score ?? 1) >= 6 ? 'HIGH' : (a.risk_score ?? 1) >= 4 ? 'ELEVATED' : 'LOW',
        url: a.link,
      });
    });
  }

  // Earthquakes
  if (data.earthquakes) {
    data.earthquakes.slice(0, 5).forEach((eq: any) => {
      alerts.push({
        type: 'quake', title: `M${eq.magnitude} - ${eq.place}`, source: 'USGS',
        lat: eq.lat, lng: eq.lng, time: eq.time,
        severity: eq.magnitude >= 6 ? 'CRITICAL' : eq.magnitude >= 4.5 ? 'HIGH' : 'MODERATE',
      });
    });
  }

  // Built-in live feeds (always present)
  BUILTIN_FEEDS.forEach(f => {
    alerts.push({
      type: 'feed', title: f.name,
      source: `${f.city}, ${f.country}`,
      lat: f.lat, lng: f.lng,
      feedUrl: f.url, severity: 'LOW', category: f.category,
    });
  });

  const filtered = filter === 'all' ? alerts.filter(a => a.type !== 'feed') :
    filter === 'news' ? alerts.filter(a => a.type === 'news') :
    filter === 'quakes' ? alerts.filter(a => a.type === 'quake') :
    alerts.filter(a => a.type === 'feed');

  const getIcon = (type: string) => {
    switch (type) {
      case 'news': return Newspaper;
      case 'quake': return AlertTriangle;
      case 'feed': return Radio;
      default: return Newspaper;
    }
  };

  // Ensure portal only renders on client
  const mounted = useHydrated();

  const content = (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.5, duration: 0.6 }}
      className={`glass-panel flex flex-col overflow-hidden pointer-events-auto transition-all duration-300 ${maximized ? 'fixed inset-4 z-[9999] bg-[#0a0a09]/95 backdrop-blur-3xl' : 'shrink-0 h-[500px] max-h-[80vh] resize-y'}`}
    >
      {/* Header - Fixed Height, Never Shrinks */}
      <div
        onClick={() => setExpanded(!expanded)}
        onKeyDown={e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setExpanded(!expanded); } }}
        role="button"
        tabIndex={0}
        className="flex-shrink-0 flex items-center justify-between px-3 py-2 hover:bg-[var(--hover-accent)] transition-colors cursor-pointer outline-none border-b border-[rgba(255,255,255,0.05)] bg-[rgba(0,0,0,0.3)]"
      >
        <div className="flex items-center gap-2">
          <Radio className="w-3.5 h-3.5 text-[#FF4081]" />
          <span className="hud-text text-[11px] text-[var(--text-primary)]">LIVE ALERTS</span>
          <span className="gotham-tag gotham-tag--high" style={{ fontSize: '9px', padding: '1px 5px' }}>{alerts.filter(a => a.type === 'news' || a.type === 'quake').length}</span>
          <span className="gotham-tag gotham-tag--info" style={{ fontSize: '9px', padding: '1px 4px' }}>{BUILTIN_FEEDS.length} FEEDS</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-[#FF4081] animate-vantage-pulse" />
          <button onClick={(e) => { e.stopPropagation(); setMaximized(!maximized); if (!expanded && !maximized) setExpanded(true); }} className="p-1.5 -m-0.5 rounded hover:text-white hover:bg-white/10 transition-colors" title={maximized ? "Restore" : "Maximize"}>
            {maximized ? <Minimize2 className="w-3 h-3 text-[var(--text-muted)]" /> : <Maximize2 className="w-3 h-3 text-[var(--text-muted)]" />}
          </button>
          {expanded ? <ChevronUp className="w-3.5 h-3.5 text-[var(--text-muted)]" /> : <ChevronDown className="w-3.5 h-3.5 text-[var(--text-muted)]" />}
        </div>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className={`flex flex-col flex-1 min-h-0 ${maximized ? 'bg-[#0a0a09]' : 'bg-transparent'}`}
          >
            {/* Filters - Fixed Height, Never Shrinks */}
            <div className={`flex-shrink-0 flex flex-wrap gap-1 ${maximized ? 'px-6 py-4 border-b border-[#2A2A28] bg-[#111111]' : 'px-3 py-2 border-b border-[rgba(255,255,255,0.05)]'}`}>
              {(['inbox', 'all', 'news', 'quakes', 'feeds'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1.5 rounded text-[11px] font-mono tracking-wider transition-all ${filter === f ? 'bg-[var(--cyan-primary)]/20 text-[var(--cyan-primary)] border border-[var(--cyan-primary)]/50' : 'text-[#8A8880] border border-transparent hover:text-[#E8E6E0] hover:bg-[#2A2A28]'}`}
                >
                  {f.toUpperCase()}
                </button>
              ))}
            </div>

            {filter === 'inbox' ? <AlertInbox onLocate={onLocate} /> : <>
            {/* One-click AI overview of the current alert picture */}
            <div className={`flex-shrink-0 ${maximized ? 'px-6 pt-3' : 'px-3 pt-2'}`}>
              <AiOverview mode="alerts" payload={data} accent="#FF4081" />
            </div>

            {/* Alert List - Internally Scrolling */}
            <div className={`flex-1 overflow-y-auto styled-scrollbar ${maximized ? 'p-6' : 'p-3'}`}>
              <div className="space-y-2">
                {filtered.map((alert, i) => {
                  const Icon = getIcon(alert.type);
                const sevColor = RISK_COLORS[alert.severity] || '#FFD700';
                return (
                  <div
                    key={i}
                    onClick={() => {
                      if (alert.lat !== undefined && alert.lng !== undefined) {
                        onLocate(alert.lat, alert.lng);
                      }
                      if (alert.feedUrl && onWatchFeed) {
                        onWatchFeed(alert.feedUrl, alert.title);
                      }
                    }}
                    className="w-full text-left p-2.5 rounded-lg bg-[#111111]/60 border border-[#2A2A28] hover:bg-[#1A1A1A] transition-all hover:border-[#3A3A38] group cursor-pointer"
                  >
                    <div className="flex items-start gap-2.5">
                      {/* Severity indicator */}
                      <div className="flex-shrink-0 mt-1">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: sevColor, boxShadow: `0 0 6px ${sevColor}60` }} />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-1.5 mb-2">
                          <Icon className="w-3.5 h-3.5 flex-shrink-0 mt-[2px]" style={{ color: sevColor }} />
                          <span className={`text-[11px] font-mono text-[#E8E6E0] leading-relaxed ${alert.type === 'news' ? 'line-clamp-3' : 'truncate'}`}>
                            {(alert.description || alert.title || '').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')}
                          </span>
                        </div>
                        <div className="flex items-center justify-between border-t border-[#2A2A28]/50 pt-1.5 mt-1.5">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-mono text-[#8A8880] uppercase tracking-wider">{alert.source}</span>
                            {alert.time && (
                              <span className="text-[10px] font-mono text-[#5C5A54] flex items-center gap-1 border-l border-[#2A2A28] pl-2">
                                <Clock className="w-2.5 h-2.5" />
                                {new Date(alert.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            )}
                          </div>
                          {alert.url && (
                            <a 
                              href={alert.url} 
                              target="_blank" 
                              rel="noopener noreferrer" 
                              className="inline-flex items-center py-1.5 px-1.5 -mx-1 rounded text-[9px] font-mono text-[var(--cyan-primary)] hover:underline hover:bg-[var(--cyan-primary)]/10"
                              onClick={(e) => e.stopPropagation()}
                            >
                              SOURCE
                            </a>
                          )}
                        </div>
                      </div>

                      {/* Fly-to icon */}
                      {alert.lat !== undefined && (
                        <MapPin className="w-3 h-3 text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5" />
                      )}
                    </div>
                  </div>
                );
              })}
              </div>
              {filtered.length === 0 && (
                <div className="text-center py-4 text-[11px] font-mono text-[var(--text-muted)]">
                  No alerts for this filter
                </div>
              )}
            </div>
            </>}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );

  if (maximized && mounted && typeof document !== 'undefined') {
    return createPortal(content, document.body);
  }

  return content;
}
