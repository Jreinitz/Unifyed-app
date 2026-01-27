import { nanoid, customAlphabet } from 'nanoid';

// Standard nanoid for UUIDs and general IDs
export function generateId(size = 21): string {
  return nanoid(size);
}

// Short link code generator (URL-safe, easy to type)
const shortLinkAlphabet = '0123456789abcdefghijklmnopqrstuvwxyz';
const generateShortCode = customAlphabet(shortLinkAlphabet, 8);

export function generateShortLinkCode(): string {
  return generateShortCode();
}

// Slug generator (for replay URLs)
const slugAlphabet = '0123456789abcdefghijklmnopqrstuvwxyz';
const generateSlugId = customAlphabet(slugAlphabet, 10);

export function generateSlug(title?: string): string {
  if (title) {
    // Create slug from title + random suffix
    const baseSlug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 30);
    return `${baseSlug}-${generateSlugId().slice(0, 6)}`;
  }
  return generateSlugId();
}

// Idempotency key generator
export function generateIdempotencyKey(): string {
  return nanoid(32);
}

// Visitor ID generator (for anonymous tracking)
export function generateVisitorId(): string {
  return nanoid(16);
}
