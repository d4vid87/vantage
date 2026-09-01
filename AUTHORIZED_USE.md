# Authorized Use

Vantage aggregates open sources. Most of it is passive: it reads public feeds
(USGS, NASA, NOAA, transport authorities, news RSS) and draws them on a map.
That part is safe to run anywhere.

**The RECON toolkit is different.** Port scanning, subdomain enumeration, TLS
inspection and vulnerability probing send real traffic at real infrastructure.
In many jurisdictions doing that to a system you do not own or have permission
to test is a criminal offence, regardless of intent or impact.

## Ground rules

1. **RECON ships disabled.** Every scanner route returns `503` until you set
   `VANTAGE_RECON_ENABLED=1`. That is a deliberate speed bump, not an oversight.
2. **Only scan what you are authorized to scan** — assets you own, or assets
   covered by a written engagement (a signed statement of work, a bug bounty
   scope, or an internal authorization from the asset owner).
3. **Everything is logged.** Each attempt — permitted or blocked — is written to
   the `recon_audit` table with tool, target, actor IP, outcome and timestamp.
   Read it back with `GET /api/recon-audit`. If you are ever asked to account
   for traffic from your instance, this is the record you produce.
4. **Internal ranges are refused.** `src/lib/ssrf-guard.ts` rejects loopback,
   RFC1918, CGNAT, link-local (including cloud metadata at `169.254.169.254`),
   multicast and reserved IPv6, and resolves hostnames before deciding so a DNS
   record pointing at a reserved range is blocked too. Do not remove this guard
   to "scan your own LAN" from an internet-exposed instance.
5. **Dangerous scan types are not exposed.** Full 65k-port sweeps, banner
   grabbing and traceroute are deliberately absent from the allowed set.

## Passive OSINT is still collection

WHOIS, certificate transparency, breach lookups, Telegram channel scraping and
sanctions screening do not touch the target, but they do build a profile of
people and organisations. Depending on where you and your subjects are, GDPR
and comparable regimes may apply to what you store and for how long. The
dossier export exists to make that record explicit and reviewable, not to make
it feel official.

## If you are running this publicly

- Leave `VANTAGE_RECON_ENABLED` unset.
- Set `VANTAGE_TICK_SECRET` so strangers cannot drive your alert evaluator.
- Put the instance behind authentication. Vantage assumes a single trusted
  operator; it has no user model of its own.

## Not for

Vantage is built for defensive situational awareness and authorized security
work. It is not built for stalking, harassment, unauthorized intrusion, or
targeting individuals. If that is what you need it for, you are on your own
and you are not welcome here.
