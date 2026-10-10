import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
import { parseSource } from "../lib/format.js";
import { ease, item, list, reveal } from "../lib/motion.js";
import { Icon } from "./Icons.jsx";

const STATUS = {
  CONTRADICTED: { icon: "cross", label: "Contradicted" },
  VERIFIED: { icon: "check", label: "Verified" },
  UNVERIFIED: { icon: "question", label: "Unverified" },
};

export function EvidenceLedger({ checks }) {
  const counts = checks.reduce((acc, c) => ({ ...acc, [c.status]: (acc[c.status] || 0) + 1 }), {});
  return (
    <motion.section className="card" {...reveal}>
      <div className="card-head">
        <div>
          <p className="eyebrow">Evidence ledger</p>
          <h3>Every claim, checked against live search</h3>
        </div>
        <div className="ledger-counts">
          {Object.keys(STATUS).filter((s) => counts[s]).map((s) => (
            <span key={s} className={`count-chip st-${s}`}>
              <Icon name={STATUS[s].icon} size={12} />
              {counts[s]} {STATUS[s].label.toLowerCase()}
            </span>
          ))}
        </div>
      </div>
      <motion.ul className="ledger" variants={list} initial="hidden" whileInView="show" viewport={{ once: true }}>
        {checks.map((c, i) => (
          <ClaimCard key={`${i}-${c.claim}`} check={c} defaultOpen={i === 0 || c.status === "CONTRADICTED"} />
        ))}
      </motion.ul>
    </motion.section>
  );
}

function ClaimCard({ check, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen);
  const status = STATUS[check.status] ? check.status : "UNVERIFIED";
  const sources = useMemo(
    () => [...new Set((check.sources || []).map((s) => String(s).trim()))].map(parseSource).filter(Boolean),
    [check.sources],
  );
  return (
    <motion.li className={`claim st-${status}`} variants={item}>
      <button type="button" className="claim-head" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="claim-icon"><Icon name={STATUS[status].icon} size={14} /></span>
        <span className="claim-text">{check.claim}</span>
        <span className="claim-status">{STATUS[status].label}</span>
        <motion.span className="claim-chev" animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.25 }}>
          <Icon name="chev" size={16} />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            className="claim-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease }}
          >
            <div className="claim-inner">
              <p>{check.evidence}</p>
              {sources.length ? (
                <div className="sources">{sources.map((src) => <SourceChip key={src.raw} src={src} />)}</div>
              ) : (
                <p className="muted small">No sources cited.</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  );
}

function SourceChip({ src }) {
  if (src.kind === "link") {
    return (
      <a className="src-link" href={src.url} target="_blank" rel="noopener noreferrer" title={src.url}>
        <span className="src-text">{src.label}</span>
        <Icon name="external" size={12} />
      </a>
    );
  }
  return <span className="src-rule" title={src.raw}><small>{src.prefix}</small> {src.label}</span>;
}

export function Flags({ red = [], green = [] }) {
  return (
    <div className="two-col">
      <FlagList tone="scam" icon="alert" title="Red flags" items={red} empty="No red flags found." />
      <FlagList tone="legit" icon="check" title="Signs of legitimacy" items={green} empty="No signs of legitimacy found." />
    </div>
  );
}

function FlagList({ tone, icon, title, items, empty }) {
  const has = items && items.length > 0;
  return (
    <motion.section className={`card flags flags-${tone}`} {...reveal}>
      <h3>
        <span className="flag-icon"><Icon name={icon} size={16} /></span>
        {title}
        <span className="flag-count">{has ? items.length : 0}</span>
      </h3>
      <motion.ul variants={list} initial="hidden" whileInView="show" viewport={{ once: true }}>
        {(has ? items : [empty]).map((x, i) => (
          <motion.li key={i} variants={item} className={has ? "" : "is-empty"}>{x}</motion.li>
        ))}
      </motion.ul>
    </motion.section>
  );
}
