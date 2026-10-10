import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { NextSteps, VerifyEmail } from "./components/Actions.jsx";
import { Footer, TopBar } from "./components/Brand.jsx";
import { EvidenceLedger, Flags } from "./components/Evidence.jsx";
import { Hero } from "./components/Hero.jsx";
import { InvestigationPanel } from "./components/Investigation.jsx";
import { OfferForm } from "./components/OfferForm.jsx";
import { SerpPanel } from "./components/SerpPanel.jsx";
import { Metrics, VerdictReveal } from "./components/Verdict.jsx";
import { useInvestigation } from "./lib/useInvestigation.js";

export default function App() {
  const [config, setConfig] = useState({ max_budget: 16, ready: true, public: false });
  const [offer, setOffer] = useState("");
  const [sender, setSender] = useState("");
  const [budget, setBudget] = useState(12);
  const { state, run } = useInvestigation();
  const checkRef = useRef(null);
  const panelRef = useRef(null);
  const resultsRef = useRef(null);

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((cfg) => {
        setConfig(cfg);
        setBudget((b) => Math.min(b, cfg.max_budget));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (state.status !== "done") return undefined;
    const id = setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 200);
    return () => clearTimeout(id);
  }, [state.status, state.runId]);

  const loadSample = async (name) => {
    try {
      const r = await fetch(`/api/samples/${name}`);
      if (r.ok) setOffer((await r.json()).text);
    } catch {
      /* samples are optional */
    }
  };
  const goToCheck = () => checkRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  const investigate = () => {
    panelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    run({ offer: offer.trim(), sender: sender.trim(), budget });
  };

  let note = "";
  let noteTone = "info";
  if (state.status === "error") {
    note = state.error;
    noteTone = "error";
  } else if (!config.ready) {
    note = "This server is missing its API keys, so investigations can't run.";
    noteTone = "error";
  } else if (config.public) {
    note = `Public demo: ${config.daily_limit} investigations per day.`;
  }

  const { verdict, stats, domain } = state;
  return (
    <MotionConfig reducedMotion="user">
      <TopBar />
      <main>
        <Hero onCheck={goToCheck} onTrySample={() => { loadSample("scam"); goToCheck(); }} />

        <section id="check" ref={checkRef} className="wrap workbench">
          <OfferForm
            offer={offer} setOffer={setOffer}
            sender={sender} setSender={setSender}
            budget={budget} setBudget={setBudget} maxBudget={config.max_budget}
            onSubmit={investigate} onSample={loadSample}
            busy={state.status === "running"} note={note} noteTone={noteTone}
          />
          <InvestigationPanel state={state} ref={panelRef} />
        </section>

        <AnimatePresence mode="wait">
          {state.status === "done" && verdict && (
            <motion.section
              key={state.runId}
              ref={resultsRef}
              className="wrap results"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              aria-label="Investigation results"
            >
              <VerdictReveal verdict={verdict} />
              <Metrics verdict={verdict} stats={stats} domain={domain} />
              <EvidenceLedger checks={verdict.claim_checks || []} />
              <Flags red={verdict.red_flags} green={verdict.green_flags} />
              <div className="two-col">
                <VerifyEmail verdict={verdict} />
                <NextSteps verdict={verdict} />
              </div>
              <SerpPanel log={stats?.search_log || []} />
            </motion.section>
          )}
        </AnimatePresence>
      </main>
      <Footer />
    </MotionConfig>
  );
}
