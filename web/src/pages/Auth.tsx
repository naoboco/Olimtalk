import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CITIES, PROFILE_EMOJI, WORLD_META } from '../../../shared/data.ts';
import { PROFILES, WORLDS, type Lang, type Me, type ProfileType } from '../../../shared/types.ts';
import { Logo } from '../components/icons.tsx';
import { profileKey } from '../components/dialogs.tsx';
import { Field, Spinner, WorldBadge } from '../components/ui.tsx';
import { ApiError, api } from '../lib/api.ts';
import { useT, type Key } from '../lib/i18n.ts';
import { useStore } from '../lib/store.ts';

export function WorldPicker({ value, onChange }: { value: Lang; onChange: (w: Lang) => void }) {
  return (
    <div className="world-picker">
      {WORLDS.map((w) => (
        <button key={w} type="button" className={`world-card ${w === value ? 'active' : ''}`} onClick={() => onChange(w)} aria-pressed={w === value}>
          <WorldBadge world={w} size={22} />
          <span>
            <strong>{WORLD_META[w].label}</strong>
            <small>{WORLD_META[w].native}</small>
          </span>
        </button>
      ))}
    </div>
  );
}

export function AuthPage() {
  const t = useT();
  const navigate = useNavigate();
  const location = useLocation();
  const lang = useStore((s) => s.lang);
  const setLang = useStore((s) => s.setLang);
  const setMe = useStore((s) => s.setMe);
  const next = (location.state as { next?: string } | null)?.next || '/chats';

  const [mode, setMode] = useState<'register' | 'login'>((location.state as { mode?: 'login' } | null)?.mode ?? 'register');
  const [step, setStep] = useState(0);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [profile, setProfile] = useState<ProfileType | null>(null);
  const [city, setCity] = useState('');
  const [year, setYear] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const fail = (e: unknown) => {
    const code = e instanceof ApiError ? e.code : 'server_error';
    const key = `err_${code}` as Key;
    const text = t(key);
    setErr(text === key ? t('err_server_error') : text);
  };

  const login = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await api.post<{ me: Me }>('/auth/login', { email, password });
      setMe(r.me);
      navigate(next, { replace: true });
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const register = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await api.post<{ me: Me }>('/auth/register', {
        email,
        password,
        name,
        world: lang,
        profile,
        city: city || null,
        aliyahYear: year ? Number(year) : null,
      });
      setMe(r.me);
      navigate(next, { replace: true });
    } catch (e) {
      fail(e);
      setStep(0);
    } finally {
      setBusy(false);
    }
  };

  const step0Valid = name.trim().length >= 2 && /.+@.+\..+/.test(email) && password.length >= 8;

  return (
    <div className="auth">
      <div className="auth-hero">
        <div className="auth-brand">
          <Logo size={52} />
          <span>OlimTalk</span>
        </div>
        <h1>{t('auth_title')}</h1>
        <p>{t('auth_subtitle')}</p>
        <ul className="auth-points">
          <li>🌍 {t('auth_point_public')}</li>
          <li>🏙️ {t('auth_point_groups')}</li>
          <li>🧭 {t('auth_point_guide')}</li>
          <li>✨ {t('auth_point_share')}</li>
        </ul>
      </div>

      <div className="auth-card">
        <div className="auth-worlds">
          <span className="field-label">{t('choose_world')}</span>
          <WorldPicker value={lang} onChange={setLang} />
        </div>

        <div className="tabs">
          <button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => (setMode('register'), setErr(null))}>
            {t('sign_up')}
          </button>
          <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => (setMode('login'), setErr(null))}>
            {t('log_in')}
          </button>
        </div>

        {err && <div className="banner error">{err}</div>}

        {mode === 'login' ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void login();
            }}
          >
            <Field label={t('email')}>
              <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </Field>
            <Field label={t('password')}>
              <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </Field>
            <button type="submit" className="btn primary block large" disabled={busy || !email || !password}>
              {busy ? <Spinner size={18} /> : t('log_in')}
            </button>
          </form>
        ) : step === 0 ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (step0Valid) setStep(1);
            }}
          >
            <Field label={t('your_name')}>
              <input autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required dir="auto" />
            </Field>
            <Field label={t('email')}>
              <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </Field>
            <Field label={t('password')} hint={t('password_hint')}>
              <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required />
            </Field>
            <button type="submit" className="btn primary block large" disabled={!step0Valid}>
              {t('continue')}
            </button>
          </form>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void register();
            }}
          >
            <div className="field">
              <span className="field-label">{t('your_profile')}</span>
              <div className="profile-grid">
                {PROFILES.map((p) => (
                  <button key={p} type="button" className={`profile-opt ${p === profile ? 'active' : ''}`} onClick={() => setProfile(p === profile ? null : p)}>
                    <span>{PROFILE_EMOJI[p]}</span>
                    {t(profileKey(p))}
                  </button>
                ))}
              </div>
              <span className="field-hint">{t('your_profile_hint')}</span>
            </div>
            <div className="two-cols">
              <Field label={t('your_city')}>
                <select value={city} onChange={(e) => setCity(e.target.value)}>
                  <option value="">{t('city_none')}</option>
                  {CITIES.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.name[lang]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t('aliyah_year')}>
                <input type="number" inputMode="numeric" min={1948} max={new Date().getFullYear() + 5} value={year} onChange={(e) => setYear(e.target.value)} placeholder={String(new Date().getFullYear())} />
              </Field>
            </div>
            <div className="row-gap">
              <button type="button" className="btn ghost" onClick={() => setStep(0)}>
                {t('back')}
              </button>
              <button type="submit" className="btn primary grow large" disabled={busy}>
                {busy ? <Spinner size={18} /> : t('create_account')}
              </button>
            </div>
          </form>
        )}
        <p className="muted small center">{t('auth_terms')}</p>
      </div>
    </div>
  );
}
