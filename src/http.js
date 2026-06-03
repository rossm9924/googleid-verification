// Small helpers shared by the Vercel serverless functions.
import { PRODUCT_FIELDS } from './serpapi.js';

// Vercel parses JSON bodies automatically, but tolerate a raw string just in case.
export function readBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return req.body;
}

// Keep only known product fields, trimmed.
export function cleanFields(fields) {
  const clean = {};
  for (const { key } of PRODUCT_FIELDS) {
    if (fields && typeof fields[key] === 'string') clean[key] = fields[key].trim();
  }
  return clean;
}
