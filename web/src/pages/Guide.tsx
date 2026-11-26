import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PROFILE_EMOJI } from '../../../shared/data.ts';
import type { Chat, Lang, ProfileType } from '../../../shared/types.ts';
import { profileKey } from '../components/dialogs.tsx';
import { Icon } from '../components/icons.tsx';
import { Chip, IconButton } from '../components/ui.tsx';
import { DISCLAIMER, GUIDES, OFFICIAL_LINKS, type OfficialLink } from '../content/resources.ts';
import { api } from '../lib/api.ts';
import { useT } from '../lib/i18n.ts';
import { useStore } from '../lib/store.ts';

type Tab = ProfileType | 'all';

function linkUrl(link: OfficialLink, lang: Lang): string {
  if (typeof link.url === 'string') return link.url;
  return link.url[lang] ?? link.url.en ?? Object.values(link.url)[0] ?? '#';
}

function LinkCard({ link, lang }: { link: OfficialLink; lang: Lang }) {
  const t = useT();
  const openShare = useStore((s) => s.openShare);
  const url = linkUrl(link, lang);
  return (
    <div className="card link-card">
      <a className="link-card-main" href={url} target="_blank" rel="noopener noreferrer">
        <span className="link-emoji">{link.emoji}</span>
        <span className="link-text">
          <strong>
            {link.org}
            <span className={`kind kind-${link.kind}`}>{t(`kind_${link.kind}`)}</span>
          </strong>
          {link.hebrew && (
            <span className="hebrew" dir="rtl" lang="he">
              {link.hebrew}
            </span>
          )}
          <span className="link-title">{link.title[lang]}</span>
          <small>{link.desc[lang]}</small>
          <span className="link-url">
            <Icon name="external" size={13} /> {url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}
          </span>
        </span>
      </a>
      <div className="link-card-actions">
        {link.phone && (
          <a className="btn small soft" href={`tel:${link.phone.replace(/[^\d*+]/g, '')}`}>
            <Icon name="phone" size={15} /> {link.phone}
          </a>
        )}
        <IconButton
          icon="share"
          label={t('share')}
          size={18}
          onClick={() => openShare({ title: link.org, text: `${link.org} — ${link.title[lang]}`, url, emoji: link.emoji, subtitle: link.desc[lang] })}
        />
      </div>
    </div>
  );
}

export default function GuidePage() {
  const t = useT();
  const navigate = useNavigate();
  const me = useStore((s) => s.me)!;
  const lang = useStore((s) => s.lang);
  const { error, upsertChat } = useStore.getState();
  const [tab, setTab] = useState<Tab>(me.profile ?? 'all');
  const [open, setOpen] = useState<number | null>(0);

  const guide = GUIDES.find((g) => g.profile === tab) ?? GUIDES[0]!;
  const byId = useMemo(() => new Map(OFFICIAL_LINKS.map((l) => [l.id, l])), []);
  const links = useMemo(
    () =>
      OFFICIAL_LINKS.filter((l) => !l.worlds || l.worlds.includes(lang)).filter((l) =>
        tab === 'all' ? !l.profiles : !l.profiles || l.profiles.includes(tab),
      ),
    [lang, tab],
  );
  // Links specific to the selected profile come first.
  const sorted = useMemo(() => [...links].sort((a, b) => Number(!!b.profiles) - Number(!!a.profiles) || Number(!!b.worlds) - Number(!!a.worlds)), [links]);

  // The built-in discussion group for this profile (or the paperwork group).
  const openGroup = async () => {
    try {
      const r = await api.get<{ groups: Chat[] }>(`/explore?world=${me.world}&category=${tab === 'all' ? 'general' : 'profile'}`);
      const group = tab === 'all' ? r.groups[0] : r.groups.find((g) => g.profile === tab);
      if (!group) return;
      upsertChat(group);
      navigate(`/chats/${group.id}`);
    } catch (e) {
      error(e);
    }
  };

  return (
    <div className="page">
      <header className="pane-head">
        <h1>{t('tab_guide')}</h1>
      </header>
      <div className="page-scroll">
        <div className="page-inner">
          <div className="hero-banner guide">
            <div>
              <h2>{t('guide_title')}</h2>
              <p>{t('guide_subtitle')}</p>
            </div>
            <span className="hero-emoji">🧭</span>
          </div>

          <div className="chips wrap">
            {GUIDES.map((g) => (
              <Chip
                key={g.profile}
                active={g.profile === tab}
                onClick={() => {
                  setTab(g.profile);
                  setOpen(0);
                }}
              >
                {g.profile === 'all' ? '✈️' : PROFILE_EMOJI[g.profile]} {g.profile === 'all' ? t('guide_all') : t(profileKey(g.profile))}
                {g.profile === me.profile && <span className="chip-dot" />}
              </Chip>
            ))}
          </div>

          <section className="guide-section">
            <h3 className="section-heading">
              {guide.emoji} {guide.title[lang]}
            </h3>
            <p className="muted">{guide.intro[lang]}</p>
            <ol className="steps">
              {guide.steps.map((s, i) => (
                <li key={i} className={`step ${open === i ? 'open' : ''}`}>
                  <button type="button" className="step-head" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}>
                    <span className="step-n">{i + 1}</span>
                    <span className="step-title">{s.title[lang]}</span>
                    <Icon name={open === i ? 'down' : 'right'} size={18} />
                  </button>
                  {open === i && (
                    <div className="step-body">
                      <p>{s.desc[lang]}</p>
                      {s.links && s.links.length > 0 && (
                        <div className="step-links">
                          {s.links.map((id) => {
                            const l = byId.get(id);
                            if (!l) return null;
                            return (
                              <a key={id} className="tag link" href={linkUrl(l, lang)} target="_blank" rel="noopener noreferrer">
                                {l.emoji} {l.org} <Icon name="external" size={12} />
                              </a>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ol>
            <button type="button" className="btn soft" onClick={() => void openGroup()}>
              <Icon name="chat" size={18} /> {t('guide_ask_group')}
            </button>
          </section>

          <h3 className="section-heading">{t('official_links')}</h3>
          <div className="link-grid">
            {sorted.map((l) => (
              <LinkCard key={l.id} link={l} lang={lang} />
            ))}
          </div>

          <p className="disclaimer">
            <Icon name="info" size={16} /> {DISCLAIMER[lang]}
          </p>
        </div>
      </div>
    </div>
  );
}
