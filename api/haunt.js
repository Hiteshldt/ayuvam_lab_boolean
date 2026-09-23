// POST /api/haunt { jd, days?, reposted?, turnstile? } → the medium's reading of a job description.
// Guarded: origin check → per-IP limit → Turnstile → daily cap → cache. Quotes are verified against the JD.
import { guard, hasAI, chat, cacheGet, cacheSet, hash, deny } from '../lib/guard.js';
import { scan, tierOf } from '../public/signals.js';

const MAX_CHARS = 9000;

const SYSTEM = `You are "the medium" in Boo-lean, a ghost-job detector. A ghost job is a posting with no real intent to hire soon:
evergreen talent pools, stale reposts, vague wishlists, agencies harvesting CVs. You also flag outright scams.
Judge only from the text. Be fair: plenty of real jobs are badly written. Quote the JD exactly when you cite it.
Voice: dry, witty, a little spooky, never cruel. Return JSON only.`;

function prompt(jd, days, reposted, heur) {
  return `Job description:
"""
${jd}
"""
Days since posted: ${days ?? 'unknown'}. Seen reposted before: ${reposted ? 'yes' : 'no'}.
Our pattern scanner already found: ${heur.ghost.map((g) => g.label).join('; ') || 'nothing'} | signs of life: ${heur.life.map((g) => g.label).join('; ') || 'none'}.

Return:
{"score": 0-100 (100 = certainly a ghost),
 "verdict": "a punny 3-7 word title for this job's afterlife",
 "reading": "2 sentences on why, in the medium's voice",
 "flags": [{"quote": "exact words copied from the JD, max 12 words", "why": "max 16 words"}],   // up to 4
 "life": [{"quote": "exact words copied from the JD, max 12 words", "why": "max 16 words"}],    // up to 3
 "advice": "one practical sentence: apply / apply with referral / skip, and why"}`;
}

const inJd = (jd) => {
  const lower = jd.toLowerCase().replace(/\s+/g, ' ');
  return (q) => typeof q === 'string' && q.trim().length > 3 && lower.includes(q.toLowerCase().replace(/\s+/g, ' ').trim());
};
const str = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');

export default async function handler(req, res) {
  const ok = await guard(req, res, {
    name: 'boo', perIp: Number(process.env.RATE_PER_IP || 6), windowSec: 3600, daily: Number(process.env.DAILY_CAP || 300),
    msgIp: 'The medium needs a breather. You get 6 readings an hour.',
  });
  if (!ok) return;

  const jd = str(req.body?.jd, MAX_CHARS + 1);
  if (jd.length < 150) return deny(res, 400, 'Paste the whole job description. Ghosts hide in the details.');
  if (jd.length > MAX_CHARS) return deny(res, 400, `That’s a novel. Keep it under ${MAX_CHARS} characters.`);
  const d = Number(req.body?.days);
  const days = Number.isFinite(d) && d >= 0 && d < 3650 ? Math.round(d) : null;
  const reposted = req.body?.reposted === true;

  const heur = scan(jd, { days, reposted });
  if (!hasAI()) return res.json({ score: heur.score, tier: tierOf(heur.score), heur, ai: null, note: 'AI is switched off on this server.' });

  const key = `boo:v1:${hash(jd + '|' + days + '|' + reposted)}`;
  let ai = await cacheGet(key);
  if (!ai) {
    try {
      const raw = await chat({ system: SYSTEM, user: prompt(jd, days, reposted, heur), maxTokens: 700, temperature: 0.7 });
      const real = inJd(jd);
      ai = {
        score: Math.max(0, Math.min(100, Math.round(Number(raw.score) || heur.score))),
        verdict: str(raw.verdict, 70),
        reading: str(raw.reading, 360),
        advice: str(raw.advice, 220),
        // Only keep quotes that really exist in the JD, so the model can't invent evidence.
        flags: (Array.isArray(raw.flags) ? raw.flags : []).filter((f) => real(f?.quote)).slice(0, 4).map((f) => ({ quote: str(f.quote, 120), why: str(f.why, 140) })),
        life: (Array.isArray(raw.life) ? raw.life : []).filter((f) => real(f?.quote)).slice(0, 3).map((f) => ({ quote: str(f.quote, 120), why: str(f.why, 140) })),
      };
      await cacheSet(key, ai, 7 * 86400);
    } catch (e) {
      console.error('medium failed:', e.message);
      return res.json({ score: heur.score, tier: tierOf(heur.score), heur, ai: null, note: 'The medium lost the signal. Here’s what the instruments say.' });
    }
  }
  const score = Math.round(ai.score * 0.55 + heur.score * 0.45);
  res.json({ score, tier: tierOf(score), heur, ai });
}
