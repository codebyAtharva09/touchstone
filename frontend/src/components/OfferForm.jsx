import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { ease } from "../lib/motion.js";
import { Icon } from "./Icons.jsx";

function useElapsed(active) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!active) return undefined;
    setSeconds(0);
    const t0 = Date.now();
    const id = setInterval(() => setSeconds(Math.floor((Date.now() - t0) / 1000)), 500);
    return () => clearInterval(id);
  }, [active]);
  return seconds;
}

export function OfferForm({
  offer, setOffer, sender, setSender, budget, setBudget, maxBudget,
  onSubmit, onSample, busy, note, noteTone,
}) {
  const [showBudget, setShowBudget] = useState(false);
  const elapsed = useElapsed(busy);
  const length = offer.trim().length;
  const tooShort = length < 20;

  return (
    <motion.form
      className="card form-card"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease, delay: 0.3 }}
      onSubmit={(e) => {
        e.preventDefault();
        if (!tooShort && !busy) onSubmit();
      }}
    >
      <div className="card-head">
        <div>
          <p className="eyebrow">Step 1</p>
          <h2>Paste the offer</h2>
        </div>
        <div className="samples" role="group" aria-label="Load a sample offer">
          <button type="button" className="pill pill-scam" data-sample="scam" onClick={() => onSample("scam")}>Scam sample</button>
          <button type="button" className="pill pill-legit" data-sample="genuine" onClick={() => onSample("genuine")}>Genuine sample</button>
        </div>
      </div>

      <label className="field">
        <span className="label">Offer message</span>
        <span className="textarea-wrap">
          <textarea
            value={offer}
            onChange={(e) => setOffer(e.target.value)}
            rows={10}
            maxLength={8000}
            placeholder="Paste the full email or WhatsApp message here…"
          />
          <span className="counter">{offer.length.toLocaleString()} / 8,000</span>
        </span>
      </label>
      {length > 0 && tooShort && <p className="hint">Paste the full message, at least a couple of lines.</p>}

      <label className="field">
        <span className="label">Sender email <span className="muted">(if it isn't in the message)</span></span>
        <input type="email" value={sender} onChange={(e) => setSender(e.target.value)} placeholder="hr@company.com" />
      </label>

      <button type="button" className="adv-toggle" aria-expanded={showBudget} onClick={() => setShowBudget((v) => !v)}>
        Search budget: <b>{budget}</b> live searches <Icon name="chev" size={14} />
      </button>
      <AnimatePresence initial={false}>
        {showBudget && (
          <motion.div
            className="adv"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease }}
          >
            <input
              type="range" min={4} max={maxBudget} value={budget}
              onChange={(e) => setBudget(+e.target.value)}
              aria-label="Live searches per investigation"
            />
            <p className="muted small">Each live search uses one SerpApi credit. Repeat checks reuse cached results for free.</p>
          </motion.div>
        )}
      </AnimatePresence>

      <button id="go" className={`btn btn-dark btn-xl${busy ? " is-busy" : ""}`} type="submit" disabled={busy || tooShort}>
        {busy ? (
          <><span className="spinner" aria-hidden="true" /> Investigating… <span className="mono elapsed">{elapsed}s</span></>
        ) : (
          <>Investigate this offer <Icon name="arrow" /></>
        )}
      </button>

      <AnimatePresence mode="wait">
        {note && (
          <motion.p
            key={note}
            className={`form-note ${noteTone}`}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            role={noteTone === "error" ? "alert" : undefined}
          >
            {note}
          </motion.p>
        )}
      </AnimatePresence>
      <p className="privacy"><Icon name="rule" size={14} /> Remove phone numbers and ID numbers before you paste.</p>
    </motion.form>
  );
}
