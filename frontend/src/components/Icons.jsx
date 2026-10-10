// Hand-drawn 24px line icons (stroke = currentColor), so no icon font or library is needed.
const PATHS = {
  google: (<><circle cx="11" cy="11" r="6" /><path d="m20 20-4.5-4.5" /></>),
  google_news: (<><rect x="4" y="5" width="16" height="14" rx="2" /><path d="M8 9h8M8 13h8M8 17h5" /></>),
  google_maps: (<><path d="M12 21s-6-5.6-6-10a6 6 0 0 1 12 0c0 4.4-6 10-6 10Z" /><circle cx="12" cy="11" r="2.2" /></>),
  youtube: (<><rect x="3" y="6" width="18" height="12" rx="3.5" /><path d="m10.5 9.5 4 2.5-4 2.5Z" fill="currentColor" /></>),
  google_jobs: (<><rect x="3.5" y="8" width="17" height="11" rx="2" /><path d="M9 8V6.5A1.5 1.5 0 0 1 10.5 5h3A1.5 1.5 0 0 1 15 6.5V8M3.5 13h17" /></>),
  rule: (<><path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6Z" /><path d="m9 12 2 2 4-4" /></>),
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  cross: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
  question: (<><path d="M9.2 9.3a2.9 2.9 0 1 1 4.1 2.6c-.9.4-1.3 1-1.3 1.9v.4" /><circle cx="12" cy="17.6" r=".7" fill="currentColor" /></>),
  alert: (<><path d="M12 4 2.8 19.5h18.4Z" /><path d="M12 10v4.5" /><circle cx="12" cy="17" r=".7" fill="currentColor" /></>),
  copy: (<><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M5 15V6a1 1 0 0 1 1-1h9" /></>),
  mail: (<><rect x="3" y="5.5" width="18" height="13" rx="2" /><path d="m4 7 8 6 8-6" /></>),
  chat: <path d="M20 11.5a8 8 0 0 1-11.8 7L4 20l1.5-4A8 8 0 1 1 20 11.5Z" />,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  chev: <path d="m6 9 6 6 6-6" />,
  external: <path d="M14 5h5v5M19 5l-8 8M18 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h4" />,
};

export function Icon({ name, size = 16, className = "" }) {
  return (
    <svg className={`icon ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name] || PATHS.rule}
    </svg>
  );
}

export function EngineIcon({ engine, size = 16 }) {
  return <Icon name={PATHS[engine] ? engine : "rule"} size={size} />;
}
