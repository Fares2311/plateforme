'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { db, storage } from '@/lib/firebase';
import { doc, getDoc, setDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { updatePassword, EmailAuthProvider, reauthenticateWithCredential, updateProfile } from 'firebase/auth';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useLocale } from '@/context/LocaleContext';
import { useUI } from '@/context/UIContext';
import { Save, User as UserIcon, ShieldCheck, Lock, Target, Clock, ShieldX, Image as ImageIcon, X, Check, Sparkles, RefreshCw, Upload } from 'lucide-react';
import { AVATAR_PRESETS, getAvatarUrl } from '@/lib/avatarPresets';

const fmtHours = (h: number) => h < 1 ? `${Math.round(h * 60)}min` : `${parseFloat(h.toFixed(2))}h`;

type Tab = 'profile' | 'discipline' | 'security';

export default function Profile() {
    const { user, loading } = useAuth();
    const { t } = useLocale();
    const { setNavbarVisible } = useUI();

    const [activeTab, setActiveTab] = useState<Tab>('profile');

    const [name, setName] = useState('');
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [username, setUsername] = useState('');
    const [uploadedPhotoUrl, setUploadedPhotoUrl] = useState('');
    const [photoMode, setPhotoMode] = useState<'avatar' | 'upload'>('avatar');
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [email, setEmail] = useState('');
    const [avatarUrl, setAvatarUrl] = useState('');
    const [avatarStyle, setAvatarStyle] = useState('1');
    const [showAvatarModal, setShowAvatarModal] = useState(false);
    const [pendingStyle, setPendingStyle] = useState('1');

    const [totalHours, setTotalHours] = useState(0);
    const [totalRooms, setTotalRooms] = useState(0);

    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    const [saving, setSaving] = useState(false);
    const [updatingPassword, setUpdatingPassword] = useState(false);

    const [message, setMessage] = useState({ text: '', type: 'success' });
    const [pwdMessage, setPwdMessage] = useState({ text: '', type: 'success' });

    // Discipline profile
    const [disciplineProfile, setDisciplineProfile] = useState<any>(null);
    const [profileLoading, setProfileLoading] = useState(false);
    const [showProfileForm, setShowProfileForm] = useState(false);
    // Questionnaire — multi-choice where marked
    const [preferredTimes, setPreferredTimes] = useState<string[]>([]);
    const [mainChallenges, setMainChallenges] = useState<string[]>([]);
    const [workStyle, setWorkStyle] = useState('');
    const [motivators, setMotivators] = useState<string[]>([]);
    const [motivationDip, setMotivationDip] = useState('');

    const toggleMulti = (arr: string[], val: string, max: number): string[] => {
        if (arr.includes(val)) return arr.filter(v => v !== val);
        if (arr.length >= max) return arr;
        return [...arr, val];
    };

    useEffect(() => {
        const fetchProfileData = async () => {
            if (!user) return;
            try {
                setEmail(user.email || '');
                const docRef = doc(db, 'users', user.uid);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    setName(data.full_name || '');
                    setFirstName(data.first_name || '');
                    setLastName(data.last_name || '');
                    setUsername(data.username || '');
                    if (data.avatar_url) { setUploadedPhotoUrl(data.avatar_url); setPhotoMode('upload'); }
                    if (data.avatar_style) { setAvatarStyle(data.avatar_style); setPendingStyle(data.avatar_style); }
                    if (data.avatar_url) setAvatarUrl(data.avatar_url);
                    if (data.discipline_profile) setDisciplineProfile(data.discipline_profile);
                    if (data.discipline_questionnaire) {
                        const q = data.discipline_questionnaire;
                        if (q.preferredTimes) setPreferredTimes(q.preferredTimes);
                        if (q.mainChallenges) setMainChallenges(q.mainChallenges);
                        if (q.workStyle) setWorkStyle(q.workStyle);
                        if (q.motivationDip) setMotivationDip(q.motivationDip);
                        if (q.motivators) setMotivators(q.motivators);
                    }
                }
                let hours = 0, rooms = 0;
                const q = query(collection(db, 'memberships'), where('user_id', '==', user.uid));
                const membershipDocs = await getDocs(q);
                membershipDocs.forEach(d => { rooms++; hours += d.data().completed_hours || 0; });
                setTotalRooms(rooms);
                setTotalHours(hours);
            } catch (err) { console.error('Error fetching profile:', err); }
        };
        fetchProfileData();
    }, [user]);

    const handleGenerateProfile = async () => {
        const canGenerate = preferredTimes.length > 0 && mainChallenges.length > 0 && workStyle;
        if (!user || !canGenerate || profileLoading) return;
        setProfileLoading(true);
        try {
            const res = await fetch('/api/discipline-profile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    totalHours: parseFloat(totalHours.toFixed(1)),
                    totalObjectives: totalRooms,
                    totalPairs: 0,
                    preferredTimes,
                    mainChallenges,
                    workStyle,
                    motivators,
                    motivationDip,
                    userName: name || 'l\'utilisateur',
                }),
            });
            const profile = await res.json();
            setDisciplineProfile(profile);
            setShowProfileForm(false);
            await setDoc(doc(db, 'users', user.uid), { discipline_profile: profile }, { merge: true });
        } catch (err) { console.error(err); }
        finally { setProfileLoading(false); }
    };

    const handleSaveProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;
        setSaving(true);
        setMessage({ text: '', type: 'success' });
        try {
            const fullName = `${firstName.trim()} ${lastName.trim()}`.trim() || name;
            await setDoc(doc(db, 'users', user.uid), {
                first_name: firstName.trim(),
                last_name: lastName.trim(),
                full_name: fullName,
                username: username.trim(),
                avatar_style: avatarStyle,
                ...(uploadedPhotoUrl && photoMode === 'upload' ? { avatar_url: uploadedPhotoUrl } : { avatar_url: '' }),
            }, { merge: true });
            await updateProfile(user, { displayName: fullName });
            setName(fullName);
            setMessage({ text: t('profile_success') || 'Profil mis à jour avec succès.', type: 'success' });
            setTimeout(() => setMessage({ text: '', type: 'success' }), 4000);
        } catch {
            setMessage({ text: 'Erreur lors de la sauvegarde du profil.', type: 'error' });
        } finally { setSaving(false); }
    };

    const handleUpdatePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !user.email) return;
        if (newPassword !== confirmPassword) { setPwdMessage({ text: 'Les mots de passe ne correspondent pas.', type: 'error' }); return; }
        if (newPassword.length < 6) { setPwdMessage({ text: 'Minimum 6 caractères requis.', type: 'error' }); return; }
        setUpdatingPassword(true);
        setPwdMessage({ text: '', type: 'success' });
        try {
            const credential = EmailAuthProvider.credential(user.email, currentPassword);
            await reauthenticateWithCredential(user, credential);
            await updatePassword(user, newPassword);
            setPwdMessage({ text: 'Mot de passe mis à jour avec succès !', type: 'success' });
            setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
            setTimeout(() => setPwdMessage({ text: '', type: 'success' }), 4000);
        } catch (error: any) {
            if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password') {
                setPwdMessage({ text: 'Mot de passe actuel incorrect.', type: 'error' });
            } else {
                setPwdMessage({ text: error.message || 'Erreur lors du changement.', type: 'error' });
            }
        } finally { setUpdatingPassword(false); }
    };

    const confirmAvatarSelection = () => {
        setAvatarStyle(pendingStyle);
        setShowAvatarModal(false);
        setNavbarVisible(true);
    };

    const handleOpenAvatarModal = () => {
        setPendingStyle(avatarStyle);
        setShowAvatarModal(true);
        setNavbarVisible(false);
    };

    const handleCloseAvatarModal = () => {
        setShowAvatarModal(false);
        setNavbarVisible(true);
    };

    const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !user) return;
        setUploading(true);
        try {
            const storageRef = ref(storage, `avatars/${user.uid}`);
            await uploadBytes(storageRef, file);
            const url = await getDownloadURL(storageRef);
            setUploadedPhotoUrl(url);
            setPhotoMode('upload');
            await setDoc(doc(db, 'users', user.uid), { avatar_url: url }, { merge: true });
        } catch (err) { console.error(err); }
        finally { setUploading(false); }
    };

    if (loading) return <div className="container py-16 text-center">Chargement...</div>;
    if (!user) return <div className="container py-16 text-center">Non autorisé</div>;

    const currentPreset = AVATAR_PRESETS.find(s => s.id === avatarStyle) || AVATAR_PRESETS[0];
    const dynamicAvatarUrl = (photoMode === 'upload' && uploadedPhotoUrl) ? uploadedPhotoUrl : (avatarUrl || getAvatarUrl(currentPreset.style, currentPreset.seed));
    const pendingPreset = AVATAR_PRESETS.find(s => s.id === pendingStyle) || AVATAR_PRESETS[0];

    const tabs: { id: Tab; label: string; icon: string }[] = [
        { id: 'profile',    label: 'Mon Profil', icon: '👤' },
        { id: 'discipline', label: 'Discipline',  icon: '🧠' },
        { id: 'security',   label: 'Sécurité',    icon: '🔒' },
    ];

    const questionnaireDone = [
        preferredTimes.length > 0,
        mainChallenges.length > 0,
        !!workStyle,
        motivators.length > 0,
        !!motivationDip,
    ].filter(Boolean).length;
    const canGenerate = questionnaireDone >= 3 && preferredTimes.length > 0 && mainChallenges.length > 0 && !!workStyle;

    return (
        <div style={{ minHeight: '100vh', paddingBottom: '4rem' }}>

            {/* ── HERO HEADER ── */}
            <div style={{
                background: 'linear-gradient(160deg, rgba(99,102,241,0.14) 0%, rgba(139,92,246,0.07) 55%, rgba(236,72,153,0.05) 100%)',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
                paddingBottom: 0,
            }}>
                <div style={{ maxWidth: '820px', margin: '0 auto', padding: '2.5rem 2rem 0' }}>

                    {/* Avatar + Name + Stats row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginBottom: '2.25rem', flexWrap: 'wrap' }}>

                        {/* Avatar with edit button */}
                        <div style={{ position: 'relative', flexShrink: 0 }}>
                            <div style={{
                                width: '84px', height: '84px', borderRadius: '50%',
                                background: 'rgba(99,102,241,0.15)',
                                border: '3px solid rgba(99,102,241,0.5)',
                                padding: '3px', overflow: 'hidden',
                                boxShadow: '0 0 0 6px rgba(99,102,241,0.08), 0 8px 32px rgba(99,102,241,0.2)',
                            }}>
                                <img src={dynamicAvatarUrl} alt="Avatar" style={{ width: '100%', height: '100%', borderRadius: '50%' }} />
                            </div>
                            <button
                                onClick={handleOpenAvatarModal}
                                title="Changer l'avatar"
                                style={{
                                    position: 'absolute', bottom: '2px', right: '2px',
                                    width: '24px', height: '24px', borderRadius: '50%',
                                    background: '#6366f1',
                                    border: '2px solid var(--color-bg)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    cursor: 'pointer', color: 'white',
                                    boxShadow: '0 2px 8px rgba(99,102,241,0.5)',
                                }}
                            >
                                <ImageIcon size={11} />
                            </button>
                        </div>

                        {/* Name + email */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <h1 style={{
                                fontSize: '1.65rem', fontWeight: 800, color: 'white',
                                margin: '0 0 0.2rem', letterSpacing: '-0.03em',
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}>
                                {name || 'Mon Profil'}
                            </h1>
                            <p style={{ color: 'rgba(255,255,255,0.4)', margin: 0, fontSize: '0.85rem' }}>{email}</p>
                            {disciplineProfile && (
                                <div
                                    onClick={() => setActiveTab('discipline')}
                                    style={{
                                        display: 'inline-flex', alignItems: 'center', gap: '5px',
                                        marginTop: '8px', padding: '3px 10px 3px 7px',
                                        borderRadius: '20px', cursor: 'pointer',
                                        background: `${disciplineProfile.color}18`,
                                        border: `1px solid ${disciplineProfile.color}35`,
                                    }}
                                >
                                    <span style={{ fontSize: '0.8rem' }}>{disciplineProfile.emoji}</span>
                                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: disciplineProfile.color }}>{disciplineProfile.type}</span>
                                </div>
                            )}
                        </div>

                        {/* Stats chips */}
                        <div style={{ display: 'flex', gap: '0.6rem', flexShrink: 0 }}>
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: '9px',
                                padding: '9px 14px', borderRadius: '14px',
                                background: 'rgba(52,211,153,0.09)',
                                border: '1px solid rgba(52,211,153,0.2)',
                            }}>
                                <Clock size={14} style={{ color: '#34d399', flexShrink: 0 }} />
                                <div>
                                    <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'white', lineHeight: 1 }}>{fmtHours(totalHours)}</div>
                                    <div style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.07em', marginTop: '3px' }}>{t('profile_stat_hours')}</div>
                                </div>
                            </div>
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: '9px',
                                padding: '9px 14px', borderRadius: '14px',
                                background: 'rgba(244,114,182,0.09)',
                                border: '1px solid rgba(244,114,182,0.2)',
                            }}>
                                <Target size={14} style={{ color: '#f472b6', flexShrink: 0 }} />
                                <div>
                                    <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'white', lineHeight: 1 }}>{totalRooms}</div>
                                    <div style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.07em', marginTop: '3px' }}>{t('profile_stat_objs')}</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ── Tab Bar ── */}
                    <div style={{ display: 'flex', gap: '0' }}>
                        {tabs.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '7px',
                                    padding: '0.7rem 1.2rem',
                                    background: 'none', border: 'none', cursor: 'pointer',
                                    fontSize: '0.875rem',
                                    fontWeight: activeTab === tab.id ? 700 : 500,
                                    color: activeTab === tab.id ? 'white' : 'rgba(255,255,255,0.4)',
                                    borderBottom: activeTab === tab.id
                                        ? '2px solid #6366f1'
                                        : '2px solid transparent',
                                    transition: 'color 0.18s, border-color 0.18s',
                                    marginBottom: '-1px',
                                    letterSpacing: '-0.01em',
                                }}
                            >
                                <span style={{ fontSize: '0.9rem' }}>{tab.icon}</span>
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* ── TAB CONTENT ── */}
            <div style={{ maxWidth: '820px', margin: '0 auto', padding: '2rem' }}>

                {/* ════ TAB: PROFIL ════ */}
                {activeTab === 'profile' && (
                    <div className="fade-enter">
                        <div className="card card-glass border border-white/10" style={{ padding: '2rem 2.25rem' }}>
                            <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'white', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '8px', margin: '0 0 1.5rem' }}>
                                <UserIcon size={16} style={{ color: '#818cf8' }} /> Informations publiques
                            </h3>

                            {message.text && (
                                <div className={`p-3 mb-5 rounded-lg flex items-center gap-2 text-sm font-medium ${message.type === 'success' ? 'bg-primary-light text-primary' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                                    {message.type === 'success' ? <ShieldCheck size={16} /> : <ShieldX size={16} />} {message.text}
                                </div>
                            )}

                            <form onSubmit={handleSaveProfile} className="flex flex-col gap-5">
                                {/* First + Last name side by side */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                    <div className="form-group mb-0">
                                        <label className="text-sm font-semibold text-slate-300">Prénom</label>
                                        <input type="text" className="input" value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Ton prénom" />
                                    </div>
                                    <div className="form-group mb-0">
                                        <label className="text-sm font-semibold text-slate-300">Nom</label>
                                        <input type="text" className="input" value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Ton nom" />
                                    </div>
                                </div>

                                {/* Username — read-only */}
                                <div className="form-group mb-0 opacity-60 pointer-events-none">
                                    <label className="text-sm font-semibold text-slate-300">Pseudo <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.3)', fontWeight: 400 }}>(@unique)</span></label>
                                    <input type="text" className="input" value={username} readOnly />
                                    <p className="text-xs text-secondary mt-1">Le pseudo ne peut pas être modifié.</p>
                                </div>

                                <div className="form-group mb-0 opacity-60 pointer-events-none">
                                    <label className="text-sm font-semibold text-slate-300">{t('profile_label_email')}</label>
                                    <input type="email" className="input" value={email} readOnly />
                                    <p className="text-xs text-secondary mt-1">L&apos;email ne peut pas être modifié.</p>
                                </div>

                                {/* Photo / Avatar section */}
                                <div style={{ background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.18)', borderRadius: '14px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Photo de profil</div>

                                    {/* Toggle avatar / upload */}
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <button type="button" onClick={() => setPhotoMode('avatar')}
                                            style={{ flex: 1, padding: '8px', borderRadius: '10px', cursor: 'pointer', fontWeight: 600, fontSize: '0.82rem', border: `1.5px solid ${photoMode === 'avatar' ? 'rgba(99,102,241,0.7)' : 'rgba(255,255,255,0.1)'}`, background: photoMode === 'avatar' ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.03)', color: photoMode === 'avatar' ? '#a5b4fc' : 'rgba(255,255,255,0.45)', transition: 'all 0.15s' }}>
                                            🎭 Avatar
                                        </button>
                                        <button type="button" onClick={() => fileInputRef.current?.click()}
                                            style={{ flex: 1, padding: '8px', borderRadius: '10px', cursor: 'pointer', fontWeight: 600, fontSize: '0.82rem', border: `1.5px solid ${photoMode === 'upload' ? 'rgba(16,185,129,0.7)' : 'rgba(255,255,255,0.1)'}`, background: photoMode === 'upload' ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.03)', color: photoMode === 'upload' ? '#6ee7b7' : 'rgba(255,255,255,0.45)', transition: 'all 0.15s' }}>
                                            {uploading ? '⏳ Upload...' : '📷 Photo'}
                                        </button>
                                    </div>
                                    <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhotoUpload} />

                                    {/* Preview + action */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <img
                                            src={dynamicAvatarUrl} alt="avatar"
                                            style={{ width: '52px', height: '52px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0, boxShadow: '0 0 0 2px rgba(99,102,241,0.35)' }}
                                        />
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: '13px', fontWeight: 600, color: 'white' }}>
                                                {photoMode === 'upload' && uploadedPhotoUrl ? 'Photo personnalisée' : `Avatar ${currentPreset.id}`}
                                            </div>
                                            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginTop: '2px' }}>
                                                {photoMode === 'upload' ? 'Importée depuis ton ordinateur' : 'Style actuel'}
                                            </div>
                                        </div>
                                        {photoMode === 'avatar' && (
                                            <button type="button" onClick={handleOpenAvatarModal}
                                                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 14px', borderRadius: '10px', background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.35)', color: '#a5b4fc', fontSize: '12px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                                <ImageIcon size={13} /> Choisir
                                            </button>
                                        )}
                                        {photoMode === 'upload' && uploadedPhotoUrl && (
                                            <button type="button" onClick={() => { setPhotoMode('avatar'); setUploadedPhotoUrl(''); }}
                                                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 14px', borderRadius: '10px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', fontSize: '12px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                                <X size={13} /> Retirer
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <div className="flex justify-end border-t border-white/5 pt-5 mt-1">
                                    <button type="submit" className="btn btn-primary px-8 shadow-glow" disabled={saving}>
                                        <Save size={16} /> {saving ? 'Sauvegarde...' : t('profile_btn_save')}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* ════ TAB: DISCIPLINE ════ */}
                {activeTab === 'discipline' && (
                    <div className="fade-enter">
                        {disciplineProfile && !showProfileForm ? (

                            /* ── ARCHETYPE RESULT ── */
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                {/* Main card */}
                                <div className="card card-glass border border-white/10" style={{ overflow: 'hidden' }}>
                                    {/* Header band */}
                                    <div style={{
                                        background: `linear-gradient(135deg, ${disciplineProfile.color}22, ${disciplineProfile.color}06)`,
                                        borderBottom: `1px solid ${disciplineProfile.color}28`,
                                        padding: '1.75rem 2rem',
                                        display: 'flex', alignItems: 'flex-start', gap: '1.25rem',
                                    }}>
                                        <div style={{
                                            width: '68px', height: '68px', borderRadius: '18px', flexShrink: 0,
                                            background: `${disciplineProfile.color}18`,
                                            border: `1.5px solid ${disciplineProfile.color}35`,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: '2rem',
                                            boxShadow: `0 4px 20px ${disciplineProfile.color}20`,
                                        }}>
                                            {disciplineProfile.emoji}
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: '0.62rem', fontWeight: 700, color: disciplineProfile.color, textTransform: 'uppercase', letterSpacing: '0.13em', marginBottom: '5px' }}>
                                                Profil de discipline
                                            </div>
                                            <h2 style={{ fontSize: '1.45rem', fontWeight: 800, color: 'white', margin: '0 0 3px', letterSpacing: '-0.03em' }}>
                                                {disciplineProfile.type}
                                            </h2>
                                            <p style={{ fontSize: '0.875rem', color: disciplineProfile.color, fontWeight: 600, margin: '0 0 10px' }}>
                                                {disciplineProfile.tagline}
                                            </p>
                                            <p style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.58)', margin: 0, lineHeight: 1.65 }}>
                                                {disciplineProfile.description}
                                            </p>
                                        </div>
                                        <button
                                            onClick={() => setShowProfileForm(true)}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: '5px',
                                                background: 'rgba(255,255,255,0.05)',
                                                border: '1px solid rgba(255,255,255,0.1)',
                                                borderRadius: '10px', padding: '7px 12px',
                                                cursor: 'pointer', color: 'rgba(255,255,255,0.35)',
                                                fontSize: '0.75rem', fontWeight: 600, flexShrink: 0,
                                            }}
                                        >
                                            <RefreshCw size={12} /> Refaire
                                        </button>
                                    </div>

                                    {/* Forces + À développer */}
                                    <div style={{ padding: '1.5rem 2rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                                        <div>
                                            <div style={{ fontSize: '0.62rem', fontWeight: 700, color: 'rgba(255,255,255,0.28)', textTransform: 'uppercase', letterSpacing: '0.13em', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <span style={{ color: '#10b981' }}>✦</span> Forces
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
                                                {disciplineProfile.strengths?.map((s: string, i: number) => (
                                                    <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                                                        <div style={{
                                                            width: '20px', height: '20px', borderRadius: '7px', flexShrink: 0, marginTop: '1px',
                                                            background: 'rgba(16,185,129,0.14)', border: '1px solid rgba(16,185,129,0.28)',
                                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        }}>
                                                            <Check size={10} style={{ color: '#10b981' }} />
                                                        </div>
                                                        <span style={{ fontSize: '0.83rem', color: 'rgba(255,255,255,0.62)', lineHeight: 1.55 }}>{s}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '0.62rem', fontWeight: 700, color: 'rgba(255,255,255,0.28)', textTransform: 'uppercase', letterSpacing: '0.13em', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <span style={{ color: '#f59e0b' }}>✦</span> À développer
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
                                                {disciplineProfile.growth_areas?.map((g: string, i: number) => (
                                                    <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                                                        <div style={{
                                                            width: '20px', height: '20px', borderRadius: '7px', flexShrink: 0, marginTop: '1px',
                                                            background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.24)',
                                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                            fontSize: '10px', color: '#f59e0b',
                                                        }}>
                                                            →
                                                        </div>
                                                        <span style={{ fontSize: '0.83rem', color: 'rgba(255,255,255,0.62)', lineHeight: 1.55 }}>{g}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Tip banner */}
                                    <div style={{
                                        margin: '0 1.75rem 1.75rem',
                                        padding: '14px 18px', borderRadius: '14px',
                                        background: `${disciplineProfile.color}10`,
                                        border: `1px solid ${disciplineProfile.color}25`,
                                    }}>
                                        <div style={{ fontSize: '0.62rem', fontWeight: 700, color: disciplineProfile.color, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '6px' }}>
                                            💡 Conseil personnalisé
                                        </div>
                                        <p style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.68)', margin: 0, lineHeight: 1.65 }}>
                                            {disciplineProfile.tip}
                                        </p>
                                    </div>
                                </div>
                            </div>

                        ) : (

                            /* ── QUESTIONNAIRE ── */
                            <div className="card card-glass border border-white/10" style={{ overflow: 'hidden' }}>
                                {/* Form header */}
                                <div style={{
                                    padding: '1.5rem 2rem',
                                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                                    background: 'linear-gradient(135deg, rgba(99,102,241,0.09), rgba(139,92,246,0.04))',
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                }}>
                                    <div>
                                        <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'white', margin: '0 0 3px' }}>
                                            Analyser mon profil de discipline
                                        </h3>
                                        <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.38)', margin: 0 }}>
                                            Répondez pour découvrir votre archétype de productivité
                                        </p>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        {/* Dot progress */}
                                        <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                                            {[0, 1, 2, 3, 4].map(i => (
                                                <div key={i} style={{
                                                    width: i < questionnaireDone ? '18px' : '7px',
                                                    height: '7px', borderRadius: '4px',
                                                    background: i < questionnaireDone ? '#6366f1' : 'rgba(255,255,255,0.12)',
                                                    transition: 'all 0.25s',
                                                }} />
                                            ))}
                                        </div>
                                        <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.3)', fontWeight: 600 }}>{questionnaireDone}/5</span>
                                        {disciplineProfile && (
                                            <button onClick={() => setShowProfileForm(false)}
                                                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '5px 10px', cursor: 'pointer', color: 'rgba(255,255,255,0.35)', fontSize: '0.72rem' }}>
                                                Annuler
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Questions */}
                                <div style={{ padding: '1.75rem 2rem', display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>

                                    {/* Q1: Preferred times */}
                                    <div>
                                        <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'rgba(255,255,255,0.7)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span>🕐</span> Quand travaillez-vous le mieux ?
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
                                                    <button key={label} onClick={() => setPreferredTimes(prev => toggleMulti(prev, label, 3))}
                                                        style={{
                                                            padding: '8px 14px', borderRadius: '10px', cursor: 'pointer',
                                                            border: `1.5px solid ${sel ? 'rgba(99,102,241,0.7)' : 'rgba(255,255,255,0.1)'}`,
                                                            background: sel ? 'rgba(99,102,241,0.18)' : 'rgba(255,255,255,0.03)',
                                                            color: sel ? '#c7d2fe' : 'rgba(255,255,255,0.45)',
                                                            fontSize: '0.82rem', fontWeight: 600,
                                                            transition: 'all 0.15s',
                                                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', minWidth: '76px',
                                                        }}>
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
                                            <span>🧱</span> Vos principaux obstacles ?
                                            <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.28)', fontWeight: 400 }}>jusqu&apos;à 3</span>
                                        </div>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                            {['Démarrer', 'Concentration', 'Régularité', 'Terminer', 'Procrastination', 'Perfectionnisme'].map(opt => {
                                                const sel = mainChallenges.includes(opt);
                                                const maxed = mainChallenges.length >= 3 && !sel;
                                                return (
                                                    <button key={opt} onClick={() => !maxed && setMainChallenges(prev => toggleMulti(prev, opt, 3))}
                                                        style={{
                                                            padding: '8px 14px', borderRadius: '10px',
                                                            border: `1.5px solid ${sel ? 'rgba(239,68,68,0.6)' : 'rgba(255,255,255,0.1)'}`,
                                                            background: sel ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.03)',
                                                            color: sel ? '#fca5a5' : maxed ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.45)',
                                                            fontSize: '0.82rem', fontWeight: 600,
                                                            cursor: maxed ? 'not-allowed' : 'pointer', transition: 'all 0.15s',
                                                        }}>
                                                        {opt}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* Q3 + Q5 side by side */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                                        {/* Q3: Work rhythm */}
                                        <div>
                                            <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'rgba(255,255,255,0.7)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <span>⚡</span> Votre rythme naturel ?
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
                                                        <button key={label} onClick={() => setWorkStyle(label)}
                                                            style={{
                                                                padding: '9px 12px', borderRadius: '10px',
                                                                border: `1.5px solid ${sel ? 'rgba(16,185,129,0.6)' : 'rgba(255,255,255,0.08)'}`,
                                                                background: sel ? 'rgba(16,185,129,0.13)' : 'rgba(255,255,255,0.02)',
                                                                color: sel ? '#6ee7b7' : 'rgba(255,255,255,0.45)',
                                                                fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
                                                                textAlign: 'left', transition: 'all 0.15s',
                                                                display: 'flex', alignItems: 'center', gap: '8px',
                                                            }}>
                                                            <span>{icon}</span>{label}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        {/* Q5: Motivation dip */}
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
                                                        <button key={label} onClick={() => setMotivationDip(label)}
                                                            style={{
                                                                padding: '9px 12px', borderRadius: '10px',
                                                                border: `1.5px solid ${sel ? 'rgba(139,92,246,0.6)' : 'rgba(255,255,255,0.08)'}`,
                                                                background: sel ? 'rgba(139,92,246,0.13)' : 'rgba(255,255,255,0.02)',
                                                                color: sel ? '#c4b5fd' : 'rgba(255,255,255,0.45)',
                                                                fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
                                                                textAlign: 'left', transition: 'all 0.15s',
                                                                display: 'flex', alignItems: 'center', gap: '8px',
                                                            }}>
                                                            <span>{icon}</span>{label}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Q4: Motivators */}
                                    <div>
                                        <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'rgba(255,255,255,0.7)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span>🔑</span> Ce qui vous motive ?
                                            <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.28)', fontWeight: 400 }}>jusqu&apos;à 3</span>
                                        </div>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                            {['Voir ma progression', 'Les défis', 'La routine', 'La nouveauté', 'Être reconnu', 'Accomplir'].map(opt => {
                                                const sel = motivators.includes(opt);
                                                const maxed = motivators.length >= 3 && !sel;
                                                return (
                                                    <button key={opt} onClick={() => !maxed && setMotivators(prev => toggleMulti(prev, opt, 3))}
                                                        style={{
                                                            padding: '8px 14px', borderRadius: '10px',
                                                            border: `1.5px solid ${sel ? 'rgba(245,158,11,0.65)' : 'rgba(255,255,255,0.1)'}`,
                                                            background: sel ? 'rgba(245,158,11,0.13)' : 'rgba(255,255,255,0.03)',
                                                            color: sel ? '#fcd34d' : maxed ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.45)',
                                                            fontSize: '0.82rem', fontWeight: 600,
                                                            cursor: maxed ? 'not-allowed' : 'pointer', transition: 'all 0.15s',
                                                        }}>
                                                        {opt}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* Progress + Generate */}
                                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '1.25rem', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                        <div style={{ height: '4px', borderRadius: '2px', background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                                            <div style={{
                                                height: '100%', width: `${(questionnaireDone / 5) * 100}%`,
                                                background: 'linear-gradient(90deg, #6366f1, #818cf8)',
                                                borderRadius: '2px', transition: 'width 0.35s ease',
                                            }} />
                                        </div>
                                        <button
                                            onClick={handleGenerateProfile}
                                            disabled={!canGenerate || profileLoading}
                                            style={{
                                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                                                padding: '13px', borderRadius: '12px', border: 'none',
                                                background: canGenerate
                                                    ? 'linear-gradient(135deg, #6366f1 0%, #818cf8 100%)'
                                                    : 'rgba(255,255,255,0.05)',
                                                color: canGenerate ? '#fff' : 'rgba(255,255,255,0.22)',
                                                fontSize: '0.9rem', fontWeight: 700,
                                                cursor: canGenerate ? 'pointer' : 'not-allowed',
                                                transition: 'all 0.2s',
                                                boxShadow: canGenerate ? '0 4px 24px rgba(99,102,241,0.38)' : 'none',
                                            }}>
                                            {profileLoading
                                                ? <><span style={{ width: '14px', height: '14px', borderRadius: '50%', border: '2px solid rgba(255,255,255,0.35)', borderTopColor: '#fff', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} /> Analyse en cours…</>
                                                : <><Sparkles size={15} /> Révéler mon archétype</>
                                            }
                                        </button>
                                        {!canGenerate && (
                                            <p style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.22)', textAlign: 'center', margin: 0 }}>
                                                Répondez aux 3 premières questions pour continuer
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ════ TAB: SÉCURITÉ ════ */}
                {activeTab === 'security' && (
                    <div className="fade-enter">
                        <div className="card card-glass border border-pink-500/15" style={{ padding: '2rem 2.25rem' }}>
                            <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'white', margin: '0 0 1.5rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Lock size={16} style={{ color: '#f472b6' }} /> Modifier le mot de passe
                            </h3>

                            {pwdMessage.text && (
                                <div className={`p-3 mb-5 rounded-lg flex items-center gap-2 text-sm font-medium ${pwdMessage.type === 'success' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                                    {pwdMessage.type === 'success' ? <ShieldCheck size={16} /> : <ShieldX size={16} />} {pwdMessage.text}
                                </div>
                            )}

                            <form onSubmit={handleUpdatePassword} className="flex flex-col gap-5">
                                <div className="form-group mb-0">
                                    <label className="text-sm font-semibold text-slate-300">Mot de passe actuel</label>
                                    <input type="password" className="input" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} placeholder="Pour confirmer votre identité" required />
                                </div>
                                <div className="form-group mb-0">
                                    <label className="text-sm font-semibold text-slate-300">Nouveau mot de passe</label>
                                    <input type="password" className="input" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Minimum 6 caractères" required />
                                </div>
                                <div className="form-group mb-0">
                                    <label className="text-sm font-semibold text-slate-300">Confirmer</label>
                                    <input type="password" className="input" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Idem nouveau mot de passe" required />
                                </div>
                                <div className="border-t border-white/5 pt-5 mt-2">
                                    <button type="submit" className="btn w-full"
                                        style={{ background: 'rgba(236,72,153,0.1)', border: '1px solid rgba(236,72,153,0.38)', color: '#f472b6' }}
                                        disabled={updatingPassword}>
                                        <Lock size={16} /> {updatingPassword ? 'Mise à jour...' : 'Modifier le mot de passe'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
            </div>

            {/* ── Avatar Picker Modal ── */}
            {showAvatarModal && (
                <div
                    className="fixed inset-0 flex items-center justify-center p-4 fade-enter"
                    style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(12px)', zIndex: 50 }}
                    onClick={e => { if (e.target === e.currentTarget) handleCloseAvatarModal(); }}
                >
                    <div
                        className="card glass-panel w-full relative shadow-2xl no-scrollbar slide-up"
                        style={{ maxWidth: '620px', border: '1px solid rgba(255,255,255,0.1)', padding: '0', overflow: 'hidden', maxHeight: '90vh', overflowY: 'auto' }}
                    >
                        <div style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.18), rgba(236,72,153,0.1))', padding: '1.75rem 2rem 1.5rem', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                            <button onClick={handleCloseAvatarModal} style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'rgba(255,255,255,0.6)' }}>
                                <X size={16} />
                            </button>
                            <div className="flex items-center gap-4">
                                <div style={{ background: 'rgba(99,102,241,0.2)', padding: '12px', borderRadius: '14px', border: '1px solid rgba(99,102,241,0.3)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <UserIcon className="text-primary" size={26} />
                                </div>
                                <div className="flex flex-col justify-center">
                                    <h3 className="m-0 text-xl font-bold" style={{ lineHeight: '1', marginBottom: '4px', marginTop: '15px' }}>Choisir un Avatar</h3>
                                    <p className="m-0 text-sm opacity-60" style={{ lineHeight: '1' }}>Personnalisez votre présence sur Synkra</p>
                                </div>
                            </div>
                        </div>

                        <div style={{ padding: '1.75rem 2rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: '16px' }}>
                            {AVATAR_PRESETS.map(preset => {
                                const isPending = pendingStyle === preset.id;
                                return (
                                    <div
                                        key={preset.id}
                                        onClick={() => setPendingStyle(preset.id)}
                                        className="relative group cursor-pointer transition-all duration-300"
                                        style={{ aspectRatio: '1', borderRadius: '20px', padding: '8px', border: isPending ? '2px solid rgba(99,102,241,0.9)' : '2px solid transparent', background: isPending ? 'rgba(99,102,241,0.1)' : 'rgba(255,255,255,0.03)', boxShadow: isPending ? '0 8px 25px -5px rgba(99,102,241,0.3)' : 'none', transform: isPending ? 'scale(1.05)' : 'scale(1)' }}
                                    >
                                        <div style={{ width: '100%', height: '100%', borderRadius: '14px', overflow: 'hidden', background: 'rgba(255,255,255,0.05)', boxShadow: isPending ? '0 0 0 2px rgba(99,102,241,0.5) inset' : 'inset 0 0 0 1px rgba(255,255,255,0.05)', transition: 'transform 0.2s' }} className={`${!isPending ? 'group-hover:scale-105 group-hover:brightness-110' : ''}`}>
                                            <img src={getAvatarUrl(preset.style, preset.seed)} alt="Avatar option" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        </div>
                                        {isPending && (
                                            <div style={{ position: 'absolute', top: '-6px', right: '-6px', width: '24px', height: '24px', background: 'var(--color-primary)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '3px solid var(--color-bg)', boxShadow: '0 2px 10px rgba(0,0,0,0.5)', animation: 'scaleIn 0.2s ease-out forwards' }}>
                                                <Check size={14} strokeWidth={3} className="text-white" />
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        <div className="flex justify-between items-center" style={{ padding: '0 2rem 1.75rem' }}>
                            <div className="flex items-center gap-4">
                                <div style={{ width: '42px', height: '42px', borderRadius: '50%', background: 'rgba(99,102,241,0.15)', border: '2px solid rgba(99,102,241,0.4)', overflow: 'hidden', flexShrink: 0 }}>
                                    <img src={getAvatarUrl(pendingPreset.style, pendingPreset.seed)} alt="preview" style={{ width: '100%', height: '100%', borderRadius: '50%' }} />
                                </div>
                                <div>
                                    <div className="text-sm font-semibold tracking-wide">Avatar {pendingPreset.id}</div>
                                    <div className="text-xs text-secondary opacity-70">Aperçu</div>
                                </div>
                            </div>
                            <div className="flex justify-end gap-3">
                                <button type="button" className="btn btn-ghost" onClick={handleCloseAvatarModal}>Annuler</button>
                                <button type="button" className="btn btn-primary" onClick={confirmAvatarSelection}>
                                    <Check size={16} /> Appliquer
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
