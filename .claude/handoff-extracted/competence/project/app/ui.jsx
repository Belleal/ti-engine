// Shared UI components for Competence.
// Depends on window.Icon (icons.jsx) and window.COMPETENCE_DATA (data.js).

(() => {
const { useState, useEffect, useRef, useMemo, useCallback, createContext, useContext } = React;
const { Icon, COMPETENCE_DATA } = window;
const { STATUSES, GRADES, THRESHOLDS } = COMPETENCE_DATA;

/* ============================================================
   Format helpers
   ============================================================ */
const fmtDate = (iso, fallback = '—') => {
  if (!iso) return fallback;
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};
const fmtDateShort = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
};
const fmtTime = (hhmm) => hhmm;
const daysBetween = (a, b) => {
  const A = new Date(a), B = new Date(b);
  A.setHours(0,0,0,0); B.setHours(0,0,0,0);
  return Math.round((A - B) / 86400000);
};

/* ============================================================
   Avatar
   ============================================================ */
const Avatar = ({ employee, size = 'md' }) => {
  if (!employee) return null;
  const cls = `avatar ${size === 'lg' ? 'lg' : size === 'xl' ? 'xl' : size === 'sm' ? 'sm' : ''}`;
  return (
    <span className={cls} style={{ background: employee.color || 'var(--accent)' }} aria-hidden="true">
      {employee.avatar || (employee.name || '?').split(' ').map(p => p[0]).slice(0, 2).join('')}
    </span>
  );
};

/* ============================================================
   Status pill — uses STATUSES table for tone
   ============================================================ */
const StatusPill = ({ status, animate = true }) => {
  const s = STATUSES[status] || STATUSES.NOT_STARTED;
  return (
    <span className={`status-pill ${s.tone}`} role="status">
      <span className="dot" aria-hidden="true"/>
      {s.name}
    </span>
  );
};

/* ============================================================
   State-machine track — visualizes evaluation progress through statuses
   ============================================================ */
const StateTrack = ({ current }) => {
  const steps = ['OPEN', 'IN_REVIEW', 'READY', 'CLOSED'];
  const idx = steps.indexOf(current);
  // NOT_STARTED renders all incomplete. CLOSED renders all complete.
  return (
    <div className="state-track" role="img" aria-label={`Evaluation status: ${(STATUSES[current] || STATUSES.NOT_STARTED).name}`}>
      {steps.map((step, i) => {
        const isComplete = idx > i || current === 'CLOSED';
        const isCurrent = idx === i;
        return (
          <React.Fragment key={step}>
            <div className={`state-step ${isComplete ? 'complete' : ''} ${isCurrent ? 'current' : ''}`}>
              <span className="marker"/>
              <span>{STATUSES[step].name}</span>
            </div>
            {i < steps.length - 1 && (
              <span className={`state-step-line ${isComplete ? 'complete' : ''} ${idx === i ? 'current' : ''}`}/>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

/* ============================================================
   Grade chip — replaces select dropdown
   ============================================================ */
const GradeChip = ({ grade, selectable = false, selected = false, locked = false, onClick, size }) => {
  const cls = `grade-chip ${grade ? '' : 'empty'} ${selectable ? 'selectable' : ''} ${selected ? 'selected' : ''} ${locked ? 'locked' : ''}`;
  const content = grade || '—';
  return (
    <button
      type="button"
      className={cls}
      data-grade={grade || 'X'}
      onClick={onClick}
      disabled={locked || !selectable && !onClick}
      aria-label={grade ? GRADES[grade]?.name : 'No grade'}
    >
      {content}
    </button>
  );
};

const GradeSelector = ({ value, locked, onChange }) => {
  return (
    <div className="grade-row" role="radiogroup">
      {['S', 'R', 'U', 'N'].map(g => (
        <GradeChip
          key={g}
          grade={g}
          selectable={!locked}
          locked={locked}
          selected={value === g}
          onClick={() => !locked && onChange?.(g === value ? null : g)}
        />
      ))}
    </div>
  );
};

/* ============================================================
   ScoreRing — animated circular score reveal
   ============================================================ */
const ScoreRing = ({ score, max = 130, threshold, animate = true, size = 132 }) => {
  const [drawn, setDrawn] = useState(animate ? 0 : score);
  useEffect(() => {
    if (!animate) { setDrawn(score); return; }
    const t = setTimeout(() => setDrawn(score), 60);
    return () => clearTimeout(t);
  }, [score, animate]);
  const r = (size - 16) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(1, drawn / max);
  const offset = circ * (1 - pct);
  const t = THRESHOLDS.find(x => x.code === threshold) || THRESHOLDS[2];
  const color = t.code === 'T5' ? 'var(--success)' :
                t.code === 'T4' ? 'var(--accent)' :
                t.code === 'T3' ? 'var(--info)' :
                'var(--danger)';
  return (
    <div className="score-ring" style={{ width: size, height: size, '--c': color }}>
      <svg width={size} height={size}>
        <circle className="track" cx={size/2} cy={size/2} r={r} fill="none" strokeWidth="8" />
        <circle className="progress" cx={size/2} cy={size/2} r={r} fill="none" strokeWidth="8" strokeLinecap="round"
                strokeDasharray={circ} strokeDashoffset={offset} />
      </svg>
      <div style={{ textAlign: 'center', position: 'relative', zIndex: 1 }}>
        <div className="score-ring-value">{score}</div>
        <div className="score-ring-max">of {max}</div>
      </div>
    </div>
  );
};

/* ============================================================
   Toasts
   ============================================================ */
const ToastContext = createContext(null);
const useToast = () => useContext(ToastContext);

const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((toast) => {
    const id = Math.random().toString(36).slice(2);
    setToasts(t => [...t, { id, ...toast }]);
    if (toast.duration !== 0) {
      setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), toast.duration || 4200);
    }
  }, []);
  const remove = useCallback((id) => setToasts(t => t.filter(x => x.id !== id)), []);
  return (
    <ToastContext.Provider value={{ push, remove }}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.tone || 'info'}`} role="alert">
            <div className="toast-bar" aria-hidden="true"/>
            <Icon name={t.tone === 'success' ? 'check-bold' : t.tone === 'warn' ? 'alert' : t.tone === 'danger' ? 'alert' : 'info'} className="toast-icon" />
            <div style={{ flex: 1 }}>
              <div className="toast-title">{t.title}</div>
              {t.message && <div className="toast-msg">{t.message}</div>}
            </div>
            <button className="toast-close" onClick={() => remove(t.id)} aria-label="Dismiss"><Icon name="close" size={14}/></button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

/* ============================================================
   Empty State
   ============================================================ */
const EmptyState = ({ icon = 'sparkle', title, message, action }) => (
  <div className="empty-state">
    <div className="empty-icon"><Icon name={icon} size={26}/></div>
    <div>
      <div className="empty-title">{title}</div>
      {message && <div className="empty-msg">{message}</div>}
    </div>
    {action}
  </div>
);

/* ============================================================
   Tooltip wrapper
   ============================================================ */
const Tip = ({ children, label }) => (
  <span className="tt-host">
    {children}
    {label && <span className="tt">{label}</span>}
  </span>
);

/* ============================================================
   Tag
   ============================================================ */
const Tag = ({ children, tone, mono }) => (
  <span className={`tag ${tone || ''}`} style={mono ? { fontFamily: "'JetBrains Mono', monospace" } : null}>{children}</span>
);

/* ============================================================
   Level pip — e.g. "S2", "R3"
   ============================================================ */
const LevelPip = ({ level, stage }) => (
  <span className={`level-pip ${level}`}>{level}{stage || ''}</span>
);

/* ============================================================
   Sidebar
   ============================================================ */
const SIDEBAR_ITEMS = [
  { id: 'dashboard',  label: 'Dashboard',          icon: 'dashboard' },
  { id: 'employees',  label: 'Employees',          icon: 'employees' },
  { id: 'evaluation', label: 'My Evaluation',      icon: 'evaluation', badge: 'IN_REVIEW' },
  { id: 'calendar',   label: 'Availability',       icon: 'calendar' },
  { id: 'schedule',   label: 'Interviews',         icon: 'schedule' },
];

const Sidebar = ({ active, onNavigate, themeName, onThemeToggle, collapsed, onCollapseToggle }) => {
  const { EMPLOYEES, CURRENT_USER_ID } = COMPETENCE_DATA;
  const me = EMPLOYEES.find(e => e.id === CURRENT_USER_ID);
  return (
    <aside className="sidebar">
      <button
        className="sidebar-collapse-btn"
        onClick={onCollapseToggle}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        <Icon name="chevron-left" size={12}/>
      </button>
      <div className="sidebar-brand">
        <div className="sidebar-brand-mark">C</div>
        <div className="sidebar-brand-text-block">
          <div className="sidebar-brand-text">Competence</div>
          <div className="sidebar-brand-sub">Spring '26 cycle</div>
        </div>
      </div>

      <div className="sidebar-section-label">Workspace</div>
      <nav className="sidebar-nav">
        {SIDEBAR_ITEMS.map(item => (
          <button
            key={item.id}
            className={`sidebar-item ${active === item.id ? 'active' : ''}`}
            onClick={() => onNavigate(item.id)}
            data-tip={item.label}
          >
            <span className="sidebar-item-icon"><Icon name={item.icon}/></span>
            <span className="sidebar-item-label">{item.label}</span>
            {item.badge && active !== item.id && (
              <span className="sidebar-item-badge">1</span>
            )}
          </button>
        ))}
      </nav>

      <div className="sidebar-section-label">Quick links</div>
      <nav className="sidebar-nav">
        <button className="sidebar-item" onClick={() => onNavigate('guide')} data-tip="Process guide">
          <span className="sidebar-item-icon"><Icon name="guide"/></span>
          <span className="sidebar-item-label">Process guide</span>
        </button>
        <button className="sidebar-item" onClick={() => onNavigate('help')} data-tip="Help & shortcuts">
          <span className="sidebar-item-icon"><Icon name="help"/></span>
          <span className="sidebar-item-label">Help & shortcuts</span>
        </button>
      </nav>

      <div className="sidebar-foot">
        <button
          className="sidebar-item"
          onClick={onThemeToggle}
          data-tip={`Theme: ${themeName === 'daylight' ? 'Daylight' : 'Black Glass'}`}
          title="Toggle theme"
        >
          <span className="sidebar-item-icon"><Icon name={themeName === 'daylight' ? 'compass' : 'sparkle'}/></span>
          <span className="sidebar-item-label">{themeName === 'daylight' ? 'Daylight' : 'Black Glass'}</span>
        </button>
        <button className="sidebar-user" onClick={() => onNavigate('profile')} data-tip={me?.name}>
          <Avatar employee={me} size="sm"/>
          <div className="sidebar-user-text">
            <div className="sidebar-user-name">{me?.name}</div>
            <div className="sidebar-user-sub">Senior · S2</div>
          </div>
        </button>
      </div>
    </aside>
  );
};

/* ============================================================
   Topbar
   ============================================================ */
const Topbar = ({ title, sub, actions, breadcrumb }) => (
  <header className="topbar">
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--s-3)' }}>
        <div className="topbar-title">{title}</div>
        {sub && <div className="topbar-sub">{sub}</div>}
      </div>
    </div>
    <div className="topbar-spacer"/>
    <div className="topbar-actions">
      <button className="btn icon ghost" aria-label="Search"><Icon name="search"/></button>
      <button className="btn icon ghost" aria-label="Notifications"><Icon name="bell"/></button>
      {actions}
    </div>
  </header>
);

/* ============================================================
   Role banner — calm reassuring framing
   ============================================================ */
const ROLE_COPY = {
  1: { role: 'employee', title: 'You are reviewing yourself',
       msg: 'Take your time. Your grades are private to you and your manager — your team won\'t see them. There are no wrong answers; we\'ll discuss everything in the interview.' },
  2: { role: 'manager',  title: 'You are reviewing as the manager',
       msg: 'You can see the employee\'s self-grades and the aggregated team feedback. Your submission will calculate the final scores and move this evaluation to Ready.' },
  4: { role: 'team',     title: 'You are providing team feedback',
       msg: 'Your grades are anonymous to the employee. You grade by subcategory; we apply your grade to every competency within it. Submit only when you\'re confident.' },
};
const RoleBanner = ({ role }) => {
  const c = ROLE_COPY[role];
  if (!c) return null;
  return (
    <div className={`role-banner ${c.role}`}>
      <div className="role-banner-icon"><Icon name={c.role === 'manager' ? 'briefcase' : c.role === 'team' ? 'users' : 'user'} size={16}/></div>
      <div>
        <div className="role-banner-title">{c.title}</div>
        <div className="role-banner-msg">{c.msg}</div>
      </div>
    </div>
  );
};

// Expose for other scripts
Object.assign(window, {
  fmtDate, fmtDateShort, fmtTime, daysBetween,
  Avatar, StatusPill, StateTrack, GradeChip, GradeSelector, ScoreRing,
  ToastProvider, useToast,
  EmptyState, Tip, Tag, LevelPip,
  Sidebar, Topbar, RoleBanner,
});
})();
