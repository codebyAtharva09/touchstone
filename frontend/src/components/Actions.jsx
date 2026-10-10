import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { VERDICTS, safeUrl, shortUrl } from "../lib/format.js";
import { item, list, reveal } from "../lib/motion.js";
import { Icon } from "./Icons.jsx";

const EMAIL_RE = /[\w.+-]+@[\w-]+(\.[\w-]+)+/;

export function VerifyEmail({ verdict }) {
  const [copied, setCopied] = useState(false);
  const contact = (verdict.official_contact || "").trim();
  const email = EMAIL_RE.exec(contact)?.[0];
  const link = !email && safeUrl(contact);
  const text = verdict.verification_email || "";
  const mailto = email
    ? `mailto:${email}?subject=${encodeURIComponent("Please confirm: is this offer genuine?")}&body=${encodeURIComponent(text)}`
    : null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <motion.section className="card letter" {...reveal}>
      <p className="eyebrow">Ask the real company</p>
      <h3>A verification email, ready to send</h3>
      <div className="letter-to">
        <span className="letter-label">To</span>
        {email ? <b>{email}</b>
          : link ? <a href={link} target="_blank" rel="noopener noreferrer">{shortUrl(link)}</a>
          : contact ? <b>{contact}</b>
          : <span className="muted">the company's official careers contact</span>}
      </div>
      <pre className="letter-body">{text}</pre>
      <div className="letter-actions">
        <button type="button" className="btn btn-dark btn-sm" onClick={copy}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={copied ? "ok" : "copy"}
              className="btn-swap"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
            >
              <Icon name={copied ? "check" : "copy"} />
              {copied ? "Copied" : "Copy email"}
            </motion.span>
          </AnimatePresence>
        </button>
        {mailto && <a className="btn btn-ghost btn-sm" href={mailto}><Icon name="mail" /> Open in mail app</a>}
      </div>
    </motion.section>
  );
}

export function NextSteps({ verdict }) {
  const label = VERDICTS[verdict.verdict]?.label || verdict.verdict;
  const risk = Math.max(0, Math.min(100, verdict.risk_score | 0));
  const share = `Touchstone checked an offer I got: ${label} (risk ${risk}/100). ${verdict.one_line_summary} Check yours: ${window.location.origin}`;
  const urgent = verdict.verdict === "LIKELY_SCAM" || verdict.verdict === "SUSPICIOUS";
  return (
    <motion.section className="card next" {...reveal}>
      <p className="eyebrow">What to do next</p>
      <h3>Your next moves</h3>
      <motion.ol className="steps" variants={list} initial="hidden" whileInView="show" viewport={{ once: true }}>
        {(verdict.next_steps || []).map((s, i) => (
          <motion.li key={i} variants={item}>
            <span className="step-num">{i + 1}</span>
            <span>{s}</span>
          </motion.li>
        ))}
      </motion.ol>
      <div className="next-actions">
        <a className="btn btn-ghost btn-sm" href={`https://wa.me/?text=${encodeURIComponent(share)}`} target="_blank" rel="noopener noreferrer">
          <Icon name="chat" /> Warn friends on WhatsApp
        </a>
        {urgent && (
          <a className="btn btn-danger btn-sm" href="https://cybercrime.gov.in" target="_blank" rel="noopener noreferrer">
            <Icon name="external" /> Report at cybercrime.gov.in
          </a>
        )}
      </div>
    </motion.section>
  );
}
