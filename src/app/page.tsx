'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  Target, Users, Video, ArrowRight, Zap, Brain,
  CheckCircle, Clock, TrendingUp, BookOpen,
  BarChart2, Calendar, Code2, Music, Dumbbell,
  BookMarked, Briefcase, PenTool, FlaskConical,
  Palette, MessageSquare, Globe, ChevronRight
} from 'lucide-react';

/* ─── Hooks ─────────────────────────────────────────────────── */

function useCounter(target: number, duration = 2000, active = true) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!active) return;
    let v = 0;
    const step = target / (duration / 16);
    const id = setInterval(() => {
      v += step;
      if (v >= target) { setVal(target); clearInterval(id); }
      else setVal(Math.floor(v));
    }, 16);
    return () => clearInterval(id);
  }, [target, duration, active]);
  return val;
}

function useVisible(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) setOn(true); },
      { threshold }
    );
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, on };
}

/* ─── Data ───────────────────────────────────────────────────── */

const TICKER = [
  { user: 'Maxime', action: 'a terminé 2h30 de code', tag: 'Code', color: '#6366f1' },
  { user: 'Lisa', action: 'a rejoint "Design System v3"', tag: 'Design', color: '#ec4899' },
  { user: 'Thomas', action: 'vient de débloquer 25 sessions', tag: 'Fitness', color: '#ef4444' },
  { user: 'Camille', action: 'a lancé une session live', tag: 'Musique', color: '#10b981' },
  { user: 'Julien', action: 'a complété son objectif mensuel', tag: 'Lecture', color: '#f59e0b' },
  { user: 'Sarah', action: 'a créé le projet "App Mobile"', tag: 'Code', color: '#6366f1' },
  { user: 'Antoine', action: 'a logué 5h d\'études d\'affilée', tag: 'Science', color: '#3b82f6' },
  { user: 'Emma', action: 'a validé 3 cartes Kanban', tag: 'Business', color: '#8b5cf6' },
];

const CATEGORIES = [
  { name: 'Code & Dev',  Icon: Code2,       color: '#6366f1', count: '1.2k objectifs' },
  { name: 'Design',      Icon: Palette,     color: '#ec4899', count: '840 objectifs'  },
  { name: 'Musique',     Icon: Music,       color: '#10b981', count: '620 objectifs'  },
  { name: 'Fitness',     Icon: Dumbbell,    color: '#ef4444', count: '2.1k objectifs' },
  { name: 'Lecture',     Icon: BookMarked,  color: '#f59e0b', count: '950 objectifs'  },
  { name: 'Business',    Icon: Briefcase,   color: '#8b5cf6', count: '710 objectifs'  },
  { name: 'Écriture',    Icon: PenTool,     color: '#f97316', count: '430 objectifs'  },
  { name: 'Science',     Icon: FlaskConical,color: '#3b82f6', count: '380 objectifs'  },
];

const STEPS = [
  { n: '01', title: 'Crée ton objectif', desc: 'Définis ta cible, ta fréquence, tes jalons. L\'IA génère ta feuille de route.', color: '#6366f1' },
  { n: '02', title: 'Forme ton équipe', desc: 'Invite des partenaires, rejoins un salon collectif ou travaille en solo.', color: '#ec4899' },
  { n: '03', title: 'Travaille en live', desc: 'Lance une session Pomodoro, code avec ton équipe, fais valider par l\'IA.', color: '#10b981' },
];

/* ─── Component ──────────────────────────────────────────────── */

export default function Home() {
  /* Pomodoro ring demo */
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => (t + 1) % 1500), 60);
    return () => clearInterval(id);
  }, []);
  const pct = tick / 1500;
  const R = 54;
  const circ = 2 * Math.PI * R;
  const offset = circ * (1 - pct);
  const mins = Math.floor((1500 - tick) / 60);
  const secs = (1500 - tick) % 60;

  /* Counters */
  const { ref: statsRef, on: statsOn } = useVisible();
  const sessions = useCounter(2847, 1800, statsOn);
  const hours    = useCounter(48620, 2200, statsOn);
  const members  = useCounter(3940,  2000, statsOn);

  return (
    <div style={{ background: '#07070f', overflowX: 'hidden', color: '#f8f9fa', position: 'relative' }}>

      {/* Global ambient */}
      <div style={{
        position: 'fixed', top: '-15%', left: '50%', transform: 'translateX(-50%)',
        width: '900px', height: '500px', pointerEvents: 'none', zIndex: 0,
        background: 'radial-gradient(ellipse, rgba(99,102,241,0.07) 0%, transparent 70%)',
      }} />

      {/* ══════════════════════════════════
          HERO
      ══════════════════════════════════ */}
      <section style={{
        minHeight: '100vh', maxWidth: '1280px', margin: '0 auto',
        padding: '0 3rem', paddingTop: '100px',
        display: 'grid', gridTemplateColumns: '55% 45%',
        alignItems: 'center', gap: '4rem',
        position: 'relative', zIndex: 1,
      }}>

        {/* ── Left ── */}
        <div>
          {/* Live badge */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '8px',
            padding: '5px 14px 5px 10px',
            background: 'rgba(16,185,129,0.07)',
            border: '1px solid rgba(16,185,129,0.2)', borderRadius: '100px',
            fontSize: '12px', fontWeight: 600, color: '#34d399', marginBottom: '2rem',
          }}>
            <span style={{ width: '6px', height: '6px', background: '#10b981', borderRadius: '50%', animation: 'gs-pulse 1.5s infinite' }} />
            2 847 sessions actives en ce moment
          </div>

          <h1 style={{
            fontSize: 'clamp(2.8rem, 4.5vw, 4.8rem)',
            fontWeight: 900, lineHeight: 1.06,
            letterSpacing: '-0.04em', marginBottom: '1.5rem',
          }}>
            Chaque heure<br />
            <span style={{
              background: 'linear-gradient(125deg, #818cf8 0%, #ec4899 55%, #f59e0b 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
            }}>compte.</span>{' '}
            <span style={{ color: 'rgba(255,255,255,0.88)' }}>Prouve-le.</span>
          </h1>

          <p style={{
            fontSize: '1.18rem', lineHeight: 1.65,
            color: 'rgba(255,255,255,0.45)',
            maxWidth: '480px', marginBottom: '2.5rem',
          }}>
            La plateforme d'accountability qui transforme tes ambitions en résultats — partenaires, IA coach, coworking live et suivi en temps réel.
          </p>

          <div style={{ display: 'flex', gap: '0.875rem', flexWrap: 'wrap' }}>
            <Link href="/register" style={{
              display: 'inline-flex', alignItems: 'center', gap: '10px',
              background: 'linear-gradient(135deg,#6366f1,#4f46e5)',
              color: '#fff', padding: '14px 28px', borderRadius: '14px',
              fontSize: '1rem', fontWeight: 700, textDecoration: 'none',
              boxShadow: '0 8px 32px rgba(99,102,241,0.35)',
              transition: 'transform 0.2s, box-shadow 0.2s',
            }}>
              Commencer gratuitement <ArrowRight size={17} />
            </Link>
            <Link href="/explore" style={{
              display: 'inline-flex', alignItems: 'center', gap: '10px',
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
              color: '#d1d5db', padding: '14px 24px', borderRadius: '14px',
              fontSize: '1rem', fontWeight: 600, textDecoration: 'none',
              transition: 'background 0.2s',
            }}>
              Explorer la communauté
            </Link>
          </div>

          {/* Mini stats */}
          <div style={{
            display: 'flex', gap: '2.5rem', marginTop: '3rem',
            paddingTop: '2rem', borderTop: '1px solid rgba(255,255,255,0.06)',
          }}>
            {[
              { label: 'Utilisateurs', value: '3.9k+', color: '#818cf8' },
              { label: 'Heures trackées', value: '48k+', color: '#34d399' },
              { label: 'Taux de réussite', value: '89%', color: '#fbbf24' },
            ].map(s => (
              <div key={s.label}>
                <div style={{ fontSize: '1.65rem', fontWeight: 900, color: s.color, lineHeight: 1 }}>{s.value}</div>
                <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.38)', marginTop: '4px', fontWeight: 500 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Right: Dashboard card ── */}
        <div style={{ position: 'relative' }}>

          {/* Floating AI badge */}
          <div style={{
            position: 'absolute', top: '-18px', right: '10px', zIndex: 10,
            background: 'rgba(139,92,246,0.1)', backdropFilter: 'blur(20px)',
            border: '1px solid rgba(139,92,246,0.3)', borderRadius: '16px',
            padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '8px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          }}>
            <Brain size={15} style={{ color: '#a78bfa' }} />
            <div>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#c4b5fd' }}>Coach IA</div>
              <div style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.45)' }}>Analyse en cours…</div>
            </div>
          </div>

          {/* Main card */}
          <div style={{
            background: 'rgba(13,13,22,0.95)', backdropFilter: 'blur(40px)',
            border: '1px solid rgba(255,255,255,0.09)', borderRadius: '26px',
            padding: '2rem',
            boxShadow: '0 40px 100px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.03) inset',
          }}>
            {/* Objective header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1.5rem' }}>
              <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: 'rgba(99,102,241,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Code2 size={19} style={{ color: '#818cf8' }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>Maîtriser React</div>
                <div style={{ fontSize: '0.71rem', color: 'rgba(255,255,255,0.38)' }}>Code · Semaine 8 / 12</div>
              </div>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, background: 'rgba(16,185,129,0.1)', color: '#34d399', padding: '3px 10px', borderRadius: '20px', border: '1px solid rgba(16,185,129,0.22)' }}>En cours</div>
            </div>

            {/* Timer + week bars */}
            <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '1.5rem', alignItems: 'center' }}>
              {/* Pomodoro ring */}
              <div style={{ position: 'relative', width: '120px', height: '120px', flexShrink: 0 }}>
                <svg width="120" height="120" style={{ transform: 'rotate(-90deg)' }}>
                  <circle cx="60" cy="60" r={R} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="9" />
                  <circle cx="60" cy="60" r={R} fill="none"
                    stroke="url(#gr1)" strokeWidth="9" strokeLinecap="round"
                    strokeDasharray={circ} strokeDashoffset={offset}
                    style={{ transition: 'stroke-dashoffset 0.06s linear' }}
                  />
                  <defs>
                    <linearGradient id="gr1" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#6366f1" />
                      <stop offset="100%" stopColor="#ec4899" />
                    </linearGradient>
                  </defs>
                </svg>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ fontSize: '1.25rem', fontWeight: 900, lineHeight: 1, letterSpacing: '-0.03em' }}>
                    {String(mins).padStart(2,'0')}:{String(secs).padStart(2,'0')}
                  </div>
                  <div style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.38)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: '3px', fontWeight: 700 }}>Focus</div>
                </div>
              </div>

              {/* Week micro-bars */}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.3)', marginBottom: '8px' }}>Cette semaine</div>
                {[['Lun',82,'#6366f1'],['Mar',58,'#6366f1'],['Mer',100,'#ec4899'],['Jeu',44,'#6366f1'],['Ven',71,'#6366f1']].map(([l,v,c]) => (
                  <div key={l as string} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }}>
                    <span style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.28)', width: '20px', fontWeight: 600 }}>{l}</span>
                    <div style={{ flex: 1, height: '5px', borderRadius: '3px', background: 'rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${v}%`, background: c as string, borderRadius: '3px' }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Live members strip */}
            <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '12px', padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ display: 'flex' }}>
                {['#6366f1','#ec4899','#10b981','#f59e0b'].map((c,i) => (
                  <div key={i} style={{
                    width: '26px', height: '26px', borderRadius: '50%',
                    background: c, border: '2px solid #07070f',
                    marginLeft: i > 0 ? '-7px' : 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.58rem', fontWeight: 900, color: '#fff',
                  }}>
                    {['M','L','T','C'][i]}
                  </div>
                ))}
              </div>
              <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.55)', flex: 1 }}>
                <span style={{ color: '#34d399', fontWeight: 700 }}>4 membres</span> actifs maintenant
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.68rem', color: '#34d399', fontWeight: 700 }}>
                <span style={{ width: '5px', height: '5px', background: '#10b981', borderRadius: '50%', animation: 'gs-pulse 1.5s infinite' }} />
                LIVE
              </div>
            </div>
          </div>

          {/* Floating milestone badge */}
          <div style={{
            position: 'absolute', bottom: '-16px', left: '10px',
            background: 'rgba(16,185,129,0.09)', backdropFilter: 'blur(20px)',
            border: '1px solid rgba(16,185,129,0.22)', borderRadius: '13px',
            padding: '9px 14px', display: 'flex', alignItems: 'center', gap: '8px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          }}>
            <CheckCircle size={14} style={{ color: '#34d399' }} />
            <span style={{ fontSize: '0.73rem', fontWeight: 700, color: 'rgba(255,255,255,0.8)' }}>
              Étape débloquée ✓
            </span>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════
          ACTIVITY TICKER
      ══════════════════════════════════ */}
      <div style={{
        borderTop: '1px solid rgba(255,255,255,0.04)',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        background: 'rgba(0,0,0,0.25)', overflow: 'hidden',
        padding: '13px 0', position: 'relative', zIndex: 1, marginTop: '6rem',
      }}>
        <div style={{ display: 'flex', gap: '2.5rem', width: 'max-content', animation: 'gs-ticker 35s linear infinite' }}>
          {[...TICKER, ...TICKER].map((item, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', whiteSpace: 'nowrap' }}>
              <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: item.color, flexShrink: 0 }} />
              <span style={{
                fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px', borderRadius: '20px',
                background: `${item.color}15`, color: item.color, border: `1px solid ${item.color}28`,
              }}>{item.tag}</span>
              <span style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.65)' }}>
                <strong style={{ color: '#e2e8f0', fontWeight: 700 }}>{item.user}</strong> {item.action}
              </span>
              <span style={{ color: 'rgba(255,255,255,0.12)' }}>·</span>
            </div>
          ))}
        </div>
      </div>

      {/* ══════════════════════════════════
          STATS ROW
      ══════════════════════════════════ */}
      <div ref={statsRef} style={{
        maxWidth: '1100px', margin: '0 auto',
        padding: '5rem 3rem 4rem',
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.25rem',
        position: 'relative', zIndex: 1,
      }}>
        {[
          { label: 'Sessions actives aujourd\'hui', val: sessions.toLocaleString(), Icon: Zap,        color: '#6366f1' },
          { label: 'Heures trackées au total',      val: hours.toLocaleString()+'h', Icon: Clock,      color: '#10b981' },
          { label: 'Utilisateurs actifs',           val: members.toLocaleString(),  Icon: Users,      color: '#ec4899' },
          { label: 'Taux de réussite moyen',        val: '89%',                     Icon: TrendingUp, color: '#f59e0b' },
        ].map((s, i) => (
          <div key={i} style={{
            background: 'rgba(13,13,22,0.8)', border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: '20px', padding: '1.75rem', position: 'relative', overflow: 'hidden',
          }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: `linear-gradient(90deg, transparent, ${s.color}80, transparent)` }} />
            <s.Icon size={17} style={{ color: s.color, marginBottom: '1rem', opacity: 0.85 }} />
            <div style={{ fontSize: '2.1rem', fontWeight: 900, lineHeight: 1, color: '#f4f4f5', letterSpacing: '-0.03em' }}>{s.val}</div>
            <div style={{ fontSize: '0.74rem', color: 'rgba(255,255,255,0.35)', marginTop: '0.5rem', fontWeight: 500 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* ══════════════════════════════════
          FEATURES BENTO
      ══════════════════════════════════ */}
      <section style={{ maxWidth: '1280px', margin: '0 auto', padding: '1rem 3rem 6rem', position: 'relative', zIndex: 1 }}>

        <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
          <div style={{
            display: 'inline-block', fontSize: '0.72rem', fontWeight: 700,
            letterSpacing: '0.13em', textTransform: 'uppercase', color: '#6366f1',
            background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.18)',
            borderRadius: '100px', padding: '5px 16px', marginBottom: '1.5rem',
          }}>Tout ce dont tu as besoin</div>
          <h2 style={{
            fontSize: 'clamp(2rem, 4vw, 3.2rem)', fontWeight: 900,
            letterSpacing: '-0.04em', lineHeight: 1.08, marginBottom: '1rem',
          }}>
            Un écosystème complet.<br />
            <span style={{ background: 'linear-gradient(135deg,#818cf8,#ec4899)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
              Zéro distraction.
            </span>
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.38)', fontSize: '1.05rem', maxWidth: '480px', margin: '0 auto' }}>
            Des outils taillés pour les gens qui passent à l'action.
          </p>
        </div>

        {/* 12-col bento */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '1.1rem' }}>

          {/* ── Coworking Live (7 cols) ── */}
          <div style={{
            gridColumn: 'span 7',
            background: 'linear-gradient(135deg, #0e0e1c 0%, #12122a 100%)',
            border: '1px solid rgba(99,102,241,0.18)', borderRadius: '28px',
            padding: '2.25rem', position: 'relative', overflow: 'hidden', minHeight: '270px',
          }}>
            <div style={{ position: 'absolute', top: '-40px', right: '-40px', width: '200px', height: '200px', background: 'radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 70%)', pointerEvents: 'none' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1.5rem' }}>
              <div style={{ width: '38px', height: '38px', borderRadius: '11px', background: 'rgba(99,102,241,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Video size={19} style={{ color: '#818cf8' }} />
              </div>
              <div><div style={{ fontWeight: 700 }}>Coworking Live</div><div style={{ fontSize: '0.73rem', color: 'rgba(255,255,255,0.38)' }}>Travaillez ensemble, en temps réel</div></div>
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.7rem', color: '#34d399', fontWeight: 700 }}>
                <span style={{ width: '5px', height: '5px', background: '#10b981', borderRadius: '50%', animation: 'gs-pulse 1.5s infinite' }} /> LIVE
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
              {[['Maxime','#6366f1',true],['Lisa','#ec4899',true],['Thomas','#10b981',false]].map(([name,c,active],i) => (
                <div key={i} style={{ height: '76px', borderRadius: '12px', background: `${c}10`, border: `1px solid ${c}22`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '5px', position: 'relative' }}>
                  <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: c as string, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 800, color: '#fff' }}>{(name as string)[0]}</div>
                  <div style={{ fontSize: '0.63rem', fontWeight: 600, color: 'rgba(255,255,255,0.65)' }}>{name as string}</div>
                  {active && <div style={{ position: 'absolute', top: '5px', right: '5px', width: '5px', height: '5px', borderRadius: '50%', background: '#10b981' }} />}
                </div>
              ))}
            </div>
            <div style={{ marginTop: '1.1rem', display: 'flex', gap: '8px' }}>
              <div style={{ flex: 1, background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: '10px', padding: '7px 12px', fontSize: '0.75rem', color: '#a5b4fc', fontWeight: 600 }}>⏱ Pomodoro · 18:32</div>
              <div style={{ flex: 1, background: 'rgba(255,255,255,0.04)', borderRadius: '10px', padding: '7px 12px', fontSize: '0.75rem', color: 'rgba(255,255,255,0.45)' }}>📋 Tableau blanc partagé</div>
            </div>
          </div>

          {/* ── Coach IA (5 cols) ── */}
          <div style={{
            gridColumn: 'span 5',
            background: 'linear-gradient(135deg, #0f0b1e 0%, #100d20 100%)',
            border: '1px solid rgba(139,92,246,0.18)', borderRadius: '28px',
            padding: '2.25rem', position: 'relative', overflow: 'hidden',
          }}>
            <div style={{ position: 'absolute', bottom: '-30px', right: '-30px', width: '160px', height: '160px', background: 'radial-gradient(circle, rgba(139,92,246,0.14) 0%, transparent 70%)', pointerEvents: 'none' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1.5rem' }}>
              <div style={{ width: '38px', height: '38px', borderRadius: '11px', background: 'rgba(139,92,246,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Brain size={19} style={{ color: '#a78bfa' }} />
              </div>
              <div><div style={{ fontWeight: 700 }}>Coach IA</div><div style={{ fontSize: '0.73rem', color: 'rgba(255,255,255,0.38)' }}>Propulsé par Gemini</div></div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ alignSelf: 'flex-start', background: 'rgba(255,255,255,0.05)', borderRadius: '14px 14px 14px 4px', padding: '9px 13px', maxWidth: '88%', fontSize: '0.8rem', color: 'rgba(255,255,255,0.7)', lineHeight: 1.55 }}>
                J'ai du mal à rester constant cette semaine…
              </div>
              <div style={{ alignSelf: 'flex-end', background: 'linear-gradient(135deg, rgba(99,102,241,0.2), rgba(139,92,246,0.22))', border: '1px solid rgba(139,92,246,0.2)', borderRadius: '14px 14px 4px 14px', padding: '9px 13px', maxWidth: '88%', fontSize: '0.8rem', color: '#c4b5fd', lineHeight: 1.55 }}>
                Ton pic était mercredi à 9h. Planifie tes sessions le matin 🌅
              </div>
              <div style={{ alignSelf: 'flex-start', background: 'rgba(255,255,255,0.04)', borderRadius: '14px 14px 14px 4px', padding: '9px 13px', maxWidth: '88%', fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)', lineHeight: 1.55 }}>
                Tu veux que je génère ton planning pour la semaine ?
              </div>
            </div>
          </div>

          {/* ── Kanban (5 cols) ── */}
          <div style={{
            gridColumn: 'span 5',
            background: 'linear-gradient(135deg, #0a1010 0%, #0d1514 100%)',
            border: '1px solid rgba(16,185,129,0.14)', borderRadius: '28px',
            padding: '2.25rem',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1.5rem' }}>
              <div style={{ width: '38px', height: '38px', borderRadius: '11px', background: 'rgba(16,185,129,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <BarChart2 size={19} style={{ color: '#34d399' }} />
              </div>
              <div><div style={{ fontWeight: 700 }}>Kanban Board</div><div style={{ fontSize: '0.73rem', color: 'rgba(255,255,255,0.38)' }}>Projet collaboratif</div></div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              {[
                { label: 'À faire', items: ['Design maquettes','Écrire les tests'], color: '#71717a' },
                { label: 'En cours', items: ['Dev API','Figma v2'], color: '#f59e0b' },
                { label: 'Terminé', items: ['Auth flow','CI/CD'], color: '#10b981' },
              ].map(col => (
                <div key={col.label} style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', color: col.color, marginBottom: '6px', letterSpacing: '0.06em' }}>{col.label}</div>
                  {col.items.map(item => (
                    <div key={item} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '8px', padding: '6px 8px', marginBottom: '4px', fontSize: '0.7rem', color: 'rgba(255,255,255,0.65)', border: '1px solid rgba(255,255,255,0.05)' }}>{item}</div>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* ── Étapes (4 cols) ── */}
          <div style={{
            gridColumn: 'span 4',
            background: 'linear-gradient(135deg, #110810 0%, #130a12 100%)',
            border: '1px solid rgba(236,72,153,0.14)', borderRadius: '28px',
            padding: '2.25rem',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1.5rem' }}>
              <div style={{ width: '38px', height: '38px', borderRadius: '11px', background: 'rgba(236,72,153,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CheckCircle size={19} style={{ color: '#f472b6' }} />
              </div>
              <div><div style={{ fontWeight: 700 }}>Étapes & Jalons</div><div style={{ fontSize: '0.73rem', color: 'rgba(255,255,255,0.38)' }}>IA génère ta roadmap</div></div>
            </div>
            {[['Bases React',true],['Hooks avancés',true],['Context API',true],['Performance',false],['Tests',false]].map(([t,d],i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', fontSize: '0.8rem', opacity: d ? 0.45 : 1 }}>
                <span style={{ color: d ? '#10b981' : 'rgba(255,255,255,0.2)', flexShrink: 0 }}>{d ? '✓' : '○'}</span>
                <span style={{ textDecoration: d ? 'line-through' : 'none' }}>{t as string}</span>
              </div>
            ))}
            <div style={{ marginTop: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', marginBottom: '5px' }}>
                <span style={{ color: 'rgba(255,255,255,0.35)' }}>Progression</span>
                <span style={{ color: '#f472b6', fontWeight: 700 }}>60%</span>
              </div>
              <div style={{ height: '4px', borderRadius: '3px', background: 'rgba(255,255,255,0.06)' }}>
                <div style={{ height: '100%', width: '60%', borderRadius: '3px', background: 'linear-gradient(90deg,#ec4899,#f472b6)' }} />
              </div>
            </div>
          </div>

          {/* ── Accountability (3 cols) ── */}
          <div style={{
            gridColumn: 'span 3',
            background: 'linear-gradient(135deg, #0a0d12 0%, #0c1018 100%)',
            border: '1px solid rgba(245,158,11,0.14)', borderRadius: '28px',
            padding: '2.25rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
          }}>
            <div>
              <div style={{ width: '38px', height: '38px', borderRadius: '11px', background: 'rgba(245,158,11,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.25rem' }}>
                <Users size={19} style={{ color: '#fbbf24' }} />
              </div>
              <div style={{ fontWeight: 700, marginBottom: '0.5rem' }}>Accountability</div>
              <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.38)', lineHeight: 1.55 }}>Un partenaire te relance quand tu procrastines</div>
            </div>
            <div style={{ marginTop: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.15)', borderRadius: '10px', padding: '8px 10px' }}>
                <span style={{ fontSize: '0.9rem' }}>🔔</span>
                <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.65)' }}>Julien t'a envoyé un nudge !</span>
              </div>
            </div>
          </div>

          {/* ── Agenda IA (4 cols) ── */}
          <div style={{
            gridColumn: 'span 4',
            background: 'linear-gradient(135deg, #08101c 0%, #0a1422 100%)',
            border: '1px solid rgba(59,130,246,0.14)', borderRadius: '28px',
            padding: '2.25rem',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1.5rem' }}>
              <div style={{ width: '38px', height: '38px', borderRadius: '11px', background: 'rgba(59,130,246,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Calendar size={19} style={{ color: '#60a5fa' }} />
              </div>
              <div><div style={{ fontWeight: 700 }}>Agenda Intelligent</div><div style={{ fontSize: '0.73rem', color: 'rgba(255,255,255,0.38)' }}>Planifié par l'IA</div></div>
            </div>
            {[
              { t: '09:00', label: 'Session Travail · React Hooks', color: '#6366f1', now: true },
              { t: '11:30', label: 'Discussion · Code Review',       color: '#ec4899', now: false },
              { t: '14:00', label: 'Recherche · Documentation',      color: '#8b5cf6', now: false },
            ].map((ev, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px',
                background: ev.now ? `${ev.color}10` : 'rgba(255,255,255,0.025)',
                border: `1px solid ${ev.now ? `${ev.color}28` : 'rgba(255,255,255,0.04)'}`,
                borderRadius: '10px', padding: '7px 10px',
              }}>
                <span style={{ fontSize: '0.64rem', color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace', fontWeight: 600, flexShrink: 0 }}>{ev.t}</span>
                <div style={{ width: '2px', height: '22px', borderRadius: '2px', background: ev.color, flexShrink: 0 }} />
                <span style={{ fontSize: '0.76rem', color: ev.now ? '#fff' : 'rgba(255,255,255,0.55)', fontWeight: ev.now ? 600 : 400, flex: 1 }}>{ev.label}</span>
                {ev.now && <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: ev.color, animation: 'gs-pulse 1.5s infinite', flexShrink: 0 }} />}
              </div>
            ))}
          </div>

          {/* ── Ressources (5 cols) ── */}
          <div style={{
            gridColumn: 'span 5',
            background: 'linear-gradient(135deg, #090f0e 0%, #0b1210 100%)',
            border: '1px solid rgba(16,185,129,0.13)', borderRadius: '28px',
            padding: '2.25rem',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1.5rem' }}>
              <div style={{ width: '38px', height: '38px', borderRadius: '11px', background: 'rgba(16,185,129,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <BookOpen size={19} style={{ color: '#34d399' }} />
              </div>
              <div><div style={{ fontWeight: 700 }}>Ressources Partagées</div><div style={{ fontSize: '0.73rem', color: 'rgba(255,255,255,0.38)' }}>Liens · Fichiers · IA</div></div>
            </div>
            {[
              { title: 'React Docs Officielles', type: 'Lien', color: '#6366f1' },
              { title: 'Patterns de hooks.pdf',  type: 'Fichier', color: '#10b981' },
              { title: '5 ressources générées par l\'IA', type: 'IA', color: '#8b5cf6' },
            ].map((r, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px', padding: '8px 11px', marginBottom: '6px', border: '1px solid rgba(255,255,255,0.04)' }}>
                <div style={{ fontSize: '0.62rem', fontWeight: 700, padding: '2px 7px', borderRadius: '5px', background: `${r.color}14`, color: r.color, border: `1px solid ${r.color}22`, flexShrink: 0 }}>{r.type}</div>
                <span style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.65)' }}>{r.title}</span>
              </div>
            ))}
          </div>

        </div>
      </section>

      {/* ══════════════════════════════════
          HOW IT WORKS
      ══════════════════════════════════ */}
      <section style={{
        maxWidth: '1100px', margin: '0 auto', padding: '2rem 3rem 7rem',
        position: 'relative', zIndex: 1,
      }}>
        <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
          <h2 style={{ fontSize: 'clamp(1.8rem, 3.5vw, 2.8rem)', fontWeight: 900, letterSpacing: '-0.04em', marginBottom: '0.75rem' }}>
            En trois étapes,
            <span style={{ background: 'linear-gradient(135deg,#818cf8,#34d399)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}> tout change.</span>
          </h2>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem', position: 'relative' }}>
          {/* Connecting line */}
          <div style={{ position: 'absolute', top: '2.5rem', left: '18%', right: '18%', height: '1px', background: 'linear-gradient(90deg, rgba(99,102,241,0.4), rgba(16,185,129,0.4))', zIndex: 0, pointerEvents: 'none' }} />

          {STEPS.map((step, i) => (
            <div key={i} style={{
              background: 'rgba(13,13,22,0.8)', border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: '24px', padding: '2.5rem 2rem', position: 'relative', zIndex: 1,
            }}>
              {/* Number */}
              <div style={{
                width: '48px', height: '48px', borderRadius: '50%',
                background: `${step.color}12`, border: `1px solid ${step.color}30`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.8rem', fontWeight: 900, color: step.color,
                fontFamily: 'monospace', marginBottom: '1.5rem',
              }}>{step.n}</div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '0.75rem', letterSpacing: '-0.02em' }}>{step.title}</h3>
              <p style={{ fontSize: '0.88rem', color: 'rgba(255,255,255,0.45)', lineHeight: 1.65, margin: 0 }}>{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ══════════════════════════════════
          CATEGORIES
      ══════════════════════════════════ */}
      <section style={{
        maxWidth: '1100px', margin: '0 auto', padding: '0 3rem 7rem',
        position: 'relative', zIndex: 1,
      }}>
        <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
          <h2 style={{ fontSize: 'clamp(1.8rem, 3.5vw, 2.8rem)', fontWeight: 900, letterSpacing: '-0.04em', marginBottom: '0.75rem' }}>
            Pour chaque ambition,<br />
            <span style={{ background: 'linear-gradient(135deg,#818cf8,#34d399)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>un espace dédié.</span>
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '1rem' }}>Rejoins une communauté de passionnés dans ta catégorie.</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.9rem' }}>
          {CATEGORIES.map((cat, i) => (
            <Link key={i} href="/explore" style={{
              textDecoration: 'none',
              background: `${cat.color}0c`, border: `1px solid ${cat.color}1a`,
              borderRadius: '18px', padding: '1.5rem',
              display: 'flex', alignItems: 'center', gap: '0.875rem',
              transition: 'border-color 0.2s, background 0.2s',
            }}>
              <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: `${cat.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <cat.Icon size={21} style={{ color: cat.color }} />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#f4f4f5' }}>{cat.name}</div>
                <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)', marginTop: '2px' }}>{cat.count}</div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ══════════════════════════════════
          CTA
      ══════════════════════════════════ */}
      <section style={{
        position: 'relative', zIndex: 1, textAlign: 'center',
        padding: '7rem 3rem', borderTop: '1px solid rgba(255,255,255,0.04)', overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
          width: '700px', height: '350px', pointerEvents: 'none',
          background: 'radial-gradient(ellipse, rgba(99,102,241,0.12) 0%, transparent 70%)',
        }} />
        <div style={{ position: 'relative', maxWidth: '680px', margin: '0 auto' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.13em', textTransform: 'uppercase', color: '#6366f1', marginBottom: '1.5rem' }}>
            Rejoins 3 940 utilisateurs actifs
          </div>
          <h2 style={{ fontSize: 'clamp(2.5rem, 5vw, 4.2rem)', fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 1.07, marginBottom: '1.5rem' }}>
            Tes objectifs<br />
            <span style={{ background: 'linear-gradient(135deg,#a5b4fc,#ec4899)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>t'attendent.</span>
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.38)', fontSize: '1.08rem', marginBottom: '2.5rem', lineHeight: 1.65 }}>
            Commence gratuitement. Pas de carte bancaire requise.<br />Résultats visibles dès la première semaine.
          </p>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/register" style={{
              display: 'inline-flex', alignItems: 'center', gap: '10px',
              background: 'linear-gradient(135deg,#6366f1,#4f46e5)',
              color: '#fff', padding: '16px 36px', borderRadius: '16px',
              fontSize: '1.05rem', fontWeight: 700, textDecoration: 'none',
              boxShadow: '0 10px 40px rgba(99,102,241,0.4)',
            }}>
              Créer mon compte <ArrowRight size={19} />
            </Link>
            <Link href="/explore" style={{
              display: 'inline-flex', alignItems: 'center', gap: '10px',
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
              color: '#d1d5db', padding: '16px 28px', borderRadius: '16px',
              fontSize: '1rem', fontWeight: 600, textDecoration: 'none',
            }}>
              Explorer la communauté
            </Link>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════
          FOOTER
      ══════════════════════════════════ */}
      <footer style={{ borderTop: '1px solid rgba(255,255,255,0.04)', background: 'rgba(4,4,10,0.95)', backdropFilter: 'blur(12px)' }}>
        <div style={{
          maxWidth: '1100px', margin: '0 auto',
          padding: '2.5rem 3rem',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: 'linear-gradient(135deg,#6366f1,#4f46e5)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.72rem', fontWeight: 900, color: '#fff' }}>G</div>
            <span style={{ fontWeight: 700 }}>Gitsync</span>
            <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: '0.82rem' }}>© {new Date().getFullYear()}</span>
          </div>
          <div style={{ display: 'flex', gap: '2rem', fontSize: '0.82rem', color: 'rgba(255,255,255,0.3)' }}>
            {[['Explorer','/explore'],['Connexion','/login'],["S'inscrire",'/register']].map(([label,href]) => (
              <Link key={href} href={href} style={{ color: 'inherit', textDecoration: 'none', transition: 'color 0.15s' }}>{label}</Link>
            ))}
          </div>
        </div>
      </footer>

      {/* ── Keyframes ── */}
      <style>{`
        @keyframes gs-ticker {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }
        @keyframes gs-pulse {
          0%,100% { opacity:1; transform:scale(1); }
          50%      { opacity:.45; transform:scale(.75); }
        }
      `}</style>
    </div>
  );
}
