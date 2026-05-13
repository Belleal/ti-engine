// Main app — wires the shell and routing for the Competence prototype.

(() => {
const {
  Icon, COMPETENCE_DATA,
  Sidebar, Topbar, ToastProvider, useToast,
  ScreenDashboard, ScreenEmployees, ScreenEvaluation, ScreenNewEvaluation,
  ScreenCalendar, ScreenInterviews,
} = window;

function App() {
  // Read initial theme from URL or default to daylight
  const url = new URL(window.location.href);
  const initialTheme = url.searchParams.get('theme') === 'glass' ? 'glass' : 'daylight';
  const [theme, setTheme] = React.useState(initialTheme);
  const [collapsed, setCollapsed] = React.useState(() => {
    try { return localStorage.getItem('competence:sidebar') === 'collapsed'; } catch { return false; }
  });
  const [route, setRoute] = React.useState({ screen: 'dashboard', params: {} });

  React.useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);
  React.useEffect(() => {
    try { localStorage.setItem('competence:sidebar', collapsed ? 'collapsed' : 'expanded'); } catch {}
  }, [collapsed]);

  const navigate = (screen, params = {}) => {
    if (screen === 'guide' || screen === 'help' || screen === 'profile') {
      // ignore — placeholder routes
      return;
    }
    setRoute({ screen, params });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const onStartEvaluation = (employeeID) => navigate('new-evaluation', { employeeID });
  const onOpenEvaluation = (employeeID, evaluationID) => navigate('evaluation', { employeeID, evaluationID });

  const topTitle = ({
    dashboard:      ['Dashboard',           'Spring \'26 cycle'],
    employees:      ['Employees',           COMPETENCE_DATA.ORG_UNITS['UNIT-ENG'].name],
    evaluation:     ['Performance evaluation', COMPETENCE_DATA.CYCLE.cycleID],
    'new-evaluation': ['Start new evaluation', COMPETENCE_DATA.CYCLE.cycleID],
    calendar:       ['Availability calendar', 'Your slots'],
    schedule:       ['Interviews',          'Schedule'],
  })[route.screen] || ['Competence', ''];

  return (
    <ToastProvider>
      <div className={`app-shell ${collapsed ? 'collapsed' : ''}`}>
        <Sidebar
          active={route.screen.startsWith('eval') || route.screen === 'new-evaluation' ? 'evaluation' : route.screen}
          onNavigate={navigate}
          themeName={theme}
          onThemeToggle={() => setTheme(theme === 'daylight' ? 'glass' : 'daylight')}
          collapsed={collapsed}
          onCollapseToggle={() => setCollapsed(c => !c)}
        />
        <div className="content">
          <Topbar title={topTitle[0]} sub={topTitle[1]} actions={
            route.screen === 'employees'
              ? <button className="btn primary" onClick={() => navigate('new-evaluation', { employeeID: 'EM-007' })}><Icon name="add" size={14}/> Start evaluation</button>
              : null
          }/>
          {route.screen === 'dashboard'   && <ScreenDashboard   onNavigate={navigate}/>}
          {route.screen === 'employees'   && <ScreenEmployees   onNavigate={navigate} onStartEvaluation={onStartEvaluation} onOpenEvaluation={onOpenEvaluation}/>}
          {route.screen === 'evaluation'  && <ScreenEvaluation  employeeID={route.params.employeeID || COMPETENCE_DATA.CURRENT_USER_ID} onNavigate={navigate}/>}
          {route.screen === 'new-evaluation' && <ScreenNewEvaluation employeeID={route.params.employeeID} onNavigate={navigate}/>}
          {route.screen === 'calendar'    && <ScreenCalendar    onNavigate={navigate}/>}
          {route.screen === 'schedule'    && <ScreenInterviews  onNavigate={navigate}/>}
        </div>
      </div>
    </ToastProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
})();
