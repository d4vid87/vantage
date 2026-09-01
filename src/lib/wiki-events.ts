/**
 * VANTAGE — Wikipedia current events digest (Wikimedia featured feed).
 *
 * An editorially curated daily summary, useful as a sanity check against a
 * firehose of individual headlines.
 */

export interface WikiEvent {
  id: string;
  text: string;
  links: { title: string; url: string }[];
  url: string;
  date: string;
  source: string;
}

interface NewsBlock {
  story?: string;
  links?: { titles?: { normalized?: string }; title?: string; content_urls?: { desktop?: { page?: string } } }[];
}

/** The `story` field is HTML with inline links. */
export function stripHtml(html: string): string {
  return (html || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function mapWikiNews(news: NewsBlock[] | null | undefined, date: string): WikiEvent[] {
  if (!Array.isArray(news)) return [];
  const out: WikiEvent[] = [];

  news.forEach((n, i) => {
    const text = stripHtml(n?.story ?? '');
    if (!text) return;
    const links = (n.links ?? []).slice(0, 6).map((l) => ({
      title: l?.titles?.normalized || l?.title || '',
      url: l?.content_urls?.desktop?.page || '',
    })).filter((l) => l.title);

    out.push({
      id: `wiki-${date}-${i}`,
      text,
      links,
      url: links[0]?.url || 'https://en.wikipedia.org/wiki/Portal:Current_events',
      date,
      source: 'Wikipedia Current Events',
    });
  });

  return out;
}
