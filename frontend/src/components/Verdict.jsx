import { animate, motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef } from "react";
import { VERDICTS } from "../lib/format.js";
import { ease, item, list } from "../lib/motion.js";

export function CountUp({ value, delay = 0, duration = 1.2 }) {
  const ref = useRef(null);
  const reduce = useReducedMotion();
  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    if (reduce) {
      node.textContent = String(value);
      return undefined;
    }
    const controls = animate(0, value, {
      duration, delay, ease,
      onUpdate: (v) => { node.textContent = String(Math.round(v)); },
    });
    return () => controls.stop();
  }, [value, delay, duration, reduce]);
  return <span ref={ref}>0</span>;
}

// The verdict as a touchstone test: the streak is drawn in the verdict's colour, then the stamp lands.
export function VerdictReveal({ verdict }) {
  const meta = VERDICTS[verdict.verdict] || { label: verdict.verdict, note: "" };
  const risk = Math.max(0, Math.min(100, verdict.risk_score | 0));
  return (
    <motion.section
      className={`verdict-card v-${verdict.verdict}`}
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, ease }}
      aria-labelledby="verdictTitle"
    >
      <div className="touchstone" role="img" aria-label={`Risk ${risk} out of 100`}>
        <svg viewBox="0 0 240 150" className="touchstone-svg" aria-hidden="true">
          <defs>
            <filter id="streak-grain" x="-10%" y="-30%" width="120%" height="160%">
              <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="noise" />
              <feDisplacementMap in="SourceGraphic" in2="noise" scale="7" />
            </filter>
          </defs>
          <rect width="240" height="150" rx="22" className="stone" />
          <motion.path
            d="M30 70 C 72 32, 124 88, 212 30"
            className="streak"
            filter="url(#streak-grain)"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1.1, ease: [0.65, 0, 0.35, 1], delay: 0.3 }}
          />
        </svg>
        <div className="touchstone-num">
          <b><CountUp value={risk} delay={0.3} /></b>
          <span>/100 risk</span>
        </div>
      </div>

      <div className="verdict-copy">
        <motion.p className="eyebrow" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}>
          {meta.note}
        </motion.p>
        <motion.h2
          id="verdictTitle"
          className="stamp"
          initial={{ opacity: 0, scale: 2, rotate: -14 }}
          animate={{ opacity: 1, scale: 1, rotate: -3 }}
          transition={{ type: "spring", stiffness: 380, damping: 17, delay: 0.9 }}
        >
          {meta.label}
        </motion.h2>
        <motion.p
          className="verdict-summary"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.25, duration: 0.6, ease }}
        >
          {verdict.one_line_summary}
        </motion.p>
      </div>
    </motion.section>
  );
}

export function Metrics({ verdict, stats, domain }) {
  const tiles = [
    { key: "live", label: "live SerpApi searches", value: stats?.live_searches ?? 0, suffix: stats ? ` / ${stats.budget}` : "" },
    { key: "cache", label: "cached searches reused", value: stats?.cache_hits ?? 0 },
    { key: "claims", label: "claims checked", value: (verdict.claim_checks || []).length },
    { key: "domain", label: "email domain check", text: domain ? domain.status.replace(/_/g, " ").toLowerCase() : "not checked" },
  ];
  return (
    <motion.div className="metrics" variants={list} initial="hidden" animate="show">
      {tiles.map((t) => (
        <motion.div key={t.key} className="metric" variants={item}>
          {t.text ? <b className="metric-text">{t.text}</b> : <b><CountUp value={t.value} delay={0.4} />{t.suffix}</b>}
          <span>{t.label}</span>
        </motion.div>
      ))}
    </motion.div>
  );
}
