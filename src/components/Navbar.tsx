'use client';

import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from '@/context/LocaleContext';
import { auth, db } from '@/lib/firebase';
import { signOut } from 'firebase/auth';
import { useRouter, usePathname } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import { collection, query, where, onSnapshot, orderBy, updateDoc, doc, getDocs, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { Bell, Zap, LogOut, User as UserIcon, Settings, ChevronDown } from 'lucide-react';
import { useUI } from '@/context/UIContext';
import { useLiveSession } from '@/context/LiveSessionContext';
import Avatar from './Avatar';

export default function Navbar() {
    const { user, loading } = useAuth();
    const { locale, setLocale, t } = useLocale();
    const router = useRouter();
    const pathname = usePathname();
    const { isNavbarVisible, isWorking } = useUI();
    const { sessionInfo } = useLiveSession();
    const isSession = pathname?.startsWith('/session');

    const [notifications, setNotifications] = useState<any[]>([]);
    const [showNotifs, setShowNotifs] = useState(false);
    const [showUserMenu, setShowUserMenu] = useState(false);
    const [userData, setUserData] = useState<any>(null);
    const [unreadMessagesMap, setUnreadMessagesMap] = useState<Record<string, number>>({});
    const [friendRequestCount, setFriendRequestCount] = useState(0);
    const [accountabilityCount, setAccountabilityCount] = useState(0);
    const notifRef = useRef<HTMLDivElement>(null);
    const userMenuRef = useRef<HTMLDivElement>(null);

    const activeSession = !isSession ? sessionInfo : null;

    useEffect(() => {
        if (!user) return;
        const q = query(collection(db, 'users', user.uid, 'notifications'), orderBy('created_at', 'desc'));
        const unsubNotifs = onSnapshot(q, snap => {
            setNotifications(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });
        let unsubs: (() => void)[] = [];
        const loadConversations = async () => {
            const q1 = query(collection(db, 'friendships'), where('user1_id', '==', user.uid), where('status', '==', 'accepted'));
            const q2 = query(collection(db, 'friendships'), where('user2_id', '==', user.uid), where('status', '==', 'accepted'));
            const [s1, s2] = await Promise.all([getDocs(q1), getDocs(q2)]);
            const seen = new Set<string>();
            const unique = [...s1.docs, ...s2.docs].filter(d => { if (seen.has(d.id)) return false; seen.add(d.id); return true; });
            unique.forEach(d => {
                const data = d.data();
                const friendUid = data.user1_id === user.uid ? data.user2_id : data.user1_id;
                const convId = [user.uid, friendUid].sort().join('_');
                const msgQ = query(collection(db, 'direct_messages', convId, 'messages'), where('sender_id', '==', friendUid), where('read', '==', false));
                unsubs.push(onSnapshot(msgQ, snap => { setUnreadMessagesMap(prev => ({ ...prev, [convId]: snap.size })); }));
            });
        };
        loadConversations();
        return () => { unsubNotifs(); unsubs.forEach(u => u()); };
    }, [user]);

    useEffect(() => {
        if (!user) { setUserData(null); return; }
        const unsubscribe = onSnapshot(doc(db, 'users', user.uid), (docSnap) => {
            if (docSnap.exists()) setUserData(docSnap.data());
        });
        return () => unsubscribe();
    }, [user]);

    useEffect(() => {
        if (!user) { setFriendRequestCount(0); setAccountabilityCount(0); return; }
        const unsubFriends = onSnapshot(query(collection(db, 'friendships'), where('user2_id', '==', user.uid), where('status', '==', 'pending')), snap => setFriendRequestCount(snap.size));
        const unsubAcc = onSnapshot(query(collection(db, 'accountability_pairs'), where('user2_id', '==', user.uid), where('status', '==', 'pending')), snap => setAccountabilityCount(snap.size));
        return () => { unsubFriends(); unsubAcc(); };
    }, [user]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (notifRef.current && !notifRef.current.contains(event.target as Node)) setShowNotifs(false);
            if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) setShowUserMenu(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const SHOWN_TYPES = ['session_add', 'session_update', 'friend_request', 'friend_accept', 'accountability_invite', 'accountability_accepted', 'accountability_nudge', 'project_invite'];
    const visibleNotifications = notifications.filter((n: any) => SHOWN_TYPES.includes(n.type));
    const unreadCount = visibleNotifications.filter((n: any) => !n.read).length;
    const totalUnreadMessages = Object.values(unreadMessagesMap).reduce((a, b) => a + b, 0);

    const notifLink = (n: any): string => {
        if (n.link) return n.link;
        if (n.type === 'friend_request' || n.type === 'friend_accept') return '/friends';
        if (n.type === 'session_add' || n.type === 'session_update') return '/calendar';
        if (n.type === 'project_invite' && n.project_id) return `/project/${n.project_id}`;
        return '/dashboard';
    };
    const notifIcon = (type: string) => {
        if (type === 'friend_request' || type === 'friend_accept') return '👥';
        if (type === 'session_add' || type === 'session_update') return '📅';
        if (type === 'accountability_invite' || type === 'accountability_accepted') return '🤝';
        if (type === 'accountability_nudge') return '💪';
        if (type === 'project_invite') return '🚀';
        return '🔔';
    };

    const handleAcceptProjectInvite = async (n: any) => {
        if (!user) return;
        try {
            await setDoc(doc(db, 'project_memberships', `${user.uid}_${n.project_id}`), { user_id: user.uid, project_id: n.project_id, role: n.role || 'member', joined_at: new Date().toISOString() });
            await updateDoc(doc(db, 'users', user.uid, 'notifications', n.id), { read: true, accepted: true });
            router.push(`/project/${n.project_id}`); setShowNotifs(false);
        } catch (err) { console.error(err); }
    };
    const handleDeclineProjectInvite = async (n: any) => {
        if (!user) return;
        try { await deleteDoc(doc(db, 'users', user.uid, 'notifications', n.id)); }
        catch (err) { console.error(err); }
    };
    const isActive = (href: string) => pathname === href || (href !== '/dashboard' && pathname?.startsWith(href));
    const handleMarkAllRead = async () => {
        if (!user) return;
        for (const n of notifications.filter((n: any) => !n.read))
            await updateDoc(doc(db, 'users', user.uid, 'notifications', n.id), { read: true });
    };
    const handleLogout = async () => { await signOut(auth); router.push('/'); };

    if (!isNavbarVisible) return null;

    const NAV_LINKS = [
        { href: '/dashboard',      label: t('nav_dashboard'),  badge: 0 },
        { href: '/explore',        label: t('nav_explore'),    badge: 0 },
        { href: '/calendar',       label: 'Calendrier',        badge: 0 },
        { href: '/friends',        label: t('nav_friends'),    badge: friendRequestCount },
        { href: '/accountability', label: 'Accountability',    badge: accountabilityCount },
        { href: '/messages',       label: t('nav_messages'),   badge: totalUnreadMessages },
    ];

    return (
        <>
            <style>{`
                @keyframes nb-pulse { 0%,100%{box-shadow:0 0 0 0 rgba(16,185,129,.5)} 50%{box-shadow:0 0 0 4px rgba(16,185,129,0)} }
                @keyframes nb-in    { from{opacity:0;transform:translateY(-8px) scale(.97)} to{opacity:1;transform:translateY(0) scale(1)} }
                @keyframes nb-dot   { 0%,100%{opacity:1} 50%{opacity:.4} }

                /* Link reset */
                .nb-navlink {
                    position: relative;
                    display: inline-flex; align-items: center; gap: 5px;
                    padding: 5px 12px;
                    border-radius: 8px;
                    font-size: .79rem;
                    font-weight: 500;
                    letter-spacing: -.01em;
                    text-decoration: none;
                    white-space: nowrap;
                    transition: color .2s, background .2s;
                    color: rgba(255,255,255,.38);
                }
                .nb-navlink:hover { color: rgba(255,255,255,.72) !important; background: rgba(255,255,255,.04) !important; }
                .nb-navlink.active {
                    color: transparent !important;
                    background: linear-gradient(135deg,#fff 30%,#c4b5fd) !important;
                    -webkit-background-clip: text !important;
                    background-clip: text !important;
                    font-weight: 600;
                }
                /* the underline accent on active */
                .nb-navlink.active::after {
                    content: '';
                    position: absolute;
                    bottom: 2px; left: 50%;
                    transform: translateX(-50%);
                    width: 14px; height: 2px;
                    border-radius: 2px;
                    background: linear-gradient(90deg,#818cf8,#a78bfa);
                    box-shadow: 0 0 6px rgba(129,140,248,.7);
                }

                /* Icon buttons */
                .nb-icon { width:32px;height:32px;border-radius:8px;background:transparent;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,.35);transition:color .15s,background .15s; }
                .nb-icon:hover { color:rgba(255,255,255,.8); background:rgba(255,255,255,.06); }

                /* Dropdowns */
                .nb-panel {
                    animation: nb-in .2s cubic-bezier(.16,1,.3,1);
                    position: absolute; right: 0; top: calc(100% + 12px);
                    background: rgba(10,10,18,.96);
                    border: 1px solid rgba(255,255,255,.08);
                    border-radius: 18px;
                    overflow: hidden;
                    box-shadow: 0 4px 8px rgba(0,0,0,.15), 0 24px 64px rgba(0,0,0,.8), 0 0 0 1px rgba(0,0,0,.3), inset 0 1px 0 rgba(255,255,255,.06);
                    backdrop-filter: blur(32px);
                    z-index: 300;
                }
                .nb-panel-row { display:flex;align-items:flex-start;gap:10px;padding:11px 14px;font-size:.8rem;color:rgba(255,255,255,.5);cursor:pointer;transition:background .12s,color .12s;text-decoration:none; }
                .nb-panel-row:hover { background:rgba(255,255,255,.04); color:rgba(255,255,255,.85); }
                .nb-sep { height:1px; background:rgba(255,255,255,.06); margin:0; }
            `}</style>

            {/* ── Outer wrapper creates the gradient border ── */}
            <div style={{ position: 'fixed', top: 14, left: 0, right: 0, zIndex: 100, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
                {/* Gradient border shell */}
                <div style={{
                    pointerEvents: 'auto',
                    width: '100%', maxWidth: '1040px', margin: '0 16px',
                    borderRadius: '28px',
                    padding: '1px',
                    background: 'linear-gradient(135deg, rgba(99,102,241,.35) 0%, rgba(255,255,255,.08) 40%, rgba(139,92,246,.2) 70%, rgba(99,102,241,.1) 100%)',
                    boxShadow: '0 0 40px rgba(99,102,241,.08), 0 20px 60px rgba(0,0,0,.6)',
                }}>
                    {/* Inner nav */}
                    <nav style={{
                        display: 'flex', alignItems: 'center',
                        height: '54px',
                        borderRadius: '27px',
                        background: 'rgba(9,9,17,.92)',
                        backdropFilter: 'blur(32px) saturate(180%)',
                        WebkitBackdropFilter: 'blur(32px) saturate(180%)',
                        padding: '0 6px 0 16px',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', width: '100%', gap: 0 }}>

                            {/* ══════════ LOGO ══════════ */}
                            <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '9px', textDecoration: 'none', padding: '0 10px 0 4px', flexShrink: 0 }}>
                                {/* Mark: rounded square with gradient */}
                                <div style={{
                                    width: 28, height: 28, borderRadius: '8px', flexShrink: 0,
                                    background: isWorking
                                        ? 'linear-gradient(145deg,#059669,#10b981)'
                                        : 'linear-gradient(145deg,#4f46e5,#7c3aed)',
                                    boxShadow: isWorking
                                        ? '0 2px 12px rgba(16,185,129,.45), inset 0 1px 0 rgba(255,255,255,.25)'
                                        : '0 2px 12px rgba(99,102,241,.45), inset 0 1px 0 rgba(255,255,255,.25)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    position: 'relative', transition: 'all .4s',
                                }}>
                                    <Zap size={13} strokeWidth={3} style={{ color: '#fff', fill: '#fff' }} />
                                    {isWorking && (
                                        <span style={{ position: 'absolute', top: -2, right: -2, width: 6, height: 6, borderRadius: '50%', background: '#10b981', border: '1.5px solid rgba(9,9,17,.92)', animation: 'nb-pulse 2s infinite' }} />
                                    )}
                                </div>
                                <span style={{ fontSize: '.92rem', fontWeight: 800, letterSpacing: '-0.035em', color: '#f2f2ff' }}>
                                    Synkra
                                </span>
                                {isWorking && (
                                    <span style={{ fontSize: '.58rem', fontWeight: 700, color: '#10b981', letterSpacing: '.05em', opacity: .9 }}>FOCUS</span>
                                )}
                            </Link>

                            {/* Separator */}
                            <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,.07)', flexShrink: 0, marginRight: 10 }} />

                            {/* ══════════ NAV LINKS ══════════ */}
                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1px' }}>
                                {!loading && user && NAV_LINKS.map(({ href, label, badge }) => {
                                    const active = isActive(href);
                                    return (
                                        <Link key={href} href={href} className={`nb-navlink${active ? ' active' : ''}`}>
                                            {label}
                                            {badge > 0 && (
                                                <span style={{ minWidth: 15, height: 15, borderRadius: 8, background: 'rgba(239,68,68,.85)', color: '#fff', fontSize: '.55rem', fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px', lineHeight: 1, flexShrink: 0 }}>
                                                    {badge > 9 ? '9+' : badge}
                                                </span>
                                            )}
                                        </Link>
                                    );
                                })}
                            </div>

                            {/* Separator */}
                            <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,.07)', flexShrink: 0, marginLeft: 10 }} />

                            {/* ══════════ RIGHT ACTIONS ══════════ */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', paddingLeft: '10px', flexShrink: 0 }}>

                                {/* Active session pill */}
                                {activeSession && (
                                    <button
                                        onClick={() => router.push(`/session?id=${activeSession.objectiveId}`)}
                                        style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: '8px', background: 'rgba(16,185,129,.08)', border: '1px solid rgba(16,185,129,.2)', color: '#34d399', fontSize: '.72rem', fontWeight: 600, cursor: 'pointer', transition: 'background .15s', whiteSpace: 'nowrap', marginRight: 2 }}
                                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(16,185,129,.15)'}
                                        onMouseLeave={e => e.currentTarget.style.background = 'rgba(16,185,129,.08)'}
                                    >
                                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#10b981', flexShrink: 0, animation: 'nb-dot 1.4s ease-in-out infinite' }} />
                                        Retour à la salle
                                    </button>
                                )}

                                {/* Language */}
                                <button
                                    onClick={() => setLocale(locale === 'fr' ? 'en' : 'fr')}
                                    className="nb-icon"
                                    style={{ width: 'auto', padding: '0 8px', fontSize: '.68rem', fontWeight: 700, letterSpacing: '.03em', gap: 4 }}
                                    title="Changer de langue"
                                >
                                    {locale === 'fr' ? '🇫🇷' : '🇬🇧'}
                                </button>

                                {!loading && (
                                    <>
                                        {user ? (
                                            <>
                                                {/* Bell */}
                                                <div ref={notifRef} style={{ position: 'relative' }}>
                                                    <button
                                                        className="nb-icon"
                                                        onClick={() => { setShowNotifs(v => !v); if (!showNotifs) handleMarkAllRead(); }}
                                                        style={{ position: 'relative' }}
                                                    >
                                                        <Bell size={15} />
                                                        {unreadCount > 0 && (
                                                            <span style={{ position: 'absolute', top: 6, right: 6, width: 6, height: 6, borderRadius: '50%', background: '#f97316', border: '1.5px solid rgba(9,9,17,.92)', boxShadow: '0 0 5px rgba(249,115,22,.7)' }} />
                                                        )}
                                                    </button>

                                                    {showNotifs && (
                                                        <div className="nb-panel" style={{ width: 348, maxHeight: 440, overflowY: 'auto' }}>
                                                            <div style={{ padding: '14px 16px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                                <span style={{ fontWeight: 700, fontSize: '.85rem', color: '#f0f0f8' }}>Notifications</span>
                                                                {unreadCount > 0 && (
                                                                    <span style={{ fontSize: '.67rem', color: 'rgba(255,255,255,.3)', fontWeight: 500 }}>{unreadCount} non lue{unreadCount > 1 ? 's' : ''}</span>
                                                                )}
                                                            </div>
                                                            <div className="nb-sep" />

                                                            {visibleNotifications.length === 0 ? (
                                                                <div style={{ padding: '2.5rem 1.5rem', textAlign: 'center', color: 'rgba(255,255,255,.2)', fontSize: '.8rem' }}>
                                                                    <Bell size={22} style={{ margin: '0 auto 10px', opacity: .3 }} />
                                                                    {t('nav_no_notifs')}
                                                                </div>
                                                            ) : (
                                                                visibleNotifications.slice(0, 15).map((n: any) => (
                                                                    <div key={n.id} className="nb-panel-row"
                                                                        style={{ background: !n.read ? 'rgba(99,102,241,.06)' : 'transparent', cursor: n.type === 'project_invite' ? 'default' : 'pointer', display: 'block' }}
                                                                        onClick={n.type !== 'project_invite' ? () => { router.push(notifLink(n)); setShowNotifs(false); } : undefined}
                                                                    >
                                                                        <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                                                                            <span style={{ fontSize: '.95rem', flexShrink: 0, marginTop: 1 }}>{notifIcon(n.type)}</span>
                                                                            <div>
                                                                                <p style={{ margin: 0, fontSize: '.79rem', lineHeight: 1.45, color: n.read ? 'rgba(255,255,255,.45)' : 'rgba(255,255,255,.82)' }}>{n.message}</p>
                                                                                <p style={{ margin: '3px 0 0', fontSize: '.67rem', color: 'rgba(255,255,255,.22)' }}>
                                                                                    {n.created_at?.toDate ? n.created_at.toDate().toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
                                                                                </p>
                                                                            </div>
                                                                        </div>
                                                                        {n.type === 'project_invite' && !n.accepted && (
                                                                            <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
                                                                                <button onClick={e => { e.stopPropagation(); handleAcceptProjectInvite(n); }}
                                                                                    style={{ flex: 1, padding: '6px 0', borderRadius: '8px', fontWeight: 700, fontSize: '.73rem', cursor: 'pointer', background: 'rgba(99,102,241,.8)', color: '#fff', border: '1px solid rgba(99,102,241,.35)', transition: 'background .15s' }}
                                                                                    onMouseEnter={e => e.currentTarget.style.background = '#6366f1'}
                                                                                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(99,102,241,.8)'}
                                                                                >✓ Rejoindre</button>
                                                                                <button onClick={e => { e.stopPropagation(); handleDeclineProjectInvite(n); }}
                                                                                    style={{ flex: 1, padding: '6px 0', borderRadius: '8px', fontWeight: 700, fontSize: '.73rem', cursor: 'pointer', background: 'rgba(239,68,68,.07)', color: '#fca5a5', border: '1px solid rgba(239,68,68,.18)', transition: 'background .15s' }}
                                                                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,.14)'}
                                                                                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(239,68,68,.07)'}
                                                                                >✕ Décliner</button>
                                                                            </div>
                                                                        )}
                                                                        {n.type === 'project_invite' && n.accepted && (
                                                                            <p style={{ margin: '8px 0 0', fontSize: '.7rem', color: '#4ade80', fontWeight: 600 }}>✓ Invitation acceptée</p>
                                                                        )}
                                                                    </div>
                                                                ))
                                                            )}
                                                        </div>
                                                    )}
                                                </div>

                                                {/* User menu */}
                                                <div ref={userMenuRef} style={{ position: 'relative', paddingRight: 4 }}>
                                                    <button
                                                        onClick={() => setShowUserMenu(v => !v)}
                                                        style={{ display: 'flex', alignItems: 'center', gap: 6, background: showUserMenu ? 'rgba(255,255,255,.06)' : 'transparent', border: 'none', borderRadius: '10px', padding: '3px 4px 3px 3px', cursor: 'pointer', transition: 'background .15s' }}
                                                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,.06)'}
                                                        onMouseLeave={e => { if (!showUserMenu) e.currentTarget.style.background = 'transparent'; }}
                                                    >
                                                        {/* Avatar with gradient ring */}
                                                        <div style={{ borderRadius: '50%', padding: '1.5px', background: showUserMenu ? 'linear-gradient(135deg,#6366f1,#a78bfa)' : 'rgba(255,255,255,.15)', transition: 'background .2s' }}>
                                                            <div style={{ borderRadius: '50%', overflow: 'hidden', border: '1.5px solid rgba(9,9,17,.92)' }}>
                                                                <Avatar uid={user?.uid} avatarUrl={userData?.avatar_url} avatarStyle={userData?.avatar_style} size={30} />
                                                            </div>
                                                        </div>
                                                        <ChevronDown size={11} style={{ color: 'rgba(255,255,255,.3)', transition: 'transform .2s', transform: showUserMenu ? 'rotate(180deg)' : 'rotate(0)' }} />
                                                    </button>

                                                    {showUserMenu && (
                                                        <div className="nb-panel" style={{ width: 220 }}>
                                                            {/* Profile card */}
                                                            <div style={{ padding: '14px 16px', display: 'flex', gap: '11px', alignItems: 'center' }}>
                                                                <div style={{ borderRadius: '50%', padding: '1.5px', background: 'linear-gradient(135deg,#6366f1,#a78bfa)', flexShrink: 0 }}>
                                                                    <div style={{ borderRadius: '50%', overflow: 'hidden', border: '1.5px solid rgba(10,10,18,.96)' }}>
                                                                        <Avatar uid={user?.uid} avatarUrl={userData?.avatar_url} avatarStyle={userData?.avatar_style} size={32} />
                                                                    </div>
                                                                </div>
                                                                <div style={{ minWidth: 0 }}>
                                                                    <p style={{ margin: 0, fontWeight: 700, fontSize: '.82rem', color: '#f0f0f8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{userData?.full_name || 'Utilisateur'}</p>
                                                                    <p style={{ margin: 0, fontSize: '.67rem', color: 'rgba(255,255,255,.25)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '1px' }}>{user.email}</p>
                                                                </div>
                                                            </div>

                                                            <div className="nb-sep" />

                                                            <div style={{ padding: '6px' }}>
                                                                <Link href="/profile" onClick={() => setShowUserMenu(false)} className="nb-panel-row" style={{ borderRadius: '10px', gap: 9, display: 'flex', alignItems: 'center' }}>
                                                                    <UserIcon size={13} style={{ color: 'rgba(255,255,255,.3)', flexShrink: 0 }} /> {t('nav_profile')}
                                                                </Link>
                                                                <Link href="/settings" onClick={() => setShowUserMenu(false)} className="nb-panel-row" style={{ borderRadius: '10px', gap: 9, display: 'flex', alignItems: 'center' }}>
                                                                    <Settings size={13} style={{ color: 'rgba(255,255,255,.3)', flexShrink: 0 }} /> Paramètres
                                                                </Link>
                                                            </div>

                                                            <div className="nb-sep" />

                                                            <div style={{ padding: '6px' }}>
                                                                <button
                                                                    onClick={() => { setShowUserMenu(false); handleLogout(); }}
                                                                    className="nb-panel-row"
                                                                    style={{ borderRadius: '10px', width: '100%', background: 'transparent', border: 'none', color: '#fca5a5', gap: 9, display: 'flex', alignItems: 'center' }}
                                                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,.07)'}
                                                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                                                >
                                                                    <LogOut size={13} style={{ color: '#f87171', flexShrink: 0, opacity: .7 }} /> {t('nav_logout')}
                                                                </button>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </>
                                        ) : (
                                            <div style={{ display: 'flex', gap: '5px', paddingRight: 4 }}>
                                                <Link href="/login"
                                                    style={{ padding: '5px 13px', borderRadius: '8px', border: '1px solid rgba(255,255,255,.09)', background: 'transparent', color: 'rgba(255,255,255,.55)', fontSize: '.78rem', fontWeight: 500, textDecoration: 'none', transition: 'all .15s' }}
                                                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,.06)'; e.currentTarget.style.color = '#fff'; }}
                                                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,.55)'; }}
                                                >{t('nav_login')}</Link>
                                                <Link href="/register"
                                                    style={{ padding: '5px 13px', borderRadius: '8px', background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', color: '#fff', fontSize: '.78rem', fontWeight: 600, textDecoration: 'none', boxShadow: '0 0 16px rgba(99,102,241,.3)', transition: 'opacity .15s' }}
                                                    onMouseEnter={e => e.currentTarget.style.opacity = '.85'}
                                                    onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                                                >{t('nav_register')}</Link>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    </nav>
                </div>
            </div>
        </>
    );
}
