// Extended mock data for the new screens (Cycles, Cycle Setup, Employee Management).
// Merges into window.COMPETENCE_DATA after data.js loads.

(() => {
  const D = window.COMPETENCE_DATA;
  if (!D) return;

  // ---------- Role Families & Specializations ----------
  // Mirrors config.role-families.json (current branch). Each family has baseline
  // competencies + per-spec extras.
  const ROLE_FAMILIES = [
    { code: 'SE', name: 'Software Engineering', description: 'Builds and maintains software systems.',
      specializations: [
        { code: 'BACKEND',   name: 'Backend' },
        { code: 'FRONTEND',  name: 'Frontend' },
        { code: 'MOBILE',    name: 'Mobile' },
        { code: 'FULLSTACK', name: 'Full-stack' },
        { code: 'EMBEDDED',  name: 'Embedded' },
      ]
    },
    { code: 'QE', name: 'Quality Engineering', description: 'Verifies that systems meet quality bars.',
      specializations: [
        { code: 'MANUAL',      name: 'Manual QA' },
        { code: 'AUTOMATION',  name: 'Test automation' },
        { code: 'PERFORMANCE', name: 'Performance' },
        { code: 'SECURITY',    name: 'Security' },
      ]
    },
    { code: 'BA', name: 'Business Analysis', description: 'Translates business needs into requirements.',
      specializations: [
        { code: 'REQUIREMENTS',       name: 'Requirements' },
        { code: 'PROCESS',            name: 'Process' },
        { code: 'PRODUCT_OWNERSHIP',  name: 'Product ownership' },
        { code: 'DATA_BA',            name: 'Data analysis' },
        { code: 'DOC_PROC',           name: 'Documentation' },
      ]
    },
    { code: 'PM', name: 'Project Management', description: 'Plans and delivers projects.',
      specializations: [
        { code: 'AGILE',       name: 'Agile' },
        { code: 'TRADITIONAL', name: 'Traditional' },
        { code: 'PROGRAM',     name: 'Program' },
      ]
    },
    { code: 'XD', name: 'Experience Design', description: 'Designs the experience and the interface.',
      specializations: [
        { code: 'RESEARCH',    name: 'User research' },
        { code: 'INTERACTION', name: 'Interaction' },
        { code: 'VISUAL',      name: 'Visual' },
        { code: 'SERVICE',     name: 'Service design' },
      ]
    },
    { code: 'DA', name: 'Data & Analytics', description: 'Builds data platforms, models, and insight.',
      specializations: [
        { code: 'ENGINEERING', name: 'Data engineering' },
        { code: 'ANALYTICS',   name: 'Analytics' },
        { code: 'ML',          name: 'Machine learning' },
        { code: 'RESEARCH',    name: 'Research' },
      ]
    },
    { code: 'IO', name: 'Infrastructure & Operations', description: 'Runs and scales the platform.',
      specializations: [
        { code: 'DEVOPS',   name: 'DevOps' },
        { code: 'SRE',      name: 'SRE' },
        { code: 'CLOUD',    name: 'Cloud' },
        { code: 'SYSADMIN', name: 'SysAdmin' },
        { code: 'SECOPS',   name: 'SecOps' },
      ]
    },
  ];

  // Subcategories list (for floor coverage indicator in cycle setup)
  const SUBCATEGORIES = D.COMPETENCIES.flatMap(c => c.subcategories.map(s => ({ code: s.id, name: s.name, family: c.id })));
  const ALL_COMPETENCY_ITEMS = D.COMPETENCIES.flatMap(c => c.subcategories.flatMap(s => s.items.map(i => ({ ...i, subcategoryID: s.id, subcategoryName: s.name, categoryID: c.id }))));

  // Cycle-level competency sets keyed by family + key ('baseline' or spec code).
  // We seed a few examples to make the editor feel real.
  const COMPETENCY_SETS = {
    'SE.baseline': ['E1.1', 'E1.2', 'E1.3', 'E2.1', 'E2.2', 'I1.1', 'I2.1', 'I2.2', 'C1.1', 'C2.1', 'C2.2'],
    'SE.BACKEND':  ['E2.3', 'E3.1', 'I3.1'],
    'SE.FRONTEND': ['E2.3', 'I3.2'],
    'SE.MOBILE':   [],
    'SE.FULLSTACK': null, // null = not yet touched (incomplete)
    'SE.EMBEDDED':  null,

    'QE.baseline': ['E1.1', 'E2.1', 'E2.2', 'I1.1', 'I1.2', 'I2.1', 'C1.1', 'C2.1'],
    'QE.MANUAL': [],
    'QE.AUTOMATION': ['E2.3', 'E3.1'],
    'QE.PERFORMANCE': null,
    'QE.SECURITY': null,

    'BA.baseline': ['E1.1', 'I1.1', 'I2.1', 'I3.2', 'C2.1', 'C2.2', 'C2.3'],
    'PM.baseline': null,
    'XD.baseline': null,
    'DA.baseline': null,
    'IO.baseline': null,
  };

  // ---------- Cycles ----------
  const CYCLES = [
    { cycleID: '2025-H2', name: 'Autumn \'25', cycleStart: '2025-07-01', cycleDate: '2025-12-15', cycleEnd: '2025-12-31', actualCloseDate: '2026-01-08', status: 'CLOSED',   counts: { inProgress: 0, completed: 14 }, createdAt: '2025-06-12', createdBy: 'EM-014', createdByName: 'Galina Vasileva' },
    { cycleID: '2026-H1', name: 'Spring \'26', cycleStart: '2026-01-15', cycleDate: '2026-06-04', cycleEnd: '2026-06-30', actualCloseDate: null,         status: 'ACTIVE',   counts: { inProgress: 5,  completed: 2 },  createdAt: '2025-12-08', createdBy: 'EM-014', createdByName: 'Galina Vasileva' },
    { cycleID: '2026-H2', name: 'Autumn \'26', cycleStart: '2026-07-01', cycleDate: '2026-12-15', cycleEnd: '2026-12-31', actualCloseDate: null,         status: 'PLANNING', counts: { inProgress: 0,  completed: 0 },  createdAt: '2026-05-04', createdBy: 'EM-014', createdByName: 'Galina Vasileva' },
  ];
  const CYCLE_STATUSES = {
    PLANNING: { code: 'PLANNING', name: 'Planning',  tone: 'info',    description: 'Competency sets are being configured. Once locked, evaluations can be opened.' },
    ACTIVE:   { code: 'ACTIVE',   name: 'Active',    tone: 'success', description: 'Cycle is live. Evaluations can be opened, drafted, submitted, and interviews scheduled.' },
    CLOSED:   { code: 'CLOSED',   name: 'Closed',    tone: 'muted',   description: 'Cycle is closed and read-only. Final scores are archived.' },
  };

  // ---------- Audit trail (per employee, recent first) ----------
  const AUDIT = {
    'EM-002': [
      { entryID: 'A1', timestamp: '2026-04-22T11:13:00Z', field: 'career.stageLevel',  oldValue: 'R2', newValue: 'R3', changedBy: 'EM-008', changedByName: 'Martin Todorov' },
      { entryID: 'A2', timestamp: '2026-03-04T09:25:00Z', field: 'personal.workMode',  oldValue: 'office', newValue: 'hybrid', changedBy: 'EM-014', changedByName: 'Galina Vasileva' },
      { entryID: 'A3', timestamp: '2025-09-12T15:42:00Z', field: '__created__',        oldValue: null, newValue: null, changedBy: 'EM-014', changedByName: 'Galina Vasileva' },
    ],
    'EM-001': [
      { entryID: 'A4', timestamp: '2026-04-30T14:01:00Z', field: 'career.specialization', oldValue: 'BACKEND', newValue: 'FULLSTACK', changedBy: 'EM-008', changedByName: 'Martin Todorov' },
      { entryID: 'A5', timestamp: '2026-02-18T10:22:00Z', field: 'career.stageLevel',     oldValue: 'S1', newValue: 'S2', changedBy: 'EM-008', changedByName: 'Martin Todorov' },
      { entryID: 'A6', timestamp: '2019-04-15T08:00:00Z', field: '__created__',           oldValue: null, newValue: null, changedBy: 'EM-014', changedByName: 'Galina Vasileva' },
    ],
  };

  // ---------- Employment + role family assignments to employees ----------
  // Map old `careerPath` (SE01/PM01/BA01) -> new (family, specialization)
  const PATH_MAP = {
    SE01: { roleFamily: 'SE', specialization: 'BACKEND' },
    PM01: { roleFamily: 'PM', specialization: 'AGILE' },
    BA01: { roleFamily: 'BA', specialization: 'REQUIREMENTS' },
  };

  // Distribute employment statuses for the demo
  const EMPLOYMENT_BY_EMPLOYEE = {
    'EM-001': { employmentStatus: 'active',     workMode: 'hybrid',  workLocation: 'sofia-hq' },
    'EM-002': { employmentStatus: 'active',     workMode: 'remote',  workLocation: 'remote-eu' },
    'EM-003': { employmentStatus: 'probation',  workMode: 'office',  workLocation: 'sofia-hq' },
    'EM-004': { employmentStatus: 'active',     workMode: 'hybrid',  workLocation: 'sofia-hq' },
    'EM-005': { employmentStatus: 'active',     workMode: 'remote',  workLocation: 'remote-eu' },
    'EM-006': { employmentStatus: 'active',     workMode: 'hybrid',  workLocation: 'sofia-hq' },
    'EM-007': { employmentStatus: 'probation',  workMode: 'office',  workLocation: 'sofia-hq' },
    'EM-008': { employmentStatus: 'active',     workMode: 'hybrid',  workLocation: 'sofia-hq' },
    'EM-009': { employmentStatus: 'active',     workMode: 'hybrid',  workLocation: 'sofia-hq' },
    'EM-010': { employmentStatus: 'on-leave',   workMode: 'remote',  workLocation: 'remote-eu' },
    'EM-011': { employmentStatus: 'active',     workMode: 'office',  workLocation: 'sofia-hq' },
    'EM-012': { employmentStatus: 'active',     workMode: 'hybrid',  workLocation: 'sofia-hq' },
    'EM-013': { employmentStatus: 'active',     workMode: 'hybrid',  workLocation: 'sofia-hq' },
    'EM-014': { employmentStatus: 'active',     workMode: 'office',  workLocation: 'sofia-hq' },
  };

  // Patch in role family + specialization onto existing employees
  D.EMPLOYEES.forEach(e => {
    const p = PATH_MAP[e.careerPath] || { roleFamily: 'SE', specialization: 'BACKEND' };
    e.roleFamily = p.roleFamily;
    e.specialization = p.specialization;
    e.stageLevel = `${e.level}${e.stage}`;
    const emp = EMPLOYMENT_BY_EMPLOYEE[e.id] || { employmentStatus: 'active', workMode: 'hybrid', workLocation: 'sofia-hq' };
    e.employmentStatus = emp.employmentStatus;
    e.workMode = emp.workMode;
    e.workLocation = emp.workLocation;
    const [first, ...rest] = e.name.split(' ');
    e.firstName = first;
    e.lastName  = rest.join(' ');
  });

  // A specialization mix that's varied for the demo (override a few SE folks)
  const SPEC_OVERRIDES = {
    'EM-001': 'FULLSTACK',
    'EM-002': 'BACKEND',
    'EM-003': 'FRONTEND',
    'EM-006': 'BACKEND',
    'EM-007': 'FRONTEND',
    'EM-009': 'BACKEND',
    'EM-010': 'FRONTEND',
  };
  Object.entries(SPEC_OVERRIDES).forEach(([id, spec]) => {
    const e = D.EMPLOYEES.find(x => x.id === id);
    if (e && e.roleFamily === 'SE') e.specialization = spec;
  });

  const EMPLOYMENT_STATUSES = {
    active:    { code: 'active',    name: 'Active',     tone: 'success' },
    probation: { code: 'probation', name: 'Probation',  tone: 'info'    },
    'on-leave':{ code: 'on-leave',  name: 'On leave',   tone: 'warn'    },
    notice:    { code: 'notice',    name: 'Notice',     tone: 'warn'    },
    departed:  { code: 'departed',  name: 'Departed',   tone: 'muted'   },
  };

  const WORK_MODES = {
    office: { code: 'office', name: 'Office' },
    hybrid: { code: 'hybrid', name: 'Hybrid' },
    remote: { code: 'remote', name: 'Remote' },
  };
  const WORK_LOCATIONS = {
    'sofia-hq':  { code: 'sofia-hq',  name: 'Sofia (HQ)' },
    'remote-eu': { code: 'remote-eu', name: 'Remote · EU' },
  };

  // expose
  Object.assign(D, {
    ROLE_FAMILIES, SUBCATEGORIES, ALL_COMPETENCY_ITEMS, COMPETENCY_SETS,
    CYCLES, CYCLE_STATUSES,
    AUDIT, EMPLOYMENT_STATUSES, WORK_MODES, WORK_LOCATIONS,
  });
})();
