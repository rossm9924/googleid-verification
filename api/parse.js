import { parseText } from '../src/parse.js';
import { readBody } from '../src/http.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const { text } = readBody(req);
    if (!text || !String(text).trim()) {
      return res.status(400).json({ error: 'Paste some text to detect fields from.' });
    }
    const result = await parseText(String(text), { apiKey: process.env.ANTHROPIC_API_KEY });
    res.status(200).json(result);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'Internal server error' });
  }
}
