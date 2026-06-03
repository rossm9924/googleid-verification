import { PRODUCT_FIELDS } from '../src/serpapi.js';

export default function handler(req, res) {
  res.status(200).json({
    fields: PRODUCT_FIELDS,
    serpapiConfigured: Boolean(process.env.SERPAPI_KEY),
  });
}
