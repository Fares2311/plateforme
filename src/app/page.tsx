'use client';

import Link from 'next/link';
import { Target, Users, Video, ArrowRight, Activity, ShieldCheck, Zap } from 'lucide-react';
import { useLocale } from '@/context/LocaleContext';

export default function Home() {
  const { t } = useLocale();

  return (
    <div style={{ overflowX: 'hidden', position: 'relative' }}>

      {/* Hero Section */}
      <section className="relative flex flex-col items-center justify-center pt-32 pb-24" style={{ minHeight: '85vh' }}>
        <div className="container relative z-10 text-center fade-enter" style={{ maxWidth: '900px' }}>

          {/* Badge */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 16px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '100px', marginBottom: '32px', fontSize: '13px', fontWeight: 600, color: '#a1a1aa' }}>
            <span style={{ display: 'inline-block', width: '6px', height: '6px', background: '#ec4899', borderRadius: '50%', boxShadow: '0 0 10px #ec4899' }}></span>
            Next-Gen Accountability Platform
          </div>

          <h1 className="mb-6 tracking-tighter" style={{ fontSize: 'clamp(3rem, 6vw, 5rem)', lineHeight: 1.1, fontWeight: 800 }}>
            <span style={{ color: '#fff' }}>Le partenaire de </span>
            <span style={{
              background: 'linear-gradient(135deg, #a5b4fc 0%, #ec4899 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'
            }}>réussite</span> qu'il te manquait.
          </h1>

          <p className="text-secondary mb-10 mx-auto" style={{ fontSize: 'clamp(1.1rem, 2vw, 1.35rem)', lineHeight: 1.6, maxWidth: '700px', color: '#a1a1aa' }}>
            {t('hero_subtitle')}
          </p>

          <div className="flex flex-col sm:flex-row justify-center items-center gap-6 mt-10">
            <Link href="/dashboard?create=true"
              className="hover-lift"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
                background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                color: '#fff', padding: '18px 30px', borderRadius: '20px',
                fontSize: '1.1rem', fontWeight: 700, textDecoration: 'none',
                boxShadow: '0 10px 30px rgba(99, 102, 241, 0.3), inset 0 1px 0 rgba(255,255,255,0.2)',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                width: '280px'
              }}
            >
              <Target size={22} strokeWidth={2.5} /> {t('hero_btn_join')}
            </Link>
            <Link href="/explore"
              className="hover-lift"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)',
                color: '#fff', padding: '18px 30px', borderRadius: '20px',
                fontSize: '1.1rem', fontWeight: 700, textDecoration: 'none',
                backdropFilter: 'blur(12px)', transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                width: '280px'
              }}
            >
              <Users size={22} strokeWidth={2.5} /> {t('hero_btn_explore')}
            </Link>
          </div>

          <div className="mt-24 pt-10">
            <p className="text-sm uppercase tracking-widest mb-6 font-bold" style={{ color: '#71717a' }}>🔥 Rejoint par des passionnés de</p>
            <div className="flex justify-center flex-wrap gap-4 opacity-70">
              {['Code & Dev', 'Design', 'Musique', 'Fitness', 'Lecture', 'Études'].map(tag => (
                <span key={tag} style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '100px', fontSize: '14px', fontWeight: 500, color: '#a1a1aa' }}>
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Bento Grid Features Section */}
      <section className="container py-24 relative z-10">
        <div className="text-center mb-16 fade-enter" style={{ animationDelay: '0.1s' }}>
          <h2 className="text-4xl tracking-tight font-black mb-4">Conçu pour l'action.</h2>
          <p className="text-secondary max-w-xl mx-auto" style={{ fontSize: '1.1rem' }}>Une suite d'outils minimaliste mais puissante pour transformer tes objectifs flous en victoires mesurables.</p>
        </div>

        {/* Bento Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px', maxWidth: '1100px', margin: '0 auto' }}>

          {/* Card 1 */}
          <div className="fade-enter" style={{ animationDelay: '0.2s', padding: '40px', background: 'rgba(18,18,21,0.6)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '32px', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ width: '60px', height: '60px', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '24px', color: '#818cf8', boxShadow: '0 8px 32px rgba(99,102,241,0.15)' }}>
              <Target size={28} />
            </div>
            <h3 className="text-2xl font-bold mb-3 text-white">Création d'Objectifs</h3>
            <p className="text-secondary" style={{ lineHeight: 1.6, flexGrow: 1 }}>{t('step1_desc')}</p>
          </div>

          {/* Card 2 */}
          <div className="fade-enter" style={{ animationDelay: '0.3s', padding: '40px', background: 'rgba(18,18,21,0.6)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '32px', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ width: '60px', height: '60px', background: 'rgba(236,72,153,0.1)', border: '1px solid rgba(236,72,153,0.2)', borderRadius: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '24px', color: '#f472b6', boxShadow: '0 8px 32px rgba(236,72,153,0.15)' }}>
              <Users size={28} />
            </div>
            <h3 className="text-2xl font-bold mb-3 text-white">Partenaires</h3>
            <p className="text-secondary" style={{ lineHeight: 1.6, flexGrow: 1 }}>{t('step2_desc')}</p>
          </div>

          {/* Card 3 */}
          <div className="fade-enter" style={{ animationDelay: '0.4s', padding: '40px', background: 'rgba(18,18,21,0.6)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '32px', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ width: '60px', height: '60px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '24px', color: '#34d399', boxShadow: '0 8px 32px rgba(16,185,129,0.15)' }}>
              <Video size={28} />
            </div>
            <h3 className="text-2xl font-bold mb-3 text-white">Vidéoconférence Intégrée</h3>
            <p className="text-secondary" style={{ lineHeight: 1.6, flexGrow: 1 }}>{t('step3_desc')}</p>
          </div>

        </div>
      </section>

      {/* Footer minimaliste */}
      <footer className="relative z-10 border-t" style={{ borderColor: 'rgba(255,255,255,0.05)', background: 'rgba(9,9,11,0.8)', backdropFilter: 'blur(10px)' }}>
        <div className="container py-8 text-center text-sm" style={{ color: '#71717a' }}>
          &copy; {new Date().getFullYear()} Gitsync. Conçu pour les ambitieux.
        </div>
      </footer>
    </div>
  );
}
