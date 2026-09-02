/**
 * Country name → ISO 3166-1 alpha-2.
 *
 * Feeds like WHO Disease Outbreak News name countries in prose rather than
 * codes, and spell them inconsistently ("Democratic Republic of the Congo",
 * "DR Congo", "DRC"), so the lookup is normalised and alias-rich rather than
 * exact-match.
 */

const NAMES: Record<string, string> = {
  afghanistan: 'AF', albania: 'AL', algeria: 'DZ', angola: 'AO', argentina: 'AR',
  armenia: 'AM', australia: 'AU', austria: 'AT', azerbaijan: 'AZ', bahrain: 'BH',
  bangladesh: 'BD', belarus: 'BY', belgium: 'BE', bhutan: 'BT', bolivia: 'BO',
  'bosnia and herzegovina': 'BA', bosnia: 'BA', brazil: 'BR', brunei: 'BN',
  bulgaria: 'BG', 'burkina faso': 'BF', cambodia: 'KH', cameroon: 'CM', canada: 'CA',
  chile: 'CL', china: 'CN', colombia: 'CO', 'costa rica': 'CR', croatia: 'HR',
  cuba: 'CU', cyprus: 'CY', czechia: 'CZ', 'czech republic': 'CZ',
  'democratic republic of the congo': 'CD', 'democratic republic of congo': 'CD',
  'dr congo': 'CD', drc: 'CD', 'congo, democratic republic': 'CD',
  congo: 'CG', 'republic of the congo': 'CG',
  denmark: 'DK', 'dominican republic': 'DO', ecuador: 'EC', egypt: 'EG',
  'el salvador': 'SV', estonia: 'EE', ethiopia: 'ET', fiji: 'FJ', finland: 'FI',
  france: 'FR', gabon: 'GA', georgia: 'GE', germany: 'DE', ghana: 'GH', greece: 'GR',
  guatemala: 'GT', guinea: 'GN', honduras: 'HN', 'hong kong': 'HK', hungary: 'HU',
  iceland: 'IS', india: 'IN', indonesia: 'ID', iran: 'IR',
  'islamic republic of iran': 'IR', iraq: 'IQ', ireland: 'IE', israel: 'IL',
  italy: 'IT', "cote d'ivoire": 'CI', 'ivory coast': 'CI', "côte d'ivoire": 'CI',
  jamaica: 'JM', japan: 'JP', jordan: 'JO', kazakhstan: 'KZ', kenya: 'KE',
  kuwait: 'KW', kyrgyzstan: 'KG', laos: 'LA', latvia: 'LV', lebanon: 'LB',
  libya: 'LY', lithuania: 'LT', luxembourg: 'LU', macao: 'MO', madagascar: 'MG',
  malaysia: 'MY', maldives: 'MV', mali: 'ML', malta: 'MT', mauritania: 'MR',
  mexico: 'MX', moldova: 'MD', mongolia: 'MN', montenegro: 'ME', morocco: 'MA',
  mozambique: 'MZ', myanmar: 'MM', burma: 'MM', nepal: 'NP', netherlands: 'NL',
  'new zealand': 'NZ', nicaragua: 'NI', niger: 'NE', nigeria: 'NG',
  'north macedonia': 'MK', macedonia: 'MK', norway: 'NO', oman: 'OM', pakistan: 'PK',
  panama: 'PA', 'papua new guinea': 'PG', paraguay: 'PY', peru: 'PE',
  philippines: 'PH', poland: 'PL', portugal: 'PT', 'puerto rico': 'PR', qatar: 'QA',
  romania: 'RO', russia: 'RU', 'russian federation': 'RU', rwanda: 'RW',
  'saudi arabia': 'SA', senegal: 'SN', serbia: 'RS', singapore: 'SG',
  slovakia: 'SK', slovenia: 'SI', somalia: 'SO', 'south africa': 'ZA',
  'south korea': 'KR', 'republic of korea': 'KR', korea: 'KR',
  'south sudan': 'SS', spain: 'ES', 'sri lanka': 'LK', sudan: 'SD', sweden: 'SE',
  switzerland: 'CH', syria: 'SY', 'syrian arab republic': 'SY', taiwan: 'TW',
  tajikistan: 'TJ', tanzania: 'TZ', 'united republic of tanzania': 'TZ',
  thailand: 'TH', 'trinidad and tobago': 'TT', tunisia: 'TN', turkey: 'TR',
  turkiye: 'TR', türkiye: 'TR', turkmenistan: 'TM', uganda: 'UG', ukraine: 'UA',
  'united arab emirates': 'AE', uae: 'AE',
  'united kingdom': 'GB', uk: 'GB', britain: 'GB', 'great britain': 'GB',
  'united states': 'US', 'united states of america': 'US', usa: 'US', us: 'US',
  uruguay: 'UY', uzbekistan: 'UZ', venezuela: 'VE', vietnam: 'VN',
  'viet nam': 'VN', yemen: 'YE', zambia: 'ZM', zimbabwe: 'ZW',
  palestine: 'PS', 'occupied palestinian territory': 'PS',
};

export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/^the\s+/, '')
    .replace(/\s*\(.*?\)\s*/g, ' ')
    .replace(/[.]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** ISO2 for a country name, or null when it is unknown or not a country. */
export function isoForName(name: string | null | undefined): string | null {
  if (!name) return null;
  const n = normalizeName(name);
  return NAMES[n] ?? null;
}

/**
 * Pull country names out of a headline like
 * "Ebola disease caused by Bundibugyo virus - Democratic Republic of the Congo".
 * WHO uses both " - " and ", " as the separator and joins co-affected countries
 * with "&" or "and". Non-country scopes ("Global", "Multi-locations") yield [].
 */
export function countriesFromTitle(title: string): string[] {
  if (!title) return [];
  const tail = title.split(/\s+[-–]\s+|,\s+/).slice(1).join(', ');
  // The separators must be space-delimited: an unanchored "and" matches inside
  // "Uganda" and shreds the country name into "Ug" and "a".
  const candidates = (tail || title).split(/\s+(?:&|and)\s+|,\s*/);
  const out: string[] = [];
  for (const c of candidates) {
    const iso = isoForName(c);
    if (iso && !out.includes(iso)) out.push(iso);
  }
  return out;
}

/**
 * One display name per ISO code — the FIRST alias in the table wins, which is
 * the canonical spelling by construction. Used by the command palette.
 */
export function canonicalCountries(): { iso: string; name: string }[] {
  const seen = new Map<string, string>();
  for (const [name, iso] of Object.entries(NAMES)) {
    if (!seen.has(iso)) seen.set(iso, name);
  }
  return [...seen.entries()].map(([iso, name]) => ({ iso, name }));
}
