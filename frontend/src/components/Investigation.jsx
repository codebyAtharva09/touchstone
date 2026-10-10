import { AnimatePresence, motion } from "framer-motion";
import { forwardRef, useEffect, useRef } from "react";
import { AGENTS, ENGINE_NAME, agentKey, agentLabel } from "../lib/format.js";
import { ease } from "../lib/motion.js";
import { EngineIcon, Icon } from "./Icons.jsx";

export const InvestigationPanel = forwardRef(function InvestigationPanel({ state }, ref) {
  const { status, stage, rows, searches } = state;
  return (
    <motion.aside className="card panel-card" id="how" ref={ref}
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease, delay: 0.4 }}>
      <div className="card-head">
        <div>
          <p className="eyebrow">Step 2</p>
          <h2>Watch the agents work</h2>
        </div>
        <StatusPill status={status} />
      </div>
      <Pipeline stage={stage} />
      <LiveTrace rows={rows} searches={searches} status={status} />
    </motion.aside>
  );
});

const STATUS_LABEL = { idle: "Waiting", running: "Live", done: "Complete", error: "Stopped" };

function StatusPill({ status }) {
  return (
    <span className={`status-pill s-${status}`}>
      <span className="status-dot" />
      {STATUS_LABEL[status]}
    </span>
  );
}

function Pipeline({ stage }) {
  return (
    <ol className="pipeline">
      {AGENTS.map((a, i) => {
        const n = i + 1;
        const phase = stage > n ? "done" : stage === n ? "active" : "todo";
        return (
          <li key={a.key} className={`step a-${a.key} is-${phase}`}>
            <div className="step-rail">
              <motion.span
                className="step-node"
                animate={phase === "active" ? { scale: [1, 1.12, 1] } : { scale: 1 }}
                transition={phase === "active" ? { duration: 1.4, repeat: Infinity, ease: "easeInOut" } : { duration: 0.3 }}
              >
                <AnimatePresence mode="wait" initial={false}>
                  {phase === "done" ? (
                    <motion.span key="done" className="node-inner"
                      initial={{ scale: 0, rotate: -60 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0 }}
                      transition={{ type: "spring", stiffness: 500, damping: 24 }}>
                      <Icon name="check" size={15} />
                    </motion.span>
                  ) : (
                    <motion.span key="num" className="node-inner" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      {n}
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.span>
              {n < AGENTS.length && (
                <span className="step-line">
                  <motion.span className="step-fill" initial={false}
                    animate={{ scaleY: stage > n ? 1 : 0 }} transition={{ duration: 0.6, ease }} />
                </span>
              )}
            </div>
            <div className="step-body">
              <div className="step-title">
                <b>{a.name}</b>
                <span className="gem">{a.gem}</span>
                {phase === "active" && <span className="working">working<span className="dots"><i /><i /><i /></span></span>}
              </div>
              <p>{a.blurb}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function LiveTrace({ rows, searches, status }) {
  const box = useRef(null);
  useEffect(() => {
    const el = box.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [rows.length]);

  return (
    <div className="trace">
      <div className="trace-head">
        <span>Live trace</span>
        <span className="trace-count">
          <Icon name="google" size={13} />
          <motion.span key={searches} initial={{ y: -8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="trace-num">
            {searches}
          </motion.span>
          SerpApi search{searches === 1 ? "" : "es"}
        </span>
      </div>
      <div className="trace-body" ref={box} aria-live="polite">
        {rows.length === 0 ? (
          <div className="trace-empty">
            <span className="trace-empty-icon"><Icon name="google" size={18} /></span>
            {status === "running" ? "Starting the agents…" : "Agent steps and every live search will appear here."}
          </div>
        ) : (
          rows.map((r) => <TraceRow key={r.id} row={r} />)
        )}
      </div>
    </div>
  );
}

export function AgentBadge({ name }) {
  return <span className={`agent-badge a-${agentKey(name)}`}>{agentLabel(name)}</span>;
}

const enter = { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.35, ease } };

function TraceRow({ row }) {
  switch (row.kind) {
    case "phase":
      return <motion.div {...enter} className={`trow trow-phase a-${row.agent}`}>{row.text}</motion.div>;
    case "call":
      return (
        <motion.div {...enter} className="trow trow-call">
          <div className="call-head">
            <AgentBadge name={row.agent} />
            {row.engine ? (
              <span className="engine-chip">
                <EngineIcon engine={row.engine} size={13} />
                <small>SerpApi</small> {ENGINE_NAME[row.engine]}
              </span>
            ) : (
              <span className="engine-chip local"><Icon name="rule" size={13} /> local check</span>
            )}
            <span className="tool-name">{row.tool}</span>
          </div>
          <div className="call-q">{row.text}</div>
        </motion.div>
      );
    case "result":
      return <motion.div {...enter} className="trow trow-result">↳ {row.text}</motion.div>;
    case "rule":
      return (
        <motion.div {...enter} className="trow trow-rule">
          <span className="agent-badge a-rule">Rule check</span> {row.text}
        </motion.div>
      );
    default:
      return (
        <motion.div {...enter} className={`trow trow-${row.kind}`}>
          <AgentBadge name={row.agent} /> {row.text}
        </motion.div>
      );
  }
}
