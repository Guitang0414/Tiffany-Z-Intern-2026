import { describe, it, expect } from 'vitest';
import { normalizeSourceUrl, InvalidUrlError } from './normalize-url';

describe('normalizeSourceUrl', () => {
  it('rule 1: lowercases the hostname only (path case preserved)', () => {
    expect(normalizeSourceUrl('https://Example.COM/My-Article')).toBe(
      'https://example.com/My-Article'
    );
  });

  it('rule 2: forces http -> https', () => {
    expect(normalizeSourceUrl('http://example.com/a')).toBe('https://example.com/a');
  });

  it('rule 3: strips the fragment', () => {
    expect(normalizeSourceUrl('https://example.com/a#section-2')).toBe('https://example.com/a');
  });

  it('rule 4: strips utm_/fbclid/gclid/ref_/aff_ params, keeps the rest', () => {
    expect(
      normalizeSourceUrl('https://example.com/a?utm_source=x&id=42&fbclid=abc&gclid=y&ref_src=z&aff_id=1')
    ).toBe('https://example.com/a?id=42');
  });

  it('rule 4: keeps non-tracking params that merely contain those substrings', () => {
    // "referrer" / "category" do not start with the tracking prefixes.
    expect(normalizeSourceUrl('https://example.com/a?referrer=x&category=politics')).toBe(
      'https://example.com/a?referrer=x&category=politics'
    );
  });

  it('rule 5: strips a single trailing slash', () => {
    expect(normalizeSourceUrl('https://example.com/article/')).toBe('https://example.com/article');
  });

  it('rule 5: preserves the root slash', () => {
    expect(normalizeSourceUrl('https://example.com/')).toBe('https://example.com/');
  });

  it('preserves an explicit port', () => {
    expect(normalizeSourceUrl('http://Example.com:8080/a/')).toBe('https://example.com:8080/a');
  });

  it('applies all rules together and is idempotent', () => {
    const messy = 'HTTP://News.Example.COM/Story/?utm_campaign=spring&id=7#top';
    const clean = 'https://news.example.com/Story?id=7';
    expect(normalizeSourceUrl(messy)).toBe(clean);
    expect(normalizeSourceUrl(clean)).toBe(clean); // idempotent
  });

  it('trims surrounding whitespace before parsing', () => {
    expect(normalizeSourceUrl('  https://example.com/a  ')).toBe('https://example.com/a');
  });

  it('throws InvalidUrlError on garbage input', () => {
    expect(() => normalizeSourceUrl('not a url')).toThrow(InvalidUrlError);
  });
});
