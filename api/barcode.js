import { lookupBarcode } from '../src/barcode.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const gtin = req.query.gtin || req.query.barcode;
    const result = await lookupBarcode(gtin, { apiKey: process.env.BARCODELOOKUP_KEY });
    res.status(200).json(result);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'Internal server error' });
  }
}
