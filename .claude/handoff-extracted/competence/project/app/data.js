// Mock data for the Competence prototype
// Mirrors the real domain model from packages/competence

window.COMPETENCE_DATA = (() => {
  // ---------- Competency framework (abbreviated from config.competencies.json) ----------
  const COMPETENCIES = [
    {
      id: 'E', name: 'Expertise', description: 'Technical knowledge and applied skills',
      subcategories: [
        { id: 'E1', name: 'Theoretical Knowledge', description: 'Core concepts, principles, and domain theory',
          items: [
            { id: 'E1.1', name: 'Computer Science Fundamentals', description: 'Algorithms, data structures, complexity analysis' },
            { id: 'E1.2', name: 'System Design Theory', description: 'Distributed systems, scalability, consistency models' },
            { id: 'E1.3', name: 'Language & Paradigms', description: 'Deep knowledge of language semantics and paradigms' },
          ]},
        { id: 'E2', name: 'Applied Skills', description: 'Technical abilities applied to real tasks',
          items: [
            { id: 'E2.1', name: 'Code Quality', description: 'Writes clean, idiomatic, testable code' },
            { id: 'E2.2', name: 'Debugging & Tooling', description: 'Efficient use of debuggers, profilers, observability' },
            { id: 'E2.3', name: 'Architecture in Practice', description: 'Translates designs into working systems' },
          ]},
        { id: 'E3', name: 'Practical Experience', description: 'Cumulative hands-on professional experience',
          items: [
            { id: 'E3.1', name: 'Production Operations', description: 'On-call, incident response, postmortems' },
            { id: 'E3.2', name: 'Domain Knowledge', description: 'Understanding of business and product context' },
          ]},
      ]
    },
    {
      id: 'I', name: 'Insight', description: 'Process, planning and estimation',
      subcategories: [
        { id: 'I1', name: 'Processes', description: 'Adherence to organizational workflows and standards',
          items: [
            { id: 'I1.1', name: 'Methodology Awareness', description: 'Follows agreed development & review practices' },
            { id: 'I1.2', name: 'Standards Compliance', description: 'Respects coding, security and documentation standards' },
          ]},
        { id: 'I2', name: 'Planning', description: 'Personal workflow and time management',
          items: [
            { id: 'I2.1', name: 'Prioritization', description: 'Identifies and acts on highest-impact work first' },
            { id: 'I2.2', name: 'Self-organization', description: 'Manages own pipeline, delivers reliably' },
          ]},
        { id: 'I3', name: 'Estimation', description: 'Task and resource estimation accuracy',
          items: [
            { id: 'I3.1', name: 'Effort Estimation', description: 'Provides realistic, well-reasoned estimates' },
            { id: 'I3.2', name: 'Risk Identification', description: 'Surfaces blockers and unknowns early' },
          ]},
      ]
    },
    {
      id: 'C', name: 'Commitment', description: 'Responsibility, communication and mentorship',
      subcategories: [
        { id: 'C1', name: 'Responsibility', description: 'Work ethics, professional development, best practices',
          items: [
            { id: 'C1.1', name: 'Ownership', description: 'Takes responsibility for outcomes, not just tasks' },
            { id: 'C1.2', name: 'Continuous Learning', description: 'Invests in growth, shares what they learn' },
          ]},
        { id: 'C2', name: 'Communication', description: 'Professional communication at all levels',
          items: [
            { id: 'C2.1', name: 'Written Communication', description: 'Clear docs, RFCs, code reviews, async messages' },
            { id: 'C2.2', name: 'Verbal & Meeting', description: 'Effective participation in discussions and reviews' },
            { id: 'C2.3', name: 'Cross-functional', description: 'Communicates effectively with non-engineers' },
          ]},
        { id: 'C3', name: 'Mentorship', description: 'Knowledge sharing and colleague support',
          items: [
            { id: 'C3.1', name: 'Coaching Peers', description: 'Helps colleagues grow, models good practices' },
            { id: 'C3.2', name: 'Onboarding', description: 'Brings new joiners up to speed effectively' },
          ]},
      ]
    },
  ];

  const GRADES = {
    S: { code: 'S', name: 'Superior',       weight: 1.3, description: 'Significantly exceeds expectations at this level' },
    R: { code: 'R', name: 'Regular',        weight: 1.0, description: 'Meets expectations at this level' },
    U: { code: 'U', name: 'Unsatisfactory', weight: 0.6, description: 'Falls short of expectations at this level' },
    N: { code: 'N', name: 'Not Utilized',   weight: 0.0, description: 'Not applicable or not demonstrated' },
  };

  const THRESHOLDS = [
    { code: 'T1', name: 'Weak',          max: 76,  description: 'Significantly below expectations. A formal improvement plan is required.' },
    { code: 'T2', name: 'Insufficient',  max: 89,  description: 'Below standard. Active guidance from the manager is needed.' },
    { code: 'T3', name: 'Expected',      max: 105, description: 'Meets standard expectations for the current level.' },
    { code: 'T4', name: 'Good',          max: 119, description: 'Exceeds expectations. Eligible for a bonus or formal recognition.' },
    { code: 'T5', name: 'Outstanding',   max: 150, description: 'Consistently exceeds expectations. Promotion is strongly recommended.' },
  ];

  const STATUSES = {
    NOT_STARTED: { code: 'NOT_STARTED', name: 'Not Started', description: 'No active evaluation in this cycle yet.', tone: 'muted' },
    OPEN:        { code: 'OPEN',        name: 'Open',         description: 'Awaiting self-evaluation and team feedback.', tone: 'info' },
    IN_REVIEW:   { code: 'IN_REVIEW',   name: 'In Review',    description: 'Manager review in progress.', tone: 'warn' },
    READY:       { code: 'READY',       name: 'Ready',        description: 'Manager submitted. Awaiting interview scheduling.', tone: 'success' },
    CLOSED:      { code: 'CLOSED',      name: 'Closed',       description: 'Cycle closed. Final scores recorded.', tone: 'muted' },
  };

  const CAREER_PATHS = {
    SE01: 'Software Engineer',
    PM01: 'Project Manager',
    BA01: 'Business Analyst',
  };

  // ---------- Employees ----------
  const EMPLOYEES = [
    // Platform Engineering team
    { id: 'EM-001', name: 'Mira Petrova',       email: 'mira.p@company.io',     careerPath: 'SE01', level: 'S', stage: 2, startingDate: '2019-04-15', unitID: 'UNIT-ENG-PLATFORM', avatar: 'MP', color: '#E5523C' },
    { id: 'EM-002', name: 'Daniel Ivanov',      email: 'daniel.i@company.io',   careerPath: 'SE01', level: 'R', stage: 3, startingDate: '2021-09-01', unitID: 'UNIT-ENG-PLATFORM', avatar: 'DI', color: '#2462A4' },
    { id: 'EM-003', name: 'Yana Kostova',       email: 'yana.k@company.io',     careerPath: 'SE01', level: 'J', stage: 2, startingDate: '2023-02-10', unitID: 'UNIT-ENG-PLATFORM', avatar: 'YK', color: '#1F7A4F' },
    { id: 'EM-004', name: 'Boris Stanev',       email: 'boris.s@company.io',    careerPath: 'PM01', level: 'S', stage: 1, startingDate: '2020-06-22', unitID: 'UNIT-ENG-PLATFORM', avatar: 'BS', color: '#B6741F' },
    { id: 'EM-005', name: 'Elena Marinova',     email: 'elena.m@company.io',    careerPath: 'BA01', level: 'R', stage: 2, startingDate: '2022-01-09', unitID: 'UNIT-ENG-PLATFORM', avatar: 'EM', color: '#7C3AED' },
    { id: 'EM-006', name: 'Stoyan Dimov',       email: 'stoyan.d@company.io',   careerPath: 'SE01', level: 'X', stage: 1, startingDate: '2017-11-04', unitID: 'UNIT-ENG-PLATFORM', avatar: 'SD', color: '#0F766E' },
    { id: 'EM-007', name: 'Iva Hristova',       email: 'iva.h@company.io',      careerPath: 'SE01', level: 'N', stage: 1, startingDate: '2024-09-02', unitID: 'UNIT-ENG-PLATFORM', avatar: 'IH', color: '#DB2777' },
    // Manager of Platform Engineering
    { id: 'EM-008', name: 'Martin Todorov',     email: 'martin.t@company.io',   careerPath: 'SE01', level: 'T', stage: 1, startingDate: '2016-03-18', unitID: 'UNIT-ENG-PLATFORM', avatar: 'MT', color: '#475569' },

    // Product Engineering team
    { id: 'EM-009', name: 'Nikola Atanasov',    email: 'nikola.a@company.io',   careerPath: 'SE01', level: 'S', stage: 1, startingDate: '2020-08-14', unitID: 'UNIT-ENG-PRODUCT', avatar: 'NA', color: '#0EA5E9' },
    { id: 'EM-010', name: 'Diana Pavlova',      email: 'diana.p@company.io',    careerPath: 'SE01', level: 'R', stage: 2, startingDate: '2022-04-04', unitID: 'UNIT-ENG-PRODUCT', avatar: 'DP', color: '#A16207' },
    { id: 'EM-011', name: 'Kaloyan Vasilev',    email: 'kaloyan.v@company.io',  careerPath: 'PM01', level: 'R', stage: 3, startingDate: '2021-02-22', unitID: 'UNIT-ENG-PRODUCT', avatar: 'KV', color: '#BE185D' },
    { id: 'EM-012', name: 'Rositsa Nikolova',   email: 'rositsa.n@company.io',  careerPath: 'BA01', level: 'J', stage: 3, startingDate: '2023-10-16', unitID: 'UNIT-ENG-PRODUCT', avatar: 'RN', color: '#9333EA' },
    // Manager of Product Engineering
    { id: 'EM-013', name: 'Petar Genchev',      email: 'petar.g@company.io',    careerPath: 'SE01', level: 'T', stage: 1, startingDate: '2017-05-30', unitID: 'UNIT-ENG-PRODUCT', avatar: 'PG', color: '#0891B2' },

    // Department head (HoD of Engineering)
    { id: 'EM-014', name: 'Galina Vasileva',    email: 'galina.v@company.io',   careerPath: 'PM01', level: 'T', stage: 1, startingDate: '2014-09-01', unitID: 'UNIT-ENG',         avatar: 'GV', color: '#4D7C0F' },
  ];

  // The "current user" in the prototype — Mira, who is Senior + a Team Member of others.
  const CURRENT_USER_ID = 'EM-001';
  const MANAGER_ID = 'EM-008';      // Martin Todorov (T1) manages Platform Engineering

  const ORG_UNITS = {
    'UNIT-ENG': {
      id: 'UNIT-ENG', type: 'Department', name: 'Engineering',
      location: 'Sofia, BG · HQ',
      managerIDs: ['EM-014'],
      parent: null,
      children: ['UNIT-ENG-PLATFORM', 'UNIT-ENG-PRODUCT'],
    },
    'UNIT-ENG-PLATFORM': {
      id: 'UNIT-ENG-PLATFORM', type: 'Team', name: 'Platform Engineering',
      location: 'Sofia, BG · Hybrid',
      managerIDs: ['EM-008'],
      parent: 'UNIT-ENG',
      children: [],
    },
    'UNIT-ENG-PRODUCT': {
      id: 'UNIT-ENG-PRODUCT', type: 'Team', name: 'Product Engineering',
      location: 'Sofia, BG · Hybrid',
      managerIDs: ['EM-013'],
      parent: 'UNIT-ENG',
      children: [],
    },
  };

  // ---------- Cycle ----------
  const CYCLE = { cycleID: '2026-H1', cycleDate: '2026-06-30', label: 'Spring \'26 cycle', deadlineSelf: '2026-05-21', deadlineManager: '2026-06-04' };

  // ---------- Evaluations ----------
  // We seed a few with different statuses to demonstrate every state.
  function mkGrades(picks) {
    const out = {};
    COMPETENCIES.forEach(cat => cat.subcategories.forEach(sub => sub.items.forEach(item => {
      out[item.id] = { employee: picks?.employee?.[item.id] || null,
                       manager:  picks?.manager?.[item.id]  || null,
                       team:     picks?.team?.[item.id]     || null };
    })));
    return out;
  }

  const EVALUATIONS = [
    {
      evaluationID: 'EV-2026-001', cycleID: CYCLE.cycleID, cycleDate: CYCLE.cycleDate,
      employeeID: 'EM-001', managerID: MANAGER_ID,
      careerPath: 'SE01', stageLevel: 'S2',
      status: 'IN_REVIEW',
      interviewDate: null,
      selfEvaluationCompleted: true,
      teamEvaluationCompleted: true,
      managerEvaluationCompleted: false,
      grades: mkGrades({
        employee: { 'E1.1': 'S', 'E1.2': 'R', 'E1.3': 'S', 'E2.1': 'S', 'E2.2': 'R', 'E2.3': 'S', 'E3.1': 'R', 'E3.2': 'S',
                    'I1.1': 'R', 'I1.2': 'R', 'I2.1': 'S', 'I2.2': 'R', 'I3.1': 'R', 'I3.2': 'R',
                    'C1.1': 'S', 'C1.2': 'S', 'C2.1': 'S', 'C2.2': 'R', 'C2.3': 'R', 'C3.1': 'S', 'C3.2': 'R' },
        team:     { 'E1.1': 'S', 'E1.2': 'S', 'E1.3': 'S', 'E2.1': 'S', 'E2.2': 'S', 'E2.3': 'S', 'E3.1': 'S', 'E3.2': 'S',
                    'I1.1': 'R', 'I1.2': 'R', 'I2.1': 'R', 'I2.2': 'R', 'I3.1': 'R', 'I3.2': 'R',
                    'C1.1': 'S', 'C1.2': 'S', 'C2.1': 'R', 'C2.2': 'S', 'C2.3': 'R', 'C3.1': 'S', 'C3.2': 'S' },
        manager:  {},
      }),
      feedback: { employeeComment: 'A great year, especially on the platform migration. Pushed myself on cross-team communication and saw clear results in the Q3 RFC process.', managerComment: '', teamComments: [] },
      scores: {}, finalScore: null,
      workflow: { team: ['EM-002', 'EM-005', 'EM-006'] },
    },
    {
      evaluationID: 'EV-2026-002', cycleID: CYCLE.cycleID, cycleDate: CYCLE.cycleDate,
      employeeID: 'EM-002', managerID: MANAGER_ID, careerPath: 'SE01', stageLevel: 'R3',
      status: 'OPEN', interviewDate: null,
      selfEvaluationCompleted: false, teamEvaluationCompleted: false, managerEvaluationCompleted: false,
      grades: mkGrades({}), feedback: { employeeComment: '', managerComment: '', teamComments: [] }, scores: {}, finalScore: null,
      workflow: { team: ['EM-001', 'EM-005'] },
    },
    {
      evaluationID: 'EV-2026-003', cycleID: CYCLE.cycleID, cycleDate: CYCLE.cycleDate,
      employeeID: 'EM-004', managerID: MANAGER_ID, careerPath: 'PM01', stageLevel: 'S1',
      status: 'READY', interviewDate: '2026-06-12',
      selfEvaluationCompleted: true, teamEvaluationCompleted: true, managerEvaluationCompleted: true,
      grades: mkGrades({
        employee: { 'E1.1': 'R', 'E1.2': 'R', 'E1.3': 'S', 'E2.1': 'S', 'E2.2': 'R', 'E2.3': 'S', 'E3.1': 'S', 'E3.2': 'S',
                    'I1.1': 'S', 'I1.2': 'S', 'I2.1': 'S', 'I2.2': 'S', 'I3.1': 'R', 'I3.2': 'S',
                    'C1.1': 'S', 'C1.2': 'R', 'C2.1': 'S', 'C2.2': 'S', 'C2.3': 'S', 'C3.1': 'R', 'C3.2': 'R' },
        team:     { 'E1.1': 'R', 'E1.2': 'R', 'E1.3': 'R', 'E2.1': 'S', 'E2.2': 'R', 'E2.3': 'S', 'E3.1': 'S', 'E3.2': 'S',
                    'I1.1': 'S', 'I1.2': 'S', 'I2.1': 'S', 'I2.2': 'S', 'I3.1': 'R', 'I3.2': 'R',
                    'C1.1': 'S', 'C1.2': 'S', 'C2.1': 'S', 'C2.2': 'S', 'C2.3': 'S', 'C3.1': 'S', 'C3.2': 'R' },
        manager:  { 'E1.1': 'R', 'E1.2': 'R', 'E1.3': 'S', 'E2.1': 'S', 'E2.2': 'R', 'E2.3': 'S', 'E3.1': 'S', 'E3.2': 'S',
                    'I1.1': 'S', 'I1.2': 'R', 'I2.1': 'S', 'I2.2': 'S', 'I3.1': 'R', 'I3.2': 'R',
                    'C1.1': 'S', 'C1.2': 'R', 'C2.1': 'S', 'C2.2': 'S', 'C2.3': 'R', 'C3.1': 'R', 'C3.2': 'R' },
      }),
      feedback: {
        employeeComment: 'Q1 delivery exceeded plan. I want to focus next cycle on mentoring junior PMs and developing the new estimation framework.',
        managerComment: 'Boris had a strong cycle. Project Atlas shipped two weeks early and his stakeholder communication is consistently the best on the team. Growth area: delegation \u2014 he still owns too much critical-path work himself.',
        teamComments: ['Reliable, communicative, and always one step ahead. A pleasure to plan with.', 'Could push back more on scope creep instead of absorbing it.'],
      },
      scores: { E: 116, I: 121, C: 119 }, finalScore: { score: 119, threshold: 'T4', interpretationName: 'Good' },
      workflow: { team: ['EM-001', 'EM-005', 'EM-006'] },
    },
    {
      evaluationID: 'EV-2026-004', cycleID: CYCLE.cycleID, cycleDate: CYCLE.cycleDate,
      employeeID: 'EM-005', managerID: MANAGER_ID, careerPath: 'BA01', stageLevel: 'R2',
      status: 'READY', interviewDate: null,
      selfEvaluationCompleted: true, teamEvaluationCompleted: true, managerEvaluationCompleted: true,
      grades: mkGrades({}),
      feedback: { employeeComment: '', managerComment: '', teamComments: [] },
      scores: { E: 102, I: 108, C: 110 }, finalScore: { score: 107, threshold: 'T4', interpretationName: 'Good' },
      workflow: { team: ['EM-001', 'EM-006'] },
    },
    {
      evaluationID: 'EV-2026-005', cycleID: CYCLE.cycleID, cycleDate: CYCLE.cycleDate,
      employeeID: 'EM-003', managerID: MANAGER_ID, careerPath: 'SE01', stageLevel: 'J2',
      status: 'OPEN', interviewDate: null,
      selfEvaluationCompleted: false, teamEvaluationCompleted: false, managerEvaluationCompleted: false,
      grades: mkGrades({}), feedback: { employeeComment: '', managerComment: '', teamComments: [] }, scores: {}, finalScore: null,
      workflow: { team: ['EM-001', 'EM-002'] },
    },
  ];

  // ---------- Calendar ----------
  // Working days Mon–Fri, 09:00–18:00, 30-min slots. We seed a few slots for the current week of "today".
  const CALENDAR_CONFIG = {
    slotDurationMinutes: 30,
    workingHoursStart: '09:00',
    workingHoursEnd: '18:00',
    workingDays: [1, 2, 3, 4, 5],
  };

  // The "today" of the prototype, pinned for deterministic mocks
  const TODAY = new Date('2026-05-13T10:00:00');

  function isoDate(d) { return d.toISOString().slice(0, 10); }
  function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function startOfWeek(d) { const x = new Date(d); const dow = x.getDay(); const diff = (dow === 0 ? -6 : 1 - dow); x.setDate(x.getDate() + diff); x.setHours(0,0,0,0); return x; }

  const weekStart = startOfWeek(TODAY);
  const CAL_SLOTS = [
    // This week
    { date: isoDate(addDays(weekStart, 0)), startTime: '10:00', status: 'available' },
    { date: isoDate(addDays(weekStart, 0)), startTime: '10:30', status: 'available' },
    { date: isoDate(addDays(weekStart, 0)), startTime: '14:00', status: 'busy' },
    { date: isoDate(addDays(weekStart, 1)), startTime: '09:30', status: 'available' },
    { date: isoDate(addDays(weekStart, 1)), startTime: '11:00', status: 'booked', booking: { evaluationID: 'EV-2026-003', employeeID: 'EM-004', employeeName: 'Boris Stanev', bookedAt: '2026-05-08T13:14:00Z' } },
    { date: isoDate(addDays(weekStart, 1)), startTime: '15:00', status: 'available' },
    { date: isoDate(addDays(weekStart, 1)), startTime: '15:30', status: 'available' },
    { date: isoDate(addDays(weekStart, 2)), startTime: '10:00', status: 'available' },
    { date: isoDate(addDays(weekStart, 2)), startTime: '14:30', status: 'busy' },
    { date: isoDate(addDays(weekStart, 2)), startTime: '15:00', status: 'busy' },
    { date: isoDate(addDays(weekStart, 3)), startTime: '09:00', status: 'available' },
    { date: isoDate(addDays(weekStart, 3)), startTime: '13:00', status: 'available' },
    { date: isoDate(addDays(weekStart, 3)), startTime: '13:30', status: 'available' },
    { date: isoDate(addDays(weekStart, 4)), startTime: '11:30', status: 'available' },
    { date: isoDate(addDays(weekStart, 4)), startTime: '16:00', status: 'available' },
    // next week samples
    { date: isoDate(addDays(weekStart, 7)),  startTime: '10:00', status: 'available' },
    { date: isoDate(addDays(weekStart, 8)),  startTime: '14:00', status: 'available' },
    { date: isoDate(addDays(weekStart, 9)),  startTime: '11:00', status: 'available' },
    { date: isoDate(addDays(weekStart, 11)), startTime: '15:00', status: 'available' },
  ].map((s, i) => ({ slotID: `SL-${1000 + i}`, managerID: MANAGER_ID, managerName: 'Martin Todorov', ...s }));

  return {
    COMPETENCIES, GRADES, THRESHOLDS, STATUSES, CAREER_PATHS,
    EMPLOYEES, ORG_UNITS, CYCLE, EVALUATIONS, CAL_SLOTS, CALENDAR_CONFIG,
    CURRENT_USER_ID, MANAGER_ID, TODAY,
  };
})();
