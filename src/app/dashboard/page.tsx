'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, getDoc, addDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Target, Code, BookOpen, Users, LayoutDashboard, Rocket, X, Globe, Lock, Palette, Music, Dumbbell, FlaskConical, Briefcase, Pen, ChevronRight, Star, FolderKanban, LayoutList, KanbanIcon } from 'lucide-react';
import { useLocale } from '@/context/LocaleContext';
import { useUI } from '@/context/UIContext';

import { Suspense } from 'react';

const fmtHours = (h: number) => h < 1 ? `${Math.round(h * 60)}min` : `${parseFloat(h.toFixed(2))}h`;

function DashboardContent() {
    const { user, loading } = useAuth();
    const { t } = useLocale();
    const { setNavbarVisible } = useUI();
    const router = useRouter();
    const searchParams = useSearchParams();
    const [objectives, setObjectives] = useState<any[]>([]);
    const [projects, setProjects] = useState<any[]>([]);
    const [fetching, setFetching] = useState(true);
    const [activeTab, setActiveTab] = useState<'objectives' | 'projects'>('objectives');

    const [showModal, setShowModal] = useState(false);
    const [step, setStep] = useState(0);
    const [newTitle, setNewTitle] = useState('');
    const [newDescription, setNewDescription] = useState('');
    const [newHours, setNewHours] = useState('20');
    const [newFrequency, setNewFrequency] = useState('total');
    const [newCategories, setNewCategories] = useState<string[]>([]);
    const [newLearningLink, setNewLearningLink] = useState('');
    const [isPublic, setIsPublic] = useState(false);
    
    // Nouveaux états Projet
    const [creationMode, setCreationMode] = useState<'objective' | 'project'>('objective');
    const [newGithubLink, setNewGithubLink] = useState('');
    const [pendingInvites, setPendingInvites] = useState<{email: string, role: 'admin'|'member'}[]>([]);
    const [inviteInput, setInviteInput] = useState('');
    const [inviteRole, setInviteRole] = useState<'admin' | 'member'>('member');

    const CATEGORIES = [
        { id: 'Code', label: 'Code', icon: Code, color: '#6366f1' },
        { id: 'Design', label: 'Design', icon: Palette, color: '#ec4899' },
        { id: 'Lecture', label: 'Lecture', icon: BookOpen, color: '#f59e0b' },
        { id: 'Musique', label: 'Musique', icon: Music, color: '#10b981' },
        { id: 'Sport', label: 'Sport', icon: Dumbbell, color: '#ef4444' },
        { id: 'Science', label: 'Science', icon: FlaskConical, color: '#3b82f6' },
        { id: 'Business', label: 'Business', icon: Briefcase, color: '#8b5cf6' },
        { id: 'Écriture', label: 'Écriture', icon: Pen, color: '#f97316' },
        { id: 'Autre', label: 'Autre', icon: Star, color: '#64748b' },
    ];
    const HOUR_PRESETS = [10, 20, 50, 100, 200];

    useEffect(() => {
        if (!loading && !user) {
            router.push('/login');
        }
    }, [user, loading, router]);

    useEffect(() => {
        const fetchData = async () => {
            if (!user) return;

            try {
                // ------ FETCH OBJECTIVES ------
                const membershipsRef = collection(db, 'memberships');
                const qObjs = query(membershipsRef, where('user_id', '==', user.uid));
                const membershipDocs = await getDocs(qObjs);

                const objs = [];
                for (const mDoc of membershipDocs.docs) {
                    const mData = mDoc.data();
                    const objRef = doc(db, 'objectives', mData.objective_id);
                    const objDoc = await getDoc(objRef);
                    if (objDoc.exists()) {
                        objs.push({ id: objDoc.id, ...objDoc.data(), my_completed_hours: mData.completed_hours });
                    }
                }
                setObjectives(objs);

                // ------ FETCH PROJECTS ------
                const projMembershipsRef = collection(db, 'project_memberships');
                const qProjs = query(projMembershipsRef, where('user_id', '==', user.uid));
                const projMembershipDocs = await getDocs(qProjs);

                const projs = [];
                for (const mDoc of projMembershipDocs.docs) {
                    const mData = mDoc.data();
                    const projRef = doc(db, 'projects', mData.project_id);
                    const projDoc = await getDoc(projRef);
                    if (projDoc.exists()) {
                        projs.push({ id: projDoc.id, ...projDoc.data(), role: mData.role });
                    }
                }
                setProjects(projs);

            } catch (err) {
                console.error("Error fetching data:", err);
            } finally {
                setFetching(false);
            }
        };

        if (user) fetchData();
    }, [user]);

    useEffect(() => {
        if (searchParams.get('create') === 'true') {
            handleOpenModal();
        }
    }, [searchParams]);

    const handleOpenModal = () => {
        setShowModal(true);
        setNavbarVisible(false);
    };

    const closeModal = () => {
        setShowModal(false);
        setNavbarVisible(true);
        setStep(0);
        setNewTitle(''); setNewDescription(''); setNewCategories([]); setIsPublic(false); setNewHours('20'); setNewLearningLink('');
        setCreationMode('objective'); setNewGithubLink(''); setPendingInvites([]); setInviteInput(''); setInviteRole('member');
    };

    const handleCreateObjective = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!user) return;

        try {
            if (creationMode === 'objective') {
                const objectiveRef = await addDoc(collection(db, 'objectives'), {
                    title: newTitle,
                    description: newDescription,
                    target_hours: parseInt(newHours),
                    goal_frequency: newFrequency,
                    category: newCategories,
                    learning_link: newLearningLink.trim(),
                    is_public: isPublic,
                    creator_id: user.uid,
                    participants_count: 1
                });

                await setDoc(doc(db, 'memberships', `${user.uid}_${objectiveRef.id}`), {
                    user_id: user.uid,
                    objective_id: objectiveRef.id,
                    completed_hours: 0
                });

                setObjectives([...objectives, {
                    id: objectiveRef.id,
                    title: newTitle,
                    target_hours: parseInt(newHours),
                    category: newCategories,
                    learning_link: newLearningLink.trim(),
                    is_public: isPublic,
                    participants_count: 1,
                    my_completed_hours: 0
                }]);
            } else {
                const projectRef = await addDoc(collection(db, 'projects'), {
                    title: newTitle,
                    description: newDescription,
                    github_link: newGithubLink.trim(),
                    category: newCategories,
                    is_public: isPublic,
                    creator_id: user.uid,
                    created_at: new Date().toISOString(),
                    participants_count: 1,
                    pending_invites: pendingInvites
                });

                await setDoc(doc(db, 'project_memberships', `${user.uid}_${projectRef.id}`), {
                    user_id: user.uid,
                    project_id: projectRef.id,
                    role: 'admin',
                    joined_at: new Date().toISOString()
                });

                // Send notifications to invited users
                for (const invite of pendingInvites) {
                    try {
                        const usersSnap = await getDocs(query(collection(db, 'users'), where('email', '==', invite.email)));
                        if (!usersSnap.empty) {
                            const targetUid = usersSnap.docs[0].id;
                            await addDoc(collection(db, 'users', targetUid, 'notifications'), {
                                type: 'project_invite',
                                from_uid: user.uid,
                                from_name: user.displayName || user.email?.split('@')[0] || 'Utilisateur',
                                project_id: projectRef.id,
                                project_title: newTitle,
                                role: invite.role,
                                message: `${user.displayName || user.email?.split('@')[0] || 'Quelqu\'un'} vous invite à rejoindre le projet « ${newTitle} »`,
                                read: false,
                                created_at: serverTimestamp(),
                                link: `/project/${projectRef.id}`
                            });
                        }
                    } catch (_) { /* skip if user not found */ }
                }

                setProjects([...projects, {
                    id: projectRef.id,
                    title: newTitle,
                    github_link: newGithubLink.trim(),
                    category: newCategories,
                    is_public: isPublic,
                    participants_count: 1,
                    role: 'admin'
                }]);
            }
            closeModal();
        } catch (err) {
            console.error('Error creating', err);
            alert('Erreur lors de la création.');
            closeModal();
        }
    };

    if (loading || fetching) return <div className="container py-16 text-center">Chargement...</div>;
    if (!user) return null;

    const greeting = (() => {
        const h = new Date().getHours();
        if (h < 5)  return 'Bonne nuit';
        if (h < 12) return 'Bonjour';
        if (h < 18) return 'Bon après-midi';
        return 'Bonsoir';
    })();
    const displayName = user?.displayName?.split(' ')[0] || user?.email?.split('@')[0] || '';

    return (
        <div className="container py-12 max-w-6xl mx-auto">
            {/* Header section */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '2.5rem', flexWrap: 'wrap', gap: '1.25rem' }} className="fade-enter">
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
                        <p style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.25)', margin: 0 }}>
                            {greeting}{displayName ? `, ${displayName}` : ''} 👋
                        </p>
                        {objectives.length > 0 && (
                            <span style={{ fontSize: '0.63rem', fontWeight: 700, padding: '2px 9px', borderRadius: 20, background: 'rgba(129,140,248,0.1)', border: '1px solid rgba(129,140,248,0.2)', color: '#a5b4fc', letterSpacing: '0.03em' }}>
                                {objectives.length} objectif{objectives.length > 1 ? 's' : ''}
                            </span>
                        )}
                        {projects.length > 0 && (
                            <span style={{ fontSize: '0.63rem', fontWeight: 700, padding: '2px 9px', borderRadius: 20, background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.18)', color: '#6ee7b7', letterSpacing: '0.03em' }}>
                                {projects.length} projet{projects.length > 1 ? 's' : ''}
                            </span>
                        )}
                    </div>
                    <h2 style={{ fontSize: 'clamp(1.6rem, 3vw, 2.2rem)', fontWeight: 900, letterSpacing: '-0.03em', margin: 0, color: '#f4f4f5' }}>
                        {t('dash_title')}
                    </h2>
                    <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.95rem', margin: '0.4rem 0 0', lineHeight: 1.5 }}>{t('dash_subtitle')}</p>
                </div>
                <button
                    onClick={handleOpenModal}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', padding: '11px 20px', borderRadius: '12px', background: 'linear-gradient(135deg,#6366f1,#4f46e5)', color: '#fff', fontSize: '0.88rem', fontWeight: 700, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0, boxShadow: '0 4px 18px rgba(99,102,241,0.3)', transition: 'all 0.2s ease', letterSpacing: '-0.01em' }}
                    onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 6px 26px rgba(99,102,241,0.48)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                    onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 4px 18px rgba(99,102,241,0.3)'; e.currentTarget.style.transform = 'translateY(0)'; }}
                >
                    <Target size={15} /> {t('dash_btn_create')}
                </button>
            </div>

            {/* TABS — editorial underline */}
            <div style={{ display: 'flex', gap: 0, marginBottom: '2rem', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                {([
                    { key: 'objectives', label: 'Objectifs', count: objectives.length, color: '#818cf8', Icon: Target },
                    { key: 'projects',   label: 'Projets',   count: projects.length,   color: '#34d399', Icon: FolderKanban },
                ] as const).map(tab => {
                    const isAct = activeTab === tab.key;
                    return (
                        <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key)}
                            style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: '7px', padding: '9px 20px 12px', fontSize: '0.88rem', fontWeight: isAct ? 700 : 500, cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.2s', background: 'transparent', color: isAct ? '#f4f4f5' : 'rgba(255,255,255,0.3)', border: 'none' }}
                        >
                            <tab.Icon size={14} style={{ opacity: isAct ? 1 : 0.5 }} />
                            {tab.label}
                            <span style={{ fontSize: '0.63rem', fontWeight: 700, padding: '1px 6px', borderRadius: 20, background: isAct ? tab.color + '20' : 'rgba(255,255,255,0.05)', color: isAct ? tab.color : 'rgba(255,255,255,0.25)' }}>{tab.count}</span>
                            {isAct && <span style={{ position: 'absolute', bottom: -1, left: 16, right: 16, height: '2px', background: `linear-gradient(90deg, ${tab.color}, ${tab.color}80)`, borderRadius: '2px 2px 0 0', boxShadow: `0 0 8px ${tab.color}60` }} />}
                        </button>
                    );
                })}
            </div>

            <div id="dashboard-list">
                {activeTab === 'objectives' && (
                    objectives.length === 0 ? (
                        /* Premium Empty State */
                        <div className="card card-glass text-center py-20 fade-enter" style={{ border: '1px dashed rgba(99,102,241,0.3)', background: 'rgba(99,102,241,0.02)' }}>
                            <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'rgba(99,102,241,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem' }}>
                                <Target size={40} className="text-primary" />
                            </div>
                            <h3 className="text-2xl font-bold mb-3">Aucun objectif en cours</h3>
                            <p className="text-secondary max-w-md mx-auto mb-8 opacity-80">
                                Rejoignez la communauté ou lancez votre propre but pour commencer à synchroniser vos sessions de travail avec d'autres passionnés.
                            </p>
                            <div className="flex gap-4 justify-center flex-wrap">
                                <button className="btn btn-primary shadow-glow" onClick={() => { setCreationMode('objective'); setShowModal(true); }}>
                                    <Target size={18} /> Créer un objectif
                                </button>
                                <Link href="/explore" className="btn btn-outline" style={{ background: 'rgba(255,255,255,0.05)' }}>
                                    Explorer les salons
                                </Link>
                            </div>
                        </div>
                    ) : (
                        /* Dashboard Grid */
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' }}>
                            {objectives.map((obj, i) => {
                                const perc = Math.min(100, Math.round((obj.my_completed_hours / obj.target_hours) * 100));

                                // Dynamically find category config (use first category or default)
                                let accentColor = '#6366f1';
                                let CatIcon = Target;
                                const mainCat = Array.isArray(obj.category) ? obj.category[0] : obj.category;

                                if (mainCat) {
                                    const catMatch = CATEGORIES.find(c => c.id.toLowerCase() === mainCat.toLowerCase());
                                    if (catMatch) {
                                        accentColor = catMatch.color;
                                        CatIcon = catMatch.icon;
                                    }
                                }

                                const isPublic = obj.is_public;

                                return (
                                    <Link
                                        href={`/objective/${obj.id}`}
                                        key={obj.id}
                                        className="fade-enter"
                                        style={{ position: 'relative', animationDelay: `${i * 0.08}s`, display: 'flex', flexDirection: 'column', transition: 'all 0.22s cubic-bezier(0.4, 0, 0.2, 1)', borderTop: '1px solid rgba(255,255,255,0.05)', borderRight: '1px solid rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.05)', borderLeft: `3px solid ${accentColor}`, background: 'rgba(14,14,18,0.95)', borderRadius: '14px', padding: '1.25rem 1.25rem 1.1rem 1.1rem', cursor: 'pointer', overflow: 'hidden', textDecoration: 'none' }}
                                        onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = `0 10px 32px -8px ${accentColor}35, inset 0 0 40px ${accentColor}05`; e.currentTarget.style.borderTopColor = `${accentColor}30`; e.currentTarget.style.background = 'rgba(16,16,22,0.98)'; }}
                                        onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderTopColor = 'rgba(255,255,255,0.05)'; e.currentTarget.style.background = 'rgba(14,14,18,0.95)'; }}
                                    >
                                        {/* Top row: icon + % */}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.85rem' }}>
                                            <div style={{ width: '36px', height: '36px', borderRadius: '9px', background: accentColor + '14', border: `1px solid ${accentColor}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: accentColor, flexShrink: 0 }}>
                                                <CatIcon size={18} />
                                            </div>
                                            <span style={{ fontSize: '1.5rem', fontWeight: 900, color: accentColor, lineHeight: 1, letterSpacing: '-0.05em' }}>{perc}<span style={{ fontSize: '0.65rem', fontWeight: 700, opacity: 0.55, letterSpacing: 0 }}>%</span></span>
                                        </div>

                                        {/* Title */}
                                        <h3 style={{ margin: '0 0 0.55rem', fontSize: '1rem', fontWeight: 700, color: '#f1f1f3', letterSpacing: '-0.02em', lineHeight: 1.25, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const }}>
                                            {obj.title}
                                        </h3>

                                        {/* Badges */}
                                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: '0.9rem' }}>
                                            {(Array.isArray(obj.category) ? obj.category : [obj.category]).filter(Boolean).map((cat: string) => (
                                                <span key={cat} style={{ fontSize: '0.62rem', fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: accentColor + '12', border: `1px solid ${accentColor}20`, color: accentColor, letterSpacing: '0.02em' }}>{cat}</span>
                                            ))}
                                            <span style={{ fontSize: '0.62rem', fontWeight: 700, padding: '2px 7px', borderRadius: 20, ...(isPublic ? { background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', color: '#34d399' } : { background: 'rgba(100,116,139,0.07)', border: '1px solid rgba(100,116,139,0.16)', color: '#94a3b8' }) }}>
                                                {isPublic ? '◉ Public' : '◎ Privé'}
                                            </span>
                                        </div>

                                        {/* Progress */}
                                        <div style={{ marginTop: 'auto' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                                                <span style={{ fontSize: '0.62rem', fontWeight: 700, color: 'rgba(255,255,255,0.28)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Progression</span>
                                                <span style={{ fontSize: '0.73rem', fontWeight: 700, color: 'rgba(255,255,255,0.55)' }}>{fmtHours(obj.my_completed_hours ?? 0)}<span style={{ color: 'rgba(255,255,255,0.25)', fontWeight: 400 }}> / {obj.target_hours}h</span></span>
                                            </div>
                                            <div style={{ height: '4px', borderRadius: '2px', background: 'rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                                                <div style={{ width: `${perc}%`, height: '100%', background: `linear-gradient(90deg, ${accentColor}90, ${accentColor})`, boxShadow: `0 0 10px ${accentColor}55`, borderRadius: '2px', transition: 'width 1s cubic-bezier(0.4, 0, 0.2, 1)' }} />
                                            </div>
                                        </div>

                                        {/* Footer */}
                                        <div style={{ marginTop: '0.85rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '0.7rem', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.72rem', color: 'rgba(255,255,255,0.28)', fontWeight: 500 }}><Users size={11} /> {obj.participants_count}</div>
                                            <span style={{ fontSize: '0.68rem', fontWeight: 700, color: accentColor, letterSpacing: '0.02em' }}>Ouvrir →</span>
                                        </div>
                                    </Link>
                                );
                            })}
                        </div>
                    )
                )}

                {activeTab === 'projects' && (
                    projects.length === 0 ? (
                        /* Premium Empty State Projects */
                        <div className="card card-glass text-center py-20 fade-enter" style={{ border: '1px dashed rgba(16,185,129,0.3)', background: 'rgba(16,185,129,0.02)' }}>
                            <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'rgba(16,185,129,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem' }}>
                                <FolderKanban size={40} className="text-emerald-500" />
                            </div>
                            <h3 className="text-2xl font-bold mb-3">Aucun projet collaboratif</h3>
                            <p className="text-secondary max-w-md mx-auto mb-8 opacity-80">
                                Organisez votre équipe, créez des tâches et collaborez sur des projets concrets avec les méthodes Kanban et Scrum.
                            </p>
                            <div className="flex gap-4 justify-center flex-wrap">
                                <button className="btn px-6 shadow-glow" onClick={() => { setCreationMode('project'); setShowModal(true); }} style={{ background: '#10b981', color: '#fff', border: 'none' }}>
                                    <FolderKanban size={18} /> Créer un projet
                                </button>
                                <Link href="/explore" className="btn btn-outline" style={{ background: 'rgba(255,255,255,0.05)' }}>
                                    Explorer les salons
                                </Link>
                            </div>
                        </div>
                    ) : (
                        /* Dashboard Grid Projects */
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' }}>
                            {projects.map((proj, i) => {
                                let accentColor = '#10b981'; // Emerald
                                let CatIcon = FolderKanban;
                                const mainCat = Array.isArray(proj.category) ? proj.category[0] : proj.category;

                                if (mainCat) {
                                    const catMatch = CATEGORIES.find(c => c.id.toLowerCase() === mainCat.toLowerCase());
                                    if (catMatch) {
                                        accentColor = catMatch.color;
                                        CatIcon = catMatch.icon;
                                    }
                                }

                                const isPublic = proj.is_public;

                                return (
                                    <Link
                                        href={`/project/${proj.id}`}
                                        key={proj.id}
                                        className="fade-enter"
                                        style={{ position: 'relative', animationDelay: `${i * 0.08}s`, display: 'flex', flexDirection: 'column', transition: 'all 0.22s cubic-bezier(0.4, 0, 0.2, 1)', borderTop: '1px solid rgba(255,255,255,0.05)', borderRight: '1px solid rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.05)', borderLeft: `3px solid ${accentColor}`, background: 'rgba(14,14,18,0.95)', borderRadius: '14px', padding: '1.25rem 1.25rem 1.1rem 1.1rem', cursor: 'pointer', overflow: 'hidden', textDecoration: 'none', minHeight: '160px' }}
                                        onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = `0 10px 32px -8px ${accentColor}35, inset 0 0 40px ${accentColor}05`; e.currentTarget.style.borderTopColor = `${accentColor}30`; e.currentTarget.style.background = 'rgba(16,16,22,0.98)'; }}
                                        onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderTopColor = 'rgba(255,255,255,0.05)'; e.currentTarget.style.background = 'rgba(14,14,18,0.95)'; }}
                                    >
                                        {/* Top row: icon + role badge */}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.85rem' }}>
                                            <div style={{ width: '36px', height: '36px', borderRadius: '9px', background: accentColor + '14', border: `1px solid ${accentColor}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: accentColor, flexShrink: 0 }}>
                                                <CatIcon size={18} />
                                            </div>
                                            {proj.role && (
                                                <span style={{ fontSize: '0.6rem', fontWeight: 800, padding: '2px 8px', borderRadius: 20, background: proj.role === 'admin' ? 'rgba(249,115,22,0.1)' : 'rgba(255,255,255,0.05)', border: `1px solid ${proj.role === 'admin' ? 'rgba(249,115,22,0.25)' : 'rgba(255,255,255,0.1)'}`, color: proj.role === 'admin' ? '#fb923c' : 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{proj.role}</span>
                                            )}
                                        </div>

                                        {/* Title */}
                                        <h3 style={{ margin: '0 0 0.55rem', fontSize: '1rem', fontWeight: 700, color: '#f1f1f3', letterSpacing: '-0.02em', lineHeight: 1.25, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const }}>
                                            {proj.title}
                                        </h3>

                                        {/* Badges */}
                                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: '0.6rem' }}>
                                            {(Array.isArray(proj.category) ? proj.category : [proj.category]).filter(Boolean).map((cat: string) => (
                                                <span key={cat} style={{ fontSize: '0.62rem', fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: accentColor + '12', border: `1px solid ${accentColor}20`, color: accentColor, letterSpacing: '0.02em' }}>{cat}</span>
                                            ))}
                                            <span style={{ fontSize: '0.62rem', fontWeight: 700, padding: '2px 7px', borderRadius: 20, ...(isPublic ? { background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', color: '#34d399' } : { background: 'rgba(100,116,139,0.07)', border: '1px solid rgba(100,116,139,0.16)', color: '#94a3b8' }) }}>
                                                {isPublic ? '◉ Public' : '◎ Privé'}
                                            </span>
                                        </div>

                                        {/* Footer */}
                                        <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '0.7rem', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.72rem', color: 'rgba(255,255,255,0.28)', fontWeight: 500 }}><Users size={11} /> {proj.participants_count || 1}</div>
                                            <span style={{ fontSize: '0.68rem', fontWeight: 700, color: accentColor, letterSpacing: '0.02em' }}>Ouvrir →</span>
                                        </div>
                                    </Link>
                                );
                            })}
                        </div>
                    )
                )}
            </div>

            {/* Creation Wizard */}
            {showModal && (
                <>
                    <style>{`
                        @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,700;0,9..144,900;1,9..144,700&family=DM+Sans:wght@400;500;600;700&display=swap');
                        .cr-overlay {
                            position: fixed; inset: 0;
                            background: rgba(0,0,0,0.85);
                            backdrop-filter: blur(18px);
                            -webkit-backdrop-filter: blur(18px);
                            z-index: 50;
                            display: flex; align-items: center; justify-content: center;
                            padding: 16px;
                        }
                        .cr-modal {
                            width: 100%; max-width: 700px;
                            background: rgba(12,12,16,0.97);
                            border: 1px solid rgba(255,255,255,0.08);
                            border-radius: 24px;
                            overflow: hidden;
                            box-shadow: 0 48px 96px rgba(0,0,0,0.75), 0 0 0 1px rgba(255,255,255,0.03);
                            max-height: 92vh;
                            display: flex; flex-direction: column;
                            font-family: 'DM Sans', system-ui, sans-serif;
                        }
                        .cr-header {
                            padding: 18px 26px;
                            border-bottom: 1px solid rgba(255,255,255,0.06);
                            display: flex; align-items: center; gap: 14px;
                            flex-shrink: 0;
                        }
                        .cr-step-dot {
                            width: 7px; height: 7px; border-radius: 50%;
                            background: rgba(255,255,255,0.1);
                            transition: all 0.35s cubic-bezier(0.22,1,0.36,1);
                            flex-shrink: 0;
                        }
                        .cr-step-dot.active {
                            width: 22px; border-radius: 4px;
                            background: #6366f1;
                            box-shadow: 0 0 8px rgba(99,102,241,0.55);
                        }
                        .cr-step-dot.done { background: rgba(99,102,241,0.38); }
                        .cr-body {
                            overflow-y: auto; flex: 1;
                            padding: 30px 26px;
                        }
                        .cr-body::-webkit-scrollbar { width: 4px; }
                        .cr-body::-webkit-scrollbar-track { background: transparent; }
                        .cr-body::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 4px; }
                        .cr-step-content { animation: cr-in 0.3s cubic-bezier(0.22,1,0.36,1); }
                        @keyframes cr-in {
                            from { opacity: 0; transform: translateX(18px); }
                            to   { opacity: 1; transform: none; }
                        }
                        .cr-footer {
                            padding: 18px 26px;
                            border-top: 1px solid rgba(255,255,255,0.06);
                            display: flex; align-items: center; justify-content: space-between;
                            flex-shrink: 0; gap: 12px;
                        }
                        .cr-title {
                            font-family: 'Fraunces', Georgia, serif;
                            font-size: 1.65rem; font-weight: 700;
                            color: #eeeef0; line-height: 1.15;
                            letter-spacing: -0.025em; margin: 0 0 5px;
                        }
                        .cr-sub {
                            font-size: 0.85rem; color: rgba(255,255,255,0.35);
                            margin: 0 0 26px; line-height: 1.5;
                        }
                        .cr-type-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
                        .cr-type-card {
                            border-radius: 18px; padding: 26px 22px;
                            cursor: pointer; transition: all 0.28s cubic-bezier(0.22,1,0.36,1);
                            border: 1.5px solid rgba(255,255,255,0.07);
                            background: rgba(255,255,255,0.02);
                            display: flex; flex-direction: column; gap: 14px;
                        }
                        .cr-type-card:hover { transform: translateY(-3px); }
                        .cr-type-card.obj:hover { border-color: rgba(99,102,241,0.55); background: rgba(99,102,241,0.07); box-shadow: 0 14px 40px rgba(99,102,241,0.16); }
                        .cr-type-card.proj:hover { border-color: rgba(16,185,129,0.55); background: rgba(16,185,129,0.06); box-shadow: 0 14px 40px rgba(16,185,129,0.13); }
                        .cr-input {
                            width: 100%; padding: 12px 15px;
                            background: rgba(255,255,255,0.04);
                            border: 1px solid rgba(255,255,255,0.09);
                            border-radius: 12px; color: #eeeeef;
                            font-size: 0.96rem; font-family: 'DM Sans', system-ui;
                            outline: none; transition: border-color 0.2s, background 0.2s;
                            box-sizing: border-box;
                        }
                        .cr-input:focus { border-color: rgba(99,102,241,0.48); background: rgba(99,102,241,0.04); }
                        .cr-input::placeholder { color: rgba(255,255,255,0.2); }
                        .cr-label {
                            display: block; font-size: 0.75rem; font-weight: 700;
                            letter-spacing: 0.07em; text-transform: uppercase;
                            color: rgba(255,255,255,0.32); margin-bottom: 9px;
                        }
                        .cr-cat-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(76px, 1fr)); gap: 8px; }
                        .cr-cat-item {
                            cursor: pointer; display: flex; flex-direction: column;
                            align-items: center; gap: 6px; padding: 11px 6px;
                            border-radius: 13px; border: 1.5px solid rgba(255,255,255,0.07);
                            background: rgba(255,255,255,0.02);
                            transition: all 0.18s; user-select: none;
                        }
                        .cr-cat-item:hover:not(.cr-cat-disabled) { background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.16); }
                        .cr-cat-disabled { cursor: not-allowed; opacity: 0.28; }
                        .cr-chip {
                            padding: 7px 16px; border-radius: 20px;
                            font-size: 13px; font-weight: 600; cursor: pointer;
                            transition: all 0.15s; border: 1.5px solid rgba(255,255,255,0.09);
                            background: rgba(255,255,255,0.03); color: rgba(255,255,255,0.45);
                            font-family: 'DM Sans', system-ui;
                        }
                        .cr-chip.active { border-color: rgba(99,102,241,0.7); background: rgba(99,102,241,0.14); color: #a5b4fc; }
                        .cr-invite-tag {
                            display: inline-flex; align-items: center; gap: 6px;
                            background: rgba(16,185,129,0.09); border: 1px solid rgba(16,185,129,0.25);
                            padding: 5px 10px; border-radius: 20px; font-size: 0.8rem; color: #6ee7b7;
                        }
                        .cr-btn-back {
                            padding: 10px 20px; border-radius: 11px;
                            background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.09);
                            color: rgba(255,255,255,0.48); font-weight: 600; cursor: pointer;
                            font-family: 'DM Sans', system-ui; font-size: 0.9rem; transition: all 0.2s;
                        }
                        .cr-btn-back:hover { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.78); }
                        .cr-btn-next {
                            padding: 10px 26px; border-radius: 11px;
                            background: linear-gradient(135deg, #6366f1, #4f46e5);
                            border: none; color: #fff; font-weight: 700; cursor: pointer;
                            font-family: 'DM Sans', system-ui; font-size: 0.92rem;
                            box-shadow: 0 4px 18px rgba(99,102,241,0.38); transition: all 0.2s;
                            display: flex; align-items: center; gap: 7px;
                        }
                        .cr-btn-next:hover { box-shadow: 0 6px 26px rgba(99,102,241,0.55); transform: translateY(-1px); }
                        .cr-btn-next:disabled { opacity: 0.32; cursor: not-allowed; transform: none; box-shadow: none; }
                        .cr-btn-submit {
                            padding: 10px 30px; border-radius: 11px;
                            background: linear-gradient(135deg, #6366f1, #818cf8);
                            border: none; color: #fff; font-weight: 700; cursor: pointer;
                            font-family: 'DM Sans', system-ui; font-size: 0.94rem;
                            box-shadow: 0 4px 20px rgba(99,102,241,0.42); transition: all 0.2s;
                            display: flex; align-items: center; gap: 7px;
                        }
                        .cr-btn-submit:hover { box-shadow: 0 6px 30px rgba(99,102,241,0.58); transform: translateY(-1px); }
                        .cr-btn-submit:disabled { opacity: 0.3; cursor: not-allowed; transform: none; box-shadow: none; }
                        .cr-preview {
                            border-radius: 15px; padding: 18px;
                            border: 1px solid rgba(255,255,255,0.08);
                            background: linear-gradient(155deg, rgba(22,22,28,0.95) 0%, rgba(12,12,16,0.98) 100%);
                            position: relative; overflow: hidden;
                        }
                        .cr-vis-row {
                            cursor: pointer; display: flex; align-items: center; gap: 14px;
                            padding: 16px 18px; border-radius: 14px; transition: all 0.25s;
                        }
                        .cr-feat-dot {
                            width: 5px; height: 5px; border-radius: 50%; flex-shrink: 0;
                        }
                    `}</style>
                    <div
                        className="cr-overlay"
                        onClick={e => { if (e.target === e.currentTarget) closeModal(); }}
                    >
                        <div className="cr-modal">

                            {/* ── Header ── */}
                            <div className="cr-header">
                                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                    {[0,1,2,3].map(i => (
                                        <div key={i} className={`cr-step-dot${i === step ? ' active' : i < step ? ' done' : ''}`} />
                                    ))}
                                </div>
                                <div style={{ flex: 1, paddingLeft: 6 }}>
                                    <span style={{ fontSize: '0.73rem', fontWeight: 700, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.07em', textTransform: 'uppercase' }}>
                                        {['Choisir un type','Informations','Configuration','Finaliser'][step]}
                                    </span>
                                </div>
                                {step > 0 && (
                                    <span style={{ fontSize: '0.75rem', padding: '3px 10px', borderRadius: 20, background: creationMode === 'objective' ? 'rgba(99,102,241,0.12)' : 'rgba(16,185,129,0.1)', color: creationMode === 'objective' ? '#818cf8' : '#34d399', border: `1px solid ${creationMode === 'objective' ? 'rgba(99,102,241,0.3)' : 'rgba(16,185,129,0.28)'}`, fontWeight: 600, marginRight: 6 }}>
                                        {creationMode === 'objective' ? 'Objectif' : 'Projet'}
                                    </span>
                                )}
                                <button
                                    onClick={closeModal}
                                    style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'rgba(255,255,255,0.45)', flexShrink: 0 }}
                                >
                                    <X size={14} />
                                </button>
                            </div>

                            {/* ── Body ── */}
                            <div className="cr-body">

                                {/* STEP 0 — Type selection */}
                                {step === 0 && (
                                    <div className="cr-step-content">
                                        <h2 className="cr-title">Que créez-vous ?</h2>
                                        <p className="cr-sub">Choisissez le type de salon que vous souhaitez lancer.</p>
                                        <div className="cr-type-grid">
                                            <div className="cr-type-card obj" onClick={() => { setCreationMode('objective'); setStep(1); }}>
                                                <div style={{ width: 50, height: 50, borderRadius: 13, background: 'rgba(99,102,241,0.14)', border: '1px solid rgba(99,102,241,0.28)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <Target size={24} style={{ color: '#818cf8' }} />
                                                </div>
                                                <div>
                                                    <div style={{ fontSize: '1.08rem', fontWeight: 700, color: '#eeeef0', marginBottom: 5 }}>Objectif</div>
                                                    <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.35)', lineHeight: 1.55 }}>Suivez vos heures, formez une équipe et atteignez vos buts personnels.</div>
                                                </div>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                    {["Suivi d'heures & progression","Jalons générés par IA","Salon communautaire"].map(f => (
                                                        <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.76rem', color: 'rgba(255,255,255,0.42)' }}>
                                                            <div className="cr-feat-dot" style={{ background: '#6366f1' }} />{f}
                                                        </div>
                                                    ))}
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.8rem', fontWeight: 700, color: '#818cf8', marginTop: 2 }}>
                                                    Choisir <ChevronRight size={14} />
                                                </div>
                                            </div>
                                            <div className="cr-type-card proj" onClick={() => { setCreationMode('project'); setStep(1); }}>
                                                <div style={{ width: 50, height: 50, borderRadius: 13, background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.28)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <FolderKanban size={24} style={{ color: '#34d399' }} />
                                                </div>
                                                <div>
                                                    <div style={{ fontSize: '1.08rem', fontWeight: 700, color: '#eeeef0', marginBottom: 5 }}>Projet</div>
                                                    <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.35)', lineHeight: 1.55 }}>Collaborez sur un livrable concret avec un tableau Kanban et une équipe.</div>
                                                </div>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                    {["Tableau Kanban intégré","Invitations par email","Lien GitHub & ressources"].map(f => (
                                                        <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.76rem', color: 'rgba(255,255,255,0.42)' }}>
                                                            <div className="cr-feat-dot" style={{ background: '#10b981' }} />{f}
                                                        </div>
                                                    ))}
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.8rem', fontWeight: 700, color: '#34d399', marginTop: 2 }}>
                                                    Choisir <ChevronRight size={14} />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* STEP 1 — Name & describe */}
                                {step === 1 && (
                                    <div className="cr-step-content">
                                        <h2 className="cr-title">{creationMode === 'objective' ? 'Nommez votre objectif' : 'Nommez votre projet'}</h2>
                                        <p className="cr-sub">Donnez-lui une identité claire et inspirante.</p>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                                            <div>
                                                <label className="cr-label">Titre <span style={{ color: '#f87171' }}>*</span></label>
                                                <input
                                                    className="cr-input"
                                                    type="text"
                                                    placeholder={creationMode === 'objective' ? 'Ex : Maîtriser React en 100h' : 'Ex : App Mobile de méditation'}
                                                    value={newTitle}
                                                    onChange={e => setNewTitle(e.target.value)}
                                                    autoFocus
                                                    style={{ fontSize: '1.04rem' }}
                                                />
                                            </div>
                                            <div>
                                                <label className="cr-label">Description <span style={{ fontSize: '0.73rem', color: 'rgba(255,255,255,0.2)', textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}>(optionnel)</span></label>
                                                <textarea
                                                    className="cr-input"
                                                    rows={3}
                                                    placeholder="Décrivez votre ambition, le niveau requis, ce que les participants apprendront..."
                                                    value={newDescription}
                                                    onChange={e => setNewDescription(e.target.value)}
                                                    style={{ resize: 'vertical', minHeight: 78 }}
                                                />
                                            </div>
                                            {creationMode === 'objective' && (
                                                <div>
                                                    <label className="cr-label">Formation e-learning <span style={{ fontSize: '0.73rem', color: 'rgba(255,255,255,0.2)', textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}>(optionnel)</span></label>
                                                    <input
                                                        className="cr-input"
                                                        type="url"
                                                        placeholder="https://www.udemy.com/... ou coursera.org/..."
                                                        value={newLearningLink}
                                                        onChange={e => setNewLearningLink(e.target.value)}
                                                    />
                                                </div>
                                            )}
                                            {creationMode === 'project' && (
                                                <div>
                                                    <label className="cr-label">Dépôt GitHub <span style={{ fontSize: '0.73rem', color: 'rgba(255,255,255,0.2)', textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}>(optionnel)</span></label>
                                                    <input
                                                        className="cr-input"
                                                        type="url"
                                                        placeholder="https://github.com/organisation/repo"
                                                        value={newGithubLink}
                                                        onChange={e => setNewGithubLink(e.target.value)}
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* STEP 2 — Categories + config */}
                                {step === 2 && (
                                    <div className="cr-step-content">
                                        <h2 className="cr-title">Catégories &amp; paramètres</h2>
                                        <p className="cr-sub">Classifiez votre {creationMode === 'objective' ? 'objectif' : 'projet'} et définissez vos ambitions.</p>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
                                            <div>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                                                    <label className="cr-label" style={{ margin: 0 }}>Catégories <span style={{ color: '#f87171' }}>*</span></label>
                                                    <span style={{ fontSize: '0.72rem', color: newCategories.length >= 3 ? '#fbbf24' : 'rgba(255,255,255,0.25)', fontWeight: 700 }}>{newCategories.length}/3</span>
                                                </div>
                                                <div className="cr-cat-grid">
                                                    {CATEGORIES.map(cat => {
                                                        const CatIcon = cat.icon;
                                                        const selected = newCategories.includes(cat.id);
                                                        const disabled = !selected && newCategories.length >= 3;
                                                        return (
                                                            <div
                                                                key={cat.id}
                                                                className={`cr-cat-item${disabled ? ' cr-cat-disabled' : ''}`}
                                                                onClick={() => {
                                                                    if (disabled) return;
                                                                    setNewCategories(prev => prev.includes(cat.id) ? prev.filter(c => c !== cat.id) : [...prev, cat.id]);
                                                                }}
                                                                style={{
                                                                    border: selected ? `1.5px solid ${cat.color}88` : undefined,
                                                                    background: selected ? `${cat.color}12` : undefined,
                                                                }}
                                                            >
                                                                <div style={{ background: `${cat.color}22`, borderRadius: 9, padding: 7, display: 'flex' }}>
                                                                    <CatIcon size={17} style={{ color: cat.color }} />
                                                                </div>
                                                                <span style={{ fontSize: '10.5px', fontWeight: selected ? 700 : 500, color: selected ? cat.color : 'rgba(255,255,255,0.42)' }}>{cat.label}</span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>

                                            {creationMode === 'objective' && (
                                                <div>
                                                    <label className="cr-label" style={{ marginBottom: 11 }}>Objectif d'heures <span style={{ color: '#f87171' }}>*</span></label>
                                                    <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 10 }}>
                                                        {HOUR_PRESETS.map(h => (
                                                            <button
                                                                key={h} type="button"
                                                                onClick={() => setNewHours(String(h))}
                                                                className={`cr-chip${newHours === String(h) ? ' active' : ''}`}
                                                            >{h}h</button>
                                                        ))}
                                                    </div>
                                                    <div style={{ display: 'flex', gap: 9 }}>
                                                        <input
                                                            type="number"
                                                            className="cr-input"
                                                            style={{ flex: 1 }}
                                                            value={newHours}
                                                            onChange={e => setNewHours(e.target.value)}
                                                            placeholder="Ex : 20"
                                                            min="1"
                                                        />
                                                        <select
                                                            className="cr-input"
                                                            value={newFrequency}
                                                            onChange={e => setNewFrequency(e.target.value)}
                                                            style={{ width: 138, cursor: 'pointer' }}
                                                        >
                                                            <option value="total">Total</option>
                                                            <option value="daily">Par jour</option>
                                                            <option value="weekly">Par semaine</option>
                                                            <option value="monthly">Par mois</option>
                                                        </select>
                                                    </div>
                                                </div>
                                            )}

                                            {creationMode === 'project' && (
                                                <div>
                                                    <label className="cr-label">Inviter des membres</label>
                                                    {pendingInvites.length > 0 && (
                                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 10 }}>
                                                            {pendingInvites.map((inv, idx) => (
                                                                <div key={idx} className="cr-invite-tag">
                                                                    <span>{inv.role === 'admin' ? '🛡️' : '👤'}</span>
                                                                    <span>{inv.email}</span>
                                                                    <X size={12} style={{ cursor: 'pointer', opacity: 0.65 }} onClick={() => setPendingInvites(prev => prev.filter((_, i) => i !== idx))} />
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                    <div style={{ display: 'flex', gap: 8 }}>
                                                        <input
                                                            type="email"
                                                            className="cr-input"
                                                            style={{ flex: 1 }}
                                                            placeholder="Email du collaborateur"
                                                            value={inviteInput}
                                                            onChange={e => setInviteInput(e.target.value)}
                                                            onKeyDown={e => {
                                                                if (e.key === 'Enter') {
                                                                    e.preventDefault();
                                                                    if (inviteInput.includes('@')) {
                                                                        setPendingInvites(prev => [...prev, { email: inviteInput.trim(), role: inviteRole }]);
                                                                        setInviteInput('');
                                                                    }
                                                                }
                                                            }}
                                                        />
                                                        <select
                                                            className="cr-input"
                                                            value={inviteRole}
                                                            onChange={e => setInviteRole(e.target.value as 'admin'|'member')}
                                                            style={{ width: 108, cursor: 'pointer' }}
                                                        >
                                                            <option value="member">Membre</option>
                                                            <option value="admin">Admin</option>
                                                        </select>
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                if (inviteInput.includes('@')) {
                                                                    setPendingInvites(prev => [...prev, { email: inviteInput.trim(), role: inviteRole }]);
                                                                    setInviteInput('');
                                                                }
                                                            }}
                                                            style={{ padding: '0 15px', borderRadius: 11, background: 'rgba(16,185,129,0.12)', color: '#34d399', border: '1px solid rgba(16,185,129,0.28)', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'DM Sans, system-ui' }}
                                                        >+ Ajouter</button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* STEP 3 — Visibility + preview + submit */}
                                {step === 3 && (
                                    <div className="cr-step-content">
                                        <h2 className="cr-title">Visibilité &amp; lancement</h2>
                                        <p className="cr-sub">Définissez qui peut rejoindre votre {creationMode === 'objective' ? 'objectif' : 'projet'}.</p>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                                            {/* Visibility toggle */}
                                            <div
                                                className="cr-vis-row"
                                                onClick={() => setIsPublic(!isPublic)}
                                                style={{
                                                    background: isPublic ? 'rgba(34,197,94,0.07)' : 'rgba(255,255,255,0.03)',
                                                    border: `1px solid ${isPublic ? 'rgba(34,197,94,0.28)' : 'rgba(255,255,255,0.08)'}`,
                                                }}
                                            >
                                                <div style={{ width: 42, height: 42, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: isPublic ? 'rgba(34,197,94,0.13)' : 'rgba(255,255,255,0.05)' }}>
                                                    {isPublic ? <Globe size={20} style={{ color: '#4ade80' }} /> : <Lock size={20} style={{ color: 'rgba(255,255,255,0.38)' }} />}
                                                </div>
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ fontSize: '0.93rem', fontWeight: 700, color: isPublic ? '#4ade80' : 'rgba(255,255,255,0.78)', marginBottom: 3 }}>
                                                        {isPublic ? 'Public' : 'Privé'}
                                                    </div>
                                                    <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.35)', lineHeight: 1.45 }}>
                                                        {isPublic ? "Visible dans le portail d'exploration — tout le monde peut rejoindre." : 'Accessible uniquement sur invitation directe.'}
                                                    </div>
                                                </div>
                                                <div style={{ width: 42, height: 23, borderRadius: 12, background: isPublic ? 'rgba(34,197,94,0.38)' : 'rgba(255,255,255,0.09)', border: isPublic ? '1px solid rgba(34,197,94,0.45)' : '1px solid rgba(255,255,255,0.13)', position: 'relative', flexShrink: 0, transition: 'all 0.28s' }}>
                                                    <div style={{ position: 'absolute', top: 3, left: isPublic ? 21 : 3, width: 15, height: 15, borderRadius: '50%', background: isPublic ? '#4ade80' : 'rgba(255,255,255,0.48)', transition: 'left 0.28s cubic-bezier(0.22,1,0.36,1)' }} />
                                                </div>
                                            </div>

                                            {/* Live preview */}
                                            <div>
                                                <label className="cr-label" style={{ marginBottom: 10 }}>Aperçu de votre carte</label>
                                                <div className="cr-preview">
                                                    {(() => {
                                                        const cat = CATEGORIES.find(c => newCategories.includes(c.id));
                                                        const accentColor = cat ? cat.color : '#6366f1';
                                                        const CatIcon = cat ? cat.icon : Target;
                                                        return (
                                                            <>
                                                                <div style={{ position: 'absolute', top: -16, left: -16, width: 80, height: 80, background: `radial-gradient(circle, ${accentColor}45 0%, transparent 70%)`, pointerEvents: 'none' }} />
                                                                <div style={{ display: 'flex', gap: 13, alignItems: 'flex-start', position: 'relative' }}>
                                                                    <div style={{ width: 42, height: 42, borderRadius: 11, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${accentColor}1a`, border: `1px solid ${accentColor}40` }}>
                                                                        <CatIcon size={19} style={{ color: accentColor }} />
                                                                    </div>
                                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                                        <div style={{ fontSize: '0.95rem', fontWeight: 700, color: newTitle ? '#eeeef0' : 'rgba(255,255,255,0.2)', marginBottom: 7, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                            {newTitle || `Titre de votre ${creationMode === 'objective' ? 'objectif' : 'projet'}`}
                                                                        </div>
                                                                        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                                                                            {newCategories.length > 0 ? newCategories.map(c => {
                                                                                const cc = CATEGORIES.find(x => x.id === c);
                                                                                return cc ? (
                                                                                    <span key={c} style={{ fontSize: '0.68rem', padding: '2px 8px', borderRadius: 20, background: `${cc.color}18`, border: `1px solid ${cc.color}38`, color: cc.color, fontWeight: 600 }}>{c}</span>
                                                                                ) : null;
                                                                            }) : (
                                                                                <span style={{ fontSize: '0.68rem', padding: '2px 8px', borderRadius: 20, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.22)' }}>Aucune catégorie</span>
                                                                            )}
                                                                            <span style={{ fontSize: '0.68rem', padding: '2px 8px', borderRadius: 20, fontWeight: 600, ...(isPublic ? { background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.28)', color: '#4ade80' } : { background: 'rgba(100,116,139,0.09)', border: '1px solid rgba(100,116,139,0.2)', color: '#94a3b8' }) }}>
                                                                                {isPublic ? 'Public' : 'Privé'}
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                {creationMode === 'objective' && (
                                                                    <div style={{ marginTop: 14, paddingTop: 13, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                                                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 7 }}>
                                                                            <span style={{ fontSize: '0.67rem', fontWeight: 700, color: 'rgba(255,255,255,0.28)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Progression</span>
                                                                            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'rgba(255,255,255,0.5)' }}>0 / {newHours || '20'}h{newFrequency !== 'total' ? ` / ${newFrequency === 'daily' ? 'jour' : newFrequency === 'weekly' ? 'semaine' : 'mois'}` : ''}</span>
                                                                        </div>
                                                                        <div style={{ height: 3, borderRadius: 2, background: 'rgba(0,0,0,0.5)' }}>
                                                                            <div style={{ width: '0%', height: '100%', borderRadius: 2, background: accentColor }} />
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </>
                                                        );
                                                    })()}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                            </div>

                            {/* ── Footer ── */}
                            <div className="cr-footer">
                                {step > 0 ? (
                                    <button className="cr-btn-back" onClick={() => setStep(s => s - 1)}>← Retour</button>
                                ) : (
                                    <div />
                                )}
                                {step === 0 ? (
                                    <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.22)' }}>Cliquez sur un type pour continuer</div>
                                ) : step < 3 ? (
                                    <button
                                        className="cr-btn-next"
                                        disabled={step === 1 ? !newTitle.trim() : step === 2 ? newCategories.length === 0 : false}
                                        onClick={() => setStep(s => s + 1)}
                                    >
                                        Continuer <ChevronRight size={15} />
                                    </button>
                                ) : (
                                    <button
                                        className="cr-btn-submit"
                                        disabled={!newTitle || newCategories.length === 0}
                                        onClick={() => handleCreateObjective()}
                                    >
                                        <Rocket size={15} />
                                        {creationMode === 'objective' ? "Créer l'objectif" : 'Créer le projet'}
                                    </button>
                                )}
                            </div>

                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

export default function Dashboard() {
    return (
        <Suspense fallback={<div className="container py-16 text-center">Chargement...</div>}>
            <DashboardContent />
        </Suspense>
    );
}
