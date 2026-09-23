# Boo-lean

**Is this job real, or just haunting LinkedIn?** Paste a job description and get a 0–100 ghost score.

- **The instruments** (`public/signals.js`) are free regex checks that run instantly in the browser: evergreen "talent pool" language, missing salary, mystery employers, Gmail recruiters, "fresher with 6+ years", buzzwords, stale or reposted posts, and pay-to-apply scams. Signs of life (salary numbers, named team, interview process, requisition ID) pull the score down.
- **The medium** (`api/haunt.js`) is a cheap AI model that reads the post and must quote it word for word. Any quote that isn't in the JD is dropped server-side, so it can't invent evidence. Final score = 55% medium + 45% instruments.
- **The scene:** a ghost over an empty office chair. Real jobs get a solid ghost wearing a tie and an "INTERVIEW THURSDAY" monitor; poltergeists flicker, spin the chair and show "HIRING SINCE 2019".

`POST /api/haunt { jd, days?, reposted?, turnstile? }`: guarded by origin check, per-IP limit, Turnstile, daily cap and a cache.
