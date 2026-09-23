// Loads Cloudflare Turnstile only when the server has a site key, and hands out one fresh token per request.
let widget = null, token = null, waiters = [];

export async function initTurnstile(mountId) {
  const cfg = await fetch('/api/config').then((r) => r.json()).catch(() => ({}));
  if (!cfg.turnstile) return cfg;
  await new Promise((ok, fail) => {
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.onload = ok; s.onerror = fail;
    document.head.appendChild(s);
  });
  widget = window.turnstile.render('#' + mountId, {
    sitekey: cfg.turnstile, appearance: 'interaction-only',
    callback: (t) => { token = t; waiters.splice(0).forEach((w) => w(t)); },
    'expired-callback': () => { token = null; },
  });
  return cfg;
}

export async function getToken() {
  if (widget === null) return null;
  const t = token || await new Promise((ok) => { waiters.push(ok); setTimeout(() => ok(null), 10000); });
  token = null;
  window.turnstile.reset(widget);
  return t;
}
