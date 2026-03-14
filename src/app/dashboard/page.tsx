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
        setNewTitle(''); setNewDescription(''); setNewCategories([]); setIsPublic(false); setNewHours('20'); setNewLearningLink('');
        setCreationMode('objective'); setNewGithubLink(''); setPendingInvites([]); setInviteInput(''); setInviteRole('member');
    };

    const handleCreateObjective = async (e: React.FormEvent) => {
        e.preventDefault();
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

    return (
        <div className="container py-12 max-w-6xl mx-auto">
            {/* Header section */}
            <div className="flex justify-between items-end mb-10 fade-enter flex-wrap gap-4">
                <div>
                    <h2 className="text-3xl font-bold mb-2 flex items-center gap-3">
                        <LayoutDashboard className="text-primary" size={28} />
                        {t('dash_title')}
                    </h2>
                    <p className="text-secondary text-lg m-0 opacity-80">{t('dash_subtitle')}</p>
                </div>
                <button
                    onClick={handleOpenModal}
                    style={{
                        display: 'flex', alignItems: 'center', gap: '10px',
                        padding: '10px 20px', borderRadius: '12px',
                        width: 'fit-content', height: 'fit-content', flexShrink: 0,
                        background: 'rgba(99,102,241,0.15)',
                        border: '1px solid rgba(99,102,241,0.35)',
                        color: 'rgba(165,180,252,1)',
                        fontSize: '25px', fontWeight: 600,
                        cursor: 'pointer', whiteSpace: 'nowrap',
                        transition: 'all 0.18s ease',
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(99,102,241,0.25)';
                        e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)';
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(99,102,241,0.15)';
                        e.currentTarget.style.borderColor = 'rgba(99,102,241,0.35)';
                    }}
                >
                    <Target size={25} /> {t('dash_btn_create')}
                </button>
            </div>

            {/* TABS */}
            <div className="flex gap-4 mb-10 pb-2" style={{ marginTop: '1rem' }}>
                <button
                    onClick={() => setActiveTab('objectives')}
                    style={{
                        padding: '12px 28px', borderRadius: '16px', fontSize: '1.05rem', fontWeight: 700,
                        display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer',
                        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                        background: activeTab === 'objectives' ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.03)',
                        color: activeTab === 'objectives' ? '#818cf8' : '#a1a1aa',
                        border: activeTab === 'objectives' ? '1px solid rgba(99,102,241,0.4)' : '1px solid rgba(255,255,255,0.08)',
                        boxShadow: activeTab === 'objectives' ? '0 8px 24px rgba(99,102,241,0.2)' : 'none',
                    }}
                    onMouseEnter={(e) => {
                        if (activeTab !== 'objectives') {
                            e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
                            e.currentTarget.style.color = '#e4e4e7';
                        }
                    }}
                    onMouseLeave={(e) => {
                        if (activeTab !== 'objectives') {
                            e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
                            e.currentTarget.style.color = '#a1a1aa';
                        }
                    }}
                >
                    <Target size={22} /> Mes Objectifs
                </button>
                <button
                    onClick={() => setActiveTab('projects')}
                    style={{
                        padding: '12px 28px', borderRadius: '16px', fontSize: '1.05rem', fontWeight: 700,
                        display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer',
                        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                        background: activeTab === 'projects' ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.03)',
                        color: activeTab === 'projects' ? '#34d399' : '#a1a1aa',
                        border: activeTab === 'projects' ? '1px solid rgba(16,185,129,0.4)' : '1px solid rgba(255,255,255,0.08)',
                        boxShadow: activeTab === 'projects' ? '0 8px 24px rgba(16,185,129,0.2)' : 'none',
                    }}
                    onMouseEnter={(e) => {
                        if (activeTab !== 'projects') {
                            e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
                            e.currentTarget.style.color = '#e4e4e7';
                        }
                    }}
                    onMouseLeave={(e) => {
                        if (activeTab !== 'projects') {
                            e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
                            e.currentTarget.style.color = '#a1a1aa';
                        }
                    }}
                >
                    <FolderKanban size={22} /> Mes Projets
                </button>
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
                                        className="fade-enter group"
                                        style={{
                                            position: 'relative',
                                            animationDelay: `${i * 0.08}s`,
                                            display: 'flex', flexDirection: 'column',
                                            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                            border: '1px solid rgba(255,255,255,0.05)',
                                            background: 'linear-gradient(180deg, #18181b 0%, #0f0f12 100%)',
                                            borderRadius: '16px',
                                            padding: '1.5rem',
                                            cursor: 'pointer',
                                            overflow: 'hidden',
                                            textDecoration: 'none'
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.transform = 'translateY(-4px)';
                                            e.currentTarget.style.boxShadow = `0 12px 30px -10px ${accentColor}50`;
                                            e.currentTarget.style.borderColor = `${accentColor}50`;
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.transform = 'translateY(0)';
                                            e.currentTarget.style.boxShadow = 'none';
                                            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)';
                                        }}
                                    >
                                        {/* Subtle Ambient Glow behind icon */}
                                        <div style={{
                                            position: 'absolute', top: '-20px', left: '-20px',
                                            width: '100px', height: '100px',
                                            background: `radial-gradient(circle, ${accentColor}40 0%, transparent 70%)`,
                                            opacity: 0.6, pointerEvents: 'none', zIndex: 0
                                        }}></div>

                                        {/* Card Header (Icon + Title) */}
                                        <div className="flex gap-4 items-start mb-4" style={{ position: 'relative', zIndex: 1 }}>
                                            <div style={{
                                                width: '3.5rem', height: '3.5rem', flexShrink: 0,
                                                background: `${accentColor}1A`, // 10% opacity
                                                borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                border: `1px solid ${accentColor}33`, // 20% opacity
                                                color: accentColor
                                            }}>
                                                <CatIcon size={24} />
                                            </div>
                                            <div className="flex-1 min-w-0 pt-1">
                                                <h3 className="m-0 text-lg font-bold truncate text-slate-100 group-hover:text-white transition-colors" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>
                                                    {obj.title}
                                                </h3>
                                                <div className="flex gap-2 items-center mt-2 flex-wrap">
                                                    {Array.isArray(obj.category) ? (
                                                        obj.category.map((cat: string) => (
                                                            <span key={cat} className="badge" style={{ fontSize: '0.7rem', padding: '2px 8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>{cat}</span>
                                                        ))
                                                    ) : (
                                                        <span className="badge" style={{ fontSize: '0.7rem', padding: '2px 8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>{obj.category}</span>
                                                    )}
                                                    <span className="badge" style={{
                                                        fontSize: '0.7rem', padding: '2px 8px',
                                                        ...(isPublic ? { borderColor: '#10b981', color: '#34d399', background: 'rgba(16, 185, 129, 0.1)' } : { borderColor: '#64748b', color: '#94a3b8', background: 'rgba(100, 116, 139, 0.1)' })
                                                    }}>
                                                        {isPublic ? 'Public' : t('dash_private')}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Progress Section */}
                                        <div className="mt-auto pt-5 border-t border-white/5" style={{ position: 'relative', zIndex: 1 }}>
                                            <div className="flex justify-between items-end mb-2">
                                                <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>Progression</span>
                                                <div className="text-right">
                                                    <span className="text-lg font-bold leading-none text-slate-100">{fmtHours(obj.my_completed_hours ?? 0)}</span>
                                                    <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}> / {obj.target_hours}h {obj.goal_frequency === 'daily' ? '/ jour' : obj.goal_frequency === 'weekly' ? '/ semaine' : obj.goal_frequency === 'monthly' ? '/ mois' : ''}</span>
                                                </div>
                                            </div>
                                            <div style={{ height: '4px', borderRadius: '2px', background: 'rgba(0,0,0,0.4)', overflow: 'hidden' }}>
                                                <div style={{
                                                    width: `${perc}%`, height: '100%', borderRadius: '2px',
                                                    background: accentColor,
                                                    boxShadow: `0 0 8px ${accentColor}`,
                                                    transition: 'width 1s cubic-bezier(0.4, 0, 0.2, 1)'
                                                }}></div>
                                            </div>
                                        </div>

                                        {/* Card Footer */}
                                        <div className="mt-5 flex justify-between items-center text-sm" style={{ color: 'rgba(255,255,255,0.4)', position: 'relative', zIndex: 1, transition: 'color 0.3s' }}>
                                            <div className="flex items-center gap-1.5 font-medium"><Users size={14} /> {obj.participants_count} {t('dash_members')}</div>
                                            <div className="flex items-center gap-1.5 font-semibold" style={{ color: accentColor }}>
                                                Aperçu <span className="group-hover:translate-x-1 transition-transform inline-block">→</span>
                                            </div>
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
                                        className="fade-enter group"
                                        style={{
                                            position: 'relative',
                                            animationDelay: `${i * 0.08}s`,
                                            display: 'flex', flexDirection: 'column',
                                            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                            border: '1px solid rgba(255,255,255,0.05)',
                                            background: 'linear-gradient(180deg, #18181b 0%, #0f0f12 100%)',
                                            borderRadius: '16px',
                                            padding: '1.5rem',
                                            cursor: 'pointer',
                                            overflow: 'hidden',
                                            textDecoration: 'none'
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.transform = 'translateY(-4px)';
                                            e.currentTarget.style.boxShadow = `0 12px 30px -10px ${accentColor}50`;
                                            e.currentTarget.style.borderColor = `${accentColor}50`;
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.transform = 'translateY(0)';
                                            e.currentTarget.style.boxShadow = 'none';
                                            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)';
                                        }}
                                    >
                                        <div style={{
                                            position: 'absolute', top: '-20px', left: '-20px',
                                            width: '100px', height: '100px',
                                            background: `radial-gradient(circle, ${accentColor}40 0%, transparent 70%)`,
                                            opacity: 0.6, pointerEvents: 'none', zIndex: 0
                                        }}></div>

                                        <div className="flex gap-4 items-start mb-4" style={{ position: 'relative', zIndex: 1 }}>
                                            <div style={{
                                                width: '3.5rem', height: '3.5rem', flexShrink: 0,
                                                background: `${accentColor}1A`,
                                                borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                border: `1px solid ${accentColor}33`,
                                                color: accentColor
                                            }}>
                                                <CatIcon size={24} />
                                            </div>
                                            <div className="flex-1 min-w-0 pt-1">
                                                <h3 className="m-0 text-lg font-bold truncate text-slate-100 group-hover:text-white transition-colors" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>
                                                    {proj.title}
                                                </h3>
                                                <div className="flex gap-2 items-center mt-2 flex-wrap">
                                                    <span className="badge" style={{
                                                        fontSize: '0.7rem', padding: '2px 8px',
                                                        ...(isPublic ? { borderColor: '#10b981', color: '#34d399', background: 'rgba(16, 185, 129, 0.1)' } : { borderColor: '#64748b', color: '#94a3b8', background: 'rgba(100, 116, 139, 0.1)' })
                                                    }}>
                                                        {isPublic ? 'Public' : 'Privé'}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Card Footer */}
                                        <div className="mt-auto pt-5 flex justify-between items-center text-sm border-t border-white/5" style={{ color: 'rgba(255,255,255,0.4)', position: 'relative', zIndex: 1, transition: 'color 0.3s' }}>
                                            <div className="flex items-center gap-1.5 font-medium"><Users size={14} /> {proj.participants_count || 1} {t('dash_members')}</div>
                                            <div className="flex items-center gap-1.5 font-semibold" style={{ color: accentColor }}>
                                                Accéder au projet <span className="group-hover:translate-x-1 transition-transform inline-block">→</span>
                                            </div>
                                        </div>
                                    </Link>
                                );
                            })}
                        </div>
                    )
                )}
            </div>

            {/* Creation Modal */}
            {showModal && (
                <div
                    className="fixed inset-0 flex items-center justify-center p-4"
                    style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(12px)', zIndex: 50 }}
                    onClick={e => { if (e.target === e.currentTarget) closeModal(); }}
                >
                    <div
                        className="card glass-panel w-full relative shadow-2xl no-scrollbar"
                        style={{ maxWidth: '620px', border: '1px solid rgba(255,255,255,0.1)', padding: '0', overflow: 'hidden', maxHeight: '90vh', overflowY: 'auto' }}
                    >
                        {/* Modal Top Banner */}
                        <div style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.18), rgba(236,72,153,0.1))', padding: '1.75rem 2rem 1.5rem', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                            <button onClick={closeModal} style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'rgba(255,255,255,0.6)' }}>
                                <X size={16} />
                            </button>
                            <div className="flex items-center gap-4">
                                <div style={{ background: 'rgba(99,102,241,0.2)', padding: '12px', borderRadius: '14px', border: '1px solid rgba(99,102,241,0.3)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Target className="text-primary" size={26} />
                                </div>
                                <div className="flex flex-col justify-center">
                                    <h3 className="m-0 text-xl font-bold" style={{ lineHeight: '1', marginBottom: '4px', marginTop: '15px' }}>{t('modal_create_title')}</h3>
                                    <p className="m-0 text-sm opacity-60" style={{ lineHeight: '1' }}>Définissez votre objectif et invitez la communauté</p>
                                </div>
                            </div>
                        </div>

                        <form onSubmit={handleCreateObjective} className="flex flex-col gap-6" style={{ padding: '1.75rem 2rem' }}>
                            {/* Choix du type */}
                            <div className="flex flex-col gap-3 mb-2">
                                <label className="text-sm font-semibold text-slate-300">Que souhaitez-vous créer ? <span className="text-red-400">*</span></label>
                                <div style={{ display: 'flex', gap: '12px' }}>
                                    <button
                                        type="button"
                                        onClick={() => setCreationMode('objective')}
                                        style={{
                                            flex: 1, padding: '16px 12px', borderRadius: '16px', cursor: 'pointer',
                                            border: creationMode === 'objective' ? '2px solid rgba(99,102,241,0.75)' : '2px solid rgba(255,255,255,0.07)',
                                            background: creationMode === 'objective' ? 'rgba(99,102,241,0.1)' : 'rgba(255,255,255,0.02)',
                                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px',
                                            transition: 'all 0.2s', position: 'relative',
                                            boxShadow: creationMode === 'objective' ? '0 0 0 1px rgba(99,102,241,0.2) inset' : 'none',
                                        }}
                                    >
                                        {creationMode === 'objective' && (
                                            <div style={{ position: 'absolute', top: '10px', right: '10px', width: '16px', height: '16px', borderRadius: '50%', background: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#fff' }} />
                                            </div>
                                        )}
                                        <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: creationMode === 'objective' ? 'rgba(99,102,241,0.18)' : 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: creationMode === 'objective' ? '1px solid rgba(99,102,241,0.35)' : '1px solid rgba(255,255,255,0.08)', transition: 'all 0.2s' }}>
                                            <Target size={22} style={{ color: creationMode === 'objective' ? '#818cf8' : 'rgba(255,255,255,0.35)' }} />
                                        </div>
                                        <div style={{ textAlign: 'center' }}>
                                            <div style={{ fontWeight: 700, fontSize: '0.95rem', color: creationMode === 'objective' ? '#a5b4fc' : 'rgba(255,255,255,0.65)', marginBottom: '4px' }}>Objectif</div>
                                            <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)', fontWeight: 400, lineHeight: 1.4 }}>Suivi d'heures &amp; formation</div>
                                        </div>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setCreationMode('project')}
                                        style={{
                                            flex: 1, padding: '16px 12px', borderRadius: '16px', cursor: 'pointer',
                                            border: creationMode === 'project' ? '2px solid rgba(16,185,129,0.7)' : '2px solid rgba(255,255,255,0.07)',
                                            background: creationMode === 'project' ? 'rgba(16,185,129,0.08)' : 'rgba(255,255,255,0.02)',
                                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px',
                                            transition: 'all 0.2s', position: 'relative',
                                            boxShadow: creationMode === 'project' ? '0 0 0 1px rgba(16,185,129,0.15) inset' : 'none',
                                        }}
                                    >
                                        {creationMode === 'project' && (
                                            <div style={{ position: 'absolute', top: '10px', right: '10px', width: '16px', height: '16px', borderRadius: '50%', background: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#fff' }} />
                                            </div>
                                        )}
                                        <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: creationMode === 'project' ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: creationMode === 'project' ? '1px solid rgba(16,185,129,0.35)' : '1px solid rgba(255,255,255,0.08)', transition: 'all 0.2s' }}>
                                            <FolderKanban size={22} style={{ color: creationMode === 'project' ? '#34d399' : 'rgba(255,255,255,0.35)' }} />
                                        </div>
                                        <div style={{ textAlign: 'center' }}>
                                            <div style={{ fontWeight: 700, fontSize: '0.95rem', color: creationMode === 'project' ? '#6ee7b7' : 'rgba(255,255,255,0.65)', marginBottom: '4px' }}>Projet</div>
                                            <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)', fontWeight: 400, lineHeight: 1.4 }}>Kanban, équipe &amp; livrables</div>
                                        </div>
                                    </button>
                                </div>
                            </div>

                            {/* Title */}
                            <div className="flex flex-col gap-1.5">
                                <label className="text-sm font-semibold text-slate-300">{t('modal_label_title')} <span className="text-red-400">*</span></label>
                                <input
                                    type="text" className="input"
                                    placeholder={t('modal_ph_title')}
                                    value={newTitle} onChange={e => setNewTitle(e.target.value)}
                                    required
                                    style={{ fontSize: '1rem' }}
                                />
                            </div>

                            {/* Description */}
                            <div className="flex flex-col gap-1.5">
                                <label className="text-sm font-semibold text-slate-300">Description <span className="text-xs opacity-40">(optionnel)</span></label>
                                <textarea
                                    className="input" rows={2}
                                    placeholder="Décrivez votre objectif, vos attentes, le niveau requis..."
                                    value={newDescription} onChange={e => setNewDescription(e.target.value)}
                                    style={{ resize: 'vertical', minHeight: '64px' }}
                                />
                            </div>

                            {/* Formation E-learning */}
                            {creationMode === 'objective' && (
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-sm font-semibold text-slate-300">Lien vers une formation E-learning <span className="text-xs opacity-40">(optionnel)</span></label>
                                    <input
                                        type="url" className="input"
                                        placeholder="https://www.udemy.com/... ou coursera.org/..."
                                        value={newLearningLink} onChange={e => setNewLearningLink(e.target.value)}
                                        style={{ fontSize: '0.95rem' }}
                                    />
                                </div>
                            )}

                            {/* GitHub link (Projets uniquement) */}
                            {creationMode === 'project' && (
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-sm font-semibold text-slate-300">Lien GitHub <span className="text-xs opacity-40">(optionnel)</span></label>
                                    <input
                                        type="url" className="input"
                                        placeholder="https://github.com/votre-organisation/repo"
                                        value={newGithubLink} onChange={e => setNewGithubLink(e.target.value)}
                                        style={{ fontSize: '0.95rem' }}
                                    />
                                </div>
                            )}

                            {/* Inviter des membres (Projets uniquement) */}
                            {creationMode === 'project' && (
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-sm font-semibold text-slate-300">Inviter des membres <span className="text-xs opacity-40">(optionnel)</span></label>
                                    <div className="flex flex-col gap-2">
                                        {pendingInvites.length > 0 && (
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
                                                {pendingInvites.map((inv, idx) => (
                                                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.1)', padding: '4px 10px', borderRadius: '16px', fontSize: '0.85rem' }}>
                                                        <span className="opacity-60">{inv.role === 'admin' ? '🛡️' : '👤'}</span>
                                                        <span>{inv.email}</span>
                                                        <X 
                                                            size={14} 
                                                            className="cursor-pointer hover:text-red-400 opacity-60 hover:opacity-100" 
                                                            onClick={() => setPendingInvites(prev => prev.filter((_, i) => i !== idx))} 
                                                        />
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        <div className="flex gap-2">
                                            <input
                                                type="email" className="input flex-1"
                                                placeholder="Adresse email du collaborateur"
                                                value={inviteInput} onChange={e => setInviteInput(e.target.value)}
                                                onKeyDown={e => {
                                                    if (e.key === 'Enter') {
                                                        e.preventDefault();
                                                        if (inviteInput.includes('@')) {
                                                            setPendingInvites(prev => [...prev, { email: inviteInput.trim(), role: inviteRole }]);
                                                            setInviteInput('');
                                                        }
                                                    }
                                                }}
                                                style={{ fontSize: '0.95rem' }}
                                            />
                                            <select
                                                className="input"
                                                value={inviteRole}
                                                onChange={e => setInviteRole(e.target.value as 'admin'|'member')}
                                                style={{ width: '110px', cursor: 'pointer', padding: '0 12px' }}
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
                                                style={{ padding: '0 16px', borderRadius: '12px', background: 'rgba(16,185,129,0.15)', color: '#34d399', border: '1px solid rgba(16,185,129,0.3)', fontWeight: 'bold' }}
                                            >
                                                Ajouter
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Category visual picker */}
                            <div className="flex flex-col gap-2">
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <label className="text-sm font-semibold text-slate-300">{t('modal_label_cat')} <span className="text-red-400">*</span></label>
                                    <span style={{ fontSize: '0.72rem', color: newCategories.length >= 3 ? '#f59e0b' : '#71717a' }}>
                                        {newCategories.length}/3 max
                                    </span>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: '8px' }}>
                                    {CATEGORIES.map(cat => {
                                        const CatIcon = cat.icon;
                                        const selected = newCategories.includes(cat.id);
                                        const disabled = !selected && newCategories.length >= 3;
                                        return (
                                            <div
                                                key={cat.id}
                                                onClick={() => {
                                                    if (disabled) return;
                                                    setNewCategories(prev =>
                                                        prev.includes(cat.id)
                                                            ? prev.filter(c => c !== cat.id)
                                                            : [...prev, cat.id]
                                                    );
                                                }}
                                                style={{
                                                    cursor: disabled ? 'not-allowed' : 'pointer',
                                                    opacity: disabled ? 0.35 : 1,
                                                    display: 'flex', flexDirection: 'column',
                                                    alignItems: 'center', gap: '6px', padding: '10px 6px',
                                                    borderRadius: '12px',
                                                    border: selected ? `2px solid ${cat.color}` : '2px solid rgba(255,255,255,0.06)',
                                                    background: selected ? `${cat.color}18` : 'rgba(255,255,255,0.02)',
                                                    transition: 'all 0.15s',
                                                }}
                                            >
                                                <div style={{ background: `${cat.color}22`, borderRadius: '8px', padding: '6px', display: 'flex' }}>
                                                    <CatIcon size={18} style={{ color: cat.color }} />
                                                </div>
                                                <span style={{ fontSize: '11px', fontWeight: selected ? 700 : 500, color: selected ? cat.color : 'rgba(255,255,255,0.5)' }}>{cat.label}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {creationMode === 'objective' ? (
                                <div className="flex flex-col gap-2">
                                    <label className="text-sm font-semibold text-slate-300">{t('modal_label_hours')} <span className="text-red-400">*</span></label>
                                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                                        {HOUR_PRESETS.map(h => (
                                            <button
                                                key={h} type="button"
                                                onClick={() => setNewHours(String(h))}
                                                style={{
                                                    padding: '6px 16px', borderRadius: '20px', fontSize: '13px', fontWeight: 600,
                                                    cursor: 'pointer', transition: 'all 0.15s',
                                                    border: newHours === String(h) ? '2px solid rgba(99,102,241,0.8)' : '2px solid rgba(255,255,255,0.08)',
                                                    background: newHours === String(h) ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.03)',
                                                    color: newHours === String(h) ? 'rgba(165,180,252,1)' : 'rgba(255,255,255,0.5)',
                                                }}
                                            >{h}h</button>
                                        ))}
                                        <input
                                            type="number"
                                            className="input flex-1"
                                            value={newHours}
                                            onChange={(e) => setNewHours(e.target.value)}
                                            placeholder="Ex: 20"
                                        />
                                        <select
                                            className="input"
                                            value={newFrequency}
                                            onChange={(e) => setNewFrequency(e.target.value)}
                                            style={{ width: '130px' }}
                                        >
                                            <option value="total">Total</option>
                                            <option value="daily">Par jour</option>
                                            <option value="weekly">Par semaine</option>
                                            <option value="monthly">Par mois</option>
                                        </select>
                                    </div>
                                </div>
                            ) : null}

                            {/* Visibility toggle */}
                            <div
                                onClick={() => setIsPublic(!isPublic)}
                                style={{
                                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '14px',
                                    padding: '14px 16px', borderRadius: '14px', transition: 'all 0.2s',
                                    background: isPublic ? 'rgba(34,197,94,0.07)' : 'rgba(255,255,255,0.03)',
                                    border: isPublic ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(255,255,255,0.08)',
                                }}
                            >
                                <div style={{ width: '40px', height: '40px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: isPublic ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.05)' }}>
                                    {isPublic ? <Globe size={20} style={{ color: '#4ade80' }} /> : <Lock size={20} style={{ color: 'rgba(255,255,255,0.4)' }} />}
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: '14px', fontWeight: 600, color: isPublic ? '#4ade80' : 'rgba(255,255,255,0.8)', marginBottom: '2px' }}>
                                        {isPublic ? 'Salon Public' : 'Salon Privé'}
                                    </div>
                                    <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>
                                        {isPublic ? 'Visible par tous dans le portail d\'exploration.' : 'Accessible uniquement sur invitation.'}
                                    </div>
                                </div>
                                {/* Toggle switch */}
                                <div style={{ width: '44px', height: '24px', borderRadius: '12px', background: isPublic ? 'rgba(34,197,94,0.4)' : 'rgba(255,255,255,0.1)', border: isPublic ? '1px solid rgba(34,197,94,0.5)' : '1px solid rgba(255,255,255,0.15)', position: 'relative', flexShrink: 0, transition: 'all 0.2s' }}>
                                    <div style={{ position: 'absolute', top: '3px', left: isPublic ? '22px' : '3px', width: '16px', height: '16px', borderRadius: '50%', background: isPublic ? '#4ade80' : 'rgba(255,255,255,0.5)', transition: 'left 0.2s' }} />
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="flex justify-end gap-3 pt-4 border-t border-white/8">
                                <button type="button" className="btn btn-ghost px-6" onClick={closeModal}>{t('modal_btn_cancel')}</button>
                                <button
                                    type="submit" className="btn btn-primary px-8 shadow-glow"
                                    disabled={!newTitle || newCategories.length === 0}
                                    style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                                >
                                    {t('modal_btn_submit')} <ChevronRight size={16} />
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
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
