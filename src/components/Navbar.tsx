'use client';

import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from '@/context/LocaleContext';
import { auth, db } from '@/lib/firebase';
import { signOut } from 'firebase/auth';
import { useRouter, usePathname } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import { collection, query, where, onSnapshot, orderBy, updateDoc, doc, getDocs, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { Bell, Calendar, Users, MessageCircle, LogOut, User as UserIcon, Zap } from 'lucide-react';
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

    // activeSession for the "Retour à la salle" button: use context (not localStorage)
    const activeSession = !isSession ? sessionInfo : null;

    useEffect(() => {
        if (!user) return;
        const q = query(
            collection(db, 'users', user.uid, 'notifications'),
            orderBy('created_at', 'desc')
        );
        const unsubNotifs = onSnapshot(q, snap => {
            setNotifications(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        // Listen for unread direct messages
        let unsubs: (() => void)[] = [];
        const loadConversations = async () => {
            const q1 = query(collection(db, 'friendships'), where('user1_id', '==', user.uid), where('status', '==', 'accepted'));
            const q2 = query(collection(db, 'friendships'), where('user2_id', '==', user.uid), where('status', '==', 'accepted'));
            const [s1, s2] = await Promise.all([getDocs(q1), getDocs(q2)]);

            const seen = new Set<string>();
            const unique = [...s1.docs, ...s2.docs].filter(d => {
                if (seen.has(d.id)) return false;
                seen.add(d.id);
                return true;
            });

            unique.forEach(d => {
                const data = d.data();
                const friendUid = data.user1_id === user.uid ? data.user2_id : data.user1_id;
                const convId = [user.uid, friendUid].sort().join('_');

                const msgQ = query(collection(db, 'direct_messages', convId, 'messages'), where('sender_id', '==', friendUid), where('read', '==', false));
                const unsub = onSnapshot(msgQ, snap => {
                    setUnreadMessagesMap(prev => ({ ...prev, [convId]: snap.size }));
                });
                unsubs.push(unsub);
            });
        };
        loadConversations();

        return () => {
            unsubNotifs();
            unsubs.forEach(u => u());
        };
    }, [user]);

    // Listen to user profile data for real-time updates (avatar, name, etc.)
    useEffect(() => {
        if (!user) {
            setUserData(null);
            return;
        }

        const docRef = doc(db, 'users', user.uid);
        const unsubscribe = onSnapshot(docRef, (docSnap) => {
            if (docSnap.exists()) {
                setUserData(docSnap.data());
            }
        }, (err) => {
            console.error("Error listening to user data:", err);
        });

        return () => unsubscribe();
    }, [user]);

    // Listen for pending friend requests and accountability invitations
    useEffect(() => {
        if (!user) { setFriendRequestCount(0); setAccountabilityCount(0); return; }
        const unsubFriends = onSnapshot(
            query(collection(db, 'friendships'), where('user2_id', '==', user.uid), where('status', '==', 'pending')),
            snap => setFriendRequestCount(snap.size)
        );
        const unsubAcc = onSnapshot(
            query(collection(db, 'accountability_pairs'), where('user2_id', '==', user.uid), where('status', '==', 'pending')),
            snap => setAccountabilityCount(snap.size)
        );
        return () => { unsubFriends(); unsubAcc(); };
    }, [user]);

    // Close dropdowns when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
                setShowNotifs(false);
            }
            if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
                setShowUserMenu(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Only show relevant notification types in the bell
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
            await setDoc(doc(db, 'project_memberships', `${user.uid}_${n.project_id}`), {
                user_id: user.uid,
                project_id: n.project_id,
                role: n.role || 'member',
                joined_at: new Date().toISOString(),
            });
            await updateDoc(doc(db, 'users', user.uid, 'notifications', n.id), { read: true, accepted: true });
            router.push(`/project/${n.project_id}`);
            setShowNotifs(false);
        } catch (err) {
            console.error('Erreur acceptation invitation', err);
        }
    };

    const handleDeclineProjectInvite = async (n: any) => {
        if (!user) return;
        try {
            await deleteDoc(doc(db, 'users', user.uid, 'notifications', n.id));
        } catch (err) {
            console.error('Erreur refus invitation', err);
        }
    };

    const isActive = (href: string) => pathname === href || (href !== '/dashboard' && pathname?.startsWith(href));

    const handleMarkAllRead = async () => {
        if (!user) return;
        const unread = notifications.filter((n: any) => !n.read);
        for (const n of unread) {
            await updateDoc(doc(db, 'users', user.uid, 'notifications', n.id), { read: true });
        }
    };

    const handleLogout = async () => {
        await signOut(auth);
        router.push('/');
    };

    if (!isNavbarVisible) return null;

    return (
        <div style={{ position: 'fixed', top: '16px', left: 0, right: 0, zIndex: 100, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
            <nav
                className="glass-panel"
                style={{
                    display: 'flex', alignItems: 'center',
                    pointerEvents: 'auto',
                    width: '100%', maxWidth: '1000px', margin: '0 20px',
                    height: '64px', borderRadius: '24px',
                    background: 'rgba(18, 18, 22, 0.65)',
                    backdropFilter: 'blur(20px)',
                    WebkitBackdropFilter: 'blur(20px)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    boxShadow: '0 4px 24px -1px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
                    padding: '0 24px',
                }}
            >
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', width: '100%' }}>
                    {/* Left: Logo */}
                    <Link href="/" className="logo text-xl font-black tracking-tight" style={{ justifySelf: 'start', display: 'flex', alignItems: 'center', gap: '0.5rem', textDecoration: 'none', color: '#fff' }}>
                        <div style={{ position: 'relative', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                            <Zap
                                size={22}
                                strokeWidth={2.5}
                                style={{
                                    color: isWorking ? '#10b981' : 'var(--color-primary)',
                                    fill: isWorking ? '#10b981' : 'var(--color-primary)',
                                    filter: isWorking ? 'drop-shadow(0 0 6px rgba(16,185,129,0.7))' : 'none',
                                    transition: 'all 0.4s ease',
                                    display: 'block',
                                }}
                            />
                            {isWorking && (
                                <span style={{
                                    position: 'absolute', top: '-3px', right: '-3px',
                                    width: '7px', height: '7px', borderRadius: '50%',
                                    background: '#10b981',
                                    boxShadow: '0 0 0 2px #09090b',
                                    animation: 'pulse 2s infinite',
                                }} />
                            )}
                        </div>
                        Gitsync
                        {isWorking && (
                            <span style={{ fontSize: '0.65rem', fontWeight: 600, color: '#10b981', letterSpacing: '0.04em', opacity: 0.9 }}>
                                · focus
                            </span>
                        )}
                    </Link>

                    {/* Center: Main Navigation (Only when logged in) */}
                    <div style={{ justifySelf: 'center', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        {!loading && user && (
                            <>
                                {/* Styled Nav Links */}
                                {[
                                    { href: '/dashboard', label: t('nav_dashboard'), badge: 0 },
                                    { href: '/explore', label: t('nav_explore'), badge: 0 },
                                    { href: '/calendar', label: 'Calendrier', badge: 0 },
                                    { href: '/friends', label: t('nav_friends'), badge: friendRequestCount },
                                    { href: '/accountability', label: 'Accountability', badge: accountabilityCount },
                                ].map(({ href, label, badge }) => (
                                    <Link key={href} href={href}
                                        style={{
                                            padding: '8px 12px', borderRadius: '12px', fontSize: '0.875rem',
                                            textDecoration: 'none', transition: 'all 0.2s ease', whiteSpace: 'nowrap', fontWeight: 500,
                                            position: 'relative',
                                            color: isActive(href) ? '#f8f9fa' : '#a1a1aa',
                                            background: isActive(href) ? 'rgba(255,255,255,0.07)' : 'transparent',
                                        }}
                                        onMouseEnter={e => { if (!isActive(href)) { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = '#fff'; } }}
                                        onMouseLeave={e => { if (!isActive(href)) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#a1a1aa'; } }}
                                    >
                                        {label}
                                        {badge > 0 && (
                                            <span style={{
                                                position: 'absolute', top: '2px', right: '2px',
                                                background: '#ef4444', color: '#fff',
                                                borderRadius: '50%', width: '16px', height: '16px',
                                                fontSize: '9px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontWeight: 800, lineHeight: 1, border: '2px solid rgba(18,18,22,0.8)'
                                            }}>
                                                {badge > 9 ? '9+' : badge}
                                            </span>
                                        )}
                                    </Link>
                                ))}

                                <Link href="/messages"
                                    style={{
                                        padding: '8px 12px', borderRadius: '12px', fontSize: '0.875rem',
                                        textDecoration: 'none', transition: 'all 0.2s ease', position: 'relative', whiteSpace: 'nowrap', fontWeight: 500,
                                        color: isActive('/messages') ? '#f8f9fa' : '#a1a1aa',
                                        background: isActive('/messages') ? 'rgba(255,255,255,0.07)' : 'transparent',
                                    }}
                                    onMouseEnter={e => { if (!isActive('/messages')) { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = '#fff'; } }}
                                    onMouseLeave={e => { if (!isActive('/messages')) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#a1a1aa'; } }}
                                >
                                    {t('nav_messages')}
                                    {totalUnreadMessages > 0 && (
                                        <span style={{
                                            position: 'absolute', top: '2px', right: '2px',
                                            background: '#ef4444', color: '#fff',
                                            borderRadius: '50%', width: '16px', height: '16px',
                                            fontSize: '9px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontWeight: 800, lineHeight: 1, border: '2px solid var(--color-bg-surface)'
                                        }}>
                                            {totalUnreadMessages > 9 ? '9+' : totalUnreadMessages}
                                        </span>
                                    )}
                                </Link>
                            </>
                        )}
                    </div>

                    {/* Right: Actions (Language, Notifs, Profile/Login) */}
                    <div style={{ justifySelf: 'end', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {/* Return to active session */}
                        {activeSession && (
                            <button
                                onClick={() => router.push(`/session?id=${activeSession.objectiveId}`)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 6,
                                    padding: '6px 12px', borderRadius: '12px',
                                    background: 'rgba(16,185,129,0.1)',
                                    border: '1px solid rgba(16,185,129,0.25)',
                                    color: '#10b981', fontSize: '0.78rem', fontWeight: 600,
                                    cursor: 'pointer', whiteSpace: 'nowrap',
                                    transition: 'background 0.2s',
                                }}
                                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(16,185,129,0.18)')}
                                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(16,185,129,0.1)')}
                            >
                                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', flexShrink: 0, boxShadow: '0 0 5px rgba(16,185,129,0.7)' }} />
                                Retour à la salle
                            </button>
                        )}
                        <select
                            className="input"
                            style={{
                                padding: '6px 12px', height: 'auto', width: 'auto', fontSize: '0.8125rem',
                                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px',
                                cursor: 'pointer', color: '#a1a1aa'
                            }}
                            value={locale}
                            onChange={(e) => setLocale(e.target.value as 'fr' | 'en')}
                        >
                            <option value="fr">🇫🇷 FR</option>
                            <option value="en">🇬🇧 EN</option>
                        </select>

                        {!loading && (
                            <>
                                {user ? (
                                    <>
                                        {/* Notification Bell */}
                                        <div ref={notifRef} style={{ position: 'relative' }}>
                                            <button
                                                className="btn btn-sm btn-ghost"
                                                style={{ position: 'relative', padding: '0.4rem' }}
                                                onClick={() => { setShowNotifs(v => !v); if (!showNotifs) handleMarkAllRead(); }}
                                                aria-label="Notifications"
                                            >
                                                <Bell size={18} />
                                                {unreadCount > 0 && (
                                                    <span style={{
                                                        position: 'absolute', top: '2px', right: '2px',
                                                        background: 'var(--color-secondary)', color: '#fff',
                                                        borderRadius: '50%', width: '16px', height: '16px',
                                                        fontSize: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        fontWeight: 700, lineHeight: 1
                                                    }}>
                                                        {unreadCount > 9 ? '9+' : unreadCount}
                                                    </span>
                                                )}
                                            </button>

                                            {showNotifs && (
                                                <div className="card" style={{
                                                    position: 'absolute', right: 0, top: 'calc(100% + 12px)',
                                                    width: '340px', maxHeight: '400px', overflowY: 'auto',
                                                    zIndex: 200, padding: '0',
                                                    background: '#18181b',
                                                    border: '1px solid rgba(255, 255, 255, 0.1)',
                                                    borderRadius: '20px',
                                                    boxShadow: '0 12px 40px rgba(0,0,0,0.8)'
                                                }}>
                                                    <div style={{ padding: '1.2rem', borderBottom: '1px solid rgba(255,255,255,0.05)', fontWeight: 700, fontSize: '0.95rem' }}>
                                                        🔔 {t('nav_notifications')}
                                                    </div>
                                                    {visibleNotifications.length === 0 ? (
                                                        <div style={{ padding: '2rem', textAlign: 'center', color: '#71717a', fontSize: '0.9rem' }}>
                                                            {t('nav_no_notifs')}
                                                        </div>
                                                    ) : (
                                                        visibleNotifications.slice(0, 15).map((n: any) => (
                                                            <div
                                                                key={n.id}
                                                                style={{
                                                                    padding: '1rem',
                                                                    borderBottom: '1px solid rgba(255,255,255,0.03)',
                                                                    background: n.read ? 'transparent' : (n.type === 'project_invite' && !n.accepted ? 'rgba(99,102,241,0.06)' : 'rgba(99,102,241,0.08)'),
                                                                    fontSize: '0.85rem', lineHeight: '1.4',
                                                                    cursor: n.type === 'project_invite' ? 'default' : 'pointer',
                                                                    transition: 'background 0.15s',
                                                                }}
                                                                onClick={n.type !== 'project_invite' ? () => { router.push(notifLink(n)); setShowNotifs(false); } : undefined}
                                                                onMouseEnter={n.type !== 'project_invite' ? e => (e.currentTarget.style.background = n.read ? 'rgba(255,255,255,0.03)' : 'rgba(99,102,241,0.14)') : undefined}
                                                                onMouseLeave={n.type !== 'project_invite' ? e => (e.currentTarget.style.background = n.read ? 'transparent' : 'rgba(99,102,241,0.08)') : undefined}
                                                            >
                                                                <span style={{ color: n.read ? '#a1a1aa' : '#e4e4e7' }}>{notifIcon(n.type)} {n.message}</span>
                                                                <div style={{ fontSize: '0.75rem', color: '#71717a', marginTop: '4px' }}>
                                                                    {n.created_at?.toDate ? n.created_at.toDate().toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
                                                                </div>
                                                                {n.type === 'project_invite' && !n.accepted && (
                                                                    <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                                                                        <button
                                                                            onClick={e => { e.stopPropagation(); handleAcceptProjectInvite(n); }}
                                                                            style={{ flex: 1, padding: '7px 0', borderRadius: '10px', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer', background: 'rgba(99,102,241,0.85)', color: '#fff', border: '1px solid rgba(99,102,241,0.5)', transition: 'all 0.15s' }}
                                                                            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(99,102,241,1)')}
                                                                            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(99,102,241,0.85)')}
                                                                        >
                                                                            ✓ Rejoindre
                                                                        </button>
                                                                        <button
                                                                            onClick={e => { e.stopPropagation(); handleDeclineProjectInvite(n); }}
                                                                            style={{ flex: 1, padding: '7px 0', borderRadius: '10px', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer', background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.25)', transition: 'all 0.15s' }}
                                                                            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.2)')}
                                                                            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.1)')}
                                                                        >
                                                                            ✕ Décliner
                                                                        </button>
                                                                    </div>
                                                                )}
                                                                {n.type === 'project_invite' && n.accepted && (
                                                                    <div style={{ marginTop: '8px', fontSize: '0.75rem', color: '#4ade80', fontWeight: 600 }}>✓ Invitation acceptée</div>
                                                                )}
                                                            </div>
                                                        ))
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        {/* User Menu */}
                                        <div ref={userMenuRef} style={{ position: 'relative', marginLeft: '4px' }}>
                                            <button
                                                onClick={() => setShowUserMenu(v => !v)}
                                                style={{
                                                    background: 'transparent', padding: 0, cursor: 'pointer',
                                                    border: 'none', transition: 'all 0.2s'
                                                }}
                                            >
                                                <Avatar
                                                    uid={user?.uid}
                                                    avatarUrl={userData?.avatar_url}
                                                    avatarStyle={userData?.avatar_style}
                                                    size={36}
                                                    style={{ border: '2px solid rgba(255,255,255,0.1)' }}
                                                />
                                            </button>

                                            {showUserMenu && (
                                                <div className="card" style={{
                                                    position: 'absolute', right: 0, top: 'calc(100% + 12px)',
                                                    width: '200px', zIndex: 200, padding: '8px',
                                                    background: '#18181b', border: '1px solid rgba(255, 255, 255, 0.1)',
                                                    borderRadius: '16px', boxShadow: '0 12px 40px rgba(0,0,0,0.8)'
                                                }}>
                                                    <div style={{ padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.05)', marginBottom: '4px' }}>
                                                        <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{userData?.full_name || 'Utilisateur'}</div>
                                                        <div style={{ fontSize: '0.75rem', color: '#71717a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.email}</div>
                                                    </div>

                                                    <Link href="/profile"
                                                        onClick={() => setShowUserMenu(false)}
                                                        style={{
                                                            display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px',
                                                            borderRadius: '10px', color: '#e4e4e7', textDecoration: 'none', fontSize: '0.85rem',
                                                            transition: 'background 0.2s'
                                                        }}
                                                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                                    >
                                                        <UserIcon size={16} style={{ color: '#a1a1aa' }} /> {t('nav_profile')}
                                                    </Link>

                                                    <button
                                                        onClick={() => { setShowUserMenu(false); handleLogout(); }}
                                                        style={{
                                                            display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', width: '100%',
                                                            borderRadius: '10px', color: '#ef4444', background: 'transparent', border: 'none',
                                                            fontSize: '0.85rem', cursor: 'pointer', textAlign: 'left', transition: 'background 0.2s', marginTop: '2px'
                                                        }}
                                                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                                    >
                                                        <LogOut size={16} /> {t('nav_logout')}
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <Link href="/login" className="btn btn-ghost" style={{ padding: '8px 16px', borderRadius: '12px' }}>{t('nav_login')}</Link>
                                        <Link href="/register" className="btn btn-primary" style={{ padding: '8px 20px', borderRadius: '14px', boxShadow: '0 0 20px rgba(99,102,241,0.3)' }}>{t('nav_register')}</Link>
                                    </>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </nav>
        </div>
    );
}
