'use client';

import { useState, useEffect, useRef } from 'react';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { setDoc, doc, getDoc, collection, query, where, getDocs, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
    Mail, Lock, Eye, EyeOff, User, AtSign, ChevronRight, Check, X, Zap,
} from 'lucide-react';

// ─── Step config ──────────────────────────────────────────────────────────────
const STEPS = [
    { label: 'Compte', icon: Mail },
    { label: 'Identité', icon: User },
    { label: 'Profil', icon: Zap },
];

const toggleMulti = (arr: string[], val: string, max: number): string[] => {
    if (arr.includes(val)) return arr.filter(v => v !== val);
    if (arr.length >= max) return arr;
    return [...arr, val];
};

function getPasswordStrength(pwd: string): { score: number; label: string; color: string } {
    let score = 0;
    if (pwd.length >= 8) score++;
    if (/[A-Z]/.test(pwd)) score++;
    if (/[0-9]/.test(pwd)) score++;
    if (/[^A-Za-z0-9]/.test(pwd)) score++;
    const levels = [
        { label: '', color: 'transparent' },
        { label: 'Faible', color: '#ef4444' },
        { label: 'Moyen', color: '#f59e0b' },
        { label: 'Bon', color: '#6366f1' },
        { label: 'Fort', color: '#10b981' },
    ];
    return { score, ...levels[score] };
}

export default function Register() {
    const router = useRouter();

    const [step, setStep] = useState(0);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    // Step 1
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPwd, setConfirmPwd] = useState('');
    const [showPwd, setShowPwd] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);

    // Step 2
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [username, setUsername] = useState('');
    const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle');
    const usernameTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [emailStatus, setEmailStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
    const emailTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Step 3 — questionnaire discipline
    const [preferredTimes, setPreferredTimes] = useState<string[]>([]);
    const [mainChallenges, setMainChallenges] = useState<string[]>([]);
    const [workStyle, setWorkStyle] = useState('');
    const [motivationDip, setMotivationDip] = useState('');
    const [motivators, setMotivators] = useState<string[]>([]);
    const [generatedProfile, setGeneratedProfile] = useState<any>(null);
    const [generating, setGenerating] = useState(false);

    const pwdStrength = getPasswordStrength(password);
    const pwdMatch = confirmPwd === '' ? null : password === confirmPwd;

    // ── Email uniqueness check via email_index ───────────────────────────────
    useEffect(() => {
        const trimmed = email.trim().toLowerCase();
        if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) { setEmailStatus('idle'); return; }
        setEmailStatus('checking');
        if (emailTimer.current) clearTimeout(emailTimer.current);
        emailTimer.current = setTimeout(async () => {
            try {
                const snap = await getDoc(doc(db, 'email_index', trimmed));
                setEmailStatus(snap.exists() ? 'taken' : 'available');
            } catch {
                setEmailStatus('available');
            }
        }, 500);
    }, [email]);

    // ── Username uniqueness check ─────────────────────────────────────────────
    useEffect(() => {
        if (!username) { setUsernameStatus('idle'); return; }
        if (!/^[a-z0-9_]{3,20}$/.test(username)) { setUsernameStatus('invalid'); return; }
        setUsernameStatus('checking');
        if (usernameTimer.current) clearTimeout(usernameTimer.current);
        usernameTimer.current = setTimeout(async () => {
            try {
                const snap = await getDoc(doc(db, 'username_index', username));
                setUsernameStatus(snap.exists() ? 'taken' : 'available');
            } catch {
                setUsernameStatus('available');
            }
        }, 500);
    }, [username]);

    // ── Step validation ──────────────────────────────────────────────────────
    const step1Valid = emailStatus === 'available' && password.length >= 6 && password === confirmPwd;
    const step2Valid = firstName.trim() !== '' && lastName.trim() !== '' && usernameStatus === 'available';
    const step3Valid = preferredTimes.length > 0 && mainChallenges.length > 0 && workStyle !== '';

    const nextStep = () => { setError(''); setStep(s => s + 1); };

    // ── Generate discipline profile ───────────────────────────────────────────
    const handleAnalyse = async () => {
        setGenerating(true);
        try {
            const res = await fetch('/api/discipline-profile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    totalHours: 0, totalObjectives: 0, totalPairs: 0,
                    userName: firstName.trim() || 'toi',
                    preferredTimes, mainChallenges, workStyle, motivators, motivationDip,
                }),
            });
            const profile = await res.json();
            setGeneratedProfile(profile);
        } catch {
            setError('Erreur lors de la génération du profil.');
        } finally {
            setGenerating(false);
        }
    };

    // ── Final submit ─────────────────────────────────────────────────────────
    const handleSubmit = async () => {
        if (!step3Valid) return;
        setSubmitting(true);
        setError('');
        try {
            const { user } = await createUserWithEmailAndPassword(auth, email.trim(), password);
            const fullName = `${firstName.trim()} ${lastName.trim()}`;
            await updateProfile(user, { displayName: fullName });
            const emailKey = email.trim().toLowerCase();
            const usernameKey = username.trim();
            await Promise.all([
                setDoc(doc(db, 'users', user.uid), {
                    first_name: firstName.trim(),
                    last_name: lastName.trim(),
                    full_name: fullName,
                    username: usernameKey,
                    email: emailKey,
                    avatar_style: '1',
                    discipline_questionnaire: { preferredTimes, mainChallenges, workStyle, motivationDip, motivators },
                    ...(generatedProfile ? { discipline_profile: generatedProfile } : {}),
                    created_at: serverTimestamp(),
                }),
                setDoc(doc(db, 'email_index', emailKey), { uid: user.uid }),
                setDoc(doc(db, 'username_index', usernameKey), { uid: user.uid }),
            ]);
            router.push('/dashboard');
        } catch (err: any) {
            const msgs: Record<string, string> = {
                'auth/email-already-in-use': 'Cet email est déjà utilisé.',
                'auth/weak-password': 'Mot de passe trop faible (6 caractères minimum).',
                'auth/invalid-email': 'Adresse email invalide.',
            };
            setError(msgs[err.code] || err.message || 'Une erreur est survenue.');
        } finally {
            setSubmitting(false);
        }
    };

    // ── Shared styles ────────────────────────────────────────────────────────
    const inputStyle: React.CSSProperties = {
        width: '100%', padding: '12px 16px', borderRadius: '12px', fontSize: '0.95rem',
        background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
        color: '#fff', outline: 'none', transition: 'border 0.2s',
        fontFamily: 'Inter,-apple-system,sans-serif',
    };
    const labelStyle: React.CSSProperties = {
        display: 'block', fontSize: '0.78rem', fontWeight: 700,
        color: 'rgba(255,255,255,0.5)', marginBottom: '7px',
        textTransform: 'uppercase', letterSpacing: '0.07em',
    };
    const primaryBtn: React.CSSProperties = {
        width: '100%', padding: '14px', borderRadius: '14px', fontWeight: 700,
        fontSize: '1rem', cursor: 'pointer', border: 'none',
        background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
        color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: '8px', transition: 'opacity 0.2s',
        boxShadow: '0 4px 20px rgba(99,102,241,0.4)',
    };

    return (
        <div style={{
            minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'radial-gradient(ellipse at 60% 20%, rgba(99,102,241,0.12) 0%, transparent 60%), #0d0d10',
            fontFamily: 'Inter,-apple-system,BlinkMacSystemFont,sans-serif',
            padding: '24px',
        }}>
            <div style={{ width: '100%', maxWidth: '520px' }}>

                {/* Logo */}
                <div style={{ textAlign: 'center', marginBottom: '32px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '6px' }}>
                        <Zap size={22} style={{ color: '#6366f1', fill: '#6366f1' }} />
                        <span style={{ fontSize: '1.3rem', fontWeight: 900, color: '#fff', letterSpacing: '-0.03em' }}>Synkra</span>
                    </div>
                    <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.85rem', margin: 0 }}>Crée ton compte gratuitement</p>
                </div>

                {/* Step indicator */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0', marginBottom: '28px' }}>
                    {STEPS.map((s, i) => {
                        const done = i < step;
                        const active = i === step;
                        return (
                            <div key={i} style={{ display: 'flex', alignItems: 'center' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px' }}>
                                    <div style={{
                                        width: '36px', height: '36px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        background: done ? 'rgba(99,102,241,0.85)' : active ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.05)',
                                        border: active ? '2px solid rgba(99,102,241,0.8)' : done ? 'none' : '2px solid rgba(255,255,255,0.1)',
                                        transition: 'all 0.3s',
                                        boxShadow: active ? '0 0 20px rgba(99,102,241,0.4)' : 'none',
                                    }}>
                                        {done ? <Check size={16} style={{ color: '#fff' }} /> : <s.icon size={15} style={{ color: active ? '#a5b4fc' : 'rgba(255,255,255,0.3)' }} />}
                                    </div>
                                    <span style={{ fontSize: '0.65rem', fontWeight: 700, color: active ? '#a5b4fc' : 'rgba(255,255,255,0.25)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</span>
                                </div>
                                {i < STEPS.length - 1 && (
                                    <div style={{ width: '60px', height: '2px', background: i < step ? 'rgba(99,102,241,0.6)' : 'rgba(255,255,255,0.07)', margin: '0 8px', marginBottom: '20px', transition: 'background 0.4s', borderRadius: '2px' }} />
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Card */}
                <div style={{
                    background: 'rgba(20,20,26,0.85)', border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '24px', padding: '32px',
                    backdropFilter: 'blur(20px)', boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
                }}>
                    {error && (
                        <div style={{ marginBottom: '20px', padding: '10px 14px', borderRadius: '10px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <X size={14} /> {error}
                        </div>
                    )}

                    {/* ── STEP 1: Compte ── */}
                    {step === 0 && (
                        <div>
                            <div style={{ marginBottom: '24px' }}>
                                <h2 style={{ margin: '0 0 4px', fontSize: '1.4rem', fontWeight: 800, color: '#fff' }}>Crée ton compte</h2>
                                <p style={{ margin: 0, color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem' }}>Email et mot de passe pour te connecter</p>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                <div>
                                    <label style={labelStyle}>Adresse email</label>
                                    <div style={{ position: 'relative' }}>
                                        <Mail size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.3)', pointerEvents: 'none' }} />
                                        <input type="email" value={email} onChange={e => setEmail(e.target.value)} style={{ ...inputStyle, paddingLeft: '42px' }} placeholder="ton@email.com" autoFocus />
                                    </div>
                                    {email.length > 0 && emailStatus !== 'idle' && (
                                        <span style={{ fontSize: '0.72rem', fontWeight: 700, marginTop: '4px', display: 'block', color: emailStatus === 'available' ? '#4ade80' : emailStatus === 'taken' ? '#f87171' : 'rgba(255,255,255,0.4)' }}>
                                            {emailStatus === 'checking' ? '⏳ Vérification...' : emailStatus === 'available' ? '✓ Email disponible' : '✕ Cet email est déjà utilisé'}
                                        </span>
                                    )}
                                </div>
                                <div>
                                    <label style={labelStyle}>Mot de passe</label>
                                    <div style={{ position: 'relative' }}>
                                        <Lock size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.3)', pointerEvents: 'none' }} />
                                        <input type={showPwd ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} style={{ ...inputStyle, paddingLeft: '42px', paddingRight: '42px' }} placeholder="6 caractères minimum" />
                                        <button type="button" onClick={() => setShowPwd(v => !v)} style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.3)', padding: 0 }}>
                                            {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                                        </button>
                                    </div>
                                    {password.length > 0 && (
                                        <div style={{ marginTop: '8px' }}>
                                            <div style={{ display: 'flex', gap: '4px', marginBottom: '4px' }}>
                                                {[1,2,3,4].map(n => (
                                                    <div key={n} style={{ flex: 1, height: '3px', borderRadius: '4px', background: n <= pwdStrength.score ? pwdStrength.color : 'rgba(255,255,255,0.07)', transition: 'background 0.3s' }} />
                                                ))}
                                            </div>
                                            {pwdStrength.label && <span style={{ fontSize: '0.72rem', color: pwdStrength.color, fontWeight: 600 }}>{pwdStrength.label}</span>}
                                        </div>
                                    )}
                                </div>
                                <div>
                                    <label style={labelStyle}>Confirmer le mot de passe</label>
                                    <div style={{ position: 'relative' }}>
                                        <Lock size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.3)', pointerEvents: 'none' }} />
                                        <input type={showConfirm ? 'text' : 'password'} value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)} style={{ ...inputStyle, paddingLeft: '42px', paddingRight: '42px', borderColor: confirmPwd ? (pwdMatch ? 'rgba(16,185,129,0.4)' : 'rgba(239,68,68,0.4)') : 'rgba(255,255,255,0.1)' }} placeholder="Répétez le mot de passe" />
                                        <button type="button" onClick={() => setShowConfirm(v => !v)} style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.3)', padding: 0 }}>
                                            {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                                        </button>
                                    </div>
                                    {confirmPwd && (
                                        <p style={{ margin: '5px 0 0', fontSize: '0.75rem', color: pwdMatch ? '#4ade80' : '#f87171', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            {pwdMatch ? <><Check size={12} /> Les mots de passe correspondent</> : <><X size={12} /> Les mots de passe ne correspondent pas</>}
                                        </p>
                                    )}
                                </div>
                            </div>
                            <button onClick={nextStep} disabled={!step1Valid} style={{ ...primaryBtn, marginTop: '24px', opacity: step1Valid ? 1 : 0.4, cursor: step1Valid ? 'pointer' : 'default' }}>
                                Continuer <ChevronRight size={18} />
                            </button>
                        </div>
                    )}

                    {/* ── STEP 2: Identité ── */}
                    {step === 1 && (
                        <div>
                            <div style={{ marginBottom: '24px' }}>
                                <h2 style={{ margin: '0 0 4px', fontSize: '1.4rem', fontWeight: 800, color: '#fff' }}>Ton identité</h2>
                                <p style={{ margin: 0, color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem' }}>Comment tu t'appelles sur la plateforme ?</p>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                <div style={{ display: 'flex', gap: '12px' }}>
                                    <div style={{ flex: 1 }}>
                                        <label style={labelStyle}>Prénom</label>
                                        <div style={{ position: 'relative' }}>
                                            <User size={15} style={{ position: 'absolute', left: '13px', top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.3)', pointerEvents: 'none' }} />
                                            <input type="text" value={firstName} onChange={e => setFirstName(e.target.value)} style={{ ...inputStyle, paddingLeft: '38px' }} placeholder="Jean" autoFocus />
                                        </div>
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <label style={labelStyle}>Nom</label>
                                        <div style={{ position: 'relative' }}>
                                            <User size={15} style={{ position: 'absolute', left: '13px', top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.3)', pointerEvents: 'none' }} />
                                            <input type="text" value={lastName} onChange={e => setLastName(e.target.value)} style={{ ...inputStyle, paddingLeft: '38px' }} placeholder="Dupont" />
                                        </div>
                                    </div>
                                </div>
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '7px' }}>
                                        <label style={{ ...labelStyle, marginBottom: 0 }}>Pseudo unique</label>
                                        {username.length > 0 && (
                                            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: usernameStatus === 'available' ? '#4ade80' : usernameStatus === 'taken' ? '#f87171' : usernameStatus === 'invalid' ? '#f59e0b' : 'rgba(255,255,255,0.3)' }}>
                                                {usernameStatus === 'checking' ? '⏳ Vérification...' : usernameStatus === 'available' ? '✓ Disponible' : usernameStatus === 'taken' ? '✕ Déjà pris' : usernameStatus === 'invalid' ? '⚠ 3-20 car. (a-z, 0-9, _)' : ''}
                                            </span>
                                        )}
                                    </div>
                                    <div style={{ position: 'relative' }}>
                                        <AtSign size={15} style={{ position: 'absolute', left: '13px', top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.3)', pointerEvents: 'none' }} />
                                        <input
                                            type="text" value={username}
                                            onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                                            style={{ ...inputStyle, paddingLeft: '38px', borderColor: username ? (usernameStatus === 'available' ? 'rgba(16,185,129,0.45)' : usernameStatus === 'taken' || usernameStatus === 'invalid' ? 'rgba(239,68,68,0.45)' : 'rgba(255,255,255,0.1)') : 'rgba(255,255,255,0.1)' }}
                                            placeholder="jean_dupont"
                                        />
                                    </div>
                                    <p style={{ margin: '5px 0 0', fontSize: '0.7rem', color: 'rgba(255,255,255,0.25)' }}>Lettres minuscules, chiffres et _ uniquement · Visible publiquement</p>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '10px', marginTop: '24px' }}>
                                <button onClick={() => setStep(0)} style={{ padding: '14px 20px', borderRadius: '14px', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer', background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.1)' }}>
                                    ← Retour
                                </button>
                                <button onClick={nextStep} disabled={!step2Valid} style={{ ...primaryBtn, flex: 1, opacity: step2Valid ? 1 : 0.4, cursor: step2Valid ? 'pointer' : 'default' }}>
                                    Continuer <ChevronRight size={18} />
                                </button>
                            </div>
                        </div>
                    )}

                    {/* ── STEP 3: Questionnaire discipline ── */}
                    {step === 2 && (
                        <div>
                            <div style={{ marginBottom: '22px' }}>
                                <h2 style={{ margin: '0 0 4px', fontSize: '1.4rem', fontWeight: 800, color: '#fff' }}>
                                    {generatedProfile ? `${generatedProfile.emoji} ${generatedProfile.type}` : 'Ton profil de discipline'}
                                </h2>
                                <p style={{ margin: 0, color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem' }}>
                                    {generatedProfile ? generatedProfile.tagline : 'Réponds pour découvrir ton archétype de productivité'}
                                </p>
                            </div>

                            {/* ── Résultat ── */}
                            {generatedProfile && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
                                    <p style={{ margin: 0, fontSize: '0.9rem', color: 'rgba(255,255,255,0.65)', lineHeight: 1.65, padding: '14px 16px', borderRadius: '12px', background: `${generatedProfile.color}10`, border: `1px solid ${generatedProfile.color}25` }}>
                                        {generatedProfile.description}
                                    </p>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                        <div style={{ padding: '14px', borderRadius: '12px', background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.15)' }}>
                                            <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '8px' }}>✦ Forces</div>
                                            {generatedProfile.strengths?.map((s: string, i: number) => (
                                                <div key={i} style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)', marginBottom: '5px', display: 'flex', gap: '6px' }}>
                                                    <span style={{ color: '#10b981', flexShrink: 0 }}>✓</span>{s}
                                                </div>
                                            ))}
                                        </div>
                                        <div style={{ padding: '14px', borderRadius: '12px', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)' }}>
                                            <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '8px' }}>→ À développer</div>
                                            {generatedProfile.growth_areas?.map((g: string, i: number) => (
                                                <div key={i} style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)', marginBottom: '5px', display: 'flex', gap: '6px' }}>
                                                    <span style={{ color: '#f59e0b', flexShrink: 0 }}>→</span>{g}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <div style={{ padding: '12px 16px', borderRadius: '12px', background: `${generatedProfile.color}0D`, border: `1px solid ${generatedProfile.color}20` }}>
                                        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: generatedProfile.color, textTransform: 'uppercase', letterSpacing: '0.08em' }}>💡 Conseil </span>
                                        <span style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)' }}>{generatedProfile.tip}</span>
                                    </div>
                                    <button type="button" onClick={() => setGeneratedProfile(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.3)', fontSize: '0.75rem', textDecoration: 'underline', textAlign: 'left' }}>
                                        Refaire le questionnaire
                                    </button>
                                </div>
                            )}

                            {!generatedProfile && <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

                                {/* Q1: Moments préférés */}
                                <div>
                                    <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'rgba(255,255,255,0.7)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span>🕐</span> Quand travailles-tu le mieux ?
                                        <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.28)', fontWeight: 400 }}>plusieurs choix</span>
                                    </div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                        {[
                                            { label: 'Tôt matin', sub: '5h–9h' },
                                            { label: 'Matinée', sub: '9h–12h' },
                                            { label: 'Après-midi', sub: '12h–18h' },
                                            { label: 'Soir', sub: '18h–22h' },
                                            { label: 'Nuit', sub: '22h+' },
                                        ].map(({ label, sub }) => {
                                            const sel = preferredTimes.includes(label);
                                            return (
                                                <button key={label} type="button" onClick={() => setPreferredTimes(prev => toggleMulti(prev, label, 3))}
                                                    style={{ padding: '8px 14px', borderRadius: '10px', cursor: 'pointer', border: `1.5px solid ${sel ? 'rgba(99,102,241,0.7)' : 'rgba(255,255,255,0.1)'}`, background: sel ? 'rgba(99,102,241,0.18)' : 'rgba(255,255,255,0.03)', color: sel ? '#c7d2fe' : 'rgba(255,255,255,0.45)', fontSize: '0.82rem', fontWeight: 600, transition: 'all 0.15s', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', minWidth: '76px' }}>
                                                    {label}
                                                    <span style={{ fontSize: '0.62rem', opacity: 0.55, fontWeight: 400 }}>{sub}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Q2: Obstacles */}
                                <div>
                                    <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'rgba(255,255,255,0.7)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span>🧱</span> Tes principaux obstacles ?
                                        <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.28)', fontWeight: 400 }}>jusqu&apos;à 3</span>
                                    </div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                        {['Démarrer', 'Concentration', 'Régularité', 'Terminer', 'Procrastination', 'Perfectionnisme'].map(opt => {
                                            const sel = mainChallenges.includes(opt);
                                            const maxed = mainChallenges.length >= 3 && !sel;
                                            return (
                                                <button key={opt} type="button" onClick={() => !maxed && setMainChallenges(prev => toggleMulti(prev, opt, 3))}
                                                    style={{ padding: '8px 14px', borderRadius: '10px', border: `1.5px solid ${sel ? 'rgba(239,68,68,0.6)' : 'rgba(255,255,255,0.1)'}`, background: sel ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.03)', color: sel ? '#fca5a5' : maxed ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.45)', fontSize: '0.82rem', fontWeight: 600, cursor: maxed ? 'not-allowed' : 'pointer', transition: 'all 0.15s' }}>
                                                    {opt}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Q3 + Q4 côte à côte */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                    <div>
                                        <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'rgba(255,255,255,0.7)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span>⚡</span> Ton rythme naturel ?
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                            {[
                                                { label: 'Bursts courts & intenses', icon: '🔥' },
                                                { label: 'Longues sessions profondes', icon: '🌊' },
                                                { label: 'Rythme régulier & planifié', icon: '📅' },
                                                { label: 'Aléatoire selon inspiration', icon: '🎲' },
                                            ].map(({ label, icon }) => {
                                                const sel = workStyle === label;
                                                return (
                                                    <button key={label} type="button" onClick={() => setWorkStyle(label)}
                                                        style={{ padding: '9px 12px', borderRadius: '10px', border: `1.5px solid ${sel ? 'rgba(16,185,129,0.6)' : 'rgba(255,255,255,0.08)'}`, background: sel ? 'rgba(16,185,129,0.13)' : 'rgba(255,255,255,0.02)', color: sel ? '#6ee7b7' : 'rgba(255,255,255,0.45)', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <span>{icon}</span>{label}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'rgba(255,255,255,0.7)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span>📉</span> Face à une baisse de motivation ?
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                            {[
                                                { label: 'Je prends une pause', icon: '⏸️' },
                                                { label: 'Je force et continue', icon: '💪' },
                                                { label: 'Je change de tâche', icon: '🔄' },
                                                { label: "Je cherche de l'aide", icon: '🤝' },
                                            ].map(({ label, icon }) => {
                                                const sel = motivationDip === label;
                                                return (
                                                    <button key={label} type="button" onClick={() => setMotivationDip(label)}
                                                        style={{ padding: '9px 12px', borderRadius: '10px', border: `1.5px solid ${sel ? 'rgba(139,92,246,0.6)' : 'rgba(255,255,255,0.08)'}`, background: sel ? 'rgba(139,92,246,0.13)' : 'rgba(255,255,255,0.02)', color: sel ? '#c4b5fd' : 'rgba(255,255,255,0.45)', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <span>{icon}</span>{label}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>

                                {/* Q5: Motivateurs */}
                                <div>
                                    <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'rgba(255,255,255,0.7)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span>🔑</span> Ce qui te motive ?
                                        <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.28)', fontWeight: 400 }}>jusqu&apos;à 3</span>
                                    </div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                        {['Voir ma progression', 'Les défis', 'La routine', 'La nouveauté', 'Être reconnu', 'Accomplir'].map(opt => {
                                            const sel = motivators.includes(opt);
                                            const maxed = motivators.length >= 3 && !sel;
                                            return (
                                                <button key={opt} type="button" onClick={() => !maxed && setMotivators(prev => toggleMulti(prev, opt, 3))}
                                                    style={{ padding: '8px 14px', borderRadius: '10px', border: `1.5px solid ${sel ? 'rgba(245,158,11,0.65)' : 'rgba(255,255,255,0.1)'}`, background: sel ? 'rgba(245,158,11,0.13)' : 'rgba(255,255,255,0.03)', color: sel ? '#fcd34d' : maxed ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.45)', fontSize: '0.82rem', fontWeight: 600, cursor: maxed ? 'not-allowed' : 'pointer', transition: 'all 0.15s' }}>
                                                    {opt}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                            </div>}

                            <div style={{ display: 'flex', gap: '10px', marginTop: '24px' }}>
                                <button onClick={() => { setStep(1); setGeneratedProfile(null); }} style={{ padding: '14px 20px', borderRadius: '14px', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer', background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.1)' }}>
                                    ← Retour
                                </button>
                                {!generatedProfile ? (
                                    <button type="button" onClick={handleAnalyse} disabled={!step3Valid || generating}
                                        style={{ ...primaryBtn, flex: 1, opacity: step3Valid && !generating ? 1 : 0.4, cursor: step3Valid && !generating ? 'pointer' : 'default' }}>
                                        {generating ? (
                                            <><span style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', animation: 'spin 0.8s linear infinite', display: 'inline-block' }} /> Analyse en cours…</>
                                        ) : (
                                            <>✨ Révéler mon archétype</>
                                        )}
                                    </button>
                                ) : (
                                    <button onClick={handleSubmit} disabled={submitting}
                                        style={{ ...primaryBtn, flex: 1, opacity: submitting ? 0.4 : 1, cursor: submitting ? 'default' : 'pointer' }}>
                                        {submitting ? (
                                            <><span style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', animation: 'spin 0.8s linear infinite', display: 'inline-block' }} /> Création…</>
                                        ) : (
                                            <><Zap size={17} style={{ fill: '#fff' }} /> Créer mon compte</>
                                        )}
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    <p style={{ textAlign: 'center', fontSize: '0.8rem', color: 'rgba(255,255,255,0.3)', marginTop: '20px', marginBottom: 0 }}>
                        Déjà un compte ?{' '}
                        <Link href="/login" style={{ color: '#818cf8', fontWeight: 700, textDecoration: 'none' }}>Se connecter</Link>
                    </p>
                </div>
            </div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
