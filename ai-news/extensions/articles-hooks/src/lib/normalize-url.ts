// source_url normalization — deployment-plan §4.3.6 (arch review C2).
// Prevents the same article being ingested twice due to utm_/fbclid/scheme/case/slash diffs.
//
// Rules (applied in order):
//   1. lowercase hostname            Example.COM -> example.com
//   2. force scheme to https://      http:// -> https://
//   3. strip fragment                url#section -> url
//   4. strip tracking query params   ^(utm_|fbclid|gclid|ref_|aff_)
//   5. strip trailing slash          /article/ -> /article  (root "/" is preserved)

const TRACKING_PARAM = /^(utm_|fbclid|gclid|ref_|aff_)/i;

export class InvalidUrlError extends Error {
  constructor(public readonly value: string) {
    super(`Invalid source_url: ${JSON.stringify(value)}`);
    this.name = 'InvalidUrlError';
  }
}

export function normalizeSourceUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new InvalidUrlError(raw);
  }

  // Rule 2: force https. (URL already lowercases hostname for rule 1.)
  url.protocol = 'https:';

  // Rule 3: drop fragment.
  url.hash = '';

  // Rule 4: drop tracking params (keep everything else, original order).
  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAM.test(key)) url.searchParams.delete(key);
  }

  // Rule 1: host is already lowercased by the URL parser; keep any explicit port.
  const host = url.host;

  // Rule 5: strip a single trailing slash, but never reduce the root to empty.
  let path = url.pathname;
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);

  const query = url.searchParams.toString();
  return `https://${host}${path}${query ? `?${query}` : ''}`;
}
