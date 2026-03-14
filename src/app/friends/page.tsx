'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, getDoc, setDoc, deleteDoc, onSnapshot, addDoc, Timestamp } from 'firebase/firestore';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from '@/context/LocaleContext';
import { useRouter } from 'next/navigation';
import { Users, UserCheck, UserX, MessageCircle, Clock, Search, UserPlus, Send } from 'lucide-react';
import Avatar from '@/components/Avatar';

interface FriendData {
    docId: string;
    friendUid: string;
    profile: any;
    status: 'pending' | 'accepted';
    isSender: boolean;
}

export default function Friends() {
    const { user } = useAuth();
    const { t } = useLocale();
    const router = useRouter();
    const [tab, setTab] = useState<'list' | 'requests'>('list');
    const [friends, setFriends] = useState<FriendData[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [emailInput, setEmailInput] = useState('');
    const [emailSearchResult, setEmailSearchResult] = useState<any>(null);
    const [emailSearchStatus, setEmailSearchStatus] = useState<'idle' | 'loading' | 'found' | 'not_found' | 'self' | 'already'>('idle');
    const [sendingRequest, setSendingRequest] = useState(false);
    const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);

    useEffect(() => {
        if (!user) return;

        // Listen to friendships where user is user1 or user2
        const q1 = query(collection(db, 'friendships'), where('user1_id', '==', user.uid));
        const q2 = query(collection(db, 'friendships'), where('user2_id', '==', user.uid));

        const loadAll = async () => {
            try {
                const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);
                const allDocs = [...snap1.docs, ...snap2.docs];

                // Deduplicate
                const seen = new Set<string>();
                const unique = allDocs.filter(d => {
                    if (seen.has(d.id)) return false;
                    seen.add(d.id);
                    return true;
                });

                const items: FriendData[] = [];
                for (const fdoc of unique) {
                    const data = fdoc.data();
                    const friendUid = data.user1_id === user.uid ? data.user2_id : data.user1_id;
                    // Fetch friend profile
                    const userDoc = await getDoc(doc(db, 'users', friendUid));
                    const profile = userDoc.exists() ? { id: userDoc.id, ...userDoc.data() } : { id: friendUid, full_name: 'Utilisateur', email: '' };
                    items.push({
                        docId: fdoc.id,
                        friendUid,
                        profile,
                        status: data.status,
                        isSender: data.sender_id === user.uid,
                    });
                }
                setFriends(items);
            } catch (err) {
                console.error('Error loading friends', err);
            } finally {
                setLoading(false);
            }
        };
        loadAll();
    }, [user]);

    if (!user) {
        return (
            <div className="container py-16 text-center fade-enter">
                <h2>Connectez-vous pour voir vos amis</h2>
                <button className="btn btn-primary mt-4" onClick={() => router.push('/login')}>Connexion</button>
            </div>
        );
    }

    const accepted = friends.filter(f => f.status === 'accepted');
    const pendingReceived = friends.filter(f => f.status === 'pending' && !f.isSender);
    const pendingSent = friends.filter(f => f.status === 'pending' && f.isSender);

    const filteredAccepted = accepted.filter(f =>
        !search.trim() ||
        f.profile.full_name?.toLowerCase().includes(search.toLowerCase()) ||
        f.profile.email?.toLowerCase().includes(search.toLowerCase())
    );

    const handleAccept = async (docId: string, friendUid: string) => {
        await setDoc(doc(db, 'friendships', docId), { status: 'accepted' }, { merge: true });

        // Notify the sender
        await addDoc(collection(db, 'users', friendUid, 'notifications'), {
            message: `${user?.displayName || user?.email?.split('@')[0] || "Quelqu'un"} a accepté votre demande d'ami.`,
            read: false,
            created_at: Timestamp.now()
        });

        setFriends(prev => prev.map(f => f.docId === docId ? { ...f, status: 'accepted' } : f));
    };

    const handleReject = async (docId: string) => {
        await deleteDoc(doc(db, 'friendships', docId));
        setFriends(prev => prev.filter(f => f.docId !== docId));
    };

    const handleMessage = (friendUid: string) => {
        const convId = [user.uid, friendUid].sort().join('_');
        router.push(`/ messages ? conv = ${convId} & to=${friendUid}`);
    };

    const handleSearchByEmail = async () => {
        const emailTrimmed = emailInput.trim();
        const emailLower = emailTrimmed.toLowerCase();
        if (!emailTrimmed) return;
        setEmailSearchStatus('loading');
        setEmailSearchResult(null);
        try {
            // Check if searching for self
            if (emailLower === user.email?.toLowerCase()) {
                setEmailSearchStatus('self');
                return;
            }
            // Try lowercase first, then original casing as fallback
            let snap = await getDocs(query(collection(db, 'users'), where('email', '==', emailLower)));
            if (snap.empty && emailTrimmed !== emailLower) {
                snap = await getDocs(query(collection(db, 'users'), where('email', '==', emailTrimmed)));
            }
            if (snap.empty) {
                setEmailSearchStatus('not_found');
                return;
            }
            const foundDoc = snap.docs[0];
            const foundUid = foundDoc.id;
            const foundProfile = { id: foundUid, ...foundDoc.data() };

            // Check if already friends or pending
            const alreadyLinked = friends.find(f => f.friendUid === foundUid);
            if (alreadyLinked) {
                setEmailSearchStatus('already');
                setEmailSearchResult(foundProfile);
                return;
            }
            setEmailSearchResult(foundProfile);
            setEmailSearchStatus('found');
        } catch (err) {
            console.error(err);
            setEmailSearchStatus('not_found');
        }
    };

    const handleSendRequest = async () => {
        if (!emailSearchResult || sendingRequest) return;
        setSendingRequest(true);
        try {
            const newDocRef = doc(collection(db, 'friendships'));
            await setDoc(newDocRef, {
                user1_id: user.uid,
                user2_id: emailSearchResult.id,
                sender_id: user.uid,
                status: 'pending',
                created_at: Timestamp.now(),
            });
            // Notify the target user
            await addDoc(collection(db, 'users', emailSearchResult.id, 'notifications'), {
                type: 'friend_request',
                message: `${user.displayName || user.email?.split('@')[0] || 'Quelqu\'un'} vous a envoyé une demande d'ami.`,
                read: false,
                link: '/friends',
                created_at: Timestamp.now(),
            });
            setFriends(prev => [...prev, {
                docId: newDocRef.id,
                friendUid: emailSearchResult.id,
                profile: emailSearchResult,
                status: 'pending',
                isSender: true,
            }]);
            setEmailSearchStatus('already');
        } catch (err) {
            console.error(err);
        } finally {
            setSendingRequest(false);
        }
    };

    return (
        <div className="container py-8 max-w-md mx-auto fade-enter" style={{ maxWidth: '800px' }}>
            {/* Header */}
            <div className="flex justify-between items-center mb-6 flex-wrap gap-3">
                <h1 className="flex items-center gap-3" style={{ fontSize: '1.8rem', fontWeight: 800, margin: 0, background: 'linear-gradient(to right, #fff, #a1a1aa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                    <Users size={26} style={{ color: 'var(--color-primary)', WebkitTextFillColor: 'initial' }} /> {t('friends_title')}
                </h1>
                {pendingReceived.length > 0 && tab !== 'requests' && (
                    <button className="btn btn-sm" style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }} onClick={() => setTab('requests')}>
                        {pendingReceived.length} demande{pendingReceived.length > 1 ? 's' : ''}
                    </button>
                )}
            </div>

            {/* Premium Segmented Control Tabs */}
            <div className="mb-8 relative flex items-center p-1" style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.08)', width: 'fit-content', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.1)' }}>
                {/* Animated Background Highlight */}
                <div
                    style={{
                        position: 'absolute', top: '4px', bottom: '4px', width: 'calc(50% - 4px)', borderRadius: '12px', background: 'var(--color-primary)', transition: 'all 0.3s cubic-bezier(0.4, 0.0, 0.2, 1)',
                        left: tab === 'list' ? '4px' : 'calc(50%)',
                        boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)',
                    }}
                />

                <button
                    onClick={() => setTab('list')}
                    style={{
                        position: 'relative', zIndex: 1, padding: '10px 24px', borderRadius: '12px', fontSize: '0.9rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', transition: 'color 0.3s', margin: 0, border: 'none', background: 'transparent',
                        color: tab === 'list' ? '#ffffff' : '#a1a1aa',
                    }}
                >
                    <UserCheck size={18} /> {t('friends_tab_list')} <span style={{ opacity: tab === 'list' ? 0.8 : 0.5, fontSize: '0.8rem' }}>({accepted.length})</span>
                </button>
                <button
                    onClick={() => setTab('requests')}
                    style={{
                        position: 'relative', zIndex: 1, padding: '10px 24px', borderRadius: '12px', fontSize: '0.9rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', transition: 'color 0.3s', margin: 0, border: 'none', background: 'transparent',
                        color: tab === 'requests' ? '#ffffff' : '#a1a1aa',
                    }}
                >
                    <Clock size={18} /> {t('friends_tab_requests')}
                    {pendingReceived.length > 0 && (
                        <span style={{
                            background: tab === 'requests' ? '#ffffff' : '#ef4444',
                            color: tab === 'requests' ? 'var(--color-primary)' : '#fff',
                            borderRadius: '50%', width: '20px', height: '20px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 800, marginLeft: '6px',
                            transition: 'all 0.3s', boxShadow: tab === 'requests' ? '0 2px 5px rgba(0,0,0,0.2)' : 'none'
                        }}>
                            {pendingReceived.length}
                        </span>
                    )}
                </button>
            </div>

            {loading && (
                <div className="text-center py-8">
                    <div style={{ width: '40px', height: '40px', borderRadius: '50%', border: '3px solid var(--color-primary)', borderTopColor: 'transparent', animation: 'spin 1s linear infinite', margin: '0 auto' }} />
                </div>
            )}

            {/* TAB: Friends List */}
            {!loading && tab === 'list' && (
                <div className="fade-enter">
                    {/* Add by email */}
                    <div className="mb-6" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '1.25rem' }}>
                        <div className="flex items-center gap-2 mb-3">
                            <UserPlus size={16} style={{ color: 'var(--color-primary)', opacity: 0.8 }} />
                            <span style={{ fontSize: '0.85rem', fontWeight: 600, opacity: 0.7 }}>Ajouter un ami par email</span>
                        </div>
                        <div className="flex gap-2">
                            <div className="flex items-center gap-2 flex-1" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--color-border)', borderRadius: '10px', padding: '0.5rem 0.9rem' }}>
                                <Search size={14} style={{ opacity: 0.4, flexShrink: 0 }} />
                                <input
                                    type="email"
                                    value={emailInput}
                                    onChange={e => { setEmailInput(e.target.value); setEmailSearchStatus('idle'); setEmailSearchResult(null); }}
                                    onKeyDown={e => e.key === 'Enter' && handleSearchByEmail()}
                                    placeholder="adresse@email.com"
                                    style={{ background: 'transparent', border: 'none', outline: 'none', color: 'inherit', width: '100%', fontSize: '0.88rem' }}
                                />
                            </div>
                            <button
                                onClick={handleSearchByEmail}
                                disabled={emailSearchStatus === 'loading' || !emailInput.trim()}
                                style={{
                                    padding: '0.5rem 1rem', borderRadius: '10px', fontSize: '0.85rem', fontWeight: 600,
                                    background: 'var(--color-primary)', color: '#fff', border: 'none',
                                    cursor: emailSearchStatus === 'loading' || !emailInput.trim() ? 'not-allowed' : 'pointer',
                                    opacity: !emailInput.trim() ? 0.5 : 1, flexShrink: 0,
                                }}
                            >
                                {emailSearchStatus === 'loading' ? '...' : 'Rechercher'}
                            </button>
                        </div>

                        {/* Results */}
                        {emailSearchStatus === 'not_found' && (
                            <p style={{ fontSize: '0.83rem', color: '#f87171', marginTop: '0.75rem', opacity: 0.8 }}>Aucun utilisateur trouvé avec cet email.</p>
                        )}
                        {emailSearchStatus === 'self' && (
                            <p style={{ fontSize: '0.83rem', color: '#f87171', marginTop: '0.75rem', opacity: 0.8 }}>C'est votre propre adresse email.</p>
                        )}
                        {(emailSearchStatus === 'found' || emailSearchStatus === 'already') && emailSearchResult && (
                            <div className="flex items-center gap-3 mt-3" style={{ padding: '0.75rem', background: 'rgba(255,255,255,0.04)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.07)' }}>
                                <Avatar uid={emailSearchResult.id} avatarUrl={emailSearchResult.avatar_url} avatarStyle={emailSearchResult.avatar_style} size={40} />
                                <div className="flex-1 min-w-0">
                                    <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{emailSearchResult.full_name || emailSearchResult.email}</div>
                                    <div style={{ fontSize: '0.78rem', opacity: 0.45 }}>{emailSearchResult.email}</div>
                                </div>
                                {emailSearchStatus === 'found' ? (
                                    <button
                                        onClick={handleSendRequest}
                                        disabled={sendingRequest}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px', borderRadius: '10px', fontSize: '0.82rem', fontWeight: 600,
                                            background: 'rgba(99,102,241,0.2)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.35)',
                                            cursor: sendingRequest ? 'not-allowed' : 'pointer', flexShrink: 0,
                                        }}
                                    >
                                        <Send size={14} /> {sendingRequest ? 'Envoi...' : 'Envoyer une demande'}
                                    </button>
                                ) : (
                                    <span style={{ fontSize: '0.8rem', opacity: 0.5, flexShrink: 0 }}>Déjà ami / En attente</span>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Search existing friends */}
                    {accepted.length > 0 && (
                        <div className="flex items-center gap-2 mb-5" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--color-border)', borderRadius: '12px', padding: '0.6rem 1rem' }}>
                            <Search size={16} style={{ opacity: 0.4, flexShrink: 0 }} />
                            <input
                                type="text"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder="Rechercher un ami..."
                                style={{ background: 'transparent', border: 'none', outline: 'none', color: 'inherit', width: '100%', fontSize: '0.9rem' }}
                            />
                        </div>
                    )}

                    {filteredAccepted.length === 0 ? (
                        <div className="card card-glass text-center" style={{ padding: '3rem 2rem' }}>
                            <Users size={48} style={{ margin: '0 auto 1rem', opacity: 0.15 }} />
                            <p style={{ opacity: 0.5 }}>{t('friends_empty')}</p>
                            <button className="btn btn-primary mt-4" onClick={() => router.push('/explore')}>
                                Explorer les salons
                            </button>
                        </div>
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.75rem' }}>
                            {filteredAccepted.map(f => (
                                <div
                                    key={f.docId}
                                    className="card card-glass fade-enter"
                                    style={{ padding: '1.1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
                                >
                                    {/* Top: avatar + name */}
                                    <div
                                        style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}
                                        onClick={() => router.push(`/user/${f.friendUid}`)}
                                    >
                                        <Avatar
                                            uid={f.friendUid}
                                            avatarUrl={f.profile.avatar_url}
                                            avatarStyle={f.profile.avatar_style}
                                            size={40}
                                            style={{ flexShrink: 0, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.08)' }}
                                        />
                                        <div style={{ minWidth: 0 }}>
                                            <div style={{ fontWeight: 700, fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {f.profile.full_name}
                                            </div>
                                            <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.35)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {f.profile.email}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Bottom: action buttons */}
                                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: 'auto' }}>
                                        {confirmRemoveId === f.docId ? (
                                            <>
                                                <button
                                                    onClick={() => { handleReject(f.docId); setConfirmRemoveId(null); }}
                                                    style={{ flex: 1, padding: '6px 0', borderRadius: '8px', fontSize: '0.78rem', fontWeight: 600, background: 'rgba(239,68,68,0.18)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)', cursor: 'pointer' }}
                                                >
                                                    Confirmer
                                                </button>
                                                <button
                                                    onClick={() => setConfirmRemoveId(null)}
                                                    style={{ padding: '6px 12px', borderRadius: '8px', fontSize: '0.78rem', fontWeight: 600, background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.45)', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer' }}
                                                >
                                                    ✕
                                                </button>
                                            </>
                                        ) : (
                                            <>
                                                <button
                                                    onClick={() => handleMessage(f.friendUid)}
                                                    title="Message"
                                                    style={{
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center', width: '36px', height: '32px', flexShrink: 0,
                                                        borderRadius: '8px', background: 'rgba(99,102,241,0.12)', color: '#818cf8',
                                                        border: '1px solid rgba(99,102,241,0.25)', cursor: 'pointer', transition: 'background 0.2s',
                                                    }}
                                                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(99,102,241,0.25)')}
                                                    onMouseLeave={e => (e.currentTarget.style.background = 'rgba(99,102,241,0.12)')}
                                                >
                                                    <MessageCircle size={14} />
                                                </button>
                                                <button
                                                    onClick={() => setConfirmRemoveId(f.docId)}
                                                    style={{
                                                        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', height: '32px',
                                                        borderRadius: '8px', fontSize: '0.78rem', fontWeight: 600,
                                                        background: 'rgba(239,68,68,0.08)', color: '#f87171',
                                                        border: '1px solid rgba(239,68,68,0.18)', cursor: 'pointer', transition: 'background 0.2s',
                                                    }}
                                                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.2)')}
                                                    onMouseLeave={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.08)')}
                                                >
                                                    <UserX size={13} /> Retirer
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div >
            )}

            {/* TAB: Requests */}
            {
                !loading && tab === 'requests' && (
                    <div className="fade-enter">
                        {/* Received */}
                        <h4 className="mb-3" style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.06em', opacity: 0.5 }}>{t('friends_received_title')}</h4>
                        {pendingReceived.length === 0 ? (
                            <div className="card card-glass text-center mb-6" style={{ padding: '2rem', opacity: 0.5 }}>
                                <p>{t('friends_requests_empty')}</p>
                            </div>
                        ) : (
                            <div style={{ display: 'grid', gap: '0.75rem', marginBottom: '2rem' }}>
                                {pendingReceived.map(f => (
                                    <div key={f.docId} className="card card-glass fade-enter" style={{ padding: '1.25rem 1.5rem', borderLeft: '3px solid #f59e0b' }}>
                                        <div className="flex items-center gap-4">
                                            <Avatar
                                                uid={f.friendUid}
                                                avatarUrl={f.profile.avatar_url}
                                                avatarStyle={f.profile.avatar_style}
                                                size={44}
                                                style={{ cursor: 'pointer' }}
                                                onClick={() => router.push(`/user/${f.friendUid}`)}
                                            />
                                            <div className="flex-1 min-w-0">
                                                <div style={{ fontWeight: 700 }}>{f.profile.full_name}</div>
                                                <div style={{ fontSize: '0.8rem', opacity: 0.4, marginTop: '2px' }}>{f.profile.email}</div>
                                            </div>
                                            <div className="flex gap-2" style={{ flexShrink: 0 }}>
                                                <button
                                                    onClick={() => handleAccept(f.docId, f.friendUid)}
                                                    style={{
                                                        padding: '6px 14px', borderRadius: '10px', fontSize: '0.8rem', fontWeight: 600,
                                                        background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.3)',
                                                        cursor: 'pointer', transition: 'all 0.2s ease'
                                                    }}
                                                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(16, 185, 129, 0.25)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
                                                    onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(16, 185, 129, 0.15)'; e.currentTarget.style.transform = 'translateY(0)' }}
                                                >
                                                    {t('friends_btn_accept')}
                                                </button>
                                                <button
                                                    onClick={() => handleReject(f.docId)}
                                                    style={{
                                                        padding: '6px 14px', borderRadius: '10px', fontSize: '0.8rem', fontWeight: 600,
                                                        background: 'rgba(239, 68, 68, 0.1)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.2)',
                                                        cursor: 'pointer', transition: 'all 0.2s ease'
                                                    }}
                                                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
                                                    onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'; e.currentTarget.style.transform = 'translateY(0)' }}
                                                >
                                                    {t('friends_btn_reject')}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Sent */}
                        <h4 className="mb-3" style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.06em', opacity: 0.5 }}>{t('friends_sent_title')}</h4>
                        {pendingSent.length === 0 ? (
                            <div className="card card-glass text-center" style={{ padding: '2rem', opacity: 0.5 }}>
                                <p>{t('friends_sent_empty')}</p>
                            </div>
                        ) : (
                            <div style={{ display: 'grid', gap: '0.75rem' }}>
                                {pendingSent.map(f => (
                                    <div key={f.docId} className="card card-glass fade-enter" style={{ padding: '1.25rem 1.5rem', opacity: 0.7 }}>
                                        <div className="flex items-center gap-4">
                                            <Avatar
                                                uid={f.friendUid}
                                                avatarUrl={f.profile.avatar_url}
                                                avatarStyle={f.profile.avatar_style}
                                                size={44}
                                            />
                                            <div className="flex-1 min-w-0">
                                                <div style={{ fontWeight: 700 }}>{f.profile.full_name}</div>
                                                <div style={{ fontSize: '0.8rem', opacity: 0.4, marginTop: '2px' }}>{t('friends_btn_pending')}</div>
                                            </div>
                                            <button className="btn btn-sm btn-ghost" onClick={() => handleReject(f.docId)} style={{ color: '#ef4444', opacity: 0.6 }}>
                                                Annuler
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )
            }
        </div >
    );
}
