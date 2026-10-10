// Parakh frontend: streams the investigation over SSE and renders the evidence.
const $ = (id) => document.getElementById(id);
const els = {
  form: $("form"), offer: $("offer"), sender: $("sender"), budget: $("budget"), budgetOut: $("budgetOut"),
  go: $("go"), note: $("formNote"), trace: $("trace"), traceCount: $("traceCount"), pipeline: $("pipeline"),
  results: $("results"),
};

const VERDICT_LABEL = {
  LIKELY_SCAM: "Likely scam", SUSPICIOUS: "Suspicious",
  NOT_ENOUGH_EVIDENCE: "Not enough evidence", LIKELY_LEGIT: "Likely legit",
};
const VERDICT_EYEBROW = {
  LIKELY_SCAM: "Do not pay. Do not share documents.", SUSPICIOUS: "Verify before you reply",
  NOT_ENOUGH_EVIDENCE: "Search evidence was thin", LIKELY_LEGIT: "Checks out against live search",
};

// ── helpers ────────────────────────────────────────────────────────────────
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v; else node.setAttribute(k, v);
  }
  for (const c of children) if (c != null) node.append(c instanceof Node ? c : String(c));
  return node;
}
function safeUrl(u) {
  try { const url = new URL(u); return /^https?:$/.test(url.protocol) ? url.href : null; } catch { return null; }
}
function shortUrl(u) {
  try { const url = new URL(u); return url.hostname.replace(/^www\./, "") + (url.pathname.length > 1 ? url.pathname : ""); }
  catch { return u; }
}
// Search tools return Markdown tables; turn them into a readable one-line preview.
function cleanPreview(text) {
  const t = String(text || "")
    .replace(/^#+\s*/gm, "")
    .replace(/\|?\s*-{3,}\s*/g, " ")
    .replace(/\s*\|\s*/g, " · ")
    .replace(/(·\s*){2,}/g, "· ")
    .replace(/\s+/g, " ")
    .replace(/^[\s·]+/, "")
    .trim();
  return t.length > 140 ? t.slice(0, 140) + "…" : t;
}
function fmtArgs(args) {
  return Object.entries(args || {}).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(", ");
}

// ── config & samples ───────────────────────────────────────────────────────
let CONFIG = { max_budget: 16 };
fetch("/api/config").then((r) => r.json()).then((cfg) => {
  CONFIG = cfg;
  els.budget.max = cfg.max_budget;
  if (+els.budget.value > cfg.max_budget) els.budget.value = cfg.max_budget;
  els.budgetOut.textContent = els.budget.value;
  if (!cfg.ready) setNote("This server is missing its API keys, so investigations can't run.");
  else if (cfg.public) setNote(`Public demo: ${cfg.daily_limit} investigations per day.`, true);
}).catch(() => {});

els.budget.addEventListener("input", () => (els.budgetOut.textContent = els.budget.value));
document.querySelectorAll("[data-sample]").forEach((btn) =>
  btn.addEventListener("click", async () => {
    const r = await fetch(`/api/samples/${btn.dataset.sample}`);
    if (r.ok) { els.offer.value = (await r.json()).text; els.offer.focus(); }
  }));

function setNote(msg, info = false) { els.note.textContent = msg; els.note.classList.toggle("info", info); }

// ── live trace ─────────────────────────────────────────────────────────────
let traceRows = 0, searches = 0;
function trace(cls, ...parts) {
  if (traceRows === 0) els.trace.replaceChildren();
  traceRows++;
  els.trace.append(el("div", { class: `row ${cls}` }, ...parts));
  els.trace.scrollTop = els.trace.scrollHeight;
}
function setStage(n) {
  els.pipeline.querySelectorAll("li").forEach((li) => {
    const s = +li.dataset.stage;
    li.classList.toggle("done", s < n);
    li.classList.toggle("active", s === n);
  });
}

// ── investigation ──────────────────────────────────────────────────────────
els.form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const offer = els.offer.value.trim();
  if (offer.length < 20) return setNote("Paste the full offer message (at least a couple of lines).");

  setNote("");
  els.go.disabled = true; els.go.classList.add("loading");
  els.go.querySelector(".btn-label").textContent = "Investigating…";
  els.results.hidden = true;
  els.trace.replaceChildren(); traceRows = 0; searches = 0;
  els.traceCount.textContent = "running";
  setStage(1);
  document.getElementById("how").scrollIntoView({ behavior: "smooth", block: "nearest" });

  const state = {};
  try {
    const resp = await fetch("/api/investigate", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ offer, sender: els.sender.value.trim(), budget: +els.budget.value }),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || err.detail?.[0]?.msg || `Server error ${resp.status}`);
    }
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf("\n\n")) >= 0) {
        const chunk = buf.slice(0, idx); buf = buf.slice(idx + 2);
        const line = chunk.split("\n").find((l) => l.startsWith("data: "));
        if (line) handle(JSON.parse(line.slice(6)), state);
      }
    }
    if (!state.verdict) throw new Error(state.error || "The investigation ended without a verdict.");
    setStage(5);
    render(state);
  } catch (err) {
    setNote(err.message);
    trace("warn", `✕ ${err.message}`);
    setStage(0);
  } finally {
    els.go.disabled = false; els.go.classList.remove("loading");
    els.go.querySelector(".btn-label").textContent = "Investigate this offer";
    els.traceCount.textContent = `${searches} search${searches === 1 ? "" : "es"}`;
  }
});

function handle(ev, state) {
  switch (ev.type) {
    case "phase": {
      const m = /^(\d)\/4/.exec(ev.name);
      if (m) setStage(+m[1]);
      trace("phase", `■ ${ev.name.replace(/^\d\/4\s*/, "")}`);
      break;
    }
    case "tool_call":
      searches++;
      els.traceCount.textContent = `${searches} call${searches === 1 ? "" : "s"}`;
      trace("call", el("span", { class: "agent" }, ev.agent), " → ", el("b", {}, ev.tool), `(${fmtArgs(ev.args)})`);
      break;
    case "tool_result":
      trace("res", `↳ ${cleanPreview(ev.preview)}`);
      break;
    case "warning": trace("warn", `! ${ev.message}`); break;
    case "error": state.error = ev.message; trace("warn", `✕ ${ev.message}`); break;
    case "domain":
      state.domain = ev.data;
      trace("dom", `◆ Domain check: ${ev.data.status} (${ev.data.detail})`);
      break;
    case "claims": state.claims = ev.data; break;
    case "flags": state.flags = ev.data; break;
    case "verdict": state.verdict = ev.data; trace("phase", "■ Verdict ready"); break;
    case "stats": state.stats = ev.data; break;
  }
}

// ── results ────────────────────────────────────────────────────────────────
function render({ verdict: v, stats, domain }) {
  const box = $("verdict");
  box.className = `verdict ${v.verdict}`;
  $("verdictLabel").textContent = VERDICT_LABEL[v.verdict] || v.verdict;
  $("verdictEyebrow").textContent = VERDICT_EYEBROW[v.verdict] || "Verdict";
  $("verdictSummary").textContent = v.one_line_summary;
  const risk = Math.max(0, Math.min(100, v.risk_score | 0));
  $("riskNum").textContent = risk;
  const arc = $("gaugeArc");
  arc.style.strokeDashoffset = 157.08;
  requestAnimationFrame(() => requestAnimationFrame(() => (arc.style.strokeDashoffset = 157.08 * (1 - risk / 100))));

  $("mLive").textContent = stats ? `${stats.live_searches}/${stats.budget}` : "—";
  $("mCache").textContent = stats ? stats.cache_hits : "—";
  $("mClaims").textContent = v.claim_checks.length;
  $("mDomain").textContent = domain ? domain.status.replace(/_/g, " ").toLowerCase() : "—";

  $("ledger").replaceChildren(...v.claim_checks.map((c, i) => {
    const links = (c.sources || []).map(safeUrl).filter(Boolean)
      .map((u) => el("a", { href: u, target: "_blank", rel: "noopener noreferrer", title: u }, shortUrl(u)));
    const d = el("details", { class: "claim" },
      el("summary", {}, el("span", { class: `badge ${c.status}` }, c.status), c.claim),
      el("div", { class: "claim-body" }, el("p", {}, c.evidence),
        links.length ? el("div", { class: "sources" }, ...links) : el("p", { class: "muted" }, "No source links.")));
    if (i === 0 || c.status === "CONTRADICTED") d.open = true;
    return d;
  }));

  const list = (id, items) => $(id).replaceChildren(
    ...(items && items.length ? items : ["None found"]).map((x) => el("li", {}, x)));
  list("redFlags", v.red_flags);
  list("greenFlags", v.green_flags);

  $("officialContact").textContent = v.official_contact
    ? `Send to the official contact: ${v.official_contact}` : "Send this to the company's official careers contact.";
  $("email").textContent = v.verification_email;
  $("nextSteps").replaceChildren(...(v.next_steps || []).map((s) => el("li", {}, s)));

  const share = `Parakh checked an offer I got: ${VERDICT_LABEL[v.verdict]} (risk ${risk}/100). ${v.one_line_summary} Check yours: ${location.origin}`;
  $("shareWa").href = `https://wa.me/?text=${encodeURIComponent(share)}`;

  $("searchLog").replaceChildren(...((stats && stats.search_log) || []).map((s, i) =>
    el("tr", {}, el("td", {}, i + 1), el("td", {}, s.engine || "—"), el("td", {}, s.query || "—"),
      el("td", {}, el("span", { class: `st ${s.status}` }, s.status)))));

  els.results.hidden = false;
  els.results.scrollIntoView({ behavior: "smooth", block: "start" });
}

$("copyEmail").addEventListener("click", async (e) => {
  try { await navigator.clipboard.writeText($("email").textContent); e.target.textContent = "Copied"; }
  catch { e.target.textContent = "Select & copy"; }
  setTimeout(() => (e.target.textContent = "Copy"), 1600);
});
