// The free half of Boo-lean: pattern checks that run instantly in the browser (and again on the server).
// Each rule is a smell a recruiter-tired human would notice. Positive weight = more ghost.

const GHOST = [
  { id: 'evergreen', w: 22, label: 'Evergreen requisition', why: 'They’re collecting CVs for “someday”, not filling a seat.',
    re: /\b(talent (pool|community|pipeline|network)|future (openings?|opportunit(y|ies)|requirements?|roles?)|always (looking|hiring|on the lookout)|evergreen|general application|pipeline (role|requisition)|not an? (active|immediate) (opening|requirement|vacancy))\b/gi },
  { id: 'pay', w: 35, label: 'Asks YOU to pay', why: 'Real employers never charge a fee to apply or train. This is a scam, not a ghost.',
    re: /\b((registration|training|security|processing|onboarding) (fee|deposit|charges?)|pay (a|the)? ?(fee|deposit)|refundable deposit)\b/gi },
  { id: 'mystery', w: 12, label: 'Mystery employer', why: 'No company name usually means an agency farming CVs.',
    re: /\b(confidential( company| client)?|leading (mnc|it company|company|organi[sz]ation|client)|our (esteemed |reputed )?client|reputed (company|organi[sz]ation|firm|mnc)|top mnc|fortune 500 client|well[- ]known (company|brand))\b/gi },
  { id: 'gmail', w: 10, label: 'Recruiter uses Gmail', why: 'Company hiring runs through a company domain or an ATS, not a free inbox.',
    re: /\b[\w.+-]+@(gmail|yahoo|outlook|hotmail|rediffmail)\.com\b/gi },
  { id: 'contradiction', w: 12, label: 'Entry-level with 5+ years', why: 'A “fresher” role that wants a senior’s CV is a wishlist, not a job.',
    test: (t) => /\b(fresher|entry[- ]level|graduate trainee|0\s?[-–to]+\s?[12] ?(yrs|years))\b/i.test(t) && /\b([5-9]|1\d)\s?\+?\s?(yrs|years)\b/i.test(t),
    re: /\b([5-9]|1\d)\s?\+?\s?(yrs|years)\b/gi },
  { id: 'everywhere', w: 6, label: 'Location: everywhere and nowhere', why: 'One posting for “multiple locations” is often a résumé net.',
    re: /\b(multiple|various|any|all|pan[- ]india) (locations?|cities|offices)\b/gi },
  { id: 'urgent', w: 5, label: 'Urgency theatre', why: '“Urgent” posts that stay up for months are the classic ghost.',
    re: /\b(urgent(ly)? (hiring|requirement|opening|need)|immediate joiners? (only|required|preferred)|hiring immediately|walk[- ]?in drive)\b/gi },
];

const BUZZ = /\b(rock ?star|ninja|guru|wizard|superstar|unicorn|work hard,? play hard|wear (many|multiple) hats|like a family|we are a family|fast[- ]paced|self[- ]starter|go[- ]getter|hit the ground running|dynamic (environment|individual|team)|passionate about|synergy|think outside the box)\b/gi;

const TECH = /\b(java|python|javascript|typescript|react|angular|vue|node|django|flask|spring|kotlin|swift|go|golang|rust|c\+\+|c#|\.net|php|ruby|scala|aws|azure|gcp|docker|kubernetes|terraform|jenkins|kafka|spark|hadoop|sql|mysql|postgres(ql)?|mongodb|redis|elasticsearch|graphql|tensorflow|pytorch|figma|salesforce|sap|tableau|power ?bi|linux|git)\b/gi;

const LIFE = [
  { id: 'salary', w: -15, label: 'An actual salary number', why: 'Budgeted roles publish numbers. Ghosts don’t have budgets.',
    re: /((₹|\brs\.?|\binr)\s?\d[\d,.]*(\s?(-|–|to)\s?\d[\d,.]*)?\s?(lpa|lakhs?|l|k|cr)?|\b\d{1,3}(\.\d)?\s?(-|–|to)\s?\d{1,3}(\.\d)?\s?(lpa|lakhs?)\b|\$\s?\d{2,3},?\d{3})/gi },
  { id: 'process', w: -8, label: 'Describes the interview', why: 'Someone actually designed a hiring loop for this.',
    re: /\b(interview (process|rounds?|stages?|loop)|round (1|2|3|one|two)|take[- ]home|hiring process|what to expect|next steps)\b/gi },
  { id: 'team', w: -8, label: 'Names the team', why: 'A real manager is waiting for this hire.',
    re: /\b(you('ll| will) (report|work) (to|with|closely with)|reporting to|hiring manager|team of \d+|you('ll| will) join (the|our)|our \w+ team (is|builds|owns))\b/gi },
  { id: 'deadline', w: -6, label: 'Has a deadline or start date', why: 'Deadlines mean someone is counting.',
    re: /\b(start date|joining date|apply by|application deadline|closing date|last date to apply)\b/gi },
  { id: 'weekone', w: -8, label: 'Says what you’ll actually do', why: 'Concrete first-90-days work is a strong sign of a real seat.',
    re: /\b(in your first (30|60|90) days|first (month|quarter|90 days)|you('ll| will) (build|own|ship|design|lead|launch))\b/gi },
  { id: 'reqid', w: -4, label: 'Has a requisition ID', why: 'Came from a real applicant-tracking system.',
    re: /\b(req(uisition)?\.?\s?(id|#|no\.?)|job (id|code|ref(erence)?))\s?[:#-]?\s?[a-z-]*\d{3,}/gi },
];

function allMatches(re, text) {
  const out = [];
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(text)) && out.length < 6) { out.push({ i: m.index, n: m[0].length, text: m[0] }); if (!m[0].length) re.lastIndex++; }
  return out;
}

export const TIERS = [
  { max: 24, key: 'alive', name: 'Flesh & Blood', line: 'This one has a pulse. Apply, and follow up in a week.' },
  { max: 49, key: 'faint', name: 'Faintly Haunted', line: 'Probably real, possibly stale. Apply, but don’t refresh your inbox.' },
  { max: 74, key: 'spooky', name: 'Spooky Season', line: 'Smells like a CV-collection drive. Apply only with a referral.' },
  { max: 100, key: 'poltergeist', name: 'Full Poltergeist', line: 'Nobody is getting hired here. Your CV will float in the void.' },
];
export const tierOf = (score) => TIERS.find((t) => score <= t.max);

export function scan(jd, { days = null, reposted = false } = {}) {
  const text = String(jd || '');
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const ghost = [], life = [];

  for (const r of GHOST) {
    if (r.test && !r.test(text)) continue;
    const hits = allMatches(r.re, text);
    if (hits.length) ghost.push({ id: r.id, label: r.label, why: r.why, w: r.w, hits });
  }
  const buzz = allMatches(BUZZ, text);
  if (buzz.length >= 2) ghost.push({ id: 'buzz', label: 'Buzzword ectoplasm', why: `${buzz.length} clichés and counting. Copy-pasted, not written.`, w: Math.min(12, buzz.length * 3), hits: buzz });

  const money = /(₹|\brs\.?|\binr\b|\blpa\b|\bctc\b|salary|compensation|stipend|\$|per annum|lakh|pay range|package)/i.test(text);
  if (!money) ghost.push({ id: 'nosalary', label: 'Salary: ¯\\_(ツ)_/¯', why: 'No pay mentioned anywhere. Budgets make jobs real.', w: 10, hits: [] });
  if (words < 120) ghost.push({ id: 'thin', label: 'Suspiciously thin', why: `Only ${words} words. Real roles need more explaining.`, w: 12, hits: [] });
  if (!/(responsibilit|you will|you'll|what you('ll| will) do|the role|duties|day[- ]to[- ]day|key result|your impact)/i.test(text))
    ghost.push({ id: 'nojob', label: 'No actual job described', why: 'Lists wants, never says what the work is.', w: 8, hits: [] });
  const tech = new Set((text.match(TECH) || []).map((s) => s.toLowerCase()));
  if (tech.size > 16) ghost.push({ id: 'sink', label: 'Wants a whole department', why: `${tech.size} different technologies for one hire.`, w: 8, hits: [] });

  if (days != null && days > 30) {
    const w = days > 90 ? 30 : days > 60 ? 22 : 12;
    ghost.push({ id: 'age', label: `Haunting for ${days} days`, why: 'Most real roles close within a month.', w, hits: [] });
  }
  if (reposted) ghost.push({ id: 'repost', label: 'Déjà boo', why: 'The same post keeps coming back from the dead.', w: 20, hits: [] });

  for (const r of LIFE) {
    const hits = allMatches(r.re, text);
    if (hits.length) life.push({ id: r.id, label: r.label, why: r.why, w: r.w, hits });
  }

  const raw = 30 + ghost.reduce((a, g) => a + g.w, 0) + life.reduce((a, g) => a + g.w, 0);
  const score = Math.max(0, Math.min(100, Math.round(raw)));
  return { score, words, ghost, life };
}
