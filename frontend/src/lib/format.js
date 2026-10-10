// Lookup tables and small helpers shared by the Touchstone components.

// The SerpApi engine behind each agent tool (search_log records these engine ids).
export const TOOL_ENGINE = {
  web_search: "google",
  news_search: "google_news",
  maps_search: "google_maps",
  videos_search: "youtube",
  google_jobs_search: "google_jobs",
};
export const ENGINE_NAME = {
  google: "Google Search",
  google_news: "Google News",
  google_maps: "Google Maps",
  youtube: "YouTube",
  google_jobs: "Google Jobs",
};
export const ENGINE_TOOL = Object.fromEntries(
  Object.entries(TOOL_ENGINE).map(([tool, engine]) => [engine, tool]),
);
export const RULE_CHECK = { compare_domains: "Email domain check", text_flags: "Fee & deadline scan" };

// Four agents, each with a gemstone colour shared by the pipeline and the live trace.
export const AGENTS = [
  { key: "extractor", name: "Claim Extractor", gem: "Pearl",
    blurb: "Turns the message into checkable claims. Rule checks flag fees, UPI IDs and deadlines." },
  { key: "investigator", name: "Investigator", gem: "Lapis",
    blurb: "Finds the official site, fraud warnings, the real office on Maps and the role on Google Jobs." },
  { key: "skeptic", name: "Skeptic", gem: "Jade",
    blurb: "Hunts for proof the offer is genuine, so real employers aren't wrongly accused." },
  { key: "judge", name: "Judge", gem: "Gold",
    blurb: "Weighs the evidence into a sourced verdict, with guardrails the AI can't override." },
];
export const STAGE_AGENT = { 1: "extractor", 2: "investigator", 3: "skeptic", 4: "judge" };
const AGENT_ALIAS = { guardrail: "judge" };

export function agentKey(name) {
  const key = String(name || "system").toLowerCase();
  return AGENT_ALIAS[key] || key;
}
export function agentLabel(name) {
  const key = String(name || "system").toLowerCase();
  return key.charAt(0).toUpperCase() + key.slice(1);
}

export const VERDICTS = {
  LIKELY_SCAM: { label: "Likely scam", note: "Do not pay. Do not share documents." },
  SUSPICIOUS: { label: "Suspicious", note: "Verify before you reply." },
  NOT_ENOUGH_EVIDENCE: { label: "Not enough evidence", note: "Live search found too little to judge." },
  LIKELY_LEGIT: { label: "Likely legit", note: "Checks out against live search." },
};

export function safeUrl(u) {
  try {
    const url = new URL(u);
    return /^https?:$/.test(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

export function shortUrl(u) {
  try {
    const url = new URL(u);
    return url.hostname.replace(/^www\./, "") + (url.pathname.length > 1 ? url.pathname : "");
  } catch {
    return u;
  }
}

// Search tools return Markdown tables; turn them into a readable one-line preview.
export function cleanPreview(text) {
  const t = String(text || "")
    .replace(/^#+\s*/gm, "")
    .replace(/\|?\s*-{3,}\s*/g, " ")
    .replace(/\s*\|\s*/g, " · ")
    .replace(/(·\s*){2,}/g, "· ")
    .replace(/\s+/g, " ")
    .replace(/^[\s·]+/, "")
    .trim();
  return t.length > 150 ? `${t.slice(0, 150)}…` : t;
}

export function callDetail(args = {}) {
  const { query, ...rest } = args;
  const extras = Object.entries(rest).map(([k, v]) => `${k}: ${v}`);
  return query == null ? extras.join(" · ") : [`"${query}"`, ...extras].join(" · ");
}

// A source is a web URL (clickable) or "tool:<name>": a check that ran without a web page.
export function parseSource(src) {
  const raw = String(src || "").trim();
  const tool = /^tool:\s*([\w-]+)/i.exec(raw);
  if (tool) {
    const name = tool[1].toLowerCase();
    const engine = TOOL_ENGINE[name];
    return {
      kind: "rule", raw,
      prefix: engine ? "SerpApi" : "Rule check",
      label: engine ? ENGINE_NAME[engine] : RULE_CHECK[name] || name.replace(/_/g, " "),
    };
  }
  const url = safeUrl(raw);
  if (url && CHAT_INVITE.test(new URL(url).hostname)) {
    // The offer's own WhatsApp/Telegram invite: show it as evidence, but never make it clickable.
    return { kind: "rule", raw, prefix: "From the message", label: "chat group invite (not linked)" };
  }
  return url ? { kind: "link", raw, url, label: shortUrl(url) } : null;
}
const CHAT_INVITE = /(^|\.)(chat\.whatsapp\.com|wa\.me|t\.me|telegram\.me)$/i;

// Per-engine counts for the "Powered by SerpApi" panel, built from search_log.
export function engineUsage(log = []) {
  const byEngine = new Map();
  let live = 0;
  let cached = 0;
  let skipped = 0;
  for (const s of log) {
    const e = byEngine.get(s.engine) || { engine: s.engine, total: 0, live: 0, cached: 0, skipped: 0 };
    e.total++;
    if (s.status === "cached") { e.cached++; cached++; }
    else if (s.status === "live" || s.status === "no-results") { e.live++; live++; }
    else { e.skipped++; skipped++; } // budget-blocked or error: never reached SerpApi
    byEngine.set(s.engine, e);
  }
  const engines = [...byEngine.values()].sort((a, b) => b.total - a.total);
  return { engines, live, cached, skipped, total: log.length };
}
