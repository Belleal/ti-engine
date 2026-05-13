// Icon set for Competence — pure SVG, themed via currentColor.
// Loaded before components/screens; exposes window.Icon.

(() => {
const Icon = ({ name, size = 18, className = '', strokeWidth = 1.7, style }) => {
  const props = {
    width: size, height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    className,
    style,
    'aria-hidden': true,
  };
  switch (name) {
    case 'dashboard':
      return <svg {...props}><path d="M3 12 12 4l9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/></svg>;
    case 'evaluation':
      return <svg {...props}><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>;
    case 'employees':
      return <svg {...props}><circle cx="9" cy="8" r="3.2"/><circle cx="17" cy="9.5" r="2.4"/><path d="M3 19c0-3 2.8-5 6-5s6 2 6 5"/><path d="M14.5 15c2.5 0 5 1.5 5 4"/></svg>;
    case 'calendar':
      return <svg {...props}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>;
    case 'schedule':
      return <svg {...props}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>;
    case 'add':
      return <svg {...props}><path d="M12 5v14M5 12h14"/></svg>;
    case 'check':
      return <svg {...props}><path d="m5 12 4.5 4.5L19 7"/></svg>;
    case 'check-bold':
      return <svg {...props} strokeWidth="2.6"><path d="m5 12 4.5 4.5L19 7"/></svg>;
    case 'close':
      return <svg {...props}><path d="M6 6l12 12M18 6L6 18"/></svg>;
    case 'close-bold':
      return <svg {...props} strokeWidth="2.6"><path d="M6 6l12 12M18 6L6 18"/></svg>;
    case 'chevron-right':
      return <svg {...props}><path d="m9 6 6 6-6 6"/></svg>;
    case 'chevron-left':
      return <svg {...props}><path d="m15 6-6 6 6 6"/></svg>;
    case 'chevron-down':
      return <svg {...props}><path d="m6 9 6 6 6-6"/></svg>;
    case 'arrow-right':
      return <svg {...props}><path d="M5 12h14M13 6l6 6-6 6"/></svg>;
    case 'arrow-up-right':
      return <svg {...props}><path d="M7 17L17 7M9 7h8v8"/></svg>;
    case 'search':
      return <svg {...props}><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>;
    case 'bell':
      return <svg {...props}><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2.5h-15Z"/><path d="M10 21h4"/></svg>;
    case 'settings':
      return <svg {...props}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3 1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8 1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/></svg>;
    case 'logout':
      return <svg {...props}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/></svg>;
    case 'clock':
      return <svg {...props}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>;
    case 'alert':
      return <svg {...props}><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 2.1 18.1A2 2 0 0 0 3.8 21h16.4a2 2 0 0 0 1.7-2.9L13.7 3.9a2 2 0 0 0-3.4 0Z"/></svg>;
    case 'info':
      return <svg {...props}><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v5h1"/></svg>;
    case 'sparkle':
      return <svg {...props}><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/></svg>;
    case 'lock':
      return <svg {...props}><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 1 1 8 0v3"/></svg>;
    case 'user':
      return <svg {...props}><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-7 8-7s8 3 8 7"/></svg>;
    case 'users':
      return <svg {...props}><circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3.5-7 7-7s7 3 7 7"/><path d="M16 4a4 4 0 0 1 0 8M18 21c0-3 1-7 4-7"/></svg>;
    case 'send':
      return <svg {...props}><path d="m22 2-7 20-4-9-9-4 20-7Z"/><path d="M22 2 11 13"/></svg>;
    case 'edit':
      return <svg {...props}><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4Z"/></svg>;
    case 'trash':
      return <svg {...props}><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14"/></svg>;
    case 'star':
      return <svg {...props}><path d="m12 3 2.7 6.3 6.8.6-5.2 4.5 1.6 6.6L12 17.6 6.1 21l1.6-6.6L2.5 9.9l6.8-.6Z"/></svg>;
    case 'flag':
      return <svg {...props}><path d="M4 21V4l8 2 8-2v12l-8 2-8-2"/></svg>;
    case 'chart':
      return <svg {...props}><path d="M3 21V3M3 21h18"/><rect x="6" y="13" width="3" height="6"/><rect x="11" y="9" width="3" height="10"/><rect x="16" y="5" width="3" height="14"/></svg>;
    case 'mail':
      return <svg {...props}><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>;
    case 'org':
      return <svg {...props}><rect x="9" y="2" width="6" height="5" rx="1"/><rect x="3" y="17" width="6" height="5" rx="1"/><rect x="15" y="17" width="6" height="5" rx="1"/><path d="M12 7v4M6 17v-3h12v3"/></svg>;
    case 'briefcase':
      return <svg {...props}><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18"/></svg>;
    case 'menu':
      return <svg {...props}><path d="M4 6h16M4 12h16M4 18h16"/></svg>;
    case 'help':
      return <svg {...props}><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 4 2c-1 .5-1.5 1.5-1.5 2.5M12 17h.01"/></svg>;
    case 'compass':
      return <svg {...props}><circle cx="12" cy="12" r="9"/><path d="m15 9-2 6-4 1 2-6Z"/></svg>;
    case 'guide':
      return <svg {...props}><path d="M3 5a2 2 0 0 1 2-2h6v18H5a2 2 0 0 1-2-2Z"/><path d="M21 5a2 2 0 0 0-2-2h-6v18h6a2 2 0 0 0 2-2Z"/></svg>;
    default:
      return null;
  }
};

window.Icon = Icon;
})();
