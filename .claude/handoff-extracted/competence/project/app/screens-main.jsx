// All screens for the Competence prototype.
// Depends on window.Icon, window.COMPETENCE_DATA, and shared UI in ui.jsx.

(() => {
const { useState, useEffect, useRef, useMemo, useCallback } = React;
const {
  Icon, COMPETENCE_DATA,
  fmtDate, fmtDateShort, daysBetween,
  Avatar, StatusPill, StateTrack, GradeChip, GradeSelector, ScoreRing,
  EmptyState, Tip, Tag, LevelPip,
  RoleBanner, useToast,
} = window;
const {
  COMPETENCIES, GRADES, THRESHOLDS, STATUSES, CAREER_PATHS,
  EMPLOYEES, ORG_UNITS, CYCLE, EVALUATIONS, CAL_SLOTS, CALENDAR_CONFIG,
  CURRENT_USER_ID, MANAGER_ID, TODAY,
} = COMPETENCE_DATA;

const findEmployee = (id) => EMPLOYEES.find(e => e.id === id);
const careerPathName = (code) => CAREER_PATHS[code] || code;

// ============================================================
// DASHBOARD
// ============================================================
function ScreenDashboard({ onNavigate }) {
  const me = findEmployee(CURRENT_USER_ID);
  const myEval = EVALUATIONS.find(e => e.employeeID === CURRENT_USER_ID);
  const teamEvals = EVALUATIONS.filter(e => e.workflow?.team?.includes(CURRENT_USER_ID));
  const cycleStart = new Date('2026-01-15');
  const cycleEnd = new Date(CYCLE.cycleDate);
  const totalDays = daysBetween(cycleEnd, cycleStart);
  const elapsed = daysBetween(TODAY, cycleStart);
  const cyclePct = Math.max(0, Math.min(100, (elapsed / totalDays) * 100));
  const daysLeft = daysBetween(cycleEnd, TODAY);

  const heroStatus = myEval?.status || 'NOT_STARTED';
  let heroTitle = `Good morning, ${me?.name.split(' ')[0]}.`;
  let heroMsg = "You haven't started this cycle's evaluation yet. When you're ready, we'll guide you step by step.";
  let heroCta = { label: 'Start when ready', tone: 'primary' };
  if (heroStatus === 'OPEN' && !myEval?.selfEvaluationCompleted) {
    heroMsg = "Your self-evaluation is open. There's no rush — save drafts as you go. Most people finish in two sittings.";
    heroCta = { label: 'Continue self-evaluation', tone: 'primary' };
  } else if (heroStatus === 'IN_REVIEW') {
    heroMsg = "You've submitted everything you need to. Your manager is reviewing now — you'll be notified when the interview is scheduled.";
    heroCta = { label: 'Review your submission', tone: 'ghost' };
  } else if (heroStatus === 'READY') {
    heroMsg = "Your evaluation is ready. Your interview will be on " + fmtDate(myEval?.interviewDate) + ".";
    heroCta = { label: 'See your scores', tone: 'primary' };
  }

  return (
    <main className="page">
      <div className="dash-hero">
        <div className="dash-hero-card">
          <div className="dash-hero-greeting">{fmtDate(TODAY.toISOString()).replace(/^\d+ /, '')} · Tuesday</div>
          <h1 className="dash-hero-title">{heroTitle}</h1>
          <p className="dash-hero-msg">{heroMsg}</p>
          <div style={{ marginBottom: 'var(--s-5)' }}>
            <StateTrack current={heroStatus}/>
          </div>
          <div className="dash-hero-actions">
            <button className={`btn lg ${heroCta.tone}`} onClick={() => onNavigate('evaluation')}>
              {heroCta.label}
              <Icon name="arrow-right" size={16}/>
            </button>
            <button className="btn lg" onClick={() => onNavigate('guide')}>
              <Icon name="guide" size={16}/>
              How this works
            </button>
          </div>
        </div>

        <div className="dash-cycle-card">
          <div className="cycle-meta">
            <span style={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: 11.5 }}>Current cycle</span>
            <Tag>{CYCLE.cycleID}</Tag>
          </div>
          <div className="cycle-id">{CYCLE.label}</div>
          <div>
            <div className="cycle-progress"><div className="fill" style={{ width: cyclePct + '%' }}/></div>
            <div className="cycle-progress-meta" style={{ marginTop: 6 }}>
              <span>Jan 15</span>
              <span>{daysLeft} days remaining</span>
              <span>Jun 30</span>
            </div>
          </div>
          <div className="kv-grid" style={{ marginTop: 4 }}>
            <span className="kv-key">Self-evaluation</span>
            <span className="kv-value">{fmtDate(CYCLE.deadlineSelf)}</span>
            <span className="kv-key">Manager review</span>
            <span className="kv-value">{fmtDate(CYCLE.deadlineManager)}</span>
            <span className="kv-key">Cycle closes</span>
            <span className="kv-value">{fmtDate(CYCLE.cycleDate)}</span>
          </div>
        </div>
      </div>

      <div className="dash-stats">
        <div className="stat-card accent">
          <div className="stat-card-head">
            <Icon name="users" size={12}/> Team feedback
            <span className="spacer"/>
            <span className="stat-card-trend warn">action needed</span>
          </div>
          <div className="stat-card-value">0<span className="stat-card-value-suffix">/ {teamEvals.length}</span></div>
          <div className="stat-card-sub">peer reviews submitted of {teamEvals.length} requested</div>
          <div className="stat-card-viz"><div className="fill" style={{ width: '0%' }}/></div>
        </div>
        <div className="stat-card">
          <div className="stat-card-head">
            <Icon name="evaluation" size={12}/> Your self-grades
            <span className="spacer"/>
            <span className="stat-card-trend up">complete</span>
          </div>
          <div className="stat-card-value">21<span className="stat-card-value-suffix">/ 21</span></div>
          <div className="stat-card-sub">competencies submitted · awaiting manager</div>
          <div className="stat-card-viz success"><div className="fill" style={{ width: '100%' }}/></div>
        </div>
        <div className="stat-card">
          <div className="stat-card-head">
            <Icon name="clock" size={12}/> Next deadline
            <span className="spacer"/>
            <span className="stat-card-trend warn">{daysBetween(CYCLE.deadlineManager, TODAY)}d left</span>
          </div>
          <div className="stat-card-value">{daysBetween(CYCLE.deadlineManager, TODAY)}<span className="stat-card-value-suffix">days</span></div>
          <div className="stat-card-sub">until manager review closes ({fmtDateShort(CYCLE.deadlineManager)})</div>
          <div className="stat-card-viz warn"><div className="fill" style={{ width: Math.max(10, Math.min(100, 100 - (daysBetween(CYCLE.deadlineManager, TODAY) / 30) * 100)) + '%' }}/></div>
        </div>
        <div className="stat-card">
          <div className="stat-card-head">
            <Icon name="chart" size={12}/> Team coverage
            <span className="spacer"/>
            <span className="stat-card-trend up">+2 this week</span>
          </div>
          <div className="stat-card-value">5<span className="stat-card-value-suffix">/ 8</span></div>
          <div className="stat-card-sub">teammates have started their evaluations</div>
          <div className="stat-card-viz info"><div className="fill" style={{ width: '62%' }}/></div>
        </div>
      </div>

      <div className="dash-cols">
        <div className="panel">
          <div className="panel-head">
            <div className="panel-title">Tasks for you</div>
            <div className="panel-sub">{teamEvals.length + 1} items</div>
            <div className="panel-head-actions">
              <button className="btn sm ghost">View all <Icon name="chevron-right" size={12}/></button>
            </div>
          </div>
          <div className="task-list">
            <div className="task-item" onClick={() => onNavigate('evaluation')}>
              <div className="task-item-icon"><Icon name="evaluation" size={16}/></div>
              <div>
                <div className="task-item-title">Continue your self-evaluation</div>
                <div className="task-item-sub">21 competencies · saved 2h ago · due {fmtDateShort(CYCLE.deadlineSelf)}</div>
              </div>
              <Icon name="chevron-right" size={16} className="muted-text"/>
            </div>
            {teamEvals.slice(0, 3).map(ev => {
              const emp = findEmployee(ev.employeeID);
              return (
                <div className="task-item" key={ev.evaluationID}>
                  <div className="task-item-icon info"><Icon name="users" size={16}/></div>
                  <div>
                    <div className="task-item-title">Provide team feedback for {emp?.name}</div>
                    <div className="task-item-sub">{careerPathName(emp?.careerPath)} · {ev.stageLevel} · due {fmtDateShort(CYCLE.deadlineSelf)}</div>
                  </div>
                  <Icon name="chevron-right" size={16} className="muted-text"/>
                </div>
              );
            })}
            <div className="task-item">
              <div className="task-item-icon success"><Icon name="calendar" size={16}/></div>
              <div>
                <div className="task-item-title">Block your availability for interviews</div>
                <div className="task-item-sub">Your team needs ~6 slots in late May</div>
              </div>
              <Icon name="chevron-right" size={16} className="muted-text"/>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <div className="panel-title">Recent activity</div>
            <div className="panel-head-actions">
              <button className="btn sm ghost">All <Icon name="chevron-right" size={12}/></button>
            </div>
          </div>
          <div className="activity-list">
            <div className="activity-item">
              <Avatar employee={findEmployee('EM-004')} size="sm"/>
              <div style={{ flex: 1 }}>
                <div className="activity-text"><strong>Boris Stanev's</strong> evaluation moved to <StatusPill status="READY"/>. Interview booked for <strong>{fmtDate('2026-06-12')}</strong>.</div>
                <div className="activity-time">2 hours ago</div>
              </div>
            </div>
            <div className="activity-item">
              <Avatar employee={findEmployee('EM-008')} size="sm"/>
              <div style={{ flex: 1 }}>
                <div className="activity-text"><strong>Martin Todorov</strong> opened your evaluation for <strong>manager review</strong>.</div>
                <div className="activity-time">Yesterday</div>
              </div>
            </div>
            <div className="activity-item">
              <Avatar employee={findEmployee('EM-002')} size="sm"/>
              <div style={{ flex: 1 }}>
                <div className="activity-text"><strong>Daniel Ivanov</strong> submitted team feedback for your evaluation.</div>
                <div className="activity-time">3 days ago</div>
              </div>
            </div>
            <div className="activity-item">
              <Avatar employee={findEmployee('EM-005')} size="sm"/>
              <div style={{ flex: 1 }}>
                <div className="activity-text"><strong>Elena Marinova</strong> submitted her self-evaluation.</div>
                <div className="activity-time">4 days ago</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

// ============================================================
// EMPLOYEES LIST (org tree)
// ============================================================
function ScreenEmployees({ onNavigate, onStartEvaluation, onOpenEvaluation }) {
  const department = ORG_UNITS['UNIT-ENG'];
  const teams = department.children.map(id => ORG_UNITS[id]);
  const headOfDept = findEmployee(department.managerIDs[0]);
  const isManagerView = CURRENT_USER_ID === MANAGER_ID || teams.some(t => t.managerIDs.includes(CURRENT_USER_ID));
  const startedCount = EMPLOYEES.filter(e => EVALUATIONS.some(ev => ev.employeeID === e.id && ev.status !== 'NOT_STARTED')).length;
  const readyCount = EVALUATIONS.filter(e => e.status === 'READY').length;

  const renderTeam = (team) => {
    const manager = findEmployee(team.managerIDs[0]);
    const teamEmployees = EMPLOYEES.filter(e => e.unitID === team.id && !team.managerIDs.includes(e.id));
    const teamStarted = teamEmployees.filter(e => EVALUATIONS.some(ev => ev.employeeID === e.id && ev.status !== 'NOT_STARTED')).length;

    return (
      <div className="team-block" key={team.id}>
        <div className="team-block-head">
          <div className="team-mark"><Icon name="org" size={16}/></div>
          <div>
            <div className="team-block-title">{team.name}</div>
            <div className="team-block-sub">
              <Icon name="briefcase" size={12}/>
              <span className="line">Led by <strong style={{ color: 'var(--fg-primary)', fontWeight: 600 }}>{manager?.name}</strong> · {team.location}</span>
            </div>
          </div>
          <div className="team-block-meta">
            <span><strong>{teamEmployees.length + 1}</strong> people</span>
            <span><strong>{teamStarted}</strong> in cycle</span>
          </div>
        </div>

        <div className="org-tree-head">
          <span/>
          <span/>
          <span>Person</span>
          <span>Career path</span>
          <span>Level</span>
          <span>Evaluation</span>
          <span style={{ textAlign: 'right' }}>Actions</span>
        </div>

        <div className="org-tree-rows">
          {[manager, ...teamEmployees].map((emp, idx, arr) => {
            if (!emp) return null;
            const ev = EVALUATIONS.find(e => e.employeeID === emp.id);
            const isMe = emp.id === CURRENT_USER_ID;
            const isTeamManager = team.managerIDs.includes(emp.id);
            const visible = isMe || isManagerView || ev?.workflow?.team?.includes(CURRENT_USER_ID);
            return (
              <div key={emp.id} className={`org-tree-row ${isMe ? 'current' : ''}`}>
                <div className="org-tree-connector"/>
                <Avatar employee={emp} size="md"/>
                <div className="org-employee-cell">
                  <div className="org-employee-name">
                    {emp.name}
                    {isTeamManager && <Tag tone="info">Manager</Tag>}
                    {isMe && <span className="you-tag">You</span>}
                  </div>
                  <div className="org-employee-id">{emp.id} · {emp.email}</div>
                </div>
                <div className="secondary-text small">{careerPathName(emp.careerPath)}</div>
                <div><LevelPip level={emp.level} stage={emp.stage}/></div>
                <div>
                  {visible ? (
                    ev ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <StatusPill status={ev.status}/>
                        <span className="tiny muted-text">{ev.interviewDate ? `Interview ${fmtDateShort(ev.interviewDate)}` : `Due ${fmtDateShort(CYCLE.deadlineSelf)}`}</span>
                      </div>
                    ) : <StatusPill status="NOT_STARTED"/>
                  ) : (
                    <span className="org-locked"><Icon name="lock" size={11}/> Private</span>
                  )}
                </div>
                <div className="org-action-cell">
                  {ev?.workflow?.team?.includes(CURRENT_USER_ID) && !isMe && (
                    <button className="btn sm" onClick={() => onOpenEvaluation(emp.id, ev.evaluationID)}>
                      <Icon name="users" size={14}/> Team feedback
                    </button>
                  )}
                  {isMe && ev && (
                    <button className="btn sm primary" onClick={() => onOpenEvaluation(emp.id, ev.evaluationID)}>
                      Open
                    </button>
                  )}
                  {!ev && isManagerView && !isMe && (
                    <button className="btn sm primary" onClick={() => onStartEvaluation(emp.id)}>
                      <Icon name="add" size={14}/> Start
                    </button>
                  )}
                  {!visible && (
                    <Tip label="You can only see evaluations for yourself or people who asked you for team feedback.">
                      <button className="btn sm ghost" disabled><Icon name="lock" size={14}/></button>
                    </Tip>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <main className="page-wide" style={{ maxWidth: 1400, margin: '0 auto' }}>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">Organization</div>
          <h1 className="page-title">Employees</h1>
          <p className="page-subtitle">Your department and the teams beneath it. The lock icon means you don't have visibility into that person's evaluation — that's by design.</p>
        </div>
      </div>

      <div className="org-summary">
        <div className="org-mark"><Icon name="org" size={22}/></div>
        <div className="org-meta">
          <div className="org-name">{department.name}</div>
          <div className="org-sub">{department.type} · {department.location} · headed by {headOfDept?.name}</div>
        </div>
        <div className="org-summary-stats">
          <div>
            <div className="org-stat-num">{EMPLOYEES.length}</div>
            <div className="org-stat-label">people</div>
          </div>
          <div>
            <div className="org-stat-num">{teams.length}</div>
            <div className="org-stat-label">teams</div>
          </div>
          <div>
            <div className="org-stat-num">{startedCount}</div>
            <div className="org-stat-label">in cycle</div>
          </div>
          <div>
            <div className="org-stat-num">{readyCount}</div>
            <div className="org-stat-label">ready</div>
          </div>
        </div>
      </div>

      {teams.map(renderTeam)}
    </main>
  );
}

// ============================================================
// EVALUATION FORM (the big one)
// ============================================================
function ScreenEvaluation({ employeeID, onNavigate }) {
  const toast = useToast();
  const evaluation = EVALUATIONS.find(e => e.employeeID === employeeID) || EVALUATIONS[0];
  const employee = findEmployee(evaluation.employeeID);
  const manager = findEmployee(evaluation.managerID);
  // Determine user role for this evaluation
  let userRole = 1; // employee default
  if (CURRENT_USER_ID === MANAGER_ID || evaluation.managerID === CURRENT_USER_ID) userRole = 2;
  else if (evaluation.workflow?.team?.includes(CURRENT_USER_ID) && evaluation.employeeID !== CURRENT_USER_ID) userRole = 4;
  else if (evaluation.employeeID === CURRENT_USER_ID) userRole = 1;

  // For demo: pretend current user is the EMPLOYEE if it's their own eval, MANAGER if status is IN_REVIEW
  const isOwnEval = employee.id === CURRENT_USER_ID;
  const role = isOwnEval ? 1 : (evaluation.status === 'IN_REVIEW' ? 2 : 4);

  const canEdit = (role === 1 && evaluation.status === 'OPEN' && !evaluation.selfEvaluationCompleted) ||
                  (role === 2 && evaluation.status === 'IN_REVIEW' && !evaluation.managerEvaluationCompleted) ||
                  (role === 4 && evaluation.status === 'OPEN');

  // Editable grades state
  const initialGrades = {};
  Object.keys(evaluation.grades).forEach(k => {
    initialGrades[k] = evaluation.grades[k][role === 1 ? 'employee' : role === 2 ? 'manager' : 'team'];
  });
  const [grades, setGrades] = useState(initialGrades);
  const [comment, setComment] = useState(evaluation.feedback?.employeeComment || '');
  const [managerComment, setManagerComment] = useState(evaluation.feedback?.managerComment || '');
  const [showScoreReveal, setShowScoreReveal] = useState(evaluation.status === 'READY');

  // Compute progress
  const competencyItems = COMPETENCIES.flatMap(cat => cat.subcategories.flatMap(sub => sub.items));
  const totalCount = competencyItems.length;
  const filledCount = Object.values(grades).filter(g => !!g).length;
  const progressPct = Math.round((filledCount / totalCount) * 100);

  // Per-category progress
  const catProgress = (cat) => {
    const items = cat.subcategories.flatMap(s => s.items);
    const filled = items.filter(it => grades[it.id]).length;
    return { filled, total: items.length, pct: Math.round(filled / items.length * 100) };
  };

  const setGrade = (id, g) => {
    setGrades(prev => ({ ...prev, [id]: g }));
  };

  const deadlineDate = role === 1 ? CYCLE.deadlineSelf : role === 2 ? CYCLE.deadlineManager : CYCLE.deadlineSelf;
  const daysToDeadline = daysBetween(deadlineDate, TODAY);

  return (
    <main className="page" style={{ maxWidth: 1180 }}>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">{CYCLE.cycleID} · Performance evaluation</div>
          <h1 className="page-title">{isOwnEval ? 'Your evaluation' : evaluation.employeeID + ' — ' + employee.name}</h1>
          <p className="page-subtitle">{role === 1
            ? "Reflect honestly. You'll discuss your grades and goals with your manager in a 1-on-1 — this form simply prepares that conversation."
            : role === 2
            ? "Your assessment carries 50% of the final score. Be specific in your comment — it's the part the employee remembers most."
            : "You're providing team feedback. Your individual grades stay anonymous."}</p>
        </div>
      </div>

      <RoleBanner role={role}/>

      {/* Employee + cycle summary card */}
      <div className="eval-head">
        <div className="eval-head-info">
          <div className="eval-meta-row">
            <div className="eval-employee-block">
              <Avatar employee={employee} size="xl"/>
              <div style={{ minWidth: 0 }}>
                <div className="eval-employee-name">{employee.name}</div>
                <div className="eval-employee-sub">
                  <span>{careerPathName(employee.careerPath)}</span>
                  <LevelPip level={employee.level} stage={employee.stage}/>
                  <span>Joined {fmtDate(employee.startingDate)}</span>
                </div>
              </div>
            </div>
            <StatusPill status={evaluation.status}/>
          </div>
          <div style={{ paddingTop: 'var(--s-4)', borderTop: '1px solid var(--border-soft)' }}>
            <StateTrack current={evaluation.status}/>
          </div>
        </div>
        <div className="eval-head-side">
          <div className="deadline-card">
            <div className="deadline-card-icon"><Icon name="clock" size={16}/></div>
            <div>
              <div className="deadline-card-label">{role === 1 ? 'Self-evaluation due' : role === 2 ? 'Manager review due' : 'Team feedback due'}</div>
              <div className="deadline-card-value">{fmtDate(deadlineDate)} · {daysToDeadline > 0 ? `${daysToDeadline} days left` : 'overdue'}</div>
            </div>
          </div>
          <div className="deadline-card">
            <div className="deadline-card-icon" style={{ background: 'var(--info-soft)', color: 'var(--info)' }}><Icon name="users" size={16}/></div>
            <div>
              <div className="deadline-card-label">Team reviewers</div>
              <div className="deadline-card-value">{evaluation.workflow?.team?.length || 0} colleagues</div>
            </div>
          </div>
          {evaluation.interviewDate && (
            <div className="deadline-card">
              <div className="deadline-card-icon" style={{ background: 'var(--success-soft)', color: 'var(--success)' }}><Icon name="calendar" size={16}/></div>
              <div>
                <div className="deadline-card-label">Interview</div>
                <div className="deadline-card-value">{fmtDate(evaluation.interviewDate)}</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Score reveal (only when READY) */}
      {evaluation.status === 'READY' && evaluation.finalScore && showScoreReveal && (
        <div className="panel score-reveal" style={{ marginBottom: 'var(--s-5)' }}>
          <div className="score-block">
            <ScoreRing score={evaluation.finalScore.score} max={150} threshold={evaluation.finalScore.threshold}/>
            <div className="score-summary" style={{ flex: 1 }}>
              <div className="score-label">Final performance — {CYCLE.cycleID}</div>
              <div className={`score-name ${evaluation.finalScore.threshold}`}>{evaluation.finalScore.interpretationName}</div>
              <div className="score-desc">{(THRESHOLDS.find(t => t.code === evaluation.finalScore.threshold) || {}).description}</div>
              <div style={{ marginTop: 'var(--s-4)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {COMPETENCIES.map(cat => {
                  const s = evaluation.scores[cat.id];
                  if (!s) return null;
                  const t = THRESHOLDS.find(x => s <= x.max) || THRESHOLDS[THRESHOLDS.length - 1];
                  return (
                    <div key={cat.id} className="cat-score-row">
                      <Tag mono>{cat.id} · {cat.name}</Tag>
                      <div className="cat-score-bar">
                        <div className="fill" style={{ width: Math.min(100, (s / 150) * 100) + '%' }}/>
                      </div>
                      <div className="cat-score-num">
                        <span>{s}</span>
                        <span className="interp">{t.name}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sticky progress */}
      {canEdit && (
        <div className="sticky-progress">
          <span className="sticky-progress-text"><strong>{filledCount}</strong> of {totalCount} competencies graded</span>
          <div className="sticky-progress-bar"><div className="fill" style={{ width: progressPct + '%' }}/></div>
          <span className="sticky-progress-pct">{progressPct}%</span>
          <div className="btn-bar" style={{ marginLeft: 'var(--s-3)' }}>
            <button className="btn sm" onClick={() => toast.push({ title: 'Draft saved', message: 'Your progress is safe. Pick up where you left off any time.', tone: 'success' })}>Save draft</button>
            <button className="btn sm primary" onClick={() => toast.push({ title: 'Almost there', message: `Grade ${totalCount - filledCount} more to submit.`, tone: 'warn' })}>Submit</button>
          </div>
        </div>
      )}

      {/* Grade legend */}
      <div className="panel" style={{ marginBottom: 'var(--s-5)' }}>
        <div className="panel-head">
          <div className="panel-title">How to grade</div>
          <div className="panel-sub">4-point scale</div>
        </div>
        <div className="grade-legend">
          {Object.values(GRADES).map(g => (
            <div className="grade-legend-item" key={g.code}>
              <GradeChip grade={g.code}/>
              <div>
                <div className="grade-legend-name">{g.name}</div>
                <div className="grade-legend-desc">{g.description}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Competency cards */}
      {COMPETENCIES.map(cat => {
        const prog = catProgress(cat);
        return (
          <div className={`cat-card ${cat.id}`} key={cat.id}>
            <div className="cat-card-head">
              <div className="cat-letter">{cat.id}</div>
              <div style={{ flex: 1 }}>
                <div className="cat-card-name">{cat.name}</div>
                <div className="cat-card-desc">{cat.description}</div>
              </div>
              <div className="cat-progress-mini">
                <span className="cat-progress-mini-text">{prog.filled}/{prog.total}</span>
                <div className="cat-progress-mini-bar"><div className="fill" style={{ width: prog.pct + '%' }}/></div>
              </div>
            </div>
            <div className="comp-table-head">
              <span>Competency</span>
              <span className={`h-self ${role === 1 ? 'active' : ''}`}>{role === 1 ? 'You' : 'Self'}</span>
              <span className={`h-mgr ${role === 2 ? 'active' : ''}`}>Manager</span>
              <span className={`h-team ${role === 4 ? 'active' : ''}`}>Team</span>
            </div>
            {cat.subcategories.map(sub => (
              <div className="subcat-block" key={sub.id}>
                <div className="subcat-head">
                  <span className="subcat-id">{sub.id}</span>
                  <span className="subcat-name">{sub.name}</span>
                  <span className="subcat-desc">{sub.description}</span>
                </div>
                {sub.items.map(item => {
                  const g = evaluation.grades[item.id];
                  const selfGrade = g?.employee;
                  const mgrGrade = g?.manager;
                  const teamGrade = g?.team;
                  const myGrade = grades[item.id];
                  return (
                    <div className="comp-row" key={item.id}>
                      <div className="comp-info">
                        <div className="comp-id-name">
                          <span className="comp-id">{item.id}</span>
                          <span className="comp-name">{item.name}</span>
                        </div>
                        <div className="comp-desc">{item.description}</div>
                      </div>
                      <div className="comp-cell">
                        {role === 1
                          ? <GradeSelector value={myGrade} locked={!canEdit} onChange={(v) => setGrade(item.id, v)}/>
                          : <GradeChip grade={selfGrade} locked />}
                      </div>
                      <div className="comp-cell">
                        {role === 2
                          ? <GradeSelector value={myGrade} locked={!canEdit} onChange={(v) => setGrade(item.id, v)}/>
                          : role === 1 ? <GradeChip locked /> : <GradeChip grade={mgrGrade} locked />}
                      </div>
                      <div className="comp-cell">
                        {role === 4
                          ? <GradeChip locked />
                          : <GradeChip grade={teamGrade} locked />}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        );
      })}

      {/* Feedback / comments */}
      <div className="panel" style={{ marginTop: 'var(--s-5)' }}>
        <div className="panel-head">
          <div className="panel-title">Written feedback</div>
          <div className="panel-sub">Comments matter — these go straight into the interview discussion.</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--s-5)' }}>
          <div>
            <label className="field-label">{role === 1 ? 'Your reflection' : 'Self-reflection (employee)'}</label>
            {role === 1 && canEdit ? (
              <textarea className="textarea" placeholder="Share what went well, what you're proud of, and where you want to grow next."
                        value={comment} onChange={e => setComment(e.target.value)}/>
            ) : (
              <div className="textarea" style={{ background: 'var(--bg-sunken)', minHeight: 100, whiteSpace: 'pre-wrap' }}>
                {evaluation.feedback?.employeeComment || <span className="muted-text">Not provided yet</span>}
              </div>
            )}
          </div>
          <div>
            <label className="field-label">Manager feedback</label>
            {role === 2 && canEdit ? (
              <textarea className="textarea" placeholder="Be specific. The employee will read this carefully — call out concrete examples and one growth area."
                        value={managerComment} onChange={e => setManagerComment(e.target.value)}/>
            ) : (
              <div className="textarea" style={{ background: 'var(--bg-sunken)', minHeight: 100, whiteSpace: 'pre-wrap' }}>
                {evaluation.feedback?.managerComment || <span className="muted-text">{role === 2 ? 'Visible to the employee after the interview.' : 'Not available yet — your manager submits this last.'}</span>}
              </div>
            )}
          </div>
        </div>
        {role === 2 && evaluation.feedback?.teamComments?.length > 0 && (
          <div style={{ marginTop: 'var(--s-5)' }}>
            <div className="field-label">Team comments <span className="muted-text">· anonymous · {evaluation.feedback.teamComments.length}</span></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-2)' }}>
              {evaluation.feedback.teamComments.map((c, i) => (
                <div key={i} style={{ padding: '10px 14px', background: 'var(--bg-sunken)', borderRadius: 'var(--r-md)', fontSize: 'var(--fs-base)', color: 'var(--fg-primary)', borderLeft: '3px solid var(--success)' }}>
                  "{c}"
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer action bar */}
      {canEdit && (
        <div style={{ display: 'flex', gap: 'var(--s-3)', justifyContent: 'flex-end', marginTop: 'var(--s-6)' }}>
          <button className="btn ghost" onClick={() => onNavigate('dashboard')}>Cancel</button>
          <button className="btn" onClick={() => toast.push({ title: 'Draft saved', message: 'Pick up where you left off whenever you\'re ready.', tone: 'success' })}>Save as draft</button>
          <button className="btn primary lg" onClick={() => {
            if (filledCount < totalCount) {
              toast.push({ title: 'Almost there', message: `Grade ${totalCount - filledCount} more competencies before submitting.`, tone: 'warn' });
            } else {
              toast.push({ title: 'Evaluation submitted', message: 'Thank you. Your manager has been notified.', tone: 'success' });
            }
          }}>
            <Icon name="send" size={14}/>
            Submit evaluation
          </button>
        </div>
      )}
    </main>
  );
}

// ============================================================
// NEW EVALUATION (manager starts an evaluation for an employee)
// ============================================================
function ScreenNewEvaluation({ employeeID, onNavigate }) {
  const toast = useToast();
  const emp = findEmployee(employeeID || 'EM-007');
  const manager = findEmployee(MANAGER_ID);
  const teamCandidates = EMPLOYEES.filter(e => e.id !== emp.id && e.id !== MANAGER_ID);
  const [team, setTeam] = useState([teamCandidates[0], teamCandidates[1], teamCandidates[2]]);
  const [select, setSelect] = useState('');

  const addMember = () => {
    if (!select) return;
    const m = teamCandidates.find(c => c.id === select);
    if (m && !team.find(t => t.id === m.id)) setTeam([...team, m]);
    setSelect('');
  };

  return (
    <main className="page" style={{ maxWidth: 880 }}>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">{CYCLE.cycleID} · Start new evaluation</div>
          <h1 className="page-title">Open evaluation for {emp.name}</h1>
          <p className="page-subtitle">You're starting a new performance evaluation. The employee will be notified to begin their self-assessment.</p>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <div className="panel-title">Employee</div>
        </div>
        <div style={{ display: 'flex', gap: 'var(--s-5)', alignItems: 'center' }}>
          <Avatar employee={emp} size="xl"/>
          <div className="kv-grid" style={{ flex: 1, gridTemplateColumns: '140px 1fr 140px 1fr' }}>
            <span className="kv-key">Name</span><span className="kv-value">{emp.name}</span>
            <span className="kv-key">Career path</span><span className="kv-value">{careerPathName(emp.careerPath)}</span>
            <span className="kv-key">Level</span><span className="kv-value"><LevelPip level={emp.level} stage={emp.stage}/></span>
            <span className="kv-key">Manager</span><span className="kv-value">{manager.name}</span>
            <span className="kv-key">With company since</span><span className="kv-value">{fmtDate(emp.startingDate)}</span>
            <span className="kv-key">Organization unit</span><span className="kv-value">{ORG_UNITS[emp.unitID]?.name}</span>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <div className="panel-title">Cycle & framework</div>
          <div className="panel-sub">Competencies are determined by career path and level</div>
        </div>
        <div className="kv-grid">
          <span className="kv-key">Cycle ID</span><span className="kv-value">{CYCLE.cycleID}</span>
          <span className="kv-key">Closing date</span><span className="kv-value">{fmtDate(CYCLE.cycleDate)}</span>
          <span className="kv-key">Career framework</span><span className="kv-value">{careerPathName(emp.careerPath)} · {emp.level}{emp.stage}</span>
          <span className="kv-key">Competencies to grade</span><span className="kv-value">{COMPETENCIES.flatMap(c => c.subcategories.flatMap(s => s.items)).length} across 3 categories</span>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <div className="panel-title">Team reviewers <span className="muted-text" style={{ fontWeight: 400 }}>(optional)</span></div>
          <div className="panel-sub">Recommended minimum: 3 peers</div>
        </div>
        <p className="secondary-text small" style={{ marginTop: -8, marginBottom: 'var(--s-4)' }}>
          Each peer reviewer will grade by subcategory (not individual competencies). Their grades are aggregated and anonymous to {emp.name}.
        </p>
        <div style={{ display: 'flex', gap: 'var(--s-3)' }}>
          <select className="select" style={{ flex: 1 }} value={select} onChange={e => setSelect(e.target.value)}>
            <option value="">Choose a colleague…</option>
            {teamCandidates.filter(c => !team.find(t => t.id === c.id)).map(c => (
              <option key={c.id} value={c.id}>{c.name} — {careerPathName(c.careerPath)} · {c.level}{c.stage}</option>
            ))}
          </select>
          <button className="btn" onClick={addMember} disabled={!select}><Icon name="add" size={14}/> Add</button>
        </div>
        <div className="team-chip-list">
          {team.length === 0 && <span className="muted-text small">No reviewers selected yet — you can also start without team feedback.</span>}
          {team.map(m => (
            <span className="team-chip" key={m.id}>
              <Avatar employee={m} size="sm"/>
              {m.name}
              <button className="team-chip-x" onClick={() => setTeam(team.filter(t => t.id !== m.id))} aria-label={`Remove ${m.name}`}>
                <Icon name="close" size={12}/>
              </button>
            </span>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 'var(--s-3)', justifyContent: 'flex-end', marginTop: 'var(--s-5)' }}>
        <button className="btn" onClick={() => onNavigate('employees')}>Cancel</button>
        <button className="btn primary lg" onClick={() => {
          toast.push({ title: 'Evaluation opened', message: `${emp.name} has been notified to start their self-evaluation.`, tone: 'success' });
          onNavigate('employees');
        }}>
          <Icon name="send" size={14}/>
          Open evaluation
        </button>
      </div>
    </main>
  );
}

window.ScreenDashboard = ScreenDashboard;
window.ScreenEmployees = ScreenEmployees;
window.ScreenEvaluation = ScreenEvaluation;
window.ScreenNewEvaluation = ScreenNewEvaluation;
})();
