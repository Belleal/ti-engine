// Calendar + Interview Schedule screens for the Competence prototype.

(() => {
const {
  Icon, COMPETENCE_DATA,
  fmtDate, fmtDateShort, daysBetween,
  Avatar, StatusPill, GradeChip, EmptyState, Tip, Tag, LevelPip,
  useToast,
} = window;

const ScreenCalendar_data = COMPETENCE_DATA;

function ScreenCalendar({ onNavigate }) {
  const toast = useToast();
  const { CAL_SLOTS, CALENDAR_CONFIG, CYCLE, TODAY } = ScreenCalendar_data;

  // Week navigation
  const startOfWeek = (d) => { const x = new Date(d); const dow = x.getDay(); x.setDate(x.getDate() + (dow === 0 ? -6 : 1 - dow)); x.setHours(0,0,0,0); return x; };
  const [weekStart, setWeekStart] = React.useState(startOfWeek(TODAY));
  const [slots, setSlots] = React.useState(CAL_SLOTS);

  const days = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date(weekStart); d.setDate(d.getDate() + i);
    days.push(d);
  }
  const isoDate = (d) => d.toISOString().slice(0, 10);
  const isToday = (d) => isoDate(d) === isoDate(TODAY);

  // Time slots from working hours
  const times = [];
  const [sh, sm] = CALENDAR_CONFIG.workingHoursStart.split(':').map(Number);
  const [eh, em] = CALENDAR_CONFIG.workingHoursEnd.split(':').map(Number);
  let h = sh, m = sm;
  while (h < eh || (h === eh && m < em)) {
    times.push(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`);
    m += CALENDAR_CONFIG.slotDurationMinutes;
    if (m >= 60) { m -= 60; h += 1; }
  }

  const getSlot = (date, time) => slots.find(s => s.date === date && s.startTime === time);
  const slotState = (date, time) => {
    const s = getSlot(date, time);
    if (!s || s.status === 'deleted') return 'empty';
    return s.status;
  };

  const toggleSlot = (date, time, targetStatus) => {
    const existing = getSlot(date, time);
    if (existing?.status === 'booked') return;
    if (existing && existing.status === targetStatus) {
      // remove
      setSlots(slots.filter(s => !(s.date === date && s.startTime === time)));
      toast.push({ title: 'Slot removed', tone: 'info', duration: 1800 });
    } else if (existing) {
      setSlots(slots.map(s => s.date === date && s.startTime === time ? { ...s, status: targetStatus } : s));
    } else {
      setSlots([...slots, { slotID: 'SL-' + Math.random().toString(36).slice(2), managerID: ScreenCalendar_data.MANAGER_ID, date, startTime: time, status: targetStatus }]);
    }
  };

  const removeSlot = (date, time) => {
    const existing = getSlot(date, time);
    if (existing?.status === 'booked') return;
    setSlots(slots.filter(s => !(s.date === date && s.startTime === time)));
  };

  const weekLabel = () => {
    const end = new Date(weekStart); end.setDate(end.getDate() + 4);
    const fmt = (d) => d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
    return `${fmt(weekStart)} – ${fmt(end)}`;
  };
  const prevWeek = () => { const d = new Date(weekStart); d.setDate(d.getDate() - 7); setWeekStart(d); };
  const nextWeek = () => { const d = new Date(weekStart); d.setDate(d.getDate() + 7); setWeekStart(d); };
  const canPrev = weekStart > startOfWeek(TODAY);
  const canNext = (new Date(weekStart)).getTime() < new Date(CYCLE.cycleDate).getTime() - 7 * 86400000;

  const availableCount = slots.filter(s => s.status === 'available').length;
  const bookedCount = slots.filter(s => s.status === 'booked').length;

  return (
    <main className="page-wide" style={{ maxWidth: 1300, margin: '0 auto' }}>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">Your availability</div>
          <h1 className="page-title">Interview calendar</h1>
          <p className="page-subtitle">Block slots when you're free to host evaluation interviews. Supervisors book directly from here — you'll be notified each time.</p>
        </div>
      </div>

      <div className="cal-help-card">
        <div className="cal-help-icon"><Icon name="info" size={20}/></div>
        <div>
          <div className="cal-help-title">How this works</div>
          <div className="cal-help-msg">Hover any empty cell to mark it available (✓) or busy (✕). Click a green or amber cell to clear it. Booked cells stay locked — cancel from Interviews if needed.</div>
        </div>
      </div>

      <div className="calendar-toolbar">
        <button className="btn icon" onClick={prevWeek} disabled={!canPrev} aria-label="Previous week"><Icon name="chevron-left" size={14}/></button>
        <button className="btn icon" onClick={nextWeek} disabled={!canNext} aria-label="Next week"><Icon name="chevron-right" size={14}/></button>
        <div>
          <div className="calendar-week-label">{weekLabel()}</div>
          <div className="calendar-week-sub">{CYCLE.cycleID} · {daysBetween(CYCLE.cycleDate, TODAY)} days until cycle closes</div>
        </div>
        <div className="spacer"/>
        <div style={{ display: 'flex', gap: 'var(--s-5)', alignItems: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <span className="mono" style={{ fontWeight: 600 }}>{availableCount}</span>
            <span className="tiny muted-text">available</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <span className="mono" style={{ fontWeight: 600 }}>{bookedCount}</span>
            <span className="tiny muted-text">booked</span>
          </div>
        </div>
      </div>

      <div className="calendar-grid">
        <div className="calendar-table">
          <div className="cal-corner"></div>
          {days.map(d => (
            <div className="cal-header-cell" key={isoDate(d)}>
              <div className="cal-header-day">{d.toLocaleDateString('en-US', { weekday: 'short' })}</div>
              <div className={`cal-header-date ${isToday(d) ? 'today' : ''}`}>
                {String(d.getDate()).padStart(2, '0')} {d.toLocaleDateString('en-US', { month: 'short' })}
              </div>
            </div>
          ))}
          {times.map(t => (
            <React.Fragment key={t}>
              <div className="cal-time-cell">{t}</div>
              {days.map(d => {
                const date = isoDate(d);
                const state = slotState(date, t);
                const slot = getSlot(date, t);
                return (
                  <div
                    key={date + '-' + t}
                    className={`cal-slot ${state}`}
                    onClick={() => {
                      if (state === 'available' || state === 'busy') removeSlot(date, t);
                    }}
                    role="button"
                    tabIndex={0}
                    aria-label={`${date} ${t} — ${state}`}
                  >
                    {state === 'empty' && (
                      <div className="cal-slot-split">
                        <button type="button" className="cal-slot-split-half available"
                                onClick={(e) => { e.stopPropagation(); toggleSlot(date, t, 'available'); }}
                                aria-label="Mark available">
                          <Icon name="check-bold" size={14}/>
                        </button>
                        <button type="button" className="cal-slot-split-half busy"
                                onClick={(e) => { e.stopPropagation(); toggleSlot(date, t, 'busy'); }}
                                aria-label="Mark busy">
                          <Icon name="close-bold" size={14}/>
                        </button>
                      </div>
                    )}
                    {state === 'available' && <span>Free</span>}
                    {state === 'busy' && <span>Busy</span>}
                    {state === 'booked' && (
                      <>
                        <Icon name="lock" size={11} className="cal-booked-icon"/>
                        <span style={{ fontWeight: 600 }}>{slot?.booking?.employeeName?.split(' ')[0]}</span>
                        <span style={{ fontSize: 9.5, opacity: 0.7 }}>interview</span>
                      </>
                    )}
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
        <div className="cal-legend">
          <span className="cal-legend-item"><span className="cal-legend-swatch" style={{ background: 'var(--success-soft)', border: '1px solid var(--success)' }}/> Available</span>
          <span className="cal-legend-item"><span className="cal-legend-swatch" style={{ background: 'var(--info-soft)', border: '1px solid var(--info)' }}/> Booked (read-only)</span>
          <span className="cal-legend-item"><span className="cal-legend-swatch" style={{ background: 'var(--warn-soft)', border: '1px solid var(--warn)' }}/> Busy</span>
          <span className="cal-legend-item"><span className="cal-legend-swatch" style={{ background: 'var(--bg-surface)', border: '1px dashed var(--border-strong)' }}/> Empty (hover)</span>
        </div>
      </div>
    </main>
  );
}

// ============================================================
// INTERVIEW SCHEDULE
// ============================================================
function ScreenInterviews({ onNavigate }) {
  const toast = useToast();
  const { CAL_SLOTS, EVALUATIONS, EMPLOYEES, CYCLE, TODAY } = ScreenCalendar_data;
  const [slots, setSlots] = React.useState(CAL_SLOTS);
  const [evaluations, setEvaluations] = React.useState(EVALUATIONS.filter(e => e.status === 'READY'));
  const [selected, setSelected] = React.useState(null);
  const [weekOffset, setWeekOffset] = React.useState(0);

  const startOfWeek = (d) => { const x = new Date(d); const dow = x.getDay(); x.setDate(x.getDate() + (dow === 0 ? -6 : 1 - dow)); x.setHours(0,0,0,0); return x; };
  const base = startOfWeek(TODAY);

  // Build 4 weeks of available slots starting at base + weekOffset
  const weeks = [];
  for (let i = 0; i < 4; i++) {
    const ws = new Date(base); ws.setDate(ws.getDate() + (weekOffset + i) * 7);
    const we = new Date(ws); we.setDate(we.getDate() + 6);
    const fmt = (d) => d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
    const label = `${fmt(ws)} – ${fmt(we)}`;
    const weekSlots = slots.filter(s => {
      const d = new Date(s.date);
      return s.status === 'available' && d >= ws && d <= we;
    }).sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
    weeks.push({ label, slots: weekSlots });
  }

  const bookSlot = (slotID) => {
    if (!selected) return;
    const slot = slots.find(s => s.slotID === slotID);
    const ev = evaluations.find(e => e.evaluationID === selected);
    if (!slot || !ev) return;
    const emp = EMPLOYEES.find(e => e.id === ev.employeeID);
    setSlots(slots.map(s => s.slotID === slotID ? { ...s, status: 'booked', booking: { evaluationID: ev.evaluationID, employeeID: ev.employeeID, employeeName: emp.name, bookedAt: TODAY.toISOString() } } : s));
    setEvaluations(evaluations.map(e => e.evaluationID === selected ? { ...e, interviewDate: slot.date, bookedSlotID: slotID } : e));
    toast.push({ title: 'Interview booked', message: `${emp.name}'s interview is set for ${fmtDate(slot.date)} at ${slot.startTime}.`, tone: 'success' });
    setSelected(null);
  };

  const cancelBooking = (evaluationID) => {
    const ev = evaluations.find(e => e.evaluationID === evaluationID);
    if (!ev?.bookedSlotID) {
      // Find a booked slot for this evaluation
      const slot = slots.find(s => s.status === 'booked' && s.booking?.evaluationID === evaluationID);
      if (slot) {
        setSlots(slots.map(s => s.slotID === slot.slotID ? { ...s, status: 'available', booking: undefined } : s));
      }
    } else {
      setSlots(slots.map(s => s.slotID === ev.bookedSlotID ? { ...s, status: 'available', booking: undefined } : s));
    }
    setEvaluations(evaluations.map(e => e.evaluationID === evaluationID ? { ...e, interviewDate: null, bookedSlotID: null } : e));
    toast.push({ title: 'Interview cancelled', message: 'The slot is back in the pool.', tone: 'info' });
  };

  return (
    <main className="page-wide" style={{ maxWidth: 1400, margin: '0 auto' }}>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">Interview scheduling</div>
          <h1 className="page-title">Interviews ready to schedule</h1>
          <p className="page-subtitle">These evaluations are in <em>Ready</em>. Pick one, then choose a slot from any manager's calendar.</p>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <div className="panel-title">Ready evaluations</div>
          <div className="panel-sub">{evaluations.length} awaiting interview</div>
        </div>
        {evaluations.length === 0 ? (
          <EmptyState icon="sparkle" title="No evaluations waiting" message="All ready evaluations have been scheduled. Nice work."/>
        ) : (
          <div className="interview-list">
            {evaluations.map(ev => {
              const emp = EMPLOYEES.find(e => e.id === ev.employeeID);
              return (
                <div key={ev.evaluationID} className={`interview-row ${selected === ev.evaluationID ? 'selected' : ''}`}>
                  <Avatar employee={emp} size="md"/>
                  <div>
                    <div style={{ fontWeight: 600 }}>{emp.name}</div>
                    <div className="tiny muted-text">{ev.evaluationID} · {COMPETENCE_DATA.CAREER_PATHS[emp.careerPath]} · {ev.stageLevel}</div>
                  </div>
                  <div>
                    <div className="tiny muted-text" style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>Score</div>
                    <div style={{ fontWeight: 600, fontFamily: 'JetBrains Mono, monospace' }}>{ev.finalScore?.score || '—'} · {ev.finalScore?.interpretationName}</div>
                  </div>
                  <div>
                    <div className="tiny muted-text" style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>Interview</div>
                    <div>{ev.interviewDate ? fmtDate(ev.interviewDate) : <span className="muted-text">Not scheduled</span>}</div>
                  </div>
                  <div className="interview-actions">
                    {ev.interviewDate ? (
                      <button className="btn sm danger" onClick={() => cancelBooking(ev.evaluationID)}><Icon name="close" size={14}/> Cancel</button>
                    ) : (
                      <button className={`btn sm ${selected === ev.evaluationID ? 'primary' : ''}`}
                              onClick={() => setSelected(selected === ev.evaluationID ? null : ev.evaluationID)}>
                        {selected === ev.evaluationID ? 'Cancel selection' : 'Schedule'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {selected && (
        <div className="panel">
          <div className="panel-head">
            <div className="panel-title">Pick a slot</div>
            <div className="panel-sub">Available across all managers · grouped by week</div>
            <div className="panel-head-actions">
              <button className="btn sm" onClick={() => setWeekOffset(weekOffset - 4)} disabled={weekOffset <= 0}><Icon name="chevron-left" size={12}/> Earlier</button>
              <button className="btn sm" onClick={() => setWeekOffset(weekOffset + 4)}>Later <Icon name="chevron-right" size={12}/></button>
            </div>
          </div>
          <div className="slot-picker-grid">
            {weeks.map(week => (
              <div className="slot-week-col" key={week.label}>
                <div className="slot-week-head">{week.label}</div>
                <div className="slot-week-body">
                  {week.slots.length === 0
                    ? <div className="slot-empty-week">—</div>
                    : week.slots.map(s => {
                        const d = new Date(s.date);
                        return (
                          <button key={s.slotID} className="slot-btn" onClick={() => bookSlot(s.slotID)}>
                            <span className="slot-time">{d.toLocaleDateString('en-US', { weekday: 'short' })} · {s.startTime}</span>
                            <span className="slot-mgr">{s.managerName || 'Manager'}</span>
                          </button>
                        );
                      })
                  }
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}

window.ScreenCalendar = ScreenCalendar;
window.ScreenInterviews = ScreenInterviews;
})();
