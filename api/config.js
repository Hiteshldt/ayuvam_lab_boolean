// GET /api/config → public, non-secret settings the page needs (the Turnstile site key).
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'public, s-maxage=300');
  res.json({ turnstile: process.env.TURNSTILE_SITE_KEY || null, ai: !!process.env.OPENROUTER_API_KEY });
}
