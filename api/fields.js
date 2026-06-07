import { PRODUCT_FIELDS } from '../src/serpapi.js';
import { storageConfigured } from '../src/supabase.js';

export default function handler(req, res) {
  res.status(200).json({
    fields: PRODUCT_FIELDS,
    serpapiConfigured: Boolean(process.env.SERPAPI_KEY),
    barcodeConfigured: Boolean(process.env.BARCODELOOKUP_KEY),
    marketplaceConfigured: Boolean(process.env.SERPAPI_KEY),
    synccentricConfigured: Boolean(process.env.SYNCCENTRIC_API_KEY),
    storageConfigured: storageConfigured(),
    aiParseConfigured: Boolean(process.env.ANTHROPIC_API_KEY),
  });
}
