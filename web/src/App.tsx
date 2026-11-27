import { Suspense, lazy, useEffect, useMemo } from 'react';
import { BrowserRouter, NavLink, Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Lightbox, UserProfileModal } from './components/dialogs.tsx';
import { Icon, Logo, type IconName } from './components/icons.tsx';
import { ShareSheet } from './components/ShareSheet.tsx';
import { StoryViewer } from './components/Stories.tsx';
import { Avatar, Spinner, Toasts } from './components/ui.tsx';
import { useT, type Key } from './lib/i18n.ts';
import { hideSplash, initNative, syncSystemBars } from './lib/native.ts';
import { MISCONFIGURED } from './lib/platform.ts';
import { useStore } from './lib/store.ts';
import { AuthPage } from './pages/Auth.tsx';
import { ChatsPage } from './pages/Chats.tsx';
import { EventsPage } from './pages/Events.tsx';
import { CommunityPage, ExplorePage } from './pages/Explore.tsx';
import { JoinPage } from './pages/Join.tsx';
import { ProfilePage } from './pages/Profile.tsx';

// The guide carries a lot of text in four languages: load it on demand.
const GuidePage = lazy(() => import('./pages/Guide.tsx'));
// The assistant and the mailbox are optional connections: loaded when opened.
const AssistantPage = lazy(() => import('./pages/Assistant.tsx'));
const MailPage = lazy(() => import('./pages/Mail.tsx'));
const ConnectAiPage = lazy(() => import('./pages/ConnectAi.tsx'));

const TABS: { to: string; icon: IconName; label: Key }[] = [
  { to: '/chats', icon: 'chat', label: 'tab_chats' },
  { to: '/explore', icon: 'compass', label: 'tab_explore' },
  { to: '/events', icon: 'calendar', label: 'tab_events' },
  { to: '/guide', icon: 'book', label: 'tab_guide' },
];

function Shell() {
  const t = useT();
  const me = useStore((s) => s.me)!;
  const chats = useStore((s) => s.chats);
  const location = useLocation();
  const unread = useMemo(() => Object.values(chats).reduce((n, c) => n + (c.isMember && !c.muted && !c.archived ? c.unread : 0), 0), [chats]);
  const mailUnread = useStore((s) => s.mailUnread);
  useEffect(() => {
    document.title = unread ? `(${unread > 99 ? '99+' : unread}) OlimTalk` : 'OlimTalk';
  }, [unread]);

  // On phones the tab bar is hidden while a conversation is open.
  const inChat = /^\/chats\/\d+/.test(location.pathname);
  return (
    <div className={`shell ${inChat ? 'in-chat' : ''}`}>
      <nav className="nav" aria-label="OlimTalk">
        <NavLink to="/chats" className="nav-logo" aria-label="OlimTalk">
          <Logo size={38} />
        </NavLink>
        {TABS.map((tab) => (
          <NavLink key={tab.to} to={tab.to} className={({ isActive }) => `nav-item ${isActive || (tab.to === '/explore' && location.pathname.startsWith('/community')) ? 'active' : ''}`}>
            <span className="nav-icon">
              <Icon name={tab.icon} size={24} />
              {tab.to === '/chats' && unread > 0 && <span className="badge">{unread > 99 ? '99+' : unread}</span>}
            </span>
            <span className="nav-label">{t(tab.label)}</span>
          </NavLink>
        ))}
        <span className="nav-spacer" />
        <NavLink to="/me" className={({ isActive }) => `nav-item me ${isActive ? 'active' : ''}`}>
          <span className="nav-icon">
            <Avatar id={me.id} name={me.name} src={me.avatar} size={30} />
            {mailUnread > 0 && <span className="badge">{mailUnread > 99 ? '99+' : mailUnread}</span>}
          </span>
          <span className="nav-label">{t('tab_me')}</span>
        </NavLink>
      </nav>
      <main className="content">
        <Suspense
          fallback={
            <div className="center fill">
              <Spinner />
            </div>
          }
        >
          <Outlet />
        </Suspense>
      </main>
      <UserProfileModal />
      <StoryViewer />
    </div>
  );
}

function RequireAuth() {
  const me = useStore((s) => s.me);
  const location = useLocation();
  if (!me) return <Navigate to="/welcome" replace state={{ next: location.pathname + location.search }} />;
  return <Shell />;
}

function Welcome() {
  const me = useStore((s) => s.me);
  const location = useLocation();
  if (me) return <Navigate to={(location.state as { next?: string } | null)?.next || '/chats'} replace />;
  return <AuthPage />;
}

/** Connects the router to the phone: back button, invitation links, status bar. */
function NativeBridge() {
  const navigate = useNavigate();
  const theme = useStore((s) => s.theme);
  useEffect(() => initNative((path, options) => void navigate(path, options)), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => syncSystemBars(), [theme]);
  return null;
}

export function App() {
  const t = useT();
  const ready = useStore((s) => s.ready);
  const bootError = useStore((s) => s.bootError);
  useEffect(() => void (MISCONFIGURED || useStore.getState().init()), []);
  useEffect(() => {
    if (ready || bootError || MISCONFIGURED) hideSplash();
  }, [ready, bootError]);
  if (MISCONFIGURED || bootError) {
    return (
      <div className="splash">
        <Logo size={72} />
        <p>{MISCONFIGURED ? t('boot_misconfigured') : t('boot_offline')}</p>
        {!MISCONFIGURED && (
          <button type="button" className="btn primary" onClick={() => void useStore.getState().init()}>
            {t('retry')}
          </button>
        )}
      </div>
    );
  }
  if (!ready) {
    return (
      <div className="splash">
        <Logo size={72} />
        <Spinner />
      </div>
    );
  }
  return (
    <BrowserRouter>
      <NativeBridge />
      <Routes>
        <Route path="/welcome" element={<Welcome />} />
        <Route path="/join/:code" element={<JoinPage />} />
        {/* The way back from signing in to one's AI account. */}
        <Route
          path="/connect/openrouter/*"
          element={
            <Suspense fallback={null}>
              <ConnectAiPage />
            </Suspense>
          }
        />
        <Route element={<RequireAuth />}>
          <Route path="/chats" element={<ChatsPage />} />
          <Route path="/chats/:chatId" element={<ChatsPage />} />
          <Route path="/explore" element={<ExplorePage />} />
          <Route path="/community/:id" element={<CommunityPage />} />
          <Route path="/events" element={<EventsPage />} />
          <Route path="/guide" element={<GuidePage />} />
          <Route path="/me" element={<ProfilePage />} />
          <Route path="/assistant" element={<AssistantPage />} />
          <Route path="/mail" element={<MailPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/chats" replace />} />
      </Routes>
      <ShareSheet />
      <Lightbox />
      <Toasts />
    </BrowserRouter>
  );
}
