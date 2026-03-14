'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, getDoc, addDoc, onSnapshot, orderBy, Timestamp, setDoc, limit, updateDoc, writeBatch } from 'firebase/firestore';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from '@/context/LocaleContext';
import Avatar from '@/components/Avatar';
import { useCall } from '@/context/CallContext';
import { useRouter, useSearchParams } from 'next/navigation';
import { MessageCircle, Send, Users, Phone, Video } from 'lucide-react';

function getConvId(uid1: string, uid2: string) {
    return [uid1, uid2].sort().join('_');
}

interface ConvPreview {
    convId: string;
    friendUid: string;
    friendProfile: any;
    lastMessage?: string;
    lastTime?: Date;
    unread: number;
}

function MessagesContent() {
    const { user } = useAuth();
    const { t } = useLocale();
    const router = useRouter();
    const searchParams = useSearchParams();

    const [conversations, setConversations] = useState<ConvPreview[]>([]);
    const [activeConv, setActiveConv] = useState<string | null>(searchParams.get('conv'));
    const [activeProfile, setActiveProfile] = useState<any>(null);
    const [messages, setMessages] = useState<any[]>([]);
    const [newMsg, setNewMsg] = useState('');
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [hoverMsgId, setHoverMsgId] = useState<string | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const { startCall } = useCall();

    const QUICK_REACTIONS = ['👍', '🔥', '🚀', '❤️', '🙌', '👀'];

    // Load conversations from accepted friendships
    useEffect(() => {
        if (!user) return;
        const loadConversations = async () => {
            try {
                const q1 = query(collection(db, 'friendships'), where('user1_id', '==', user.uid), where('status', '==', 'accepted'));
                const q2 = query(collection(db, 'friendships'), where('user2_id', '==', user.uid), where('status', '==', 'accepted'));
                const [s1, s2] = await Promise.all([getDocs(q1), getDocs(q2)]);

                const seen = new Set<string>();
                const allDocs = [...s1.docs, ...s2.docs].filter(d => {
                    if (seen.has(d.id)) return false;
                    seen.add(d.id);
                    return true;
                });

                const convs: ConvPreview[] = [];
                for (const fdoc of allDocs) {
                    const data = fdoc.data();
                    const friendUid = data.user1_id === user.uid ? data.user2_id : data.user1_id;
                    const convId = getConvId(user.uid, friendUid);

                    const userDoc = await getDoc(doc(db, 'users', friendUid));
                    const profile = userDoc.exists() ? { id: userDoc.id, ...userDoc.data() } : { id: friendUid, full_name: 'Utilisateur', email: '' };

                    // Get last message + count unread
                    const msgQ = query(collection(db, 'direct_messages', convId, 'messages'), orderBy('created_at', 'desc'), limit(1));
                    const msgSnap = await getDocs(msgQ);
                    const lastMsg = msgSnap.docs[0]?.data();

                    // Count unread messages (sent by friend, not read)
                    const unreadQ = query(
                        collection(db, 'direct_messages', convId, 'messages'),
                        where('sender_id', '==', friendUid),
                        where('read', '==', false)
                    );
                    const unreadSnap = await getDocs(unreadQ);

                    convs.push({
                        convId,
                        friendUid,
                        friendProfile: profile,
                        lastMessage: lastMsg?.content,
                        lastTime: lastMsg?.created_at?.toDate?.() ?? undefined,
                        unread: unreadSnap.size,
                    });
                }

                // Sort by last message time
                convs.sort((a, b) => (b.lastTime?.getTime() ?? 0) - (a.lastTime?.getTime() ?? 0));
                setConversations(convs);

                // Auto-open conversation from URL param
                const toParam = searchParams.get('to');
                const convParam = searchParams.get('conv');
                if (convParam && toParam) {
                    setActiveConv(convParam);
                    const existing = convs.find(c => c.convId === convParam);
                    if (existing) {
                        setActiveProfile(existing.friendProfile);
                    } else {
                        const uDoc = await getDoc(doc(db, 'users', toParam));
                        if (uDoc.exists()) setActiveProfile({ id: uDoc.id, ...uDoc.data() });
                    }
                }
            } catch (err) {
                console.error('Error loading conversations', err);
            } finally {
                setLoading(false);
            }
        };
        loadConversations();
    }, [user]);

    // Listen to messages for active conversation
    useEffect(() => {
        if (!activeConv) { setMessages([]); return; }
        const q = query(collection(db, 'direct_messages', activeConv, 'messages'), orderBy('created_at', 'asc'));
        const unsub = onSnapshot(q, (snap) => {
            setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
        });
        return () => unsub();
    }, [activeConv]);

    // Mark messages as read when opening a conversation
    const markAsRead = async (convId: string) => {
        if (!user) return;
        try {
            // Find the friend uid from the conv
            const conv = conversations.find(c => c.convId === convId);
            const friendUid = conv?.friendUid;
            if (!friendUid) return;

            const unreadQ = query(
                collection(db, 'direct_messages', convId, 'messages'),
                where('sender_id', '==', friendUid),
                where('read', '==', false)
            );
            const snap = await getDocs(unreadQ);
            const batch = writeBatch(db);
            snap.docs.forEach(d => batch.update(d.ref, { read: true }));
            await batch.commit();

            // Update local count
            setConversations(prev => prev.map(c =>
                c.convId === convId ? { ...c, unread: 0 } : c
            ));
        } catch (err) {
            console.error('Error marking as read', err);
        }
    };

    const selectConversation = (conv: ConvPreview) => {
        setActiveConv(conv.convId);
        setActiveProfile(conv.friendProfile);
        markAsRead(conv.convId);
    };

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMsg.trim() || !activeConv || !user) return;
        setSending(true);
        try {
            // Ensure conversation doc exists
            await setDoc(doc(db, 'direct_messages', activeConv), {
                participants: activeConv.split('_'),
                updated_at: Timestamp.now(),
            }, { merge: true });

            await addDoc(collection(db, 'direct_messages', activeConv, 'messages'), {
                sender_id: user.uid,
                content: newMsg.trim(),
                created_at: Timestamp.now(),
                read: false,
                reactions: {},
            });
            setNewMsg('');

            // Update conversation list preview
            setConversations(prev => prev.map(c =>
                c.convId === activeConv ? { ...c, lastMessage: newMsg.trim(), lastTime: new Date() } : c
            ));
        } catch (err) {
            console.error('Error sending message', err);
        } finally {
            setSending(false);
        }
    };

    const handleToggleReaction = async (msgId: string, emoji: string) => {
        if (!user || !activeConv) return;
        try {
            const msgRef = doc(db, 'direct_messages', activeConv, 'messages', msgId);
            const msgSnap = await getDoc(msgRef);
            if (!msgSnap.exists()) return;

            const existing = msgSnap.data().reactions || {};
            const updated: Record<string, string[]> = {};

            // Remove user from all existing emojis to enforce 1 reaction max
            for (const [e, uids] of Object.entries(existing)) {
                updated[e] = (uids as string[]).filter(id => id !== user.uid);
            }

            // If the user didn't previously select this exact emoji, add them
            const hasReacted = (existing[emoji] || []).includes(user.uid);
            if (!hasReacted) {
                updated[emoji] = [...(updated[emoji] || []), user.uid];
            }

            await updateDoc(msgRef, { reactions: updated });
        } catch (err) {
            console.error('Error toggling reaction', err);
        }
    };

    if (!user) {
        return (
            <div className="container py-16 text-center fade-enter">
                <h2>Connectez-vous pour accéder à la messagerie</h2>
                <button className="btn btn-primary mt-4" onClick={() => router.push('/login')}>Connexion</button>
            </div>
        );
    }

    return (
        <div className="container py-6 fade-enter" style={{ maxWidth: '1100px', height: 'calc(100vh - 80px)', display: 'flex', flexDirection: 'column' }}>
            <h1 className="flex items-center gap-3 mb-4" style={{ fontSize: '1.5rem', fontWeight: 800, background: 'linear-gradient(to right, #fff, #a1a1aa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                <MessageCircle size={24} style={{ color: 'var(--color-primary)', WebkitTextFillColor: 'initial' }} /> {t('messages_title')}
            </h1>

            <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '300px 1fr', gap: '1rem', minHeight: 0, overflow: 'hidden', borderRadius: '14px', border: '1px solid var(--color-border)' }}>

                {/* Left: Conversation List */}
                <div style={{ borderRight: '1px solid var(--color-border)', overflow: 'auto', background: 'rgba(255,255,255,0.02)' }}>
                    {loading ? (
                        <div className="text-center py-8">
                            <div style={{ width: '30px', height: '30px', borderRadius: '50%', border: '2px solid var(--color-primary)', borderTopColor: 'transparent', animation: 'spin 1s linear infinite', margin: '0 auto' }} />
                        </div>
                    ) : conversations.length === 0 ? (
                        <div className="text-center py-8" style={{ padding: '2rem', opacity: 0.4 }}>
                            <Users size={32} style={{ margin: '0 auto 0.5rem' }} />
                            <p style={{ fontSize: '0.85rem' }}>{t('messages_empty')}</p>
                        </div>
                    ) : (
                        conversations.map(conv => (
                            <div
                                key={conv.convId}
                                onClick={() => selectConversation(conv)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '0.75rem',
                                    padding: '1rem 1.25rem', cursor: 'pointer', transition: 'background 0.15s',
                                    background: activeConv === conv.convId ? 'rgba(99,102,241,0.1)' : 'transparent',
                                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                                    borderLeft: activeConv === conv.convId ? '3px solid var(--color-primary)' : '3px solid transparent',
                                }}
                                onMouseEnter={e => { if (activeConv !== conv.convId) e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
                                onMouseLeave={e => { if (activeConv !== conv.convId) e.currentTarget.style.background = 'transparent'; }}
                            >
                                <Avatar
                                    uid={conv.friendUid}
                                    avatarUrl={conv.friendProfile.avatar_url}
                                    avatarStyle={conv.friendProfile.avatar_style}
                                    size={40}
                                />
                                <div className="flex-1 min-w-0">
                                    <div style={{ fontWeight: conv.unread > 0 ? 800 : 700, fontSize: '0.9rem', color: conv.unread > 0 ? '#fff' : 'inherit' }} className="truncate">{conv.friendProfile.full_name}</div>
                                    {conv.lastMessage && (
                                        <div className="truncate" style={{ fontSize: '0.78rem', opacity: conv.unread > 0 ? 0.7 : 0.4, marginTop: '2px', fontWeight: conv.unread > 0 ? 600 : 400 }}>
                                            {conv.lastMessage}
                                        </div>
                                    )}
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', flexShrink: 0 }}>
                                    {conv.lastTime && (
                                        <div style={{ fontSize: '0.7rem', opacity: 0.3 }}>
                                            {conv.lastTime.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                                        </div>
                                    )}
                                    {conv.unread > 0 && (
                                        <span style={{
                                            background: 'var(--color-primary)', color: '#fff',
                                            borderRadius: '50%', minWidth: '20px', height: '20px',
                                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: '0.7rem', fontWeight: 800,
                                        }}>
                                            {conv.unread}
                                        </span>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Right: Chat */}
                <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                    {!activeConv ? (
                        <div className="flex items-center justify-center" style={{ flex: 1, opacity: 0.3 }}>
                            <div className="text-center">
                                <MessageCircle size={48} style={{ margin: '0 auto 1rem' }} />
                                <p>{t('messages_no_selection')}</p>
                            </div>
                        </div>
                    ) : (
                        <>
                            {/* Chat Header */}
                            {activeProfile && (
                                <div className="flex items-center justify-between" style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--color-border)', background: 'rgba(255,255,255,0.02)' }}>
                                    <div className="flex items-center gap-3">
                                        <Avatar
                                            uid={activeProfile.id}
                                            avatarUrl={activeProfile.avatar_url}
                                            avatarStyle={activeProfile.avatar_style}
                                            size={40}
                                            style={{ border: '2px solid rgba(255,255,255,0.05)' }}
                                            onClick={() => router.push(`/user/${activeProfile.id}`)}
                                        />
                                        <div className="flex-1 min-w-0">
                                            <div style={{ fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer' }} onClick={() => router.push(`/user/${activeProfile.id}`)}>
                                                {activeProfile.full_name}
                                            </div>
                                            <div style={{ fontSize: '0.75rem', opacity: 0.4 }}>{activeProfile.email}</div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button className="btn btn-sm btn-ghost" onClick={() => startCall(activeProfile.id, false)} title="Appel vidéo" style={{ padding: '0.4rem', borderRadius: '50%' }}>
                                            <Video size={18} className="text-secondary" />
                                        </button>
                                        <button className="btn btn-sm btn-ghost" onClick={() => startCall(activeProfile.id, true)} title="Appel vocal" style={{ padding: '0.4rem', borderRadius: '50%' }}>
                                            <Phone size={18} className="text-secondary" />
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Messages */}
                            <div style={{ flex: 1, overflow: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                {messages.length === 0 && (
                                    <div className="text-center my-auto" style={{ opacity: 0.3 }}>
                                        <p>{t('messages_start')} 💬</p>
                                    </div>
                                )}
                                {messages.map(msg => {
                                    const isMe = msg.sender_id === user?.uid;
                                    const time = msg.created_at?.toDate?.()?.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) ?? '';
                                    const reactions = msg.reactions || {};
                                    const hasReactions = Object.entries(reactions).filter(([, uids]) => (uids as string[]).length > 0).length > 0;

                                    return (
                                        <div
                                            key={msg.id}
                                            className={`chat-message ${isMe ? 'me' : ''}`}
                                            style={{ position: 'relative' }}
                                            onMouseEnter={() => setHoverMsgId(msg.id)}
                                            onMouseLeave={() => setHoverMsgId(null)}
                                        >
                                            {!isMe && (
                                                <Avatar
                                                    uid={activeProfile?.id}
                                                    avatarUrl={activeProfile?.avatar_url}
                                                    avatarStyle={activeProfile?.avatar_style}
                                                    size={32}
                                                />
                                            )}
                                            <div style={{ maxWidth: '75%', position: 'relative' }}>
                                                <div className={`chat-meta ${isMe ? 'justify-end' : ''}`} style={{ marginBottom: '4px' }}>
                                                    <span className="font-bold text-primary" style={{ fontSize: '0.8rem' }}>{isMe ? 'Vous' : activeProfile?.full_name}</span>
                                                    <span style={{ fontSize: '0.7rem' }}>{time}</span>
                                                </div>
                                                <div
                                                    className={`chat-bubble ${isMe ? 'bg-primary text-white' : ''}`}
                                                    style={{ display: 'inline-block', lineHeight: 1.5, position: 'relative' }}
                                                >
                                                    {msg.content}
                                                    {isMe && (
                                                        <span style={{ fontSize: '0.65rem', marginLeft: '6px', opacity: 0.6 }}>
                                                            {msg.read ? '✓✓' : '✓'}
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Reactions */}
                                                {hasReactions && (
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px', justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
                                                        {Object.entries(reactions).filter(([, uids]) => (uids as string[]).length > 0).map(([emoji, uids]) => (
                                                            <button
                                                                key={emoji}
                                                                onClick={() => handleToggleReaction(msg.id, emoji)}
                                                                style={{
                                                                    display: 'flex', alignItems: 'center', gap: '3px',
                                                                    padding: '2px 8px', borderRadius: '20px', fontSize: '13px',
                                                                    border: (uids as string[]).includes(user?.uid || '') ? '1px solid rgba(99,102,241,0.7)' : '1px solid rgba(255,255,255,0.12)',
                                                                    background: (uids as string[]).includes(user?.uid || '') ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.05)',
                                                                    cursor: 'pointer', transition: 'all 0.15s',
                                                                }}
                                                            >
                                                                {emoji} <span style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.6)' }}>{(uids as string[]).length}</span>
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}

                                                {/* Hover Reaction Toolbar */}
                                                {hoverMsgId === msg.id && (
                                                    <div
                                                        className="fade-enter shadow-glow"
                                                        style={{
                                                            position: 'absolute', top: '-36px', [isMe ? 'right' : 'left']: '10px',
                                                            background: 'var(--color-bg-surface-elevated)', border: '1px solid var(--color-border)',
                                                            borderRadius: '20px', padding: '4px 8px', display: 'flex', gap: '4px', zIndex: 10
                                                        }}
                                                    >
                                                        {QUICK_REACTIONS.map(emoji => (
                                                            <button
                                                                key={emoji}
                                                                onClick={() => handleToggleReaction(msg.id, emoji)}
                                                                style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '16px', padding: '4px', borderRadius: '50%', transition: 'transform 0.15s' }}
                                                                onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.2)'}
                                                                onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                                                                title={emoji}
                                                            >
                                                                {emoji}
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                                <div ref={messagesEndRef} />
                            </div>

                            {/* Input */}
                            <form onSubmit={handleSend} className="flex gap-2" style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--color-border)', background: 'rgba(255,255,255,0.02)' }}>
                                <input
                                    type="text"
                                    className="input flex-grow"
                                    placeholder={t('messages_placeholder')}
                                    value={newMsg}
                                    onChange={e => setNewMsg(e.target.value)}
                                    autoFocus
                                />
                                <button type="submit" className="btn btn-primary" disabled={sending || !newMsg.trim()}>
                                    <Send size={16} />
                                </button>
                            </form>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

export default function Messages() {
    return (
        <Suspense fallback={
            <div className="container py-16 text-center">
                <div style={{ width: '40px', height: '40px', borderRadius: '50%', border: '3px solid var(--color-primary)', borderTopColor: 'transparent', animation: 'spin 1s linear infinite', margin: '0 auto' }} />
            </div>
        }>
            <MessagesContent />
        </Suspense>
    );
}
