import { NextResponse } from 'next/server';
import Parser from 'rss-parser';
import { RSS_FEEDS, TELEGRAM_CHANNELS } from '@/lib/news-feeds';
import { buildNews, type RawArticle } from '@/lib/news';

/**
 * VANTAGE — OSINT news aggregation.
 *
 * A tiered RSS registry and the Telegram OSINT channels are fetched in
 * parallel, deduped by normalised headline (the same story is syndicated
 * verbatim across outlets), then geolocated against the local place gazetteer.
 */

const parser = new Parser({ timeout: 8000 });

async function fromRss(): Promise<RawArticle[]> {
  const results = await Promise.allSettled(
    RSS_FEEDS.map(async (feed) => {
      const parsed = await parser.parseURL(feed.url);
      return (parsed.items ?? []).slice(0, 12).map((i): RawArticle => ({
        title: i.title,
        description: (i.contentSnippet || i.content || '').replace(/\s+/g, ' ').slice(0, 400),
        link: i.link,
        pubDate: i.isoDate || i.pubDate,
        source: feed.source,
        tier: feed.tier,
      }));
    }),
  );
  return results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
}

function parseTelegramHTML(html: string, channel: string): RawArticle[] {
  const out: RawArticle[] = [];
  const re = /<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/g;
  const times = [...html.matchAll(/datetime="([^"]+)"/g)].map((m) => m[1]);
  let i = 0;
  for (const m of html.matchAll(re)) {
    const text = m[1].replace(/<br\s*\/?>/g, ' ').replace(/<[^>]+>/g, '').trim();
    if (text.length > 20) {
      out.push({
        title: text.slice(0, 160),
        description: text.slice(0, 400),
        link: `https://t.me/s/${channel}`,
        pubDate: times[i] || new Date().toISOString(),
        source: `TG/${channel}`,
        tier: 'osint',
      });
    }
    i++;
  }
  return out.slice(-8);
}

async function fromTelegram(): Promise<RawArticle[]> {
  const results = await Promise.allSettled(
    TELEGRAM_CHANNELS.map(async (channel) => {
      const res = await fetch(`https://t.me/s/${channel}`, {
        signal: AbortSignal.timeout(8000),
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
      });
      if (!res.ok) return [];
      return parseTelegramHTML(await res.text(), channel);
    }),
  );
  return results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
}

export async function GET() {
  try {
    const [rss, telegram] = await Promise.all([fromRss(), fromTelegram()]);
    const news = buildNews([...telegram, ...rss]);

    return NextResponse.json({
      news,
      total: news.length,
      sources: { rss: RSS_FEEDS.length, telegram: TELEGRAM_CHANNELS.length },
      geolocated: news.filter((n) => n.coords).length,
      timestamp: new Date().toISOString(),
    }, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' },
    });
  } catch (error) {
    console.error('[VANTAGE] news aggregation failed:', error);
    return NextResponse.json({ news: [], total: 0, error: 'Failed to fetch intel' }, { status: 500 });
  }
}
