// Streams POST /api/investigate (Server-Sent Events) into one reducer-managed state.
import { useCallback, useReducer, useRef } from "react";
import { STAGE_AGENT, TOOL_ENGINE, callDetail, cleanPreview } from "./format.js";

const initial = {
  runId: 0, status: "idle", stage: 0, rows: [], searches: 0,
  verdict: null, stats: null, domain: null, error: null,
};

let nextRowId = 0;
const addRow = (state, r) => [...state.rows, { id: ++nextRowId, ...r }];

function applyEvent(state, ev) {
  switch (ev.type) {
    case "phase": {
      const m = /^(\d)\/4/.exec(ev.name || "");
      const stage = m ? +m[1] : state.stage;
      return { ...state, stage, rows: addRow(state, { kind: "phase", agent: STAGE_AGENT[stage] || "judge", text: ev.name }) };
    }
    case "tool_call": {
      const engine = TOOL_ENGINE[ev.tool];
      return {
        ...state,
        searches: state.searches + (engine ? 1 : 0),
        rows: addRow(state, { kind: "call", agent: ev.agent, tool: ev.tool, engine, text: callDetail(ev.args || {}) }),
      };
    }
    case "tool_result":
      return { ...state, rows: addRow(state, { kind: "result", text: cleanPreview(ev.preview) }) };
    case "warning":
      return { ...state, rows: addRow(state, { kind: "warn", agent: ev.agent, text: ev.message }) };
    case "error":
      return { ...state, error: ev.message, rows: addRow(state, { kind: "error", agent: "system", text: ev.message }) };
    case "domain":
      return {
        ...state, domain: ev.data,
        rows: addRow(state, { kind: "rule", text: `Email domain: ${ev.data.status} (${ev.data.detail})` }),
      };
    case "verdict":
      return { ...state, verdict: ev.data, rows: addRow(state, { kind: "phase", agent: "judge", text: "Verdict ready" }) };
    case "stats":
      return { ...state, stats: ev.data };
    default:
      return state;
  }
}

function reducer(state, action) {
  switch (action.type) {
    case "start":
      return { ...initial, runId: state.runId + 1, status: "running", stage: 1 };
    case "event":
      return applyEvent(state, action.ev);
    case "finish":
      return state.verdict
        ? { ...state, status: "done", stage: 5 }
        : { ...state, status: "error", stage: 0, error: state.error || "The investigation ended without a verdict." };
    case "fail":
      return {
        ...state, status: "error", stage: 0, error: action.message,
        rows: addRow(state, { kind: "error", agent: "system", text: action.message }),
      };
    default:
      return state;
  }
}

export function useInvestigation() {
  const [state, dispatch] = useReducer(reducer, initial);
  const busy = useRef(false);

  const run = useCallback(async ({ offer, sender, budget }) => {
    if (busy.current) return;
    busy.current = true;
    dispatch({ type: "start" });
    try {
      const resp = await fetch("/api/investigate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offer, sender, budget }),
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
          const chunk = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const line = chunk.split("\n").find((l) => l.startsWith("data: "));
          if (line) dispatch({ type: "event", ev: JSON.parse(line.slice(6)) });
        }
      }
      dispatch({ type: "finish" });
    } catch (err) {
      dispatch({ type: "fail", message: err.message });
    } finally {
      busy.current = false;
    }
  }, []);

  return { state, run };
}
