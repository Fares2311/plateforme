'use client';

import { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, Mail, Lock, Eye, EyeOff, CheckCircle, Zap, Users, TrendingUp } from 'lucide-react';
import { useLocale } from '@/context/LocaleContext';

const PERKS = [
  { icon: Zap,         text: 'Pomodoro & coworking live',    sub: 'Sessions synchronisées avec ton équipe' },
  { icon: Users,       text: 'Accountability partners',      sub: 'Un partenaire qui te tient responsable' },
  { icon: TrendingUp,  text: 'Suivi de progression IA',      sub: 'Coach Gemini intégré à chaque objectif' },
  { icon: CheckCircle, text: 'Jalons & Kanban board',        sub: 'Décompose chaque projet en étapes claires' },
];

export default function Login() {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd]   = useState(false);
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const router = useRouter();
  const { t } = useLocale();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message || t('login_error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      background: '#07070f',
    }}>

      {/* ── Left: branding panel ── */}
      <div style={{
        position: 'relative',
        background: 'linear-gradient(160deg, #0e0e1c 0%, #0a0a14 100%)',
        borderRight: '1px solid rgba(255,255,255,0.05)',
        display: 'flex', flexDirection: 'column',
        padding: '3rem 3.5rem',
        overflow: 'hidden',
      }}>
        {/* Ambient */}
        <div style={{
          position: 'absolute', top: '-10%', left: '-10%',
          width: '500px', height: '500px', pointerEvents: 'none',
          background: 'radial-gradient(circle, rgba(99,102,241,0.1) 0%, transparent 65%)',
        }} />
        <div style={{
          position: 'absolute', bottom: '-5%', right: '-5%',
          width: '350px', height: '350px', pointerEvents: 'none',
          background: 'radial-gradient(circle, rgba(236,72,153,0.07) 0%, transparent 65%)',
        }} />

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', position: 'relative', zIndex: 1 }}>
          <div style={{
            width: '34px', height: '34px', borderRadius: '10px',
            background: 'linear-gradient(135deg,#6366f1,#4f46e5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.8rem', fontWeight: 900, color: '#fff',
            boxShadow: '0 4px 16px rgba(99,102,241,0.35)',
          }}>G</div>
          <span style={{ fontWeight: 800, fontSize: '1.1rem', color: '#f4f4f5', letterSpacing: '-0.02em' }}>Gitsync</span>
        </div>

        {/* Main copy */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', position: 'relative', zIndex: 1 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '7px',
            padding: '4px 12px', background: 'rgba(16,185,129,0.08)',
            border: '1px solid rgba(16,185,129,0.2)', borderRadius: '100px',
            fontSize: '0.7rem', fontWeight: 700, color: '#34d399', marginBottom: '1.75rem', alignSelf: 'flex-start',
          }}>
            <span style={{ width: '5px', height: '5px', background: '#10b981', borderRadius: '50%', animation: 'gs-pulse 1.5s infinite' }} />
            2 847 sessions actives
          </div>

          <h1 style={{
            fontSize: 'clamp(2rem, 3.5vw, 3rem)', fontWeight: 900,
            lineHeight: 1.1, letterSpacing: '-0.04em', marginBottom: '1.25rem',
            color: '#f4f4f5',
          }}>
            Bon retour.<br />
            <span style={{
              background: 'linear-gradient(125deg,#818cf8 0%,#ec4899 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
            }}>Tes objectifs t'attendent.</span>
          </h1>

          <p style={{ fontSize: '1rem', color: 'rgba(255,255,255,0.45)', lineHeight: 1.65, marginBottom: '3rem', maxWidth: '380px' }}>
            Reprends là où tu t'étais arrêté. Tes partenaires, sessions et progression t'attendent.
          </p>

          {/* Perks list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {PERKS.map((perk, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{
                  width: '38px', height: '38px', borderRadius: '10px', flexShrink: 0,
                  background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.18)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <perk.icon size={17} style={{ color: '#818cf8' }} />
                </div>
                <div>
                  <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#e2e8f0', lineHeight: 1.2 }}>{perk.text}</div>
                  <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.35)', marginTop: '2px' }}>{perk.sub}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom tagline */}
        <div style={{ position: 'relative', zIndex: 1, fontSize: '0.73rem', color: 'rgba(255,255,255,0.25)', lineHeight: 1.6 }}>
          Conçu pour les ambitieux qui passent à l'action.
        </div>
      </div>

      {/* ── Right: form panel ── */}
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '3rem 3.5rem',
        background: '#07070f',
      }}>
        <div style={{ width: '100%', maxWidth: '400px' }}>

          <h2 style={{ fontSize: '1.75rem', fontWeight: 900, letterSpacing: '-0.03em', marginBottom: '0.5rem', color: '#f4f4f5' }}>
            {t('login_title')}
          </h2>
          <p style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.4)', marginBottom: '2.5rem' }}>
            Pas encore inscrit ?{' '}
            <Link href="/register" style={{ color: '#818cf8', fontWeight: 700, textDecoration: 'none' }}>
              Créer un compte →
            </Link>
          </p>

          {error && (
            <div style={{
              background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
              borderRadius: '12px', padding: '0.75rem 1rem', marginBottom: '1.5rem',
              fontSize: '0.85rem', color: '#fca5a5',
            }}>
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

            {/* Email */}
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'rgba(255,255,255,0.55)', marginBottom: '6px', letterSpacing: '0.03em' }}>
                {t('login_label_email')}
              </label>
              <div style={{ position: 'relative' }}>
                <Mail size={15} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.3)', pointerEvents: 'none' }} />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  placeholder="ton@email.com"
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '12px', padding: '0.75rem 1rem 0.75rem 2.6rem',
                    color: '#f4f4f5', fontSize: '0.95rem', outline: 'none',
                    transition: 'border-color 0.2s',
                  }}
                  onFocus={e => e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)'}
                  onBlur={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'}
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'rgba(255,255,255,0.55)', marginBottom: '6px', letterSpacing: '0.03em' }}>
                {t('login_label_password')}
              </label>
              <div style={{ position: 'relative' }}>
                <Lock size={15} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.3)', pointerEvents: 'none' }} />
                <input
                  type={showPwd ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '12px', padding: '0.75rem 2.6rem 0.75rem 2.6rem',
                    color: '#f4f4f5', fontSize: '0.95rem', outline: 'none',
                    transition: 'border-color 0.2s',
                  }}
                  onFocus={e => e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)'}
                  onBlur={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(v => !v)}
                  style={{
                    position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.3)', padding: '4px',
                  }}
                >
                  {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                marginTop: '0.5rem',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
                background: loading ? 'rgba(99,102,241,0.4)' : 'linear-gradient(135deg,#6366f1,#4f46e5)',
                color: '#fff', padding: '0.875rem', borderRadius: '12px',
                fontSize: '1rem', fontWeight: 700, border: 'none',
                cursor: loading ? 'not-allowed' : 'pointer',
                boxShadow: loading ? 'none' : '0 6px 24px rgba(99,102,241,0.35)',
                transition: 'all 0.2s',
              }}
            >
              {loading ? 'Connexion…' : <>{t('login_btn_submit')} <ArrowRight size={17} /></>}
            </button>
          </form>

          <div style={{ marginTop: '2rem', paddingTop: '2rem', borderTop: '1px solid rgba(255,255,255,0.06)', textAlign: 'center', fontSize: '0.82rem', color: 'rgba(255,255,255,0.3)' }}>
            En continuant, vous acceptez nos conditions d'utilisation.
          </div>
        </div>
      </div>

      <style>{`
        @keyframes gs-pulse {
          0%,100%{opacity:1;transform:scale(1)}
          50%{opacity:.4;transform:scale(.75)}
        }
        @media(max-width:768px){
          div[style*="grid-template-columns: 1fr 1fr"]{
            grid-template-columns:1fr!important;
          }
          div[style*="grid-template-columns: 1fr 1fr"] > div:first-child{
            display:none!important;
          }
        }
      `}</style>
    </div>
  );
}
