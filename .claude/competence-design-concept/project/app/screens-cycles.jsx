// Cycles + Cycle Setup screens for the Competence prototype.

(() => {
const { useState, useEffect, useMemo, useRef } = React;
const {
  Icon, COMPETENCE_DATA,
  fmtDate, fmtDateShort, daysBetween,
  Avatar, StatusPill, EmptyState, Tip, Tag, LevelPip,
  useToast,
} = window;
const {
  CYCLES, CYCLE_STATUSES, ROLE_FAMILIES, SUBCATEGORIES, ALL_COMPETENCY_ITEMS, COMPETENCY_SETS,
  EMPLOYEES, COMPETENCIES, TODAY,
} = COMPETENCE_DATA;

const findEmployee = (id) => EMPLOYEES.find(e => e.id === id);

// ============================================================
// MODAL — reused
// ============================================================
function Modal({ open, onClose, title, eyebrow, size, tone, children, foot }) {
  useEffect(() => {
    if (!open) return;
    const h = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal ${size || ''} ${tone || ''}`} role="dialog" aria-modal="true">
        <div className="modal-head">
          <div className="modal-head-content">
            {eyebrow && <div className="modal-eyebrow">{eyebrow}</div>}
            <div className="modal-title">{title}</div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            <Icon name="close" size={16}/>
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {foot && <div className="modal-foot">{foot}</div>}
      </div>
    </div>
  );
}

// ============================================================
// CYCLES
// ============================================================
function ScreenCycles({ onNavigate }) {
  const toast = useToast();
  const [cycles, setCycles] = useState(CYCLES);
  const [modal, setModal] = useState(null); // { kind, payload, errorMessage }
  const hasOpenPlanning = cycles.some(c => c.status === 'PLANNING');

  const open = (kind, payload = {}) => setModal({ kind, payload });
  const close = () => setModal(null);

  const submitCreate = () => {
    const p = modal.payload;
    if (!p.cycleID || !p.name || !p.cycleStart || !p.cycleEnd) {
      setModal({ ...modal, errorMessage: 'All fields except review date are required.' });
      return;
    }
    if (cycles.find(c => c.cycleID === p.cycleID)) {
      setModal({ ...modal, errorMessage: `Cycle ID ${p.cycleID} already exists.` });
      return;
    }
    setCycles([...cycles, {
      ...p, status: 'PLANNING', counts: { inProgress: 0, completed: 0 },
      createdAt: TODAY.toISOString().slice(0, 10),
      createdByName: 'Galina Vasileva',
    }]);
    toast.push({ title: 'Cycle created', message: `${p.cycleID} is in Planning. Configure its competency sets next.`, tone: 'success' });
    close();
  };

  const submitLock = () => {
    setCycles(cycles.map(c => c.cycleID === modal.payload.cycleID ? { ...c, status: 'ACTIVE' } : c));
    toast.push({ title: 'Cycle activated', message: `${modal.payload.cycleID} is live — managers can now open evaluations.`, tone: 'success' });
    close();
  };

  const submitClose = () => {
    setCycles(cycles.map(c => c.cycleID === modal.payload.cycleID
      ? { ...c, status: 'CLOSED', actualCloseDate: TODAY.toISOString().slice(0, 10) }
      : c));
    toast.push({ title: 'Cycle closed', message: `${modal.payload.cycleID} is archived.`, tone: 'info' });
    close();
  };

  return (
    <main className="page-wide" style={{ maxWidth: 1400, margin: '0 auto' }}>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">Cycle management</div>
          <h1 className="page-title">Performance cycles</h1>
          <p className="page-subtitle">Plan, lock, and close annual or semi-annual appraisal cycles. Only one cycle can be active at a time; new cycles start in Planning until their competency sets are locked.</p>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head bar">
          <div className="panel-head-icon"><Icon name="cycles" size={16}/></div>
          <div className="panel-title">All cycles</div>
          <div className="panel-sub">{cycles.length} total</div>
          <div className="panel-head-actions">
            <button
              className="btn sm primary"
              disabled={hasOpenPlanning}
              onClick={() => open('create', { cycleID: '', name: '', cycleStart: '', cycleDate: '', cycleEnd: '' })}
            >
              <Icon name="add" size={14}/> New cycle
            </button>
          </div>
        </div>

        <div className="data-grid bordered cycle-grid">
          <div className="data-grid-head">
            <span>Cycle</span>
            <span>Name</span>
            <span>Schedule</span>
            <span>Status</span>
            <span>Evaluations</span>
            <span>Created</span>
            <span className="cell-right">Actions</span>
          </div>
          <div className="data-grid-rows">
            {cycles.map(c => (
              <div className="data-grid-row" key={c.cycleID}>
                <span><Tag mono>{c.cycleID}</Tag></span>
                <div className="cycle-row-name">{c.name}</div>
                <div>
                  <div className="cycle-row-dates">
                    <span>{fmtDateShort(c.cycleStart)}</span>
                    <Icon name="arrow-right" size={11} className="muted-text" style={{ margin: '0 4px' }}/>
                    <span>{fmtDateShort(c.cycleEnd)}</span>
                  </div>
                  {c.actualCloseDate && (
                    <div className="cycle-row-actual"><Icon name="lock" size={10}/> closed {fmtDateShort(c.actualCloseDate)}</div>
                  )}
                </div>
                <StatusPill status={c.status}/>
                <div>
                  {(c.counts.inProgress > 0 || c.counts.completed > 0) ? (
                    <div className="cycle-row-counts">
                      {c.counts.inProgress > 0 && (
                        <span><strong>{c.counts.inProgress}</strong> in progress</span>
                      )}
                      {c.counts.inProgress > 0 && c.counts.completed > 0 && <span className="muted-text">·</span>}
                      {c.counts.completed > 0 && (
                        <span><strong>{c.counts.completed}</strong> completed</span>
                      )}
                    </div>
                  ) : (
                    <span className="muted-text small">No evaluations yet</span>
                  )}
                </div>
                <div>
                  <div className="small">{fmtDateShort(c.createdAt)}</div>
                  <div className="tiny muted-text">{c.createdByName}</div>
                </div>
                <div className="cell-right">
                  <div className="cycle-row-actions">
                    <button className="btn sm" onClick={() => onNavigate('cycle-setup', { cycleID: c.cycleID })}>
                      Open
                    </button>
                    {c.status === 'PLANNING' && (
                      <button className="btn sm primary" onClick={() => open('lock-confirm', c)}>
                        <Icon name="send" size={12}/> Lock
                      </button>
                    )}
                    {c.status === 'ACTIVE' && (
                      <button className="btn sm danger" onClick={() => open('close-confirm', c)}>Close</button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <Modal open={modal?.kind === 'create'} onClose={close} size="medium"
             eyebrow="New cycle"
             title="Create a new performance cycle"
             foot={
               <>
                 <button className="btn ghost" onClick={close}>Cancel</button>
                 <button className="btn primary" onClick={submitCreate}>Create cycle</button>
               </>
             }>
        {modal?.kind === 'create' && (
          <div className="form-stack">
            <div>
              <label className="field-label">Cycle ID</label>
              <input className="input" maxLength={7} value={modal.payload.cycleID}
                     placeholder="e.g. 2026-H2"
                     onChange={e => setModal({ ...modal, payload: { ...modal.payload, cycleID: e.target.value } })}/>
              <div className="form-hint">Short identifier used everywhere — keep it under 7 characters.</div>
            </div>
            <div>
              <label className="field-label">Name</label>
              <input className="input" value={modal.payload.name} placeholder="Autumn '26"
                     onChange={e => setModal({ ...modal, payload: { ...modal.payload, name: e.target.value } })}/>
            </div>
            <div className="form-grid-3">
              <div>
                <label className="field-label">Start date</label>
                <input type="date" className="input" value={modal.payload.cycleStart}
                       onChange={e => setModal({ ...modal, payload: { ...modal.payload, cycleStart: e.target.value } })}/>
              </div>
              <div>
                <label className="field-label">Review date</label>
                <input type="date" className="input" value={modal.payload.cycleDate}
                       onChange={e => setModal({ ...modal, payload: { ...modal.payload, cycleDate: e.target.value } })}/>
              </div>
              <div>
                <label className="field-label">End date</label>
                <input type="date" className="input" value={modal.payload.cycleEnd}
                       onChange={e => setModal({ ...modal, payload: { ...modal.payload, cycleEnd: e.target.value } })}/>
              </div>
            </div>
            {modal.errorMessage && <div className="form-error">{modal.errorMessage}</div>}
          </div>
        )}
      </Modal>

      <Modal open={modal?.kind === 'lock-confirm'} onClose={close}
             title="Lock cycle and make it active?"
             foot={<>
               <button className="btn ghost" onClick={close}>Cancel</button>
               <button className="btn primary" onClick={submitLock}>Lock cycle</button>
             </>}>
        {modal?.kind === 'lock-confirm' && (
          <>
            <p className="secondary-text">Once locked, the competency sets are frozen for this cycle. Managers can immediately open evaluations against them. The cycle's competency setup will be read-only.</p>
            <div className="lock-target">
              <Tag mono>{modal.payload.cycleID}</Tag>
              <span>{modal.payload.name}</span>
            </div>
          </>
        )}
      </Modal>

      <Modal open={modal?.kind === 'close-confirm'} onClose={close} tone="danger"
             title="Close this cycle?"
             foot={<>
               <button className="btn ghost" onClick={close}>Cancel</button>
               <button className="btn danger" onClick={submitClose}>Close cycle</button>
             </>}>
        {modal?.kind === 'close-confirm' && (
          <>
            <p className="secondary-text">Closing archives all evaluations in this cycle. No further drafts, submissions, or interview bookings will be possible. This cannot be undone.</p>
            <div className="lock-target">
              <Tag mono>{modal.payload.cycleID}</Tag>
              <span>{modal.payload.name}</span>
            </div>
          </>
        )}
      </Modal>
    </main>
  );
}

// ============================================================
// CYCLE SETUP — two-pane editor
// ============================================================
function ScreenCycleSetup({ cycleID, onNavigate }) {
  const toast = useToast();
  const cycle = CYCLES.find(c => c.cycleID === cycleID) || CYCLES.find(c => c.status === 'PLANNING') || CYCLES[2];
  const isReadOnly = cycle.status !== 'PLANNING';

  // local working copy of all sets
  const [sets, setSets] = useState(() => ({ ...COMPETENCY_SETS }));
  const [savedSets, setSavedSets] = useState(() => ({ ...COMPETENCY_SETS }));

  const [selFamily, setSelFamily] = useState(ROLE_FAMILIES[0].code);
  const [selKey, setSelKey] = useState('baseline');
  const [markedEmpty, setMarkedEmpty] = useState({});
  const [picker, setPicker] = useState(null);
  const [cloneOpen, setCloneOpen] = useState(false);

  const selectedFamily = ROLE_FAMILIES.find(f => f.code === selFamily);
  const k = `${selFamily}.${selKey}`;
  const draftCodes = sets[k] || [];
  const isEmpty = sets[k] === null;
  const dirty = JSON.stringify(sets[k]) !== JSON.stringify(savedSets[k]);

  const setDraft = (codes) => setSets(prev => ({ ...prev, [k]: codes }));

  const CAP = 22; // total competency cap per role
  const totalForRole = (() => {
    const baseline = sets[`${selFamily}.baseline`] || [];
    const spec = selKey === 'baseline' ? [] : (sets[k] || []);
    return baseline.length + spec.length;
  })();

  const nodeStatus = (family, key) => {
    const v = sets[`${family}.${key}`];
    if (v === null || v === undefined) return 'incomplete';
    if (v.length === 0 && key !== 'baseline') return 'empty';
    if (v.length === 0) return 'incomplete';
    return 'complete';
  };
  const nodeCount = (family, key) => {
    const v = sets[`${family}.${key}`];
    return v?.length || 0;
  };

  const subcategoryCovered = (subCode) => {
    const baseline = sets[`${selFamily}.baseline`] || [];
    return baseline.some(code => code.startsWith(subCode));
  };

  const competencyInfo = (code) => ALL_COMPETENCY_ITEMS.find(i => i.id === code);

  const saveDraft = () => {
    setSavedSets({ ...sets });
    toast.push({ title: 'Configuration saved', tone: 'success', duration: 2200 });
  };

  return (
    <main className="page-wide" style={{ maxWidth: 1500, margin: '0 auto' }}>
      <div className="page-head" style={{ alignItems: 'center' }}>
        <div>
          <div className="page-eyebrow">Cycle setup · competencies</div>
          <h1 className="page-title">
            <span className="mono" style={{ fontSize: 26, fontWeight: 500, marginRight: 'var(--s-3)' }}>{cycle.cycleID}</span>
            <span style={{ fontWeight: 500 }}>{cycle.name}</span>
          </h1>
        </div>
        <div className="spacer"/>
        <StatusPill status={cycle.status}/>
        <button className="btn ghost" onClick={() => onNavigate('cycles')}><Icon name="chevron-left" size={14}/> All cycles</button>
      </div>

      {isReadOnly && (
        <div className="readonly-banner">
          <Icon name="lock" size={16}/>
          This cycle is {cycle.status === 'ACTIVE' ? 'active' : 'closed'} — competency sets are read-only. To make changes, create a new cycle.
        </div>
      )}

      <div className="cycle-setup-shell">
        <div className="cycle-setup-tree">
          <div className="cycle-setup-tree-head">Role families</div>
          {ROLE_FAMILIES.map(family => (
            <div className="cs-family" key={family.code}>
              <div className="cs-family-head">
                <Tag mono>{family.code}</Tag>
                <span className="cs-family-name">{family.name}</span>
              </div>
              <div className="cs-spec-list">
                <button
                  className={`cs-node ${selFamily === family.code && selKey === 'baseline' ? 'is-selected' : ''}`}
                  onClick={() => { setSelFamily(family.code); setSelKey('baseline'); }}
                >
                  <span className="cs-node-icon" data-status={nodeStatus(family.code, 'baseline')}/>
                  <span className="cs-node-label">Baseline</span>
                  {nodeCount(family.code, 'baseline') > 0 && (
                    <span className="cs-node-count">{nodeCount(family.code, 'baseline')}</span>
                  )}
                </button>
                {family.specializations.map(spec => (
                  <button
                    key={spec.code}
                    className={`cs-node spec ${selFamily === family.code && selKey === spec.code ? 'is-selected' : ''}`}
                    onClick={() => { setSelFamily(family.code); setSelKey(spec.code); }}
                  >
                    <span className="cs-node-icon" data-status={nodeStatus(family.code, spec.code)}/>
                    <span className="cs-node-label">{spec.name}</span>
                    {nodeCount(family.code, spec.code) > 0 && (
                      <span className="cs-node-count">{nodeCount(family.code, spec.code)}</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="cycle-setup-editor">
          <div className="cs-editor-head">
            <div className="cs-editor-title">
              <Tag mono>{selFamily}</Tag>
              <span>{selectedFamily.name}</span>
              {selKey !== 'baseline' && <>
                <span className="muted-text">/</span>
                <span>{selectedFamily.specializations.find(s => s.code === selKey)?.name}</span>
              </>}
            </div>
            <div className="cs-editor-desc">
              {selKey === 'baseline'
                ? 'Competencies graded for every employee in this role family. The floor coverage indicator below shows which subcategories must be represented.'
                : 'Extra competencies graded only for employees in this specialization. These add to the baseline (don\'t override it).'}
            </div>
          </div>

          {/* Cap */}
          <div className="cs-indicator-row">
            <div className="cs-indicator-label">Total cap</div>
            <div className="cs-indicator-content">
              <div className={`cap-indicator ${totalForRole > CAP ? 'over' : totalForRole === CAP ? 'at' : ''}`}>
                <div className="cap-bar"><div className="cap-bar-fill" style={{ width: `${Math.min(100, (totalForRole / CAP) * 100)}%` }}/></div>
                <div className="cap-text"><strong>{totalForRole}</strong> of {CAP} competencies <span className="muted-text">for {selectedFamily.name}{selKey !== 'baseline' && ` · ${selectedFamily.specializations.find(s => s.code === selKey)?.name}`}</span></div>
              </div>
            </div>
          </div>

          {/* Floor coverage (baseline only) */}
          {selKey === 'baseline' && (
            <div className="cs-indicator-row">
              <div className="cs-indicator-label">Floor coverage</div>
              <div className="cs-indicator-content">
                <div className="floor-pills">
                  {SUBCATEGORIES.map(sub => {
                    const covered = subcategoryCovered(sub.code);
                    return (
                      <Tip key={sub.code} label={`${sub.name}${covered ? ' — covered' : ' — missing'}`}>
                        <span className={`floor-pill ${covered ? 'satisfied' : 'missing'}`}>
                          {covered ? <Icon name="check" size={10}/> : <Icon name="close" size={10}/>}
                          {sub.code}
                        </span>
                      </Tip>
                    );
                  })}
                </div>
                <div className="cs-hint small">Every subcategory must have at least one baseline competency for this role family to be lockable.</div>
              </div>
            </div>
          )}

          {/* "No extras" toggle on specializations */}
          {selKey !== 'baseline' && (
            <div className="cs-no-extras">
              <label className="cs-no-extras-label">
                <input type="checkbox"
                       checked={isEmpty}
                       disabled={isReadOnly || draftCodes.length > 0}
                       onChange={e => setDraft(e.target.checked ? null : [])}/>
                <span>Mark explicitly empty — no extra competencies for this specialization.</span>
              </label>
              <div className="cs-hint small">Marking empty confirms the choice is deliberate (instead of leaving incomplete), which is required for locking.</div>
            </div>
          )}

          {/* Competencies */}
          <div className="cs-codes">
            {draftCodes.length === 0 && !isEmpty && (
              <div className="cs-codes-empty">
                <Icon name="sparkle" size={20} className="muted-text"/>
                <div>
                  <div className="weight-600">No competencies yet</div>
                  <div className="muted-text small">{selKey === 'baseline' ? 'Add at least one competency per subcategory to satisfy the floor coverage.' : 'Add specialization-specific competencies, or mark explicitly empty.'}</div>
                </div>
              </div>
            )}
            {draftCodes.length > 0 && draftCodes.map(code => {
              const info = competencyInfo(code);
              return (
                <div className="cs-code-row" key={code}>
                  <Tag mono>{code}</Tag>
                  <div className="cs-code-meta">
                    <div className="cs-code-name">{info?.name || code}</div>
                    <div className="cs-code-sub">
                      <Tag>{info?.subcategoryID} · {info?.subcategoryName}</Tag>
                      <span className="muted-text small">{info?.description}</span>
                    </div>
                  </div>
                  {!isReadOnly && (
                    <button className="btn sm ghost icon" onClick={() => setDraft(draftCodes.filter(c => c !== code))} aria-label={`Remove ${code}`}>
                      <Icon name="close" size={14}/>
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Action bar */}
          {!isReadOnly && (
            <div className="cs-editor-actions">
              <button className="btn primary" onClick={() => setPicker({ query: '', category: '', subcategory: '', selected: {} })}>
                <Icon name="add" size={14}/> Add competencies
              </button>
              <button className="btn" onClick={() => setCloneOpen(true)}>
                <Icon name="briefcase" size={14}/> Clone from…
              </button>
              <div className="spacer"/>
              <div className={`form-state ${dirty ? 'unsaved' : 'saved'}`}>
                {dirty ? <><span className="dot"/> Unsaved changes</> : <><Icon name="check" size={12}/> Saved</>}
              </div>
              <button className="btn primary" onClick={saveDraft} disabled={!dirty}>
                Save draft
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Picker modal */}
      <Modal open={!!picker} onClose={() => setPicker(null)} size="large"
             title="Add competencies"
             foot={picker && <>
               <button className="btn ghost" onClick={() => setPicker(null)}>Cancel</button>
               <button className="btn primary"
                       disabled={Object.values(picker.selected).filter(Boolean).length === 0}
                       onClick={() => {
                         const newCodes = Object.entries(picker.selected).filter(([_, v]) => v).map(([k]) => k);
                         setDraft([...draftCodes, ...newCodes.filter(c => !draftCodes.includes(c))]);
                         setPicker(null);
                         toast.push({ title: `${newCodes.length} competencies added`, tone: 'success', duration: 1800 });
                       }}>
                 Add {Object.values(picker.selected).filter(Boolean).length || ''}
               </button>
             </>}>
        {picker && (
          <>
            <div className="picker-filters">
              <input className="input" placeholder="Search competencies…"
                     value={picker.query}
                     onChange={e => setPicker({ ...picker, query: e.target.value })}/>
              <select className="select" value={picker.category} onChange={e => setPicker({ ...picker, category: e.target.value, subcategory: '' })}>
                <option value="">All categories</option>
                {COMPETENCIES.map(c => <option key={c.id} value={c.id}>{c.id} · {c.name}</option>)}
              </select>
              <select className="select" value={picker.subcategory} onChange={e => setPicker({ ...picker, subcategory: e.target.value })}>
                <option value="">All subcategories</option>
                {COMPETENCIES
                  .filter(c => !picker.category || c.id === picker.category)
                  .flatMap(c => c.subcategories)
                  .map(s => <option key={s.id} value={s.id}>{s.id} · {s.name}</option>)}
              </select>
            </div>
            <div className="picker-list">
              {(() => {
                const filtered = ALL_COMPETENCY_ITEMS.filter(it => {
                  if (picker.category && it.categoryID !== picker.category) return false;
                  if (picker.subcategory && it.subcategoryID !== picker.subcategory) return false;
                  if (picker.query) {
                    const q = picker.query.toLowerCase();
                    if (!it.id.toLowerCase().includes(q) && !it.name.toLowerCase().includes(q)) return false;
                  }
                  return true;
                });
                if (filtered.length === 0) return <div className="picker-empty">No matching competencies</div>;
                return filtered.map(it => {
                  const inDraft = draftCodes.includes(it.id);
                  const isChecked = !!picker.selected[it.id];
                  return (
                    <label key={it.id} className={`picker-row ${isChecked ? 'is-selected' : ''} ${inDraft ? 'is-disabled' : ''}`}>
                      <input type="checkbox" disabled={inDraft} checked={isChecked && !inDraft}
                             onChange={() => setPicker({ ...picker, selected: { ...picker.selected, [it.id]: !isChecked } })}/>
                      <div className="picker-row-meta">
                        <div className="picker-row-top">
                          <Tag mono>{it.id}</Tag>
                          <Tag>{it.subcategoryName}</Tag>
                          {inDraft && <Tag tone="muted">Already added</Tag>}
                        </div>
                        <div className="picker-row-name">{it.name}</div>
                        <div className="picker-row-desc">{it.description}</div>
                      </div>
                    </label>
                  );
                });
              })()}
            </div>
          </>
        )}
      </Modal>

      {/* Clone modal (simplified) */}
      <Modal open={cloneOpen} onClose={() => setCloneOpen(false)} size="medium"
             title="Clone competencies"
             foot={<>
               <button className="btn ghost" onClick={() => setCloneOpen(false)}>Cancel</button>
               <button className="btn primary" onClick={() => {
                 // For demo: clone SE.baseline
                 const src = sets['SE.baseline'] || [];
                 setDraft([...new Set([...draftCodes, ...src])]);
                 setCloneOpen(false);
                 toast.push({ title: 'Cloned', message: `${src.length} competencies merged into the current set.`, tone: 'success' });
               }}>Clone</button>
             </>}>
        <p className="secondary-text">Save time by copying a competency set from a previous cycle or from another role family in this cycle.</p>
        <div className="form-stack">
          <div>
            <label className="field-label">Source</label>
            <select className="select" defaultValue="prev-cycle">
              <option value="prev-cycle">Previous cycle (2025-H2) — same role + spec</option>
              <option value="other">Another role family in this cycle</option>
            </select>
          </div>
          <div className="form-grid-2">
            <div>
              <label className="field-label">Role family</label>
              <select className="select">
                {ROLE_FAMILIES.map(f => <option key={f.code} value={f.code}>{f.code} · {f.name}</option>)}
              </select>
            </div>
            <div>
              <label className="field-label">Source</label>
              <select className="select">
                <option value="baseline">Baseline</option>
                {selectedFamily.specializations.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
              </select>
            </div>
          </div>
          {draftCodes.length > 0 && (
            <div className="form-warning">
              <Icon name="alert" size={14}/>
              You currently have {draftCodes.length} competencies in this set. Cloning will <strong>merge</strong> (deduplicating) — it won't remove what you have.
            </div>
          )}
        </div>
      </Modal>
    </main>
  );
}

window.ScreenCycles = ScreenCycles;
window.ScreenCycleSetup = ScreenCycleSetup;
window.CompetenceModal = Modal;
})();
