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
            <style>{`
                @keyframes ex-shimmer { from { transform: translateX(-100%); } to { transform: translateX(200%); } }
                @keyframes ex-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
                .ex-card { animation: ex-in 0.38s cubic-bezier(0.22,1,0.36,1) both; }
                .ex-skel { position: relative; overflow: hidden; background: rgba(255,255,255,0.03); border-radius: 14px; }
                .ex-skel::after { content: ''; position: absolute; inset: 0; background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.045) 50%, transparent 100%); animation: ex-shimmer 1.5s ease infinite; }
                .ex-chip { transition: all 0.15s !important; }
                .ex-chip:not([data-active]):hover { border-color: rgba(255,255,255,0.18) !important; color: rgba(255,255,255,0.65) !important; }
                .ex-join:hover:not(:disabled) { filter: brightness(1.12); transform: translateY(-1px); }
            `}</style>

            {/* ── Hero ── */}
            <div className="fade-enter" style={{ padding: '4rem 1.5rem 2.5rem', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
                {/* Grid texture */}
                <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(99,102,241,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.035) 1px, transparent 1px)', backgroundSize: '52px 52px', pointerEvents: 'none', maskImage: 'radial-gradient(ellipse 80% 60% at 50% 0%, black 40%, transparent 100%)' }} />
                <div style={{ position: 'absolute', top: '-80px', left: '50%', transform: 'translateX(-50%)', width: '760px', height: '380px', background: 'radial-gradient(ellipse, rgba(99,102,241,0.09) 0%, transparent 65%)', pointerEvents: 'none' }} />

                <div style={{ position: 'relative' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '3px 12px', background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.16)', borderRadius: '100px', fontSize: '0.66rem', fontWeight: 800, color: '#818cf8', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '1.2rem' }}>
                        <Compass size={10} /> Explorer la communauté
                    </div>
                    <h1 style={{ fontSize: 'clamp(1.9rem, 4.5vw, 3rem)', fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 1.08, marginBottom: '0.85rem' }} className="text-gradient">
                        {t('explore_title')}
                    </h1>
                    <p style={{ fontSize: '0.95rem', maxWidth: '480px', margin: '0 auto 1.9rem', color: 'rgba(255,255,255,0.38)', lineHeight: 1.55 }}>
                        {t('explore_subtitle')}
                    </p>

                    {/* Search */}
                    <div style={{ maxWidth: '560px', margin: '0 auto 0.9rem', position: 'relative' }}>
                        <Search size={15} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.25)', pointerEvents: 'none' }} />
                        <input
                            type="text"
                            className="input"
                            style={{ paddingLeft: '2.7rem', paddingRight: search ? '2.5rem' : '1rem', borderRadius: '14px', width: '100%', fontSize: '0.9rem', height: '48px', boxSizing: 'border-box', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', transition: 'border-color 0.2s, box-shadow 0.2s' }}
                            placeholder={t('explore_search')}
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            onFocus={e => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.4)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.09)'; }}
                            onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.boxShadow = 'none'; }}
                        />
                        {search && (
                            <button onClick={() => setSearch('')} style={{ position: 'absolute', right: '0.8rem', top: '50%', transform: 'translateY(-50%)', width: '18px', height: '18px', borderRadius: '50%', background: 'rgba(255,255,255,0.08)', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.5)', fontSize: '0.6rem', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>✕</button>
                        )}
                    </div>

                    {/* Join by code — compact inline */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '7px', justifyContent: 'center' }}>
                        <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.2)', fontWeight: 500 }}>ou rejoindre via code :</span>
                        <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                            <LinkIcon size={10} style={{ position: 'absolute', left: '8px', color: 'rgba(255,255,255,0.22)', pointerEvents: 'none' }} />
                            <input
                                type="text"
                                value={codeInput}
                                onChange={e => setCodeInput(e.target.value.toUpperCase())}
                                onKeyDown={e => e.key === 'Enter' && codeInput.trim() && router.push(`/join/${codeInput.trim()}`)}
                                placeholder="CODE"
                                maxLength={12}
                                style={{ width: '90px', height: '28px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '0 0.5rem 0 1.5rem', color: 'inherit', outline: 'none', fontSize: '0.68rem', fontFamily: 'monospace', letterSpacing: '0.1em', boxSizing: 'border-box' }}
                            />
                        </div>
                        <button
                            onClick={() => codeInput.trim() && router.push(`/join/${codeInput.trim()}`)}
                            disabled={!codeInput.trim()}
                            style={{ padding: '0 10px', height: '28px', borderRadius: '8px', fontSize: '0.7rem', fontWeight: 700, background: codeInput.trim() ? 'rgba(99,102,241,0.8)' : 'rgba(99,102,241,0.18)', color: codeInput.trim() ? '#fff' : 'rgba(255,255,255,0.25)', border: 'none', cursor: !codeInput.trim() ? 'not-allowed' : 'pointer', transition: 'all 0.15s' }}
                        >→</button>
                    </div>
                </div>
            </div>

            <div className="container" style={{ maxWidth: '1100px', padding: '0 1.5rem 4rem' }}>

                {/* Tabs + count row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', gap: '1rem', flexWrap: 'wrap', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 0 }}>
                    <div style={{ display: 'flex', gap: 0 }}>
                        {([
                            { key: 'objectives', label: 'Objectifs', count: publicObjectives.length, color: '#818cf8' },
                            { key: 'projects',   label: 'Projets',   count: publicProjects.length,   color: '#34d399' },
                        ] as const).map(tab => {
                            const isAct = exploreTab === tab.key;
                            return (
                                <button
                                    key={tab.key}
                                    onClick={() => { setExploreTab(tab.key); setActiveCategory('tous'); setSearch(''); }}
                                    style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: '7px', padding: '9px 18px 12px', fontSize: '0.87rem', fontWeight: isAct ? 700 : 500, cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.2s', background: 'transparent', color: isAct ? '#f4f4f5' : 'rgba(255,255,255,0.3)', border: 'none' }}
                                >
                                    {tab.label}
                                    <span style={{ fontSize: '0.62rem', fontWeight: 700, padding: '1px 6px', borderRadius: 20, background: isAct ? tab.color + '1e' : 'rgba(255,255,255,0.05)', color: isAct ? tab.color : 'rgba(255,255,255,0.22)' }}>{tab.count}</span>
                                    {isAct && <span style={{ position: 'absolute', bottom: -1, left: 14, right: 14, height: '2px', background: `linear-gradient(90deg, ${tab.color}, ${tab.color}60)`, borderRadius: '2px 2px 0 0', boxShadow: `0 0 8px ${tab.color}50` }} />}
                                </button>
                            );
                        })}
                    </div>
                    {!loading && filtered.length > 0 && (
                        <p style={{ margin: 0, fontSize: '0.72rem', color: 'rgba(255,255,255,0.27)', fontWeight: 500 }}>
                            <TrendingUp size={11} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
                            {filtered.length} résultat{filtered.length > 1 ? 's' : ''}
                            {activeCategory !== 'tous' && <> · <strong style={{ color: 'rgba(255,255,255,0.5)' }}>{activeCategory}</strong></>}
                        </p>
                    )}
                </div>

                {/* Category chips */}
                <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginBottom: '1.75rem' }} className="fade-enter">
                    <button
                        onClick={() => setActiveCategory('tous')}
                        className="ex-chip"
                        data-active={activeCategory === 'tous' ? 'true' : undefined}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 11px', borderRadius: 30, fontSize: '0.7rem', fontWeight: activeCategory === 'tous' ? 700 : 500, border: activeCategory === 'tous' ? '1px solid rgba(99,102,241,0.45)' : '1px solid rgba(255,255,255,0.08)', background: activeCategory === 'tous' ? 'rgba(99,102,241,0.13)' : 'transparent', color: activeCategory === 'tous' ? '#a5b4fc' : 'rgba(255,255,255,0.35)', cursor: 'pointer', boxShadow: activeCategory === 'tous' ? '0 0 10px rgba(99,102,241,0.12)' : 'none', letterSpacing: '0.01em' }}
                    >
                        <span style={{ fontSize: '0.75rem' }}>🌐</span> Tous
                        <span style={{ fontSize: '0.58rem', fontWeight: 700, padding: '0 5px', borderRadius: 10, background: activeCategory === 'tous' ? 'rgba(99,102,241,0.22)' : 'rgba(255,255,255,0.07)', color: activeCategory === 'tous' ? '#a5b4fc' : 'rgba(255,255,255,0.28)' }}>{activeListData.length}</span>
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
                                className="ex-chip"
                                data-active={isActive ? 'true' : undefined}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 11px', borderRadius: 30, fontSize: '0.7rem', fontWeight: isActive ? 700 : 500, border: isActive ? `1px solid ${color}45` : '1px solid rgba(255,255,255,0.08)', background: isActive ? `${color}12` : 'transparent', color: isActive ? color : 'rgba(255,255,255,0.35)', cursor: 'pointer', boxShadow: isActive ? `0 0 10px ${color}12` : 'none', letterSpacing: '0.01em' }}
                            >
                                <span style={{ fontSize: '0.75rem' }}>{getCategoryIcon(cat)}</span> {cat}
                                <span style={{ fontSize: '0.58rem', fontWeight: 700, padding: '0 5px', borderRadius: 10, background: isActive ? `${color}20` : 'rgba(255,255,255,0.07)', color: isActive ? color : 'rgba(255,255,255,0.28)' }}>{count}</span>
                            </button>
                        );
                    })}

                    {(search || activeCategory !== 'tous') && (
                        <button
                            onClick={() => { setSearch(''); setActiveCategory('tous'); }}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 9px', borderRadius: 30, fontSize: '0.67rem', fontWeight: 600, border: '1px solid rgba(248,113,113,0.2)', background: 'rgba(248,113,113,0.05)', color: 'rgba(248,113,113,0.55)', cursor: 'pointer', transition: 'all 0.15s' }}
                        >
                            ✕ Réinitialiser
                        </button>
                    )}
                </div>

                {/* Grid */}
                {loading ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(288px, 1fr))', gap: '1.1rem' }}>
                        {[1,2,3,4,5,6].map(i => (
                            <div key={i} className="ex-skel" style={{ height: '230px', animationDelay: `${i * 0.05}s` }} />
                        ))}
                    </div>
                ) : filtered.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '5rem 2rem', background: 'rgba(255,255,255,0.012)', borderRadius: '16px', border: '1px dashed rgba(255,255,255,0.07)' }} className="fade-enter">
                        <div style={{ fontSize: '2.2rem', marginBottom: '0.9rem', opacity: 0.3 }}>🔍</div>
                        <h3 style={{ margin: '0 0 0.45rem', fontSize: '1.05rem', fontWeight: 700, color: 'rgba(255,255,255,0.55)' }}>Aucun salon trouvé</h3>
                        <p style={{ margin: '0 0 1.4rem', fontSize: '0.85rem', color: 'rgba(255,255,255,0.28)' }}>
                            {search ? `Aucun résultat pour "${search}"` : t('explore_empty')}
                        </p>
                        {(search || activeCategory !== 'tous') && (
                            <button onClick={() => { setSearch(''); setActiveCategory('tous'); }} style={{ padding: '6px 14px', borderRadius: 30, fontSize: '0.78rem', fontWeight: 600, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.45)', cursor: 'pointer' }}>
                                Voir tous les salons
                            </button>
                        )}
                    </div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(288px, 1fr))', gap: '1.1rem' }}>
                        {filtered.map((item, i) => {
                            const firstCat = Array.isArray(item.category) ? item.category[0] : item.category;
                            const catIndex = categories.indexOf(firstCat);
                            const accentColor = exploreTab === 'projects' ? '#10b981' : (catIndex >= 0 ? CATEGORY_COLORS[catIndex % CATEGORY_COLORS.length] : '#6366f1');
                            const joined = exploreTab === 'objectives' ? alreadyJoined.has(item.id) : alreadyJoinedProjects.has(item.id);
                            const joining = joiningId === item.id;
                            const membersList = exploreTab === 'objectives' ? objectiveMembers : projectMembers;
                            const members = membersList[item.id] || [];
                            const memberCount = Math.max(members.length, item.participants_count || 1);
                            const catIcon = getCategoryIcon(firstCat);

                            return (
                                <div
                                    key={item.id}
                                    className="ex-card"
                                    style={{ animationDelay: `${i * 0.04}s`, display: 'flex', flexDirection: 'column', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(13,13,18,0.94)', overflow: 'hidden', transition: 'transform 0.2s ease, box-shadow 0.2s ease', cursor: 'pointer', position: 'relative' }}
                                    onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-4px)'; (e.currentTarget as HTMLDivElement).style.boxShadow = `0 14px 40px -8px ${accentColor}28, 0 0 0 1px ${accentColor}16`; }}
                                    onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = ''; (e.currentTarget as HTMLDivElement).style.boxShadow = ''; }}
                                    onClick={() => joined ? router.push(`/${exploreTab === 'objectives' ? 'objective' : 'project'}/${item.id}`) : undefined}
                                >
                                    {/* Top accent strip */}
                                    <div style={{ height: '3px', background: `linear-gradient(90deg, ${accentColor}, ${accentColor}35)`, flexShrink: 0 }} />

                                    <div style={{ padding: '1rem 1.15rem 0.9rem', flex: 1, display: 'flex', flexDirection: 'column' }}>

                                        {/* Icon + member count */}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                                            <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: `${accentColor}10`, border: `1px solid ${accentColor}1c`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.15rem', flexShrink: 0 }}>
                                                {catIcon}
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)', fontWeight: 500 }}>
                                                <Users size={10} /> {memberCount}
                                            </div>
                                        </div>

                                        {/* Title */}
                                        <h3 style={{ margin: '0 0 0.4rem', fontSize: '0.98rem', fontWeight: 700, color: '#eeeef2', letterSpacing: '-0.02em', lineHeight: 1.25, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const }}>
                                            {item.title}
                                        </h3>

                                        {/* Description / meta */}
                                        <p style={{ margin: '0 0 0.75rem', fontSize: '0.76rem', color: 'rgba(255,255,255,0.32)', lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const }}>
                                            {exploreTab === 'objectives'
                                                ? `Objectif · ${item.target_hours}h ${item.goal_frequency === 'daily' ? 'par jour' : item.goal_frequency === 'weekly' ? 'par semaine' : 'total'}`
                                                : (item.description || "Projet collaboratif d'équipe")}
                                        </p>

                                        {/* Tags */}
                                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '0.8rem' }}>
                                            {(Array.isArray(item.category) ? item.category : [item.category]).filter(Boolean).slice(0, 2).map((cat: any, idx: number) => (
                                                <span key={idx} style={{ fontSize: '0.62rem', fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: `${accentColor}0e`, border: `1px solid ${accentColor}1c`, color: accentColor, letterSpacing: '0.02em' }}>{cat}</span>
                                            ))}
                                            {exploreTab === 'projects' && item.methodology && (
                                                <span style={{ fontSize: '0.62rem', fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.35)', letterSpacing: '0.02em' }}>
                                                    {item.methodology === 'scrum' ? 'Scrum' : 'Kanban'}
                                                </span>
                                            )}
                                        </div>

                                        {/* Avatars */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '0.8rem' }}>
                                            <div style={{ display: 'flex' }}>
                                                {(members.length > 0 ? members : [{ uid: item.creator_id || 'unknown' }]).slice(0, 4).map((m, j) => (
                                                    <Avatar key={(m as any).uid} uid={(m as any).uid} avatarStyle={(m as any).avatar_style} avatarUrl={(m as any).avatar_url} size={22} style={{ border: '2px solid #0d0d12', marginLeft: j === 0 ? 0 : '-5px', zIndex: 4 - j }} />
                                                ))}
                                                {memberCount > 4 && (
                                                    <div style={{ width: '22px', height: '22px', borderRadius: '50%', border: '2px solid #0d0d12', marginLeft: '-5px', background: `${accentColor}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.5rem', fontWeight: 700, color: accentColor }}>+{memberCount - 4}</div>
                                                )}
                                            </div>
                                            <span style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.22)', fontWeight: 500 }}>{memberCount} membre{memberCount > 1 ? 's' : ''}</span>
                                        </div>

                                        {/* CTA */}
                                        <div style={{ marginTop: 'auto', paddingTop: '0.7rem', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                                            {joined ? (
                                                <Link
                                                    href={`/${exploreTab === 'objectives' ? 'objective' : 'project'}/${item.id}`}
                                                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', padding: '7px', borderRadius: '9px', background: `${accentColor}0e`, color: accentColor, border: `1px solid ${accentColor}22`, fontSize: '0.75rem', fontWeight: 700, textDecoration: 'none', letterSpacing: '0.01em' }}
                                                    onClick={e => e.stopPropagation()}
                                                >
                                                    ✓ Membre · Ouvrir →
                                                </Link>
                                            ) : (
                                                <button
                                                    className="ex-join"
                                                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', width: '100%', padding: '7px', borderRadius: '9px', background: joining ? 'transparent' : accentColor, color: '#fff', border: `1px solid ${joining ? accentColor + '35' : accentColor}`, fontSize: '0.75rem', fontWeight: 700, cursor: joining ? 'not-allowed' : 'pointer', opacity: joining ? 0.5 : 1, letterSpacing: '0.01em', transition: 'all 0.2s ease' }}
                                                    onClick={e => { e.stopPropagation(); handleJoin(item.id, exploreTab); }}
                                                    disabled={joining}
                                                >
                                                    {joining ? '...' : 'Rejoindre →'}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Private CTA */}
                <div className="fade-enter" style={{ marginTop: '3.5rem', display: 'flex', flexDirection: 'row', gap: '1.5rem', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', background: 'rgba(99,102,241,0.04)', border: '1px solid rgba(99,102,241,0.13)', borderRadius: '14px', padding: '1.4rem 1.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(99,102,241,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <Lock size={19} style={{ color: '#818cf8' }} />
                        </div>
                        <div>
                            <h3 style={{ margin: '0 0 2px', color: '#a5b4fc', fontSize: '0.98rem', fontWeight: 700 }}>{t('explore_alone_title')}</h3>
                            <p style={{ margin: 0, fontSize: '0.8rem', color: 'rgba(255,255,255,0.38)' }}>{t('explore_alone_desc')}</p>
                        </div>
                    </div>
                    <Link href="/dashboard" className="btn btn-primary shadow-glow" style={{ whiteSpace: 'nowrap', fontSize: '0.82rem', padding: '8px 16px' }}>
                        <Sparkles size={13} style={{ marginRight: '5px' }} />
                        {t('explore_btn_private')}
                    </Link>
                </div>
            </div>
        </div>
    );
}
