'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, setDoc, doc, getDoc } from 'firebase/firestore';
import { useAuth } from '@/context/AuthContext';
import { Users, Clock, Lock, Globe, LogIn } from 'lucide-react';
import Avatar from '@/components/Avatar';

export default function JoinByCode() {
    const { code } = useParams();
    const { user } = useAuth();
    const router = useRouter();

    const [objective, setObjective] = useState<any>(null);
    const [members, setMembers] = useState<any[]>([]);
    const [status, setStatus] = useState<'loading' | 'found' | 'not_found' | 'disabled' | 'joined'>('loading');
    const [joining, setJoining] = useState(false);
    const [alreadyMember, setAlreadyMember] = useState(false);

    useEffect(() => {
        const lookup = async () => {
            try {
                const q = query(collection(db, 'objectives'), where('invite_code', '==', (code as string).toUpperCase()));
                const snap = await getDocs(q);
                if (snap.empty) { setStatus('not_found'); return; }

                const objDoc = snap.docs[0];
                const obj: any = { id: objDoc.id, ...objDoc.data() };

                // Check if link is active
                if (!obj.is_public && !obj.invite_link_enabled) {
                    setStatus('disabled');
                    return;
                }

                setObjective(obj);

                // Load member count
                const memSnap = await getDocs(query(collection(db, 'memberships'), where('objective_id', '==', obj.id)));
                const memberData = await Promise.all(memSnap.docs.map(async m => {
                    const mData = m.data();
                    const uSnap = await getDoc(doc(db, 'users', mData.user_id));
                    return { uid: mData.user_id, ...(uSnap.exists() ? uSnap.data() : {}) };
                }));
                setMembers(memberData);

                // Check if already a member
                if (user) {
                    const alreadyIn = memSnap.docs.some(m => m.data().user_id === user.uid);
                    setAlreadyMember(alreadyIn);
                }

                setStatus('found');
            } catch (err) {
                console.error(err);
                setStatus('not_found');
            }
        };
        if (code) lookup();
    }, [code, user]);

    const handleJoin = async () => {
        if (!user) {
            router.push(`/login?redirect=/join/${code}`);
            return;
        }
        if (!objective) return;
        setJoining(true);
        try {
            await setDoc(doc(db, 'memberships', `${user.uid}_${objective.id}`), {
                user_id: user.uid,
                objective_id: objective.id,
                completed_hours: 0,
            });
            router.push(`/objective/${objective.id}`);
        } catch (err) {
            console.error(err);
            setJoining(false);
        }
    };

    // Loading
    if (status === 'loading') {
        return (
            <div className="container py-20 text-center fade-enter" style={{ maxWidth: '480px', margin: '0 auto' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '50%', border: '3px solid var(--color-primary)', borderTopColor: 'transparent', animation: 'spin 1s linear infinite', margin: '0 auto' }} />
            </div>
        );
    }

    // Not found
    if (status === 'not_found') {
        return (
            <div className="container py-20 text-center fade-enter" style={{ maxWidth: '480px', margin: '0 auto' }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔍</div>
                <h2 style={{ marginBottom: '0.5rem' }}>Lien introuvable</h2>
                <p style={{ opacity: 0.5, marginBottom: '2rem' }}>Ce code d'invitation ne correspond à aucun salon.</p>
                <button className="btn btn-primary" onClick={() => router.push('/explore')}>Explorer les salons</button>
            </div>
        );
    }

    // Disabled
    if (status === 'disabled') {
        return (
            <div className="container py-20 text-center fade-enter" style={{ maxWidth: '480px', margin: '0 auto' }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔒</div>
                <h2 style={{ marginBottom: '0.5rem' }}>Lien désactivé</h2>
                <p style={{ opacity: 0.5, marginBottom: '2rem' }}>Ce lien d'invitation a été désactivé par l'administrateur du salon.</p>
                <button className="btn btn-primary" onClick={() => router.push('/explore')}>Explorer les salons</button>
            </div>
        );
    }

    return (
        <div className="container py-16 fade-enter" style={{ maxWidth: '520px', margin: '0 auto' }}>
            {/* Card */}
            <div className="card card-glass" style={{ padding: '2.5rem', textAlign: 'center', borderTop: '3px solid var(--color-primary)' }}>
                {/* Badge */}
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', fontWeight: 700, padding: '4px 12px', borderRadius: '20px', marginBottom: '1.5rem', background: objective?.is_public ? 'rgba(34,197,94,0.12)' : 'rgba(99,102,241,0.12)', color: objective?.is_public ? '#4ade80' : '#818cf8', border: objective?.is_public ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(99,102,241,0.3)' }}>
                    {objective?.is_public ? <Globe size={12} /> : <Lock size={12} />}
                    {objective?.is_public ? 'Salon public' : 'Salon privé'}
                </div>

                <h1 style={{ fontSize: '1.8rem', fontWeight: 800, marginBottom: '0.5rem', lineHeight: 1.2 }}>{objective?.title}</h1>

                {objective?.description && (
                    <p style={{ opacity: 0.6, marginBottom: '1.5rem', lineHeight: 1.6 }}>{objective.description}</p>
                )}

                {/* Stats row */}
                <div className="flex justify-center gap-6 mb-6" style={{ flexWrap: 'wrap' }}>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ fontWeight: 800, fontSize: '1.4rem' }}>{members.length}</div>
                        <div style={{ fontSize: '0.75rem', opacity: 0.5 }}>membres</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ fontWeight: 800, fontSize: '1.4rem' }}>{objective?.target_hours}h</div>
                        <div style={{ fontSize: '0.75rem', opacity: 0.5 }}>objectif</div>
                    </div>
                    {objective?.category && (
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontWeight: 800, fontSize: '1.4rem' }}>📁</div>
                            <div style={{ fontSize: '0.75rem', opacity: 0.5 }}>{objective.category}</div>
                        </div>
                    )}
                </div>

                {/* Member avatars */}
                {members.length > 0 && (
                    <div className="flex justify-center mb-6">
                        {members.slice(0, 6).map((m, i) => (
                            <Avatar
                                key={m.uid}
                                uid={m.uid}
                                avatarUrl={m.avatar_url}
                                avatarStyle={m.avatar_style}
                                size={36}
                                style={{ border: '2px solid var(--color-bg)', marginLeft: i === 0 ? 0 : '-10px' }}
                            />
                        ))}
                        {members.length > 6 && (
                            <div style={{ width: '36px', height: '36px', borderRadius: '50%', border: '2px solid var(--color-bg)', marginLeft: '-10px', background: 'rgba(99,102,241,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 700, color: '#818cf8' }}>
                                +{members.length - 6}
                            </div>
                        )}
                    </div>
                )}

                {/* CTA */}
                {alreadyMember ? (
                    <button className="btn btn-primary w-full" style={{ justifyContent: 'center' }} onClick={() => router.push(`/objective/${objective.id}`)}>
                        ✓ Déjà membre · Ouvrir le salon
                    </button>
                ) : !user ? (
                    <div>
                        <p style={{ fontSize: '0.85rem', opacity: 0.55, marginBottom: '1rem' }}>Connectez-vous pour rejoindre ce salon.</p>
                        <button className="btn btn-primary w-full" style={{ justifyContent: 'center', display: 'flex', alignItems: 'center', gap: '8px' }} onClick={() => router.push(`/login?redirect=/join/${code}`)}>
                            <LogIn size={16} /> Se connecter
                        </button>
                    </div>
                ) : (
                    <button
                        className="btn btn-primary w-full"
                        style={{ justifyContent: 'center', opacity: joining ? 0.6 : 1 }}
                        onClick={handleJoin}
                        disabled={joining}
                    >
                        {joining ? 'Rejoindre...' : '✨ Rejoindre le salon'}
                    </button>
                )}
            </div>
        </div>
    );
}
