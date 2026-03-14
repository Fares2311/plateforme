'use client';

import { useState, useEffect, useMemo } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, setDoc, doc, getDoc } from 'firebase/firestore';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from '@/context/LocaleContext';
import Link from 'next/link';
import { Search, Users, Clock, Lock, Compass, TrendingUp, Sparkles, LinkIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Avatar from '@/components/Avatar';

// Nice icons per category
const CATEGORY_ICONS: Record<string, string> = {
    'tous': '🌐',
    'dev': '💻',
    'tech': '💻',
    'développement': '💻',
    'code': '💻',
    'langue': '🗣️',
    'langues': '🗣️',
    'sport': '🏃',
    'fitness': '🏃',
    'écriture': '✍️',
    'writing': '✍️',
    'musique': '🎸',
    'music': '🎸',
    'design': '🎨',
    'art': '🎨',
    'business': '💼',
    'entrepreneuriat': '💼',
    'science': '🔬',
    'recherche': '🔬',
    'mathématiques': '📐',
    'maths': '📐',
    'finance': '💰',
    'lifestyle': '✨',
};

function getCategoryIcon(cat: string | string[]) {
    if (!cat) return '📁';
    const displayCat = Array.isArray(cat) ? cat[0] : cat;
    if (!displayCat) return '📁';
    const lower = displayCat.toLowerCase();
    return CATEGORY_ICONS[lower] ?? '📁';
}

const CATEGORY_COLORS: string[] = [
    '#6366f1', '#ec4899', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#14b8a6'
];

export default function Explore() {
    const { user } = useAuth();
    const { t } = useLocale();
    const router = useRouter();
    const [codeInput, setCodeInput] = useState('');
    const [exploreTab, setExploreTab] = useState<'objectives' | 'projects'>('objectives');
    const [publicObjectives, setPublicObjectives] = useState<any[]>([]);
    const [publicProjects, setPublicProjects] = useState<any[]>([]);
    const [objectiveMembers, setObjectiveMembers] = useState<Record<string, { uid: string, avatar_style?: string, avatar_url?: string }[]>>({});
    const [projectMembers, setProjectMembers] = useState<Record<string, { uid: string, avatar_style?: string, avatar_url?: string }[]>>({});
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [activeCategory, setActiveCategory] = useState('tous');
    const [joiningId, setJoiningId] = useState<string | null>(null);
    const [alreadyJoined, setAlreadyJoined] = useState<Set<string>>(new Set());
    const [alreadyJoinedProjects, setAlreadyJoinedProjects] = useState<Set<string>>(new Set());

    useEffect(() => {
        const fetchPublic = async () => {
            try {
                // Fetch Objectives
                const qObjs = query(collection(db, 'objectives'), where('is_public', '==', true));
                const objDocs = await getDocs(qObjs);
                const objs = objDocs.docs.map(d => ({ id: d.id, ...d.data() }));
                setPublicObjectives(objs);

                // Fetch Projects
                const qProjs = query(collection(db, 'projects'), where('is_public', '==', true));
                const projDocs = await getDocs(qProjs);
                const projs = projDocs.docs.map(d => ({ id: d.id, ...d.data() }));
                setPublicProjects(projs);

                // Fetch real members for BOTH
                const userDataMap: Record<string, { avatar_style?: string, avatar_url?: string }> = {};
                
                // Helper to get members for a collection
                const loadMembers = async (items: any[], membershipColl: string, idField: string, setMembersState: any) => {
                    if (items.length === 0) return;
                    const itemIds = items.map(i => i.id);
                    const memDocs = await getDocs(collection(db, membershipColl));
                    const uidsById: Record<string, string[]> = {};
                    memDocs.docs.forEach(d => {
                        const data = d.data();
                        if (itemIds.includes(data[idField])) {
                            if (!uidsById[data[idField]]) uidsById[data[idField]] = [];
                            uidsById[data[idField]].push(data.user_id);
                        }
                    });

                    // Fetch user data for missing UIDs
                    const allUids = Array.from(new Set(Object.values(uidsById).flat()));
                    await Promise.all(allUids.map(async uid => {
                        if (!userDataMap[uid]) {
                            const snap = await getDoc(doc(db, 'users', uid));
                            if (snap.exists()) {
                                const d = snap.data();
                                userDataMap[uid] = { avatar_style: d.avatar_style, avatar_url: d.avatar_url };
                            } else {
                                userDataMap[uid] = {};
                            }
                        }
                    }));

                    const membersMap: Record<string, { uid: string, avatar_style?: string, avatar_url?: string }[]> = {};
                    Object.entries(uidsById).forEach(([id, uids]) => {
                        membersMap[id] = uids.map(uid => ({ uid, ...userDataMap[uid] }));
                    });
                    setMembersState(membersMap);
                };

                await loadMembers(objs, 'memberships', 'objective_id', setObjectiveMembers);
                await loadMembers(projs, 'project_memberships', 'project_id', setProjectMembers);

            } catch (err) {
                console.error('Error loading explore', err);
            } finally {
                setLoading(false);
            }
        };
        fetchPublic();
    }, []);

    // Check which ones the user already joined
    useEffect(() => {
        if (!user) return;
        const fetchMemberships = async () => {
            const memSnap = await getDocs(query(collection(db, 'memberships'), where('user_id', '==', user.uid)));
            setAlreadyJoined(new Set(memSnap.docs.map(d => d.data().objective_id as string)));
            
            const projMemSnap = await getDocs(query(collection(db, 'project_memberships'), where('user_id', '==', user.uid)));
            setAlreadyJoinedProjects(new Set(projMemSnap.docs.map(d => d.data().project_id as string)));
        };
        fetchMemberships();
    }, [user]);

    const activeListData = exploreTab === 'objectives' ? publicObjectives : publicProjects;

    // Compute unique categories dynamically from data
    const categories = useMemo(() => {
        const rawCats = activeListData.flatMap(o =>
            Array.isArray(o.category) ? o.category : [o.category]
        );
        return Array.from(new Set(rawCats.filter(Boolean))) as string[];
    }, [activeListData]);

    // Filter results
    const filtered = useMemo(() => {
        return activeListData.filter(item => {
            const itemCats = (Array.isArray(item.category) ? item.category : [item.category]).filter(Boolean) as string[];
            const itemCatsLower = itemCats.map(c => c.toLowerCase());

            const matchCat = activeCategory === 'tous' || itemCatsLower.includes(activeCategory.toLowerCase());
            const searchLower = search.trim().toLowerCase();
            const matchSearch = !searchLower ||
                item.title?.toLowerCase().includes(searchLower) ||
                itemCatsLower.some(c => c.includes(searchLower));

            return matchCat && matchSearch;
        });
    }, [activeListData, activeCategory, search]);

    const handleJoin = async (id: string, type: 'objectives' | 'projects' = 'objectives') => {
        if (!user) { router.push('/login'); return; }
        setJoiningId(id);
        try {
            if (type === 'objectives') {
                await setDoc(doc(db, 'memberships', `${user.uid}_${id}`), {
                    user_id: user.uid,
                    objective_id: id,
                    completed_hours: 0
                });
                router.push(`/objective/${id}`);
            } else {
                await setDoc(doc(db, 'project_memberships', `${user.uid}_${id}`), {
                    user_id: user.uid,
                    project_id: id,
                    role: 'member',
                    joined_at: new Date().toISOString()
                });
                router.push(`/project/${id}`);
            }
        } catch {
            alert('Erreur lors de la tentative de rejoindre.');
        } finally {
            setJoiningId(null);
        }
    };

    return (
        <div style={{ minHeight: '100vh' }}>
            {/* Hero header */}
            <div
                className="text-center fade-enter"
                style={{
                    padding: '4rem 1.5rem 3rem'
                }}
            >
                <div className="flex items-center justify-center gap-2 mb-3" style={{ opacity: 0.7, fontSize: '0.85rem', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 600 }}>
                    <Compass size={14} /> Explorer
                </div>
                <h1
                    className="text-gradient mb-3"
                    style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)', lineHeight: 1.1 }}
                >
                    {t('explore_title')}
                </h1>
                <p className="text-secondary max-w-xl mx-auto mb-8" style={{ fontSize: '1.05rem' }}>
                    {t('explore_subtitle')}
                </p>

                {/* Search bar */}
                <div className="relative mx-auto" style={{ maxWidth: '520px' }}>
                    <Search size={18} className="absolute text-secondary" style={{ left: '1rem', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                    <input
                        type="text"
                        className="input"
                        style={{ paddingLeft: '2.75rem', paddingRight: '1rem', borderRadius: '2rem', width: '100%', fontSize: '1rem', height: '3rem' }}
                        placeholder={t('explore_search')}
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                    {search && (
                        <button
                            onClick={() => setSearch('')}
                            style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', opacity: 0.5, fontSize: '1.1rem', color: 'inherit' }}
                        >
                            ✕
                        </button>
                    )}
                </div>
            </div>

            {/* Join by code */}
            <div className="mx-auto mb-2" style={{ maxWidth: '520px', padding: '0 1.5rem 2rem' }}>
                <div style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: '16px', padding: '1.1rem 1.25rem' }}>
                    <div className="flex items-center gap-2 mb-2">
                        <LinkIcon size={14} style={{ color: 'var(--color-primary)', opacity: 0.8 }} />
                        <span style={{ fontSize: '0.82rem', fontWeight: 600, opacity: 0.65 }}>Rejoindre par code d'invitation</span>
                    </div>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={codeInput}
                            onChange={e => setCodeInput(e.target.value.toUpperCase())}
                            onKeyDown={e => e.key === 'Enter' && codeInput.trim() && router.push(`/join/${codeInput.trim()}`)}
                            placeholder="Ex: AB12CD34"
                            maxLength={12}
                            style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '0.5rem 0.9rem', color: 'inherit', outline: 'none', fontSize: '0.9rem', fontFamily: 'monospace', letterSpacing: '0.08em' }}
                        />
                        <button
                            onClick={() => codeInput.trim() && router.push(`/join/${codeInput.trim()}`)}
                            disabled={!codeInput.trim()}
                            style={{ padding: '0.5rem 1.1rem', borderRadius: '10px', fontSize: '0.85rem', fontWeight: 600, background: 'var(--color-primary)', color: '#fff', border: 'none', cursor: !codeInput.trim() ? 'not-allowed' : 'pointer', opacity: !codeInput.trim() ? 0.5 : 1, flexShrink: 0 }}
                        >
                            Rejoindre
                        </button>
                    </div>
                </div>
            </div>

            <div className="container" style={{ maxWidth: '1100px', padding: '2.5rem 1.5rem' }}>

                {/* TABS */}
                <div className="flex gap-6 mb-8 border-b border-white/10 pb-0">
                    <button
                        onClick={() => { setExploreTab('objectives'); setActiveCategory('tous'); setSearch(''); }}
                        className={`pb-3 px-2 text-lg font-bold transition-all relative ${exploreTab === 'objectives' ? 'text-indigo-400' : 'text-slate-400 hover:text-slate-200'}`}
                    >
                        Objectifs
                        {exploreTab === 'objectives' && <div className="absolute bottom-[-1px] left-0 w-full h-[3px] bg-indigo-500 rounded-t-md" />}
                    </button>
                    <button
                        onClick={() => { setExploreTab('projects'); setActiveCategory('tous'); setSearch(''); }}
                        className={`pb-3 px-2 text-lg font-bold transition-all relative ${exploreTab === 'projects' ? 'text-emerald-400' : 'text-slate-400 hover:text-slate-200'}`}
                    >
                        Projets Collaboratifs
                        {exploreTab === 'projects' && <div className="absolute bottom-[-1px] left-0 w-full h-[3px] bg-emerald-500 rounded-t-md" />}
                    </button>
                </div>

                {/* Category pill filters */}
                <div className="flex gap-3 flex-wrap mb-8 fade-enter" style={{ animationDelay: '0.1s' }}>
                    {/* "Tous" pill */}
                    <button
                        onClick={() => setActiveCategory('tous')}
                        style={{
                            padding: '0.45rem 1.1rem',
                            borderRadius: '2rem',
                            border: `2px solid ${activeCategory === 'tous' ? 'var(--color-primary)' : 'var(--color-border)'}`,
                            background: activeCategory === 'tous' ? 'rgba(99,102,241,0.15)' : 'transparent',
                            color: activeCategory === 'tous' ? 'var(--color-primary)' : 'inherit',
                            fontWeight: activeCategory === 'tous' ? 700 : 400,
                            cursor: 'pointer',
                            fontSize: '0.9rem',
                            transition: 'all 0.2s ease',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.4rem'
                        }}
                    >
                        🌐 {t('explore_all')}
                        <span style={{ fontSize: '0.75rem', background: 'rgba(99,102,241,0.2)', borderRadius: '10px', padding: '0 6px', marginLeft: '2px' }}>
                            {publicObjectives.length}
                        </span>
                    </button>

                    {categories.map((cat, i) => {
                        const color = CATEGORY_COLORS[i % CATEGORY_COLORS.length];
                        const isActive = activeCategory === cat;
                        const count = activeListData.filter(o => {
                            const cats = (Array.isArray(o.category) ? o.category : [o.category]).filter(Boolean);
                            return cats.some((c: any) => c.toLowerCase() === cat.toLowerCase());
                        }).length;
                        return (
                            <button
                                key={cat}
                                onClick={() => setActiveCategory(cat)}
                                style={{
                                    padding: '0.45rem 1.1rem',
                                    borderRadius: '2rem',
                                    border: `2px solid ${isActive ? color : 'var(--color-border)'}`,
                                    background: isActive ? `${color}22` : 'transparent',
                                    color: isActive ? color : 'inherit',
                                    fontWeight: isActive ? 700 : 400,
                                    cursor: 'pointer',
                                    fontSize: '0.9rem',
                                    transition: 'all 0.2s ease',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.4rem'
                                }}
                            >
                                {getCategoryIcon(cat)} {cat}
                                <span style={{ fontSize: '0.75rem', background: `${color}22`, borderRadius: '10px', padding: '0 6px', color, marginLeft: '2px' }}>
                                    {count}
                                </span>
                            </button>
                        );
                    })}
                </div>

                {/* Results count */}
                {!loading && (
                    <div className="flex items-center justify-between mb-5">
                        <p className="text-secondary text-sm m-0">
                            {filtered.length > 0
                                ? <><TrendingUp size={14} className="inline mr-1" />{filtered.length} salon{filtered.length > 1 ? 's' : ''} trouvé{filtered.length > 1 ? 's' : ''}</>
                                : 'Aucun résultat'
                            }
                            {activeCategory !== 'tous' && (
                                <> dans <strong style={{ color: 'var(--color-primary)' }}>{activeCategory}</strong></>
                            )}
                        </p>
                        {(search || activeCategory !== 'tous') && (
                            <button className="btn btn-sm btn-ghost text-secondary" style={{ fontSize: '0.8rem' }} onClick={() => { setSearch(''); setActiveCategory('tous'); }}>
                                ✕ Réinitialiser
                            </button>
                        )}
                    </div>
                )}

                {/* Grid */}
                {loading ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
                        {[1, 2, 3, 4, 5, 6].map(i => (
                            <div key={i} className="card card-glass" style={{ height: '220px', animation: 'pulse 1.5s ease infinite', opacity: 0.4 }} />
                        ))}
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="card card-glass text-center py-20 fade-enter">
                        <Compass size={56} className="mx-auto mb-4 opacity-20" />
                        <h3 className="text-secondary mb-2">Aucun salon trouvé</h3>
                        <p className="opacity-50">
                            {search ? `Aucun résultat pour "${search}"` : t('explore_empty')}
                        </p>
                        {(search || activeCategory !== 'tous') && (
                            <button className="btn btn-sm btn-outline mt-4" onClick={() => { setSearch(''); setActiveCategory('tous'); }}>
                                Voir tous les salons
                            </button>
                        )}
                    </div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
                        {filtered.map((item, i) => {
                            const firstCat = Array.isArray(item.category) ? item.category[0] : item.category;
                            const catIndex = categories.indexOf(firstCat);
                            const accentColor = exploreTab === 'projects' ? '#10b981' : (catIndex >= 0 ? CATEGORY_COLORS[catIndex % CATEGORY_COLORS.length] : '#6366f1');
                            const joined = exploreTab === 'objectives' ? alreadyJoined.has(item.id) : alreadyJoinedProjects.has(item.id);
                            const joining = joiningId === item.id;

                            const membersList = exploreTab === 'objectives' ? objectiveMembers : projectMembers;
                            const members = membersList[item.id] || [];
                            const memberCount = Math.max(members.length, item.participants_count || 1);

                            return (
                                <div
                                    key={item.id}
                                    className="card card-glass fade-enter"
                                    style={{
                                        animationDelay: `${i * 0.07}s`,
                                        display: 'flex',
                                        flexDirection: 'column',
                                        borderLeft: `3px solid ${accentColor}`,
                                        transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                                        cursor: 'pointer',
                                        position: 'relative',
                                        overflow: 'hidden'
                                    }}
                                    onMouseEnter={e => {
                                        (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-3px)';
                                        (e.currentTarget as HTMLDivElement).style.boxShadow = `0 8px 32px ${accentColor}33`;
                                    }}
                                    onMouseLeave={e => {
                                        (e.currentTarget as HTMLDivElement).style.transform = '';
                                        (e.currentTarget as HTMLDivElement).style.boxShadow = '';
                                    }}
                                    onClick={() => joined ? router.push(`/${exploreTab === 'objectives' ? 'objective' : 'project'}/${item.id}`) : undefined}
                                >
                                    {/* Subtle glow bg */}
                                    <div style={{ position: 'absolute', top: '-20px', right: '-20px', width: '80px', height: '80px', borderRadius: '50%', background: `${accentColor}18`, pointerEvents: 'none' }} />

                                    {/* Category tags */}
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex flex-wrap gap-1">
                                            {(Array.isArray(item.category) ? item.category : [item.category]).filter(Boolean).map((cat: any, idx: number) => (
                                                <span
                                                    key={idx}
                                                    className="badge"
                                                    style={{ background: `${accentColor}22`, color: accentColor, border: `1px solid ${accentColor}44`, fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: '10px' }}
                                                >
                                                    {getCategoryIcon(cat)} {cat}
                                                </span>
                                            ))}
                                            {exploreTab === 'projects' && (
                                                <span className="badge" style={{ background: `rgba(255,255,255,0.05)`, color: 'rgba(255,255,255,0.7)', border: `1px solid rgba(255,255,255,0.1)`, fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: '10px' }}>
                                                    {item.methodology === 'scrum' ? 'Scrum Agile' : 'Kanban'}
                                                </span>
                                            )}
                                        </div>
                                        <span className="flex items-center gap-1 text-secondary" style={{ fontSize: '0.8rem' }}>
                                            <Users size={13} /> {memberCount}
                                        </span>
                                    </div>

                                    {/* Title */}
                                    <h3 style={{ fontSize: '1.15rem', marginBottom: '0.5rem', lineHeight: 1.3 }}>{item.title}</h3>

                                    {/* Target hours pill / Methodology details */}
                                    {exploreTab === 'objectives' ? (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '1rem', fontSize: '0.82rem', opacity: 0.65 }}>
                                            <Clock size={12} />
                                            <span>{item.target_hours}h {t('explore_target')}</span>
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '1rem', fontSize: '0.82rem', opacity: 0.65 }}>
                                            <Compass size={12} />
                                            <span>{item.description ? (item.description.length > 50 ? item.description.substring(0, 50) + '...' : item.description) : 'Projet d\'équipe collaboratif'}</span>
                                        </div>
                                    )}

                                    {/* Mini avatar row */}
                                    <div style={{ display: 'flex', marginBottom: '1rem' }}>
                                        {members.slice(0, 4).map((m, j) => (
                                            <Avatar
                                                key={m.uid}
                                                uid={m.uid}
                                                avatarStyle={m.avatar_style}
                                                avatarUrl={m.avatar_url}
                                                size={28}
                                                style={{ border: '2px solid var(--color-bg)', marginLeft: j === 0 ? 0 : '-8px' }}
                                            />
                                        ))}
                                        {memberCount > 4 && (
                                            <div style={{ width: '28px', height: '28px', borderRadius: '50%', border: '2px solid var(--color-bg)', marginLeft: '-8px', background: `${accentColor}33`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 700, color: accentColor, zIndex: 10 }}>
                                                +{memberCount - 4}
                                            </div>
                                        )}
                                        {members.length === 0 && (
                                            <Avatar
                                                uid={item.creator_id || 'unknown'}
                                                size={28}
                                                style={{ border: '2px solid var(--color-bg)' }}
                                            />
                                        )}
                                    </div>

                                    {/* CTA */}
                                    <div className="mt-auto pt-3 flex items-center gap-2" style={{ borderTop: '1px solid var(--color-border)' }}>
                                        {joined ? (
                                            <Link href={`/${exploreTab === 'objectives' ? 'objective' : 'project'}/${item.id}`} className="btn btn-sm w-full" style={{ justifyContent: 'center', background: `${accentColor}22`, color: accentColor, border: `1px solid ${accentColor}55`, width: '100%' }}>
                                                ✓ Déjà membre · Ouvrir
                                            </Link>
                                        ) : (
                                            <button
                                                className="btn btn-sm w-full"
                                                style={{
                                                    justifyContent: 'center',
                                                    background: joining ? 'transparent' : accentColor,
                                                    color: '#fff',
                                                    border: `1px solid ${accentColor}`,
                                                    opacity: joining ? 0.6 : 1,
                                                    width: '100%',
                                                    transition: 'all 0.2s ease'
                                                }}
                                                onClick={() => handleJoin(item.id, exploreTab)}
                                                disabled={joining}
                                            >
                                                {joining ? '...' : <>✨ {t('explore_btn_join')}</>}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Private objective CTA */}
                <div
                    className="mt-16 card card-glass fade-enter"
                    style={{
                        display: 'flex',
                        flexDirection: 'row',
                        gap: '1.5rem',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        background: 'rgba(99,102,241,0.06)',
                        border: '1px solid rgba(99,102,241,0.2)',
                        padding: '1.75rem 2rem'
                    }}
                >
                    <div className="flex items-start gap-4">
                        <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(99,102,241,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <Lock size={22} style={{ color: 'var(--color-primary)' }} />
                        </div>
                        <div>
                            <h3 className="mb-1" style={{ color: 'var(--color-primary)', fontSize: '1.1rem' }}>{t('explore_alone_title')}</h3>
                            <p className="text-sm m-0" style={{ opacity: 0.7 }}>{t('explore_alone_desc')}</p>
                        </div>
                    </div>
                    <Link href="/dashboard" className="btn btn-primary shadow-glow" style={{ whiteSpace: 'nowrap' }}>
                        <Sparkles size={16} style={{ marginRight: '6px' }} />
                        {t('explore_btn_private')}
                    </Link>
                </div>
            </div>
        </div>
    );
}
