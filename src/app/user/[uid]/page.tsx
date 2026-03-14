'use client';

import Avatar from '@/components/Avatar';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { doc, getDoc, collection, query, where, getDocs, setDoc, deleteDoc, Timestamp } from 'firebase/firestore';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from '@/context/LocaleContext';
import { UserPlus, UserCheck, Clock, MessageCircle, ArrowLeft, Users, Check, Target, CalendarDays, Pencil } from 'lucide-react';

const fmtHours = (h: number) => h < 1 ? `${Math.round(h * 60)}min` : `${parseFloat(h.toFixed(2))}h`;

export default function UserProfile() {
    const { uid } = useParams<{ uid: string }>();
    const { user } = useAuth();
    const { t } = useLocale();
    const router = useRouter();

    const [profile, setProfile] = useState<any>(null);
    const [objectives, setObjectives] = useState<any[]>([]);
    const [totalHours, setTotalHours] = useState(0);
    const [totalRooms, setTotalRooms] = useState(0);
    const [loading, setLoading] = useState(true);
    const [friendStatus, setFriendStatus] = useState<'none' | 'pending_sent' | 'pending_received' | 'accepted'>('none');
    const [friendDocId, setFriendDocId] = useState<string | null>(null);
    const [actionLoading, setActionLoading] = useState(false);

    const isMyProfile = user?.uid === uid;

    useEffect(() => {
        if (!uid) return;
        const load = async () => {
            try {
                const userDoc = await getDoc(doc(db, 'users', uid));
                if (userDoc.exists()) {
                    setProfile({ id: userDoc.id, ...userDoc.data() });
                }

                // Stats from memberships
                const memberQ = query(collection(db, 'memberships'), where('user_id', '==', uid));
                const memberSnap = await getDocs(memberQ);
                let hours = 0;
                const objIds: string[] = [];
                memberSnap.docs.forEach(d => {
                    hours += d.data().completed_hours || 0;
                    objIds.push(d.data().objective_id);
                });
                setTotalHours(hours);
                setTotalRooms(memberSnap.docs.length);

                if (objIds.length > 0) {
                    const objPromises = objIds.map(id => getDoc(doc(db, 'objectives', id)));
                    const objDocs = await Promise.all(objPromises);
                    const objs = objDocs
                        .filter(d => d.exists() && d.data()?.is_public)
                        .map(d => ({ id: d.id, ...d.data() }));
                    setObjectives(objs);
                }

                // Check friendship
                if (user && user.uid !== uid) {
                    const fSnap = await getDocs(query(collection(db, 'friendships'),
                        where('user1_id', 'in', [user.uid, uid])));
                    for (const fdoc of fSnap.docs) {
                        const data = fdoc.data();
                        const involves = (data.user1_id === user.uid && data.user2_id === uid) ||
                            (data.user1_id === uid && data.user2_id === user.uid);
                        if (involves) {
                            setFriendDocId(fdoc.id);
                            if (data.status === 'accepted') setFriendStatus('accepted');
                            else if (data.sender_id === user.uid) setFriendStatus('pending_sent');
                            else setFriendStatus('pending_received');
                            break;
                        }
                    }
                }
            } catch (err) {
                console.error('Error loading profile', err);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [uid, user]);

    const handleAddFriend = async () => {
        if (!user || !uid) return;
        setActionLoading(true);
        try {
            const docId = [user.uid, uid].sort().join('_');
            await setDoc(doc(db, 'friendships', docId), {
                user1_id: user.uid < uid ? user.uid : uid,
                user2_id: user.uid < uid ? uid : user.uid,
                sender_id: user.uid,
                status: 'pending',
                created_at: Timestamp.now(),
            });
            setFriendStatus('pending_sent');
            setFriendDocId(docId);
            await setDoc(doc(collection(db, 'users', uid, 'notifications')), {
                type: 'friend_request',
                from_uid: user.uid,
                from_name: user.displayName || user.email,
                message: `${user.displayName || user.email} vous a envoyé une demande d'ami`,
                read: false,
                created_at: Timestamp.now(),
            });
        } catch (err) { console.error(err); }
        finally { setActionLoading(false); }
    };

    const handleAccept = async () => {
        if (!friendDocId) return;
        setActionLoading(true);
        try {
            await setDoc(doc(db, 'friendships', friendDocId), { status: 'accepted' }, { merge: true });
            setFriendStatus('accepted');
        } catch (err) { console.error(err); }
        finally { setActionLoading(false); }
    };

    const handleReject = async () => {
        if (!friendDocId) return;
        setActionLoading(true);
        try {
            await deleteDoc(doc(db, 'friendships', friendDocId));
            setFriendStatus('none');
            setFriendDocId(null);
        } catch (err) { console.error(err); }
        finally { setActionLoading(false); }
    };

    const handleMessage = () => {
        if (!uid) return;
        const convId = [user!.uid, uid].sort().join('_');
        router.push(`/messages?conv=${convId}&to=${uid}`);
    };

    if (loading) {
        return (
            <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '50%', border: '3px solid rgba(99,102,241,0.3)', borderTopColor: '#6366f1', animation: 'spin 0.8s linear infinite' }} />
            </div>
        );
    }

    if (!profile) {
        return (
            <div style={{ minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
                <div style={{ fontSize: '3rem' }}>🔍</div>
                <h2 style={{ color: 'white', margin: 0 }}>Utilisateur introuvable</h2>
                <button className="btn btn-ghost" onClick={() => router.back()}>
                    <ArrowLeft size={15} /> Retour
                </button>
            </div>
        );
    }

    const joinedDate = profile.created_at?.toDate
        ? profile.created_at.toDate()
        : profile.created_at ? new Date(profile.created_at) : null;

    const dp = profile.discipline_profile;

    return (
        <div style={{ minHeight: '100vh', paddingBottom: '4rem' }}>

            {/* ── HERO ── */}
            <div style={{
                background: dp
                    ? `linear-gradient(160deg, ${dp.color}18 0%, rgba(15,15,20,0) 55%)`
                    : 'linear-gradient(160deg, rgba(99,102,241,0.12) 0%, rgba(15,15,20,0) 55%)',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
                padding: '0',
            }}>
                <div style={{ maxWidth: '780px', margin: '0 auto', padding: '2rem 2rem 0' }}>

                    {/* Back */}
                    <button
                        onClick={() => router.back()}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '6px',
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: 'rgba(255,255,255,0.35)', fontSize: '0.82rem',
                            fontWeight: 500, marginBottom: '1.75rem', padding: 0,
                            transition: 'color 0.15s',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.7)')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.35)')}
                    >
                        <ArrowLeft size={15} /> Retour
                    </button>

                    {/* Profile row */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1.5rem', marginBottom: '2rem', flexWrap: 'wrap' }}>

                        {/* Avatar */}
                        <div style={{ flexShrink: 0 }}>
                            <Avatar
                                uid={uid}
                                avatarUrl={profile.avatar_url}
                                avatarStyle={profile.avatar_style}
                                size={90}
                                style={{
                                    border: dp ? `3px solid ${dp.color}60` : '3px solid rgba(99,102,241,0.45)',
                                    boxShadow: dp
                                        ? `0 0 0 6px ${dp.color}12, 0 8px 32px ${dp.color}18`
                                        : '0 0 0 6px rgba(99,102,241,0.08), 0 8px 32px rgba(99,102,241,0.18)',
                                    borderRadius: '50%',
                                }}
                            />
                        </div>

                        {/* Info */}
                        <div style={{ flex: 1, minWidth: 0, paddingTop: '4px' }}>
                            <h1 style={{
                                fontSize: '1.6rem', fontWeight: 800, color: 'white',
                                margin: '0 0 3px', letterSpacing: '-0.03em',
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}>
                                {profile.full_name || 'Utilisateur'}
                            </h1>

                            {joinedDate && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'rgba(255,255,255,0.35)', fontSize: '0.8rem', marginBottom: '10px' }}>
                                    <CalendarDays size={12} />
                                    Membre depuis {joinedDate.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
                                </div>
                            )}

                            {/* Archetype pill */}
                            {dp && (
                                <div style={{
                                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                                    padding: '4px 12px 4px 8px', borderRadius: '20px',
                                    background: `${dp.color}18`, border: `1px solid ${dp.color}35`,
                                    marginBottom: '14px',
                                }}>
                                    <span style={{ fontSize: '0.9rem' }}>{dp.emoji}</span>
                                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: dp.color }}>{dp.type}</span>
                                    <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.3)', fontWeight: 400 }}>· {dp.tagline}</span>
                                </div>
                            )}

                            {/* Action buttons */}
                            {!isMyProfile && user && (
                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                    {friendStatus === 'none' && (
                                        <button
                                            onClick={handleAddFriend} disabled={actionLoading}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: '6px',
                                                padding: '8px 16px', borderRadius: '10px',
                                                background: 'rgba(99,102,241,0.2)',
                                                border: '1px solid rgba(99,102,241,0.5)',
                                                color: '#a5b4fc', fontSize: '0.82rem', fontWeight: 700,
                                                cursor: 'pointer',
                                            }}>
                                            <UserPlus size={14} /> {t('friends_btn_add')}
                                        </button>
                                    )}
                                    {friendStatus === 'pending_sent' && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '10px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.4)', fontSize: '0.82rem', fontWeight: 600 }}>
                                            <Clock size={13} /> Demande envoyée
                                        </div>
                                    )}
                                    {friendStatus === 'pending_received' && (
                                        <>
                                            <button onClick={handleAccept} disabled={actionLoading}
                                                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '10px', background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.4)', color: '#6ee7b7', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer' }}>
                                                <UserCheck size={14} /> {t('friends_btn_accept')}
                                            </button>
                                            <button onClick={handleReject} disabled={actionLoading}
                                                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '10px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}>
                                                {t('friends_btn_reject')}
                                            </button>
                                        </>
                                    )}
                                    {friendStatus === 'accepted' && (
                                        <>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '10px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', color: '#10b981', fontSize: '0.82rem', fontWeight: 600 }}>
                                                <UserCheck size={13} /> {t('friends_already')}
                                            </div>
                                            <button onClick={handleMessage}
                                                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '10px', background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.5)', color: '#a5b4fc', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer' }}>
                                                <MessageCircle size={14} /> {t('friends_btn_message')}
                                            </button>
                                        </>
                                    )}
                                </div>
                            )}

                            {isMyProfile && (
                                <button onClick={() => router.push('/profile')}
                                    style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '10px', background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.35)', color: '#a5b4fc', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer' }}>
                                    <Pencil size={13} /> Modifier mon profil
                                </button>
                            )}
                        </div>

                        {/* Stats */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flexShrink: 0, paddingTop: '4px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderRadius: '14px', background: 'rgba(52,211,153,0.09)', border: '1px solid rgba(52,211,153,0.2)' }}>
                                <Clock size={14} style={{ color: '#34d399' }} />
                                <div>
                                    <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'white', lineHeight: 1 }}>{fmtHours(totalHours)}</div>
                                    <div style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.07em', marginTop: '3px' }}>{t('profile_stat_hours')}</div>
                                </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderRadius: '14px', background: 'rgba(244,114,182,0.09)', border: '1px solid rgba(244,114,182,0.2)' }}>
                                <Target size={14} style={{ color: '#f472b6' }} />
                                <div>
                                    <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'white', lineHeight: 1 }}>{totalRooms}</div>
                                    <div style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.07em', marginTop: '3px' }}>{t('profile_stat_objs')}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── CONTENT ── */}
            <div style={{ maxWidth: '780px', margin: '0 auto', padding: '1.75rem 2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

                {/* ── DISCIPLINE PROFILE CARD ── */}
                {dp && (
                    <div className="card card-glass border border-white/10" style={{ overflow: 'hidden' }}>
                        {/* Header gradient */}
                        <div style={{
                            background: `linear-gradient(135deg, ${dp.color}20, ${dp.color}06)`,
                            borderBottom: `1px solid ${dp.color}25`,
                            padding: '1.5rem 1.75rem',
                            display: 'flex', alignItems: 'flex-start', gap: '1.25rem',
                        }}>
                            <div style={{
                                width: '60px', height: '60px', borderRadius: '16px', flexShrink: 0,
                                background: `${dp.color}18`, border: `1.5px solid ${dp.color}35`,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: '1.8rem',
                                boxShadow: `0 4px 20px ${dp.color}18`,
                            }}>
                                {dp.emoji}
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: '0.6rem', fontWeight: 700, color: dp.color, textTransform: 'uppercase', letterSpacing: '0.13em', marginBottom: '4px' }}>
                                    Profil de discipline
                                </div>
                                <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'white', margin: '0 0 2px', letterSpacing: '-0.025em' }}>
                                    {dp.type}
                                </h3>
                                <p style={{ fontSize: '0.82rem', color: dp.color, fontWeight: 600, margin: '0 0 8px' }}>
                                    {dp.tagline}
                                </p>
                                <p style={{ fontSize: '0.83rem', color: 'rgba(255,255,255,0.55)', margin: 0, lineHeight: 1.65 }}>
                                    {dp.description}
                                </p>
                            </div>
                        </div>

                        {/* Forces + À développer */}
                        <div style={{ padding: '1.25rem 1.75rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
                            <div>
                                <div style={{ fontSize: '0.6rem', fontWeight: 700, color: 'rgba(255,255,255,0.28)', textTransform: 'uppercase', letterSpacing: '0.13em', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                    <span style={{ color: '#10b981' }}>✦</span> Forces
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                                    {dp.strengths?.map((s: string, i: number) => (
                                        <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                                            <div style={{ width: '18px', height: '18px', borderRadius: '6px', flexShrink: 0, marginTop: '1px', background: 'rgba(16,185,129,0.13)', border: '1px solid rgba(16,185,129,0.26)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <Check size={9} style={{ color: '#10b981' }} />
                                            </div>
                                            <span style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.58)', lineHeight: 1.55 }}>{s}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <div style={{ fontSize: '0.6rem', fontWeight: 700, color: 'rgba(255,255,255,0.28)', textTransform: 'uppercase', letterSpacing: '0.13em', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                    <span style={{ color: '#f59e0b' }}>✦</span> À développer
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                                    {dp.growth_areas?.map((g: string, i: number) => (
                                        <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                                            <div style={{ width: '18px', height: '18px', borderRadius: '6px', flexShrink: 0, marginTop: '1px', background: 'rgba(245,158,11,0.11)', border: '1px solid rgba(245,158,11,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', color: '#f59e0b' }}>
                                                →
                                            </div>
                                            <span style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.58)', lineHeight: 1.55 }}>{g}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Tip */}
                        <div style={{ margin: '0 1.5rem 1.5rem', padding: '12px 16px', borderRadius: '12px', background: `${dp.color}0e`, border: `1px solid ${dp.color}22` }}>
                            <div style={{ fontSize: '0.6rem', fontWeight: 700, color: dp.color, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '5px' }}>💡 Conseil personnalisé</div>
                            <p style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.62)', margin: 0, lineHeight: 1.65 }}>{dp.tip}</p>
                        </div>
                    </div>
                )}

                {/* ── OBJECTIFS PUBLICS ── */}
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem' }}>
                        <div style={{ width: '3px', height: '16px', borderRadius: '2px', background: '#6366f1', flexShrink: 0 }} />
                        <h3 style={{ fontSize: '0.82rem', fontWeight: 700, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.09em', margin: 0 }}>
                            {t('profile_public_objectives')}
                        </h3>
                        {objectives.length > 0 && (
                            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.06)', padding: '2px 8px', borderRadius: '20px' }}>
                                {objectives.length}
                            </span>
                        )}
                    </div>

                    {objectives.length === 0 ? (
                        <div style={{ padding: '2.5rem', textAlign: 'center', borderRadius: '16px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                            <div style={{ fontSize: '2rem', marginBottom: '8px', opacity: 0.4 }}>📭</div>
                            <p style={{ color: 'rgba(255,255,255,0.3)', margin: 0, fontSize: '0.85rem' }}>{t('profile_no_objectives')}</p>
                        </div>
                    ) : (
                        <div style={{ display: 'grid', gap: '0.75rem' }}>
                            {objectives.map((obj: any) => {
                                const perc = Math.min(100, Math.round(((obj.completed_hours ?? 0) / (obj.target_hours || 1)) * 100));
                                return (
                                    <div
                                        key={obj.id}
                                        onClick={() => router.push(`/objective/${obj.id}`)}
                                        style={{
                                            padding: '1.1rem 1.4rem', borderRadius: '14px', cursor: 'pointer',
                                            background: 'rgba(255,255,255,0.03)',
                                            border: '1px solid rgba(255,255,255,0.07)',
                                            transition: 'border-color 0.18s, background 0.18s',
                                        }}
                                        onMouseEnter={e => {
                                            e.currentTarget.style.borderColor = 'rgba(99,102,241,0.4)';
                                            e.currentTarget.style.background = 'rgba(99,102,241,0.05)';
                                        }}
                                        onMouseLeave={e => {
                                            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)';
                                            e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                                            <h4 style={{ margin: 0, fontWeight: 700, fontSize: '0.9rem', color: 'white' }}>{obj.title}</h4>
                                            <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '3px 9px', borderRadius: '8px', background: 'rgba(99,102,241,0.14)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.2)', flexShrink: 0, marginLeft: '8px' }}>
                                                {obj.category}
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'rgba(255,255,255,0.35)', fontSize: '0.75rem' }}>
                                                <Users size={12} /> {obj.participant_count ?? '?'} membres
                                            </div>
                                            <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.3)', fontWeight: 600 }}>{perc}%</span>
                                        </div>
                                        <div style={{ height: '3px', borderRadius: '2px', background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                                            <div style={{ height: '100%', width: `${perc}%`, background: 'linear-gradient(90deg, #6366f1, #818cf8)', borderRadius: '2px', transition: 'width 0.6s ease' }} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
