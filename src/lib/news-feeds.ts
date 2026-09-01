/**
 * VANTAGE — news source registry.
 *
 * Single source of truth for both the RSS pipeline and the live-video layer.
 * The video list previously existed twice — 16 entries in /api/live-news and a
 * divergent 24 in LiveAlerts, whose comment claimed the two were "synced" —
 * so ten channels appeared in the alert stream but never on the map.
 *
 * embed_allowed: false → the broadcaster refuses iframing; open externally.
 */

export interface LiveFeed {
  id: string;
  name: string;
  city: string;
  country: string;
  lat: number;
  lng: number;
  url: string;
  embed_allowed: boolean;
  category: string;
  language: string;
}

export const BUILTIN_FEEDS: LiveFeed[] = [

  // ── North America (external only — open in YouTube) ──
  { id: 'nbcnews',   name: 'NBC News NOW',  city: 'New York',      country: 'US', lat: 40.759, lng: -73.980, url: 'https://www.youtube.com/channel/UCeY0bbntWzzVIaj2z3QigXg/live', embed_allowed: false, category: 'mainstream', language: 'en' },
  { id: 'cbsnews',   name: 'CBS News 24/7', city: 'New York',      country: 'US', lat: 40.764, lng: -73.973, url: 'https://www.youtube.com/channel/UC8p1vwvWtl6T73JiExfWs1g/live', embed_allowed: false, category: 'mainstream', language: 'en' },
  { id: 'abcnews',   name: 'ABC News Live', city: 'New York',      country: 'US', lat: 40.763, lng: -73.979, url: 'https://www.youtube.com/channel/UCBi2mrWuNuyYy4gbM6fU18Q/live', embed_allowed: false, category: 'mainstream', language: 'en' },
  { id: 'bloomberg', name: 'Bloomberg TV',  city: 'New York',      country: 'US', lat: 40.756, lng: -73.988, url: 'https://www.youtube.com/channel/UC_vQ72b7v5n2938v9d5c80w/live', embed_allowed: false, category: 'finance',    language: 'en' },
  { id: 'cspan',     name: 'C-SPAN',        city: 'Washington DC', country: 'US', lat: 38.897, lng: -77.036, url: 'https://www.youtube.com/channel/UCb--64Gl51jIEVE-GLDAVTg/live',  embed_allowed: false, category: 'government', language: 'en' },
  { id: 'cbc',       name: 'CBC News',      city: 'Toronto',       country: 'CA', lat: 43.644, lng: -79.387, url: 'https://www.youtube.com/channel/UCKy1dAqELon0zgzZPOz9SVw/live',  embed_allowed: false, category: 'mainstream', language: 'en' },

  // ── Europe (verified embeddable) ──
  { id: 'skynews',    name: 'Sky News',      city: 'London', country: 'GB', lat: 51.500, lng:  -0.118, url: 'https://www.youtube.com/embed/live_stream?channel=UCoMdktPbSTixAyNGwb-UYkQ&autoplay=1&mute=1', embed_allowed: true, category: 'mainstream', language: 'en' },
  { id: 'france24en', name: 'France 24 EN',  city: 'Paris',  country: 'FR', lat: 48.830, lng:   2.280, url: 'https://www.youtube.com/embed/live_stream?channel=UCQfwfsi5VrQ8yKZ-UWmAEFg&autoplay=1&mute=1', embed_allowed: true, category: 'mainstream', language: 'en' },
  { id: 'dwnews',     name: 'DW News',       city: 'Berlin', country: 'DE', lat: 52.508, lng:  13.376, url: 'https://www.youtube.com/embed/live_stream?channel=UCknLrEdhRCp1aegoMqRaCZg&autoplay=1&mute=1', embed_allowed: true, category: 'mainstream', language: 'en' },

  // ── Middle East ──
  { id: 'aljazeera',  name: 'Al Jazeera EN', city: 'Doha', country: 'QA', lat: 25.286, lng: 51.534, url: 'https://www.youtube.com/embed/live_stream?channel=UCNye-wNBqNL5ZzHSJj3l8Bg&autoplay=1&mute=1', embed_allowed: true, category: 'mainstream', language: 'en' },

  // ── Asia Pacific (verified embeddable) ──
  { id: 'nhkworld', name: 'NHK World',  city: 'Tokyo',     country: 'JP', lat: 35.690, lng: 139.692, url: 'https://www.youtube.com/embed/live_stream?channel=UCSPEjw8F2nQDtmUKPFNF7_A&autoplay=1&mute=1', embed_allowed: true, category: 'mainstream', language: 'en' },
  { id: 'cna',      name: 'CNA 24/7',  city: 'Singapore', country: 'SG', lat:  1.290, lng: 103.852, url: 'https://www.youtube.com/embed/live_stream?channel=UC83jt4dlz1Gjl58fzQrrKZg&autoplay=1&mute=1', embed_allowed: true, category: 'mainstream', language: 'en' },
  { id: 'wion',     name: 'WION',      city: 'New Delhi', country: 'IN', lat: 28.614, lng:  77.209, url: 'https://www.youtube.com/embed/live_stream?channel=UC_gUM8rL-Lrg6O3adPW9K1g&autoplay=1&mute=1', embed_allowed: true, category: 'mainstream', language: 'en' },
  // CGTN blocks embeds from non-Chinese IPs often
  { id: 'cgtn',     name: 'CGTN',      city: 'Beijing',   country: 'CN', lat: 39.904, lng: 116.407, url: 'https://www.youtube.com/channel/UCgrNz-aDmcr2uuto8_DL2jg/live',                                embed_allowed: false, category: 'state',      language: 'en' },

  // ── State media (external only) ──
  { id: 'rt',       name: 'RT News',   city: 'Moscow',  country: 'RU', lat: 55.755, lng:  37.617, url: 'https://rumble.com/c/RTNewsEN', embed_allowed: false, category: 'state', language: 'en' },

  // ── Present only in the component's copy before the two lists were merged ──
  { id: 'euronews',   name: 'Euronews',      city: 'Lyon',         country: 'FR', lat: 45.764, lng:   4.836, url: 'https://www.youtube.com/embed/live_stream?channel=UCtUbOIRGKZkW7555n6x6q6g&autoplay=1&mute=1', embed_allowed: true,  category: 'mainstream', language: 'en' },
  { id: 'trtworld',   name: 'TRT World',     city: 'Istanbul',     country: 'TR', lat: 41.008, lng:  28.978, url: 'https://www.youtube.com/embed/live_stream?channel=UC7fWeaHZQg1p9-4v98L1D1A&autoplay=1&mute=1', embed_allowed: true,  category: 'mainstream', language: 'en' },
  { id: 'ukrinform',  name: 'UKRINFORM',     city: 'Kyiv',         country: 'UA', lat: 50.450, lng:  30.523, url: 'https://www.youtube.com/embed/live_stream?channel=UCaDkCK6iFHPE0lmpaYL-WxQ&autoplay=1&mute=1', embed_allowed: true,  category: 'conflict',   language: 'uk' },
  { id: 'almayadeen', name: 'Al Mayadeen',   city: 'Beirut',       country: 'LB', lat: 33.889, lng:  35.496, url: 'https://www.youtube.com/embed/live_stream?channel=UCZCFHCU-2eGF7V5ciMkoPHw&autoplay=1&mute=1', embed_allowed: true,  category: 'conflict',   language: 'ar' },
  { id: 'lbci',       name: 'LBCI Lebanon',  city: 'Beirut',       country: 'LB', lat: 33.893, lng:  35.502, url: 'https://www.youtube.com/embed/live_stream?channel=UCpE6gpKewomi17XDyPfpFjA&autoplay=1&mute=1', embed_allowed: true,  category: 'mainstream', language: 'ar' },
  { id: 'arirang',    name: 'Arirang',       city: 'Seoul',        country: 'KR', lat: 37.566, lng: 126.978, url: 'https://www.youtube.com/embed/live_stream?channel=UCw9-5Y1CjW7Qy1Yf5q1y2-Q&autoplay=1&mute=1', embed_allowed: true,  category: 'mainstream', language: 'en' },
  { id: 'abcau',      name: 'ABC AU',        city: 'Sydney',       country: 'AU', lat: -33.868, lng: 151.209, url: 'https://www.youtube.com/embed/live_stream?channel=UC5iLnYoF4Ryb63YdGD9RfWQ&autoplay=1&mute=1', embed_allowed: true, category: 'mainstream', language: 'en' },
  { id: 'africanews', name: 'Africanews',    city: 'Pointe-Noire', country: 'CG', lat:  -4.778, lng:  11.865, url: 'https://www.youtube.com/embed/live_stream?channel=UC5T2fB_W0Z31T0c8yN36a8A&autoplay=1&mute=1', embed_allowed: true, category: 'mainstream', language: 'en' },
  { id: 'sabc',       name: 'SABC News',     city: 'Johannesburg', country: 'ZA', lat: -26.204, lng:  28.047, url: 'https://www.youtube.com/embed/live_stream?channel=UC8yH-uI81UUtEMDsowQyx1g&autoplay=1&mute=1', embed_allowed: true, category: 'mainstream', language: 'en' },
  { id: 'telesur',    name: 'teleSUR EN',    city: 'Caracas',      country: 'VE', lat:  10.491, lng: -66.902, url: 'https://www.youtube.com/embed/live_stream?channel=UCmuTmpLY35O3csvhyA6vrkg&autoplay=1&mute=1', embed_allowed: true, category: 'mainstream', language: 'en' },
];

export interface RssFeed {
  url: string;
  source: string;
  tier: 'wire' | 'regional' | 'osint';
  region: string;
}

/**
 * Tiered RSS registry. Tier is provenance, not quality: `wire` are the large
 * international desks, `regional` cover a continent from inside it, and `osint`
 * are conflict-focused trackers. Breadth across tiers is what stops a single
 * editorial line from dominating the feed.
 */
export const RSS_FEEDS: RssFeed[] = [
  // ── Wire / international desks ──
  { url: 'https://feeds.bbci.co.uk/news/world/rss.xml', source: 'BBC World', tier: 'wire', region: 'global' },
  { url: 'https://www.aljazeera.com/xml/rss/all.xml', source: 'Al Jazeera', tier: 'wire', region: 'global' },
  { url: 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml', source: 'NYT World', tier: 'wire', region: 'global' },
  { url: 'https://www.theguardian.com/world/rss', source: 'Guardian World', tier: 'wire', region: 'global' },
  { url: 'https://rss.dw.com/rdf/rss-en-world', source: 'DW', tier: 'wire', region: 'global' },
  { url: 'https://www.france24.com/en/rss', source: 'France 24', tier: 'wire', region: 'global' },
  { url: 'https://feeds.npr.org/1004/rss.xml', source: 'NPR World', tier: 'wire', region: 'global' },
  { url: 'https://moxie.foxnews.com/google-publisher/world.xml', source: 'Fox World', tier: 'wire', region: 'global' },
  { url: 'https://www.cbsnews.com/latest/rss/world', source: 'CBS World', tier: 'wire', region: 'global' },
  { url: 'https://abcnews.go.com/abcnews/internationalheadlines', source: 'ABC International', tier: 'wire', region: 'global' },
  { url: 'https://www.independent.co.uk/news/world/rss', source: 'Independent World', tier: 'wire', region: 'global' },
  { url: 'https://www.telegraph.co.uk/world-news/rss.xml', source: 'Telegraph World', tier: 'wire', region: 'global' },

  // ── Regional desks ──
  { url: 'https://www.jpost.com/rss/rssfeedsheadlines.aspx', source: 'Jerusalem Post', tier: 'regional', region: 'middleeast' },
  { url: 'https://www.timesofisrael.com/feed/', source: 'Times of Israel', tier: 'regional', region: 'middleeast' },
  { url: 'https://english.alarabiya.net/tools/rss', source: 'Al Arabiya', tier: 'regional', region: 'middleeast' },
  { url: 'https://www.arabnews.com/rss.xml', source: 'Arab News', tier: 'regional', region: 'middleeast' },
  { url: 'https://kyivindependent.com/feed/', source: 'Kyiv Independent', tier: 'regional', region: 'europe' },
  { url: 'https://www.euractiv.com/feed/', source: 'Euractiv', tier: 'regional', region: 'europe' },
  { url: 'https://www.rferl.org/api/zrqiteuuir', source: 'RFE/RL', tier: 'regional', region: 'europe' },
  { url: 'https://www.scmp.com/rss/91/feed', source: 'SCMP Asia', tier: 'regional', region: 'asia' },
  { url: 'https://www3.nhk.or.jp/rj/rss/news/all.xml', source: 'NHK', tier: 'regional', region: 'asia' },
  { url: 'https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml', source: 'CNA', tier: 'regional', region: 'asia' },
  { url: 'https://feeds.feedburner.com/ndtvnews-world-news', source: 'NDTV World', tier: 'regional', region: 'asia' },
  { url: 'https://allafrica.com/tools/headlines/rdf/latest/headlines.rdf', source: 'AllAfrica', tier: 'regional', region: 'africa' },
  { url: 'https://www.africanews.com/feed/rss', source: 'Africanews', tier: 'regional', region: 'africa' },
  { url: 'https://en.mercopress.com/rss', source: 'MercoPress', tier: 'regional', region: 'americas' },
  { url: 'https://www.batimes.com.ar/feed', source: 'Buenos Aires Times', tier: 'regional', region: 'americas' },

  // ── Conflict / OSINT trackers ──
  { url: 'https://www.gdacs.org/xml/rss.xml', source: 'GDACS', tier: 'osint', region: 'global' },
  { url: 'https://www.longwarjournal.org/feed', source: 'Long War Journal', tier: 'osint', region: 'global' },
  { url: 'https://www.bellingcat.com/feed/', source: 'Bellingcat', tier: 'osint', region: 'global' },
  { url: 'https://feeds.feedburner.com/TheHackersNews', source: 'Hacker News (security)', tier: 'osint', region: 'global' },
  { url: 'https://www.defensenews.com/arc/outboundfeeds/rss/', source: 'Defense News', tier: 'osint', region: 'global' },
  { url: 'https://reliefweb.int/updates/rss.xml', source: 'ReliefWeb', tier: 'osint', region: 'global' },
];

/** Public Telegram OSINT channels scraped alongside the RSS registry. */
export const TELEGRAM_CHANNELS = ['OSINTtechnical', 'Faytuks', 'Liveuamap', 'CyberKnow'];
