import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
import { ENGINE_NAME, ENGINE_TOOL, engineUsage } from "../lib/format.js";
import { ease, reveal } from "../lib/motion.js";
import { EngineIcon, Icon } from "./Icons.jsx";

// "Powered by SerpApi": which engines this run used, with counts, built from search_log.
export function SerpPanel({ log }) {
  const [open, setOpen] = useState(false);
  const usage = useMemo(() => engineUsage(log), [log]);
  const max = Math.max(1, ...usage.engines.map((e) => e.total));
  const plural = (n, word) => `${n} ${word}${n === 1 ? "" : word.endsWith("h") ? "es" : "s"}`;

  return (
    <motion.section className="card serp" {...reveal} aria-labelledby="serpTitle">
      <div className="serp-head">
        <div>
          <p className="eyebrow">Powered by SerpApi</p>
          <h3 id="serpTitle">The live searches behind this verdict</h3>
        </div>
        {usage.total > 0 && (
          <p className="serp-summary">
            {plural(usage.total, "search")} across {plural(usage.engines.length, "engine")} · {usage.live} live ·{" "}
            {usage.cached} cached{usage.skipped ? ` · ${usage.skipped} skipped` : ""}
          </p>
        )}
      </div>

      {usage.total === 0 ? (
        <p className="muted">No searches ran in this investigation.</p>
      ) : (
        <ul className="engine-bars">
          {usage.engines.map((e, i) => (
            <li key={e.engine || i} className="engine-bar">
              <span className="eb-icon"><EngineIcon engine={e.engine} size={17} /></span>
              <div className="eb-main">
                <div className="eb-top">
                  <b>{ENGINE_NAME[e.engine] || e.engine || "Unknown"}</b>
                  <span className="eb-meta">
                    {[ENGINE_TOOL[e.engine], `${e.live} live · ${e.cached} cached`, e.skipped ? `${e.skipped} skipped` : ""]
                      .filter(Boolean).join(" · ")}
                  </span>
                </div>
                <div className="eb-track">
                  <motion.div
                    className="eb-fill"
                    initial={{ scaleX: 0 }}
                    whileInView={{ scaleX: e.total / max }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.9, ease, delay: 0.1 * i }}
                  />
                </div>
              </div>
              <span className="eb-count">{e.total}</span>
            </li>
          ))}
        </ul>
      )}

      {usage.total > 0 && (
        <>
          <button type="button" className="adv-toggle log-toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            See every query the agents ran <Icon name="chev" size={14} />
          </button>
          <AnimatePresence initial={false}>
            {open && (
              <motion.div
                className="log-wrap"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease }}
              >
                <table className="log">
                  <thead><tr><th>#</th><th>Engine</th><th>Query</th><th>Status</th></tr></thead>
                  <tbody>
                    {log.map((s, i) => (
                      <tr key={i}>
                        <td>{i + 1}</td>
                        <td>{ENGINE_NAME[s.engine] || s.engine || "—"}</td>
                        <td>{s.query || "—"}</td>
                        <td><span className={`q q-${s.status}`}>{s.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </motion.section>
  );
}
