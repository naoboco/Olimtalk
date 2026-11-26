import { Suspense, lazy, useEffect, useMemo } from 'react';
import { BrowserRouter, NavLink, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { Lightbox, UserProfileModal } from './components/dialogs.tsx';
import { Icon, Logo, type IconName } from './components/icons.tsx';
import { ShareSheet } from './components/ShareSheet.tsx';
import { StoryViewer } from './components/Stories.tsx';
import { Avatar, Spinner, Toasts } from './components/ui.tsx';
import { useT, type Key } from './lib/i18n.ts';
import { useStore } from './lib/store.ts';
import { AuthPage } from './pages/Auth.tsx';
import { ChatsPage } from './pages/Chats.tsx';
import { EventsPage } from './pages/Events.tsx';
import { CommunityPage, ExplorePage } from './pages/Explore.tsx';
import { JoinPage } from './pages/Join.tsx';
import { ProfilePage } from './pages/Profile.tsx';

// The guide carries a lot of text in four languages: load it on demand.
const GuidePage = lazy(() => import('./pages/Guide.tsx'));

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
  const unread = useMemo(
    () => Object.values(chats).reduce((n, c) => n + (c.isMember && !c.muted && !c.archived && (c.type === 'dm' || c.world === me.world) ? c.unread : 0), 0),
    [chats, me.world],
  );
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

export function App() {
  const ready = useStore((s) => s.ready);
  useEffect(() => void useStore.getState().init(), []);
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
      <Routes>
        <Route path="/welcome" element={<Welcome />} />
        <Route path="/join/:code" element={<JoinPage />} />
        <Route element={<RequireAuth />}>
          <Route path="/chats" element={<ChatsPage />} />
          <Route path="/chats/:chatId" element={<ChatsPage />} />
          <Route path="/explore" element={<ExplorePage />} />
          <Route path="/community/:id" element={<CommunityPage />} />
          <Route path="/events" element={<EventsPage />} />
          <Route path="/guide" element={<GuidePage />} />
          <Route path="/me" element={<ProfilePage />} />
        </Route>
        <Route path="*" element={<Navigate to="/chats" replace />} />
      </Routes>
      <ShareSheet />
      <Lightbox />
      <Toasts />
    </BrowserRouter>
  );
}
