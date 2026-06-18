// Employee Management screen — master/detail with tabs (Details / Evaluations / Audit).

(() => {
const { useState, useMemo, useEffect } = React;
const {
  Icon, COMPETENCE_DATA,
  fmtDate, fmtDateShort, daysBetween,
  Avatar, StatusPill, EmptyState, Tip, Tag, LevelPip,
  CompetenceModal, useToast,
} = window;
const {
  EMPLOYEES, ORG_UNITS, EVALUATIONS, ROLE_FAMILIES,
  EMPLOYMENT_STATUSES, WORK_MODES, WORK_LOCATIONS, AUDIT, TODAY,
} = COMPETENCE_DATA;

const ALL_STAGE_LEVELS = ['N1', 'J1', 'J2', 'J3', 'R1', 'R2', 'R3', 'S1', 'S2', 'S3', 'X1', 'T1'];

function ScreenEmployeeManagement({ scope = 'manager', onNavigate, initialEmployeeID }) {
  const toast = useToast();

  // Filters
  const [search, setSearch] = useState('');
  const [fRoleFamily, setFRoleFamily] = useState('');
  const [fSpec, setFSpec] = useState('');
  const [fStageLevel, setFStageLevel] = useState('');
  const [fEmployment, setFEmployment] = useState('');

  const [selectedID, setSelectedID] = useState(initialEmployeeID || 'EM-002');
  const [activeTab, setActiveTab] = useState('details');
  const [modal, setModal] = useState(null);

  const selectedFamily = ROLE_FAMILIES.find(f => f.code === fRoleFamily);
  const filteredEmployees = useMemo(() => {
    return EMPLOYEES.filter(e => {
      if (search) {
        const q = search.toLowerCase();
        if (!e.name.toLowerCase().includes(q) && !e.id.toLowerCase().includes(q) && !e.email?.toLowerCase().includes(q)) return false;
      }
      if (fRoleFamily && e.roleFamily !== fRoleFamily) return false;
      if (fSpec && e.specialization !== fSpec) return false;
      if (fStageLevel && e.stageLevel !== fStageLevel) return false;
      if (fEmployment && e.employmentStatus !== fEmployment) return false;
      return true;
    });
  }, [search, fRoleFamily, fSpec, fStageLevel, fEmployment]);

  const selected = EMPLOYEES.find(e => e.id === selectedID);
  const selectedRoleFamily = selected ? ROLE_FAMILIES.find(f => f.code === selected.roleFamily) : null;
  const selectedUnit = selected ? ORG_UNITS[selected.unitID] : null;
  const selectedManager = selectedUnit ? EMPLOYEES.find(e => e.id === selectedUnit.managerIDs[0]) : null;
  const inFlightEvals = selected ? EVALUATIONS.filter(e => e.employeeID === selected.id && e.status !== 'CLOSED') : [];
  const audit = selected ? (AUDIT[selected.id] || []) : [];

  // Form draft
  const [draft, setDraft] = useState(null);
  useEffect(() => {
    if (!selected) return;
    setDraft({
      personal: { firstName: selected.firstName, lastName: selected.lastName, workMode: selected.workMode, workLocation: selected.workLocation },
      email: selected.email,
      career: {
        roleFamily: selected.roleFamily,
        specialization: selected.specialization,
        stageLevel: selected.stageLevel,
        startingDate: selected.startingDate,
        organizationUnitID: selected.unitID,
      },
      employmentStatus: selected.employmentStatus,
    });
    setActiveTab('details');
  }, [selectedID]);

  const dirty = useMemo(() => {
    if (!selected || !draft) return false;
    return draft.email !== selected.email
      || draft.personal.firstName !== selected.firstName
      || draft.personal.lastName !== selected.lastName
      || draft.personal.workMode !== selected.workMode
      || draft.personal.workLocation !== selected.workLocation
      || draft.career.roleFamily !== selected.roleFamily
      || draft.career.specialization !== selected.specialization
      || draft.career.stageLevel !== selected.stageLevel
      || draft.career.startingDate !== selected.startingDate
      || draft.career.organizationUnitID !== selected.unitID
      || draft.employmentStatus !== selected.employmentStatus;
  }, [draft, selected]);

  const fmtTime = (iso) => new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const AUDIT_FIELD_LABELS = {
    'career.stageLevel': 'Stage level',
    'career.specialization': 'Specialization',
    'career.roleFamily': 'Role family',
    'career.organizationUnitID': 'Organization unit',
    'career.startingDate': 'Starting date',
    'personal.firstName': 'First name',
    'personal.lastName': 'Last name',
    'personal.workMode': 'Work mode',
    'personal.workLocation': 'Work location',
    'email': 'Email',
    'employmentStatus': 'Employment status',
    '__created__': 'Employee created',
  };

  if (!selected || !draft) return null;

  return (
    <main className="page-wide" style={{ maxWidth: 1500, margin: '0 auto' }}>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">People</div>
          <h1 className="page-title">{scope === 'supervisor' ? 'Manage all employees' : 'Manage your team'}</h1>
          <p className="page-subtitle">{scope === 'supervisor'
            ? 'Edit any employee\'s personal data, career, organization, and employment status. All changes are audited.'
            : 'Edit personal and career details for the employees who report to you.'}</p>
        </div>
      </div>

      <div className="emp-shell">
        {/* Master list */}
        <div className="emp-master">
          <div className="emp-filters">
            <div className="emp-filter-row" style={{ position: 'relative' }}>
              <Icon name="search" size={14} className="emp-search-icon"/>
              <input className="input emp-search" placeholder="Search by name, ID, email…"
                     value={search} onChange={e => setSearch(e.target.value)}/>
            </div>
            <div className="emp-filter-grid">
              <select className="select" value={fRoleFamily} onChange={e => { setFRoleFamily(e.target.value); setFSpec(''); }}>
                <option value="">All role families</option>
                {ROLE_FAMILIES.map(f => <option key={f.code} value={f.code}>{f.code} · {f.name}</option>)}
              </select>
              <select className="select" value={fSpec} onChange={e => setFSpec(e.target.value)} disabled={!fRoleFamily}>
                <option value="">All specializations</option>
                {selectedFamily?.specializations.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
              </select>
              <select className="select" value={fStageLevel} onChange={e => setFStageLevel(e.target.value)}>
                <option value="">All levels</option>
                {ALL_STAGE_LEVELS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select className="select" value={fEmployment} onChange={e => setFEmployment(e.target.value)}>
                <option value="">All employment</option>
                {Object.values(EMPLOYMENT_STATUSES).map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
              </select>
            </div>
            {scope === 'supervisor' && (
              <button className="btn primary" onClick={() => setModal({ kind: 'create', payload: { personal: { firstName: '', lastName: '', workMode: 'hybrid', workLocation: 'sofia-hq' }, email: '', career: { roleFamily: '', specialization: '', stageLevel: 'J1', startingDate: '', organizationUnitID: '' } } })}>
                <Icon name="add" size={14}/> Add employee
              </button>
            )}
          </div>

          <div className="emp-master-meta">
            <span><strong>{filteredEmployees.length}</strong> {filteredEmployees.length === 1 ? 'employee' : 'employees'}</span>
            {(search || fRoleFamily || fSpec || fStageLevel || fEmployment) && (
              <button className="btn sm ghost" onClick={() => { setSearch(''); setFRoleFamily(''); setFSpec(''); setFStageLevel(''); setFEmployment(''); }}>
                Clear filters
              </button>
            )}
          </div>

          <div className="emp-list">
            {filteredEmployees.length === 0 ? (
              <div className="emp-list-empty">
                <Icon name="search" size={24} className="muted-text"/>
                <div className="weight-600">No matches</div>
                <div className="muted-text small">Try a different filter or search term.</div>
              </div>
            ) : filteredEmployees.map(emp => {
              const family = ROLE_FAMILIES.find(f => f.code === emp.roleFamily);
              const spec = family?.specializations.find(s => s.code === emp.specialization);
              const empStatus = EMPLOYMENT_STATUSES[emp.employmentStatus] || EMPLOYMENT_STATUSES.active;
              return (
                <button key={emp.id} className={`emp-row ${selectedID === emp.id ? 'is-selected' : ''}`}
                        onClick={() => setSelectedID(emp.id)}>
                  <Avatar employee={emp} size="md"/>
                  <div className="emp-row-meta">
                    <div className="emp-row-name">
                      <span>{emp.name}</span>
                      <span className="emp-row-stagelevel">{emp.stageLevel}</span>
                    </div>
                    <div className="emp-row-sub">
                      <span>{family?.name}</span>
                      {spec && <><span className="muted-text">·</span><span>{spec.name}</span></>}
                      <span className="muted-text">·</span>
                      <span>{ORG_UNITS[emp.unitID]?.name}</span>
                    </div>
                  </div>
                  <span className={`status-pill ${empStatus.tone}`}>
                    <span className="dot"/>
                    {empStatus.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Detail */}
        <div className="emp-detail">
          <div className="emp-detail-head">
            <Avatar employee={selected} size="xl"/>
            <div className="emp-detail-head-meta">
              <div className="emp-detail-name">{selected.name}</div>
              <div className="emp-detail-sub">
                <span>{selectedRoleFamily?.name}</span>
                {selected.specialization && <><span className="muted-text">·</span><span>{selectedRoleFamily?.specializations.find(s => s.code === selected.specialization)?.name}</span></>}
                <span className="muted-text">·</span>
                <LevelPip level={selected.level} stage={selected.stage}/>
                <span className="muted-text">·</span>
                <span>{selectedUnit?.name}</span>
              </div>
            </div>
            <div className="emp-detail-head-aside">
              <span className={`status-pill ${EMPLOYMENT_STATUSES[selected.employmentStatus]?.tone}`}>
                <span className="dot"/>
                {EMPLOYMENT_STATUSES[selected.employmentStatus]?.name}
              </span>
              <div className="emp-detail-head-id"><Tag mono>{selected.id}</Tag></div>
            </div>
          </div>

          <div className="emp-tabs">
            <button className={`emp-tab ${activeTab === 'details' ? 'is-active' : ''}`} onClick={() => setActiveTab('details')}>
              Details
            </button>
            <button className={`emp-tab ${activeTab === 'evaluations' ? 'is-active' : ''}`} onClick={() => setActiveTab('evaluations')}>
              Evaluations
              {inFlightEvals.length > 0 && <span className="emp-tab-count">{inFlightEvals.length}</span>}
            </button>
            {scope === 'supervisor' && (
              <button className={`emp-tab ${activeTab === 'audit' ? 'is-active' : ''}`} onClick={() => setActiveTab('audit')}>
                Audit
                {audit.length > 0 && <span className="emp-tab-count">{audit.length}</span>}
              </button>
            )}
          </div>

          {activeTab === 'details' && (
            <div className="emp-form">
              <div className="form-section">
                <div className="form-section-title">Personal</div>
                <div className="form-grid">
                  <div>
                    <label className="field-label">First name</label>
                    <input className="input" value={draft.personal.firstName}
                           onChange={e => setDraft({ ...draft, personal: { ...draft.personal, firstName: e.target.value } })}/>
                  </div>
                  <div>
                    <label className="field-label">Last name</label>
                    <input className="input" value={draft.personal.lastName}
                           onChange={e => setDraft({ ...draft, personal: { ...draft.personal, lastName: e.target.value } })}/>
                  </div>
                  <div className="wide">
                    <label className="field-label">Email</label>
                    <input type="email" className="input" value={draft.email}
                           onChange={e => setDraft({ ...draft, email: e.target.value })}/>
                  </div>
                  <div>
                    <label className="field-label">Work mode</label>
                    <select className="select" value={draft.personal.workMode}
                            onChange={e => setDraft({ ...draft, personal: { ...draft.personal, workMode: e.target.value } })}>
                      {Object.values(WORK_MODES).map(m => <option key={m.code} value={m.code}>{m.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="field-label">Work location</label>
                    <select className="select" value={draft.personal.workLocation}
                            onChange={e => setDraft({ ...draft, personal: { ...draft.personal, workLocation: e.target.value } })}>
                      {Object.values(WORK_LOCATIONS).map(l => <option key={l.code} value={l.code}>{l.name}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              <div className="form-section">
                <div className="form-section-title">Career</div>
                <div className="form-grid">
                  <div>
                    <label className="field-label">Role family</label>
                    <select className="select" value={draft.career.roleFamily}
                            onChange={e => {
                              if (inFlightEvals.length > 0) {
                                setModal({ kind: 'role-family-change', payload: { ...draft, career: { ...draft.career, roleFamily: e.target.value, specialization: '' } } });
                              } else {
                                setDraft({ ...draft, career: { ...draft.career, roleFamily: e.target.value, specialization: '' } });
                              }
                            }}>
                      {ROLE_FAMILIES.map(f => <option key={f.code} value={f.code}>{f.code} · {f.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="field-label">Specialization</label>
                    <select className="select" value={draft.career.specialization || ''}
                            onChange={e => {
                              if (inFlightEvals.length > 0 && e.target.value !== draft.career.specialization) {
                                setModal({ kind: 'specialization-change', payload: { ...draft, career: { ...draft.career, specialization: e.target.value } } });
                              } else {
                                setDraft({ ...draft, career: { ...draft.career, specialization: e.target.value } });
                              }
                            }}>
                      <option value="">— None —</option>
                      {ROLE_FAMILIES.find(f => f.code === draft.career.roleFamily)?.specializations.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="field-label">Stage level</label>
                    <select className="select" value={draft.career.stageLevel}
                            onChange={e => setDraft({ ...draft, career: { ...draft.career, stageLevel: e.target.value } })}>
                      {ALL_STAGE_LEVELS.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="field-label">Starting date</label>
                    <input type="date" className="input" value={draft.career.startingDate}
                           onChange={e => setDraft({ ...draft, career: { ...draft.career, startingDate: e.target.value } })}/>
                  </div>
                </div>
              </div>

              <div className="form-section">
                <div className="form-section-title">Organization</div>
                <div className="form-grid">
                  <div className="wide">
                    <label className="field-label">Organization unit</label>
                    <select className="select" value={draft.career.organizationUnitID}
                            onChange={e => setDraft({ ...draft, career: { ...draft.career, organizationUnitID: e.target.value } })}>
                      {Object.values(ORG_UNITS).map(u => <option key={u.id} value={u.id}>{u.id} · {u.name}</option>)}
                    </select>
                  </div>
                  <div className="wide">
                    <label className="field-label">Manager</label>
                    <div className="form-readonly">
                      {selectedManager ? (<><Avatar employee={selectedManager} size="sm"/><span>{selectedManager.name}</span></>) : <span className="muted-text">No manager assigned</span>}
                      <span className="form-hint">Derived automatically from the organization unit</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="form-section">
                <div className="form-section-title">Employment</div>
                <div className="form-grid">
                  <div>
                    <label className="field-label">Status</label>
                    <select className="select" value={draft.employmentStatus}
                            onChange={e => setDraft({ ...draft, employmentStatus: e.target.value })}>
                      {Object.values(EMPLOYMENT_STATUSES).map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* Sticky action bar */}
              <div className="form-actions-sticky">
                <div className={`form-state ${dirty ? 'unsaved' : 'saved'}`}>
                  {dirty ? <><span className="dot"/> Unsaved changes</> : <><Icon name="check" size={12}/> All changes saved</>}
                </div>
                <button className="btn ghost" disabled={!dirty} onClick={() => setSelectedID(selected.id) /* reset draft */}>
                  Discard
                </button>
                <button className="btn primary" disabled={!dirty} onClick={() => toast.push({ title: 'Changes saved', message: `${selected.name}'s record has been updated.`, tone: 'success' })}>
                  Save changes
                </button>
              </div>
            </div>
          )}

          {activeTab === 'evaluations' && (
            <div className="emp-evaluations">
              {inFlightEvals.length === 0 ? (
                <EmptyState icon="evaluation" title="No active evaluations" message="This employee has no evaluations in flight for the current cycle. Past closed evaluations live in the archive."/>
              ) : (
                <div className="data-grid bordered">
                  <div className="data-grid-head">
                    <span>Evaluation</span>
                    <span>Cycle</span>
                    <span>Level</span>
                    <span>Status</span>
                    <span>Interview</span>
                    <span className="cell-right">Actions</span>
                  </div>
                  <div className="data-grid-rows">
                    {inFlightEvals.map(ev => (
                      <div className="data-grid-row" key={ev.evaluationID}>
                        <Tag mono>{ev.evaluationID}</Tag>
                        <span>{ev.cycleID}</span>
                        <span><LevelPip level={ev.stageLevel.charAt(0)} stage={ev.stageLevel.charAt(1)}/></span>
                        <StatusPill status={ev.status}/>
                        <span>{ev.interviewDate ? fmtDate(ev.interviewDate) : <span className="muted-text">Not scheduled</span>}</span>
                        <div className="cell-right">
                          <button className="btn sm" onClick={() => onNavigate('evaluation', { employeeID: selected.id, evaluationID: ev.evaluationID })}>
                            Open
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'audit' && scope === 'supervisor' && (
            <div className="emp-audit">
              {audit.length === 0 ? (
                <EmptyState icon="info" title="No audit entries" message="When fields are modified, every change shows up here with the user who made it and when."/>
              ) : (
                <div className="audit-timeline">
                  {audit.map((a, idx) => {
                    const created = a.field === '__created__';
                    return (
                      <div className="audit-entry" key={a.entryID}>
                        <div className="audit-dot" data-created={created ? 'true' : 'false'}/>
                        <div className="audit-line" style={idx === audit.length - 1 ? { background: 'transparent' } : null}/>
                        <div className="audit-content">
                          <div className="audit-when">
                            <span>{fmtTime(a.timestamp)}</span>
                            <span className="muted-text">·</span>
                            <span>by <strong>{a.changedByName}</strong></span>
                          </div>
                          {created ? (
                            <div className="audit-action created"><Icon name="sparkle" size={14}/> Employee record created</div>
                          ) : (
                            <div className="audit-action">
                              <span className="audit-field">{AUDIT_FIELD_LABELS[a.field] || a.field}</span>
                              <span className="audit-arrow">→</span>
                              <span className="audit-old">{a.oldValue ?? '—'}</span>
                              <Icon name="arrow-right" size={11} className="muted-text"/>
                              <span className="audit-new">{a.newValue ?? '—'}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Role family change confirm modal */}
      <CompetenceModal open={modal?.kind === 'role-family-change'} onClose={() => setModal(null)} tone="warn"
                       title="Change role family?"
                       foot={<>
                         <button className="btn ghost" onClick={() => setModal(null)}>Cancel</button>
                         <button className="btn primary" onClick={() => { setDraft(modal.payload); setModal(null); }}>Change role family</button>
                       </>}>
        <p className="secondary-text">Changing role family also changes which competencies this employee will be graded on. Any in-flight evaluations will continue using the role family they were started with, but new evaluations will use the new one.</p>
        {inFlightEvals.length > 0 && (
          <div className="form-warning">
            <Icon name="alert" size={14}/>
            This employee has <strong>{inFlightEvals.length}</strong> {inFlightEvals.length === 1 ? 'evaluation' : 'evaluations'} in flight.
          </div>
        )}
      </CompetenceModal>

      <CompetenceModal open={modal?.kind === 'specialization-change'} onClose={() => setModal(null)}
                       title="Change specialization?"
                       foot={<>
                         <button className="btn ghost" onClick={() => setModal(null)}>Cancel</button>
                         <button className="btn primary" onClick={() => { setDraft(modal.payload); setModal(null); }}>Change specialization</button>
                       </>}>
        <p className="secondary-text">A specialization change adjusts the extra competencies this employee will be graded on for new evaluations. In-flight evaluations are unaffected.</p>
      </CompetenceModal>

      <CompetenceModal open={modal?.kind === 'create'} onClose={() => setModal(null)} size="large"
                       eyebrow="People"
                       title="Add a new employee"
                       foot={<>
                         <button className="btn ghost" onClick={() => setModal(null)}>Cancel</button>
                         <button className="btn primary" onClick={() => { toast.push({ title: 'Employee created', message: 'They\'ll appear in the list once their account is provisioned.', tone: 'success' }); setModal(null); }}>
                           Create employee
                         </button>
                       </>}>
        {modal?.kind === 'create' && (
          <div className="form-grid">
            <div>
              <label className="field-label">First name</label>
              <input className="input" value={modal.payload.personal.firstName}
                     onChange={e => setModal({ ...modal, payload: { ...modal.payload, personal: { ...modal.payload.personal, firstName: e.target.value } } })}/>
            </div>
            <div>
              <label className="field-label">Last name</label>
              <input className="input" value={modal.payload.personal.lastName}
                     onChange={e => setModal({ ...modal, payload: { ...modal.payload, personal: { ...modal.payload.personal, lastName: e.target.value } } })}/>
            </div>
            <div className="wide">
              <label className="field-label">Email</label>
              <input type="email" className="input" value={modal.payload.email}
                     onChange={e => setModal({ ...modal, payload: { ...modal.payload, email: e.target.value } })}/>
            </div>
            <div>
              <label className="field-label">Role family</label>
              <select className="select" value={modal.payload.career.roleFamily}
                      onChange={e => setModal({ ...modal, payload: { ...modal.payload, career: { ...modal.payload.career, roleFamily: e.target.value, specialization: '' } } })}>
                <option value=""></option>
                {ROLE_FAMILIES.map(f => <option key={f.code} value={f.code}>{f.code} · {f.name}</option>)}
              </select>
            </div>
            <div>
              <label className="field-label">Specialization</label>
              <select className="select" value={modal.payload.career.specialization}
                      onChange={e => setModal({ ...modal, payload: { ...modal.payload, career: { ...modal.payload.career, specialization: e.target.value } } })}>
                <option value="">— None —</option>
                {ROLE_FAMILIES.find(f => f.code === modal.payload.career.roleFamily)?.specializations.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="field-label">Stage level</label>
              <select className="select" value={modal.payload.career.stageLevel}
                      onChange={e => setModal({ ...modal, payload: { ...modal.payload, career: { ...modal.payload.career, stageLevel: e.target.value } } })}>
                {ALL_STAGE_LEVELS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="wide">
              <label className="field-label">Organization unit</label>
              <select className="select" value={modal.payload.career.organizationUnitID}
                      onChange={e => setModal({ ...modal, payload: { ...modal.payload, career: { ...modal.payload.career, organizationUnitID: e.target.value } } })}>
                <option value=""></option>
                {Object.values(ORG_UNITS).map(u => <option key={u.id} value={u.id}>{u.id} · {u.name}</option>)}
              </select>
            </div>
            <div>
              <label className="field-label">Starting date</label>
              <input type="date" className="input" value={modal.payload.career.startingDate}
                     onChange={e => setModal({ ...modal, payload: { ...modal.payload, career: { ...modal.payload.career, startingDate: e.target.value } } })}/>
            </div>
          </div>
        )}
      </CompetenceModal>
    </main>
  );
}

window.ScreenEmployeeManagement = ScreenEmployeeManagement;
})();
