'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, getDoc, addDoc, updateDoc, deleteDoc, setDoc, serverTimestamp, Timestamp, limit } from 'firebase/firestore';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { Users, Target, Zap, CheckCircle, Clock, AlertCircle, X, ChevronRight, MapPin, Navigation2, RefreshCw } from 'lucide-react';
import Avatar from '@/components/Avatar';

interface Partner {
    id: string;
    full_name: string;
    avatar_url?: string;
    avatar_style?: string;
    weeklyGoal: number;
    goalFrequency?: string;
    objective_id?: string;
    partnerProfile: any;
    isInviter: boolean;
    status: string;
    invite_title?: string;
    last_nudged_at?: any;
    last_active?: any;
    activeSessionId?: string | null;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function distanceBadge(km: number): { label: string; color: string } {
    if (km < 1.5) return { label: 'Votre quartier', color: '#10b981' };
    if (km < 15) return { label: 'Votre ville', color: '#6366f1' };
    return { label: `${Math.round(km)} km`, color: '#8b5cf6' };
}

export default function AccountabilityPage() {
    const { user } = useAuth();
    const router = useRouter();

    const [partners, setPartners] = useState<Partner[]>([]);
    const [friends, setFriends] = useState<any[]>([]);
    const [myObjectives, setMyObjectives] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showInviteForm, setShowInviteForm] = useState(false);
    const [selectedFriend, setSelectedFriend] = useState<any>(null);
    const [selectedObjectiveId, setSelectedObjectiveId] = useState('');
    const [weeklyGoalInput, setWeeklyGoalInput] = useState('5');
    const [goalFrequencyInput, setGoalFrequencyInput] = useState('weekly');
    const [goalEnabled, setGoalEnabled] = useState(true);
    const [salonEnabled, setSalonEnabled] = useState(false);
    const [inviteTitle, setInviteTitle] = useState('');
    const [sending, setSending] = useState(false);
    const [nudging, setNudging] = useState<string | null>(null);

    // Geo-located accountability
    const [myGeo, setMyGeo] = useState<{ lat: number; lng: number; city: string; neighborhood?: string; visible: boolean } | null>(null);
    const [geoLoading, setGeoLoading] = useState(false);
    const [nearbyUsers, setNearbyUsers] = useState<any[]>([]);
    const [invitingNearby, setInvitingNearby] = useState<string | null>(null);
    const [geoInviteTarget, setGeoInviteTarget] = useState<string | null>(null);
    const [geoGoalEnabled, setGeoGoalEnabled] = useState(true);
    const [geoGoalInput, setGeoGoalInput] = useState('5');
    const [geoFreqInput, setGeoFreqInput] = useState('weekly');
    const [geoSalonEnabled, setGeoSalonEnabled] = useState(false);
    const [geoSalonObjectiveId, setGeoSalonObjectiveId] = useState('');
    const [geoInviteTitle, setGeoInviteTitle] = useState('');

    useEffect(() => {
        if (!user) return;
        load();
        loadMyGeo();
    }, [user]);

    const load = async () => {
        setLoading(true);
        try {
            // Load accountability pairs
            const q1 = query(collection(db, 'accountability_pairs'), where('user1_id', '==', user!.uid));
            const q2 = query(collection(db, 'accountability_pairs'), where('user2_id', '==', user!.uid));
            const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);

            const allPairs = [...snap1.docs, ...snap2.docs];
            const seen = new Set<string>();
            const uniquePairs = allPairs.filter(d => { if (seen.has(d.id)) return false; seen.add(d.id); return true; });

            const partnerList: Partner[] = [];
            for (const pdoc of uniquePairs) {
                const data = pdoc.data();
                const partnerUid = data.user1_id === user!.uid ? data.user2_id : data.user1_id;
                const profileDoc = await getDoc(doc(db, 'users', partnerUid));
                const profile = profileDoc.exists() ? { id: profileDoc.id, ...profileDoc.data() } : { id: partnerUid, full_name: 'Utilisateur' };

                // Try to get last seen from any presence document
                let presenceDoc = null;
                try {
                    const presQ = query(collection(db, 'presence_global'), where('uid', '==', partnerUid));
                    const presSnap = await getDocs(presQ);
                    if (!presSnap.empty) {
                        presenceDoc = presSnap.docs[0]; // Get the DocumentSnapshot
                    }
                } catch { /* ignore */ }

                partnerList.push({
                    id: pdoc.id,
                    full_name: (profile as any).full_name || 'Utilisateur',
                    avatar_url: (profile as any).avatar_url || '',
                    avatar_style: (profile as any).avatar_style || '',
                    weeklyGoal: data.weekly_hours_goal ?? 5,
                    goalFrequency: data.goal_frequency ?? 'weekly',
                    objective_id: data.objective_id,
                    partnerProfile: profile,
                    isInviter: data.inviter_id === user!.uid,
                    status: data.status,
                    invite_title: data.invite_title || undefined,
                    last_nudged_at: data.last_nudged_at,
                    last_active: presenceDoc?.exists() ? presenceDoc.data().last_seen : null,
                    activeSessionId: presenceDoc?.exists() && (Date.now() - (presenceDoc.data().last_seen?.toMillis?.() || 0) < 5 * 60 * 1000) ? presenceDoc.data().active_session_id : null,
                });
            }
            setPartners(partnerList);

            // Load accepted friends (to invite new partners)
            const fq1 = query(collection(db, 'friendships'), where('user1_id', '==', user!.uid), where('status', '==', 'accepted'));
            const fq2 = query(collection(db, 'friendships'), where('user2_id', '==', user!.uid), where('status', '==', 'accepted'));
            const [fs1, fs2] = await Promise.all([getDocs(fq1), getDocs(fq2)]);
            const allFriends = [...fs1.docs, ...fs2.docs];
            const seenF = new Set<string>();
            const uniqueFriends = allFriends.filter(d => { if (seenF.has(d.id)) return false; seenF.add(d.id); return true; });

            const friendList: any[] = [];
            for (const fdoc of uniqueFriends) {
                const data = fdoc.data();
                const friendUid = data.user1_id === user!.uid ? data.user2_id : data.user1_id;
                // Skip if already a partner
                if (partnerList.some(p => p.partnerProfile.id === friendUid)) continue;
                const userDoc = await getDoc(doc(db, 'users', friendUid));
                const profile = userDoc.exists() ? { id: userDoc.id, ...userDoc.data() } : { id: friendUid, full_name: 'Utilisateur' };
                friendList.push(profile);
            }
            setFriends(friendList);

            // Load user's objectives for salon linking
            const myMemQ = query(collection(db, 'memberships'), where('user_id', '==', user!.uid));
            const myMemSnap = await getDocs(myMemQ);
            const objIds = myMemSnap.docs.map(d => d.data().objective_id as string);
            const objDocs = await Promise.all(objIds.map(oid => getDoc(doc(db, 'objectives', oid))));
            setMyObjectives(objDocs.filter(d => d.exists()).map(d => ({ id: d.id, ...d.data() })));
        } catch (err) {
            console.error('Accountability load error', err);
        } finally {
            setLoading(false);
        }
    };

    const handleSendInvite = async () => {
        if (!user || !selectedFriend || sending) return;
        setSending(true);
        try {
            const goal = goalEnabled ? (parseFloat(weeklyGoalInput) || 5) : 0;
            await addDoc(collection(db, 'accountability_pairs'), {
                user1_id: user.uid,
                user2_id: selectedFriend.id,
                inviter_id: user.uid,
                weekly_hours_goal: goal,
                goal_frequency: goalEnabled ? goalFrequencyInput : 'weekly',
                objective_id: (salonEnabled && selectedObjectiveId) ? selectedObjectiveId : null,
                invite_title: inviteTitle.trim() || null,
                status: 'pending',
                created_at: serverTimestamp(),
            });
            const senderName = user.displayName || user.email?.split('@')[0] || 'Un utilisateur';
            const notifMsg = inviteTitle.trim()
                ? `${senderName} vous invite à rejoindre son partenariat d'accountability : "${inviteTitle.trim()}"`
                : `${senderName} vous invite à devenir partenaire d'accountability${goal > 0 ? ` avec un objectif de ${goal}h/${goalFrequencyInput === 'daily' ? 'jour' : goalFrequencyInput === 'monthly' ? 'mois' : 'semaine'}` : ''}.`;
            await addDoc(collection(db, 'users', selectedFriend.id, 'notifications'), {
                type: 'accountability_invite',
                message: notifMsg,
                link: '/accountability',
                read: false,
                created_at: serverTimestamp(),
            });
            setShowInviteForm(false);
            setSelectedFriend(null);
            setWeeklyGoalInput('5');
            setSelectedObjectiveId('');
            setInviteTitle('');
            load();
        } catch (err) {
            console.error(err);
        } finally {
            setSending(false);
        }
    };

    const handleAccept = async (pairId: string, partnerUid: string) => {
        await updateDoc(doc(db, 'accountability_pairs', pairId), { status: 'active' });
        await addDoc(collection(db, 'users', partnerUid, 'notifications'), {
            type: 'accountability_accepted',
            message: `${user!.displayName || user!.email?.split('@')[0] || 'Votre partenaire'} a accepté votre invitation d'accountability !`,
            link: '/accountability',
            read: false,
            created_at: serverTimestamp(),
        });
        load();
    };

    const handleDecline = async (pairId: string) => {
        await deleteDoc(doc(db, 'accountability_pairs', pairId));
        load();
    };

    const handleNudge = async (partnerUid: string, partnerName: string) => {
        if (nudging) return;
        setNudging(partnerUid);
        try {
            await addDoc(collection(db, 'users', partnerUid, 'notifications'), {
                type: 'accountability_nudge',
                message: `${user!.displayName || user!.email?.split('@')[0] || 'Votre partenaire'} vous envoie un coup de pouce — il est temps de travailler ! 💪`,
                link: '/dashboard',
                read: false,
                created_at: serverTimestamp(),
            });
        } catch (err) {
            console.error(err);
        } finally {
            setTimeout(() => setNudging(null), 3000);
        }
    };

    const loadMyGeo = async () => {
        if (!user) return;
        const snap = await getDoc(doc(db, 'users', user.uid));
        if (snap.exists() && snap.data().geo_visible) {
            const d = snap.data();
            setMyGeo({ lat: d.geo_lat, lng: d.geo_lng, city: d.geo_city || '', neighborhood: d.geo_neighborhood, visible: true });
            await loadNearbyUsers(d.geo_lat, d.geo_lng, d.geo_city || '');
        }
    };

    const loadNearbyUsers = async (myLat: number, myLng: number, myCity: string) => {
        if (!user) return;
        setGeoLoading(true);
        try {
            const q = query(collection(db, 'users'), where('geo_visible', '==', true), limit(80));
            const snap = await getDocs(q);
            const existing = new Set(partners.map(p => p.partnerProfile.id));
            const results: any[] = [];
            snap.forEach(d => {
                if (d.id === user.uid) return;
                if (existing.has(d.id)) return;
                const data = d.data();
                const km = haversineKm(myLat, myLng, data.geo_lat, data.geo_lng);
                if (km > 50) return;
                results.push({ id: d.id, ...data, _distanceKm: km });
            });
            results.sort((a, b) => a._distanceKm - b._distanceKm);
            setNearbyUsers(results.slice(0, 20));
        } catch (err) {
            console.error('loadNearbyUsers error', err);
        } finally {
            setGeoLoading(false);
        }
    };

    const handleEnableGeo = async () => {
        if (!user || geoLoading) return;
        setGeoLoading(true);
        try {
            const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
                navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 })
            );
            const { latitude: lat, longitude: lng } = pos.coords;

            // Reverse geocode via Nominatim (free, no API key)
            let city = '';
            let neighborhood = '';
            try {
                const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`, {
                    headers: { 'Accept-Language': 'fr' },
                });
                const data = await res.json();
                const addr = data.address || {};
                city = addr.city || addr.town || addr.village || addr.county || '';
                neighborhood = addr.suburb || addr.neighbourhood || addr.quarter || '';
            } catch { /* ignore geocode errors */ }

            const update = { geo_visible: true, geo_lat: lat, geo_lng: lng, geo_city: city, geo_neighborhood: neighborhood, geo_updated_at: serverTimestamp() };
            await setDoc(doc(db, 'users', user.uid), update, { merge: true });
            setMyGeo({ lat, lng, city, neighborhood, visible: true });
            await loadNearbyUsers(lat, lng, city);
        } catch (err: any) {
            if (err?.code === 1) alert('Accès à la géolocalisation refusé. Veuillez l\'autoriser dans les paramètres du navigateur.');
            else console.error('geo error', err);
        } finally {
            setGeoLoading(false);
        }
    };

    const handleDisableGeo = async () => {
        if (!user) return;
        await setDoc(doc(db, 'users', user.uid), { geo_visible: false }, { merge: true });
        setMyGeo(null);
        setNearbyUsers([]);
    };

    const handleInviteNearby = async (nearbyUser: any) => {
        if (!user || invitingNearby) return;
        setInvitingNearby(nearbyUser.id);
        const goal = geoGoalEnabled ? (parseFloat(geoGoalInput) || 5) : 0;
        try {
            await addDoc(collection(db, 'accountability_pairs'), {
                user1_id: user.uid,
                user2_id: nearbyUser.id,
                inviter_id: user.uid,
                weekly_hours_goal: goal,
                goal_frequency: geoGoalEnabled ? geoFreqInput : 'weekly',
                objective_id: (geoSalonEnabled && geoSalonObjectiveId) ? geoSalonObjectiveId : null,
                invite_title: geoInviteTitle.trim() || null,
                status: 'pending',
                created_at: serverTimestamp(),
                source: 'geo',
            });
            const senderNameGeo = user.displayName || user.email?.split('@')[0] || 'Un utilisateur';
            const notifMsgGeo = geoInviteTitle.trim()
                ? `${senderNameGeo} près de chez vous vous invite à rejoindre son partenariat : "${geoInviteTitle.trim()}"`
                : `${senderNameGeo} près de chez vous vous invite à devenir partenaire d'accountability !`;
            await addDoc(collection(db, 'users', nearbyUser.id, 'notifications'), {
                type: 'accountability_invite',
                message: notifMsgGeo,
                link: '/accountability',
                read: false,
                created_at: serverTimestamp(),
            });
            setNearbyUsers(prev => prev.filter(u => u.id !== nearbyUser.id));
            setGeoInviteTarget(null);
        } catch (err) {
            console.error(err);
        } finally {
            setInvitingNearby(null);
        }
    };

    const getDaysSinceLastSeen = (lastSeen: Date | null): number | null => {
        if (!lastSeen) return null;
        const diffMs = Date.now() - lastSeen.getTime();
        return Math.floor(diffMs / (1000 * 60 * 60 * 24));
    };

    if (!user) {
        return (
            <div className="container py-16 text-center fade-enter">
                <h2>Connectez-vous pour accéder à l'accountability</h2>
                <button className="btn btn-primary mt-4" onClick={() => router.push('/login')}>Connexion</button>
            </div>
        );
    }

    const activePartners = partners.filter(p => p.status === 'active');
    const pendingPartners = partners.filter(p => p.status === 'pending');

    return (
        <div className="container fade-enter" style={{ maxWidth: '820px', padding: '2rem 1.5rem' }}>
            {/* Header */}
            <div className="flex justify-between items-start mb-8 flex-wrap gap-4">
                <div>
                    <h2 className="flex items-center gap-3 m-0" style={{ fontSize: '1.8rem', fontWeight: 800, background: 'linear-gradient(to right, #fff, #a1a1aa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                        <Target size={26} style={{ color: 'var(--color-primary)', WebkitTextFillColor: 'initial' }} />
                        Accountability
                    </h2>
                    <p className="text-secondary m-0 mt-1 text-sm">Restez motivés ensemble — fixez un objectif hebdomadaire et encouragez-vous mutuellement.</p>
                </div>
                {friends.length > 0 && (
                    <button
                        className="btn btn-primary shadow-glow"
                        onClick={() => setShowInviteForm(v => !v)}
                    >
                        {showInviteForm ? '✕ Annuler' : '+ Inviter un ami'}
                    </button>
                )}
            </div>

            {/* Invite form */}
            {showInviteForm && (
                <div className="card card-glass mb-8 fade-enter" style={{ border: '1px solid rgba(99,102,241,0.35)', background: 'rgba(10,10,20,0.6)', padding: 0, overflow: 'hidden' }}>
                    {/* Form header */}
                    <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid rgba(99,102,241,0.15)', background: 'rgba(99,102,241,0.06)' }}>
                        <h4 className="m-0" style={{ fontWeight: 700, fontSize: '1rem' }}>
                            Nouvelle invitation
                        </h4>
                        <p style={{ margin: '2px 0 0', fontSize: '0.8rem', opacity: 0.45 }}>
                            {selectedFriend ? `→ ${selectedFriend.full_name || selectedFriend.email}` : 'Sélectionnez un ami pour commencer'}
                        </p>
                    </div>

                    <div style={{ padding: '1.5rem' }}>
                        {friends.length === 0 ? (
                            <p className="text-secondary" style={{ fontSize: '0.9rem' }}>Vous n'avez pas encore d'amis disponibles. <a href="/friends" style={{ color: 'var(--color-primary)' }}>Ajoutez des amis</a> d'abord.</p>
                        ) : (
                            <>
                                {/* Friend picker */}
                                <p style={{ fontSize: '0.78rem', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', opacity: 0.4, marginBottom: '0.75rem' }}>Choisir un ami</p>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '0.6rem', marginBottom: '1.5rem' }}>
                                    {friends.map(f => {
                                        const sel = selectedFriend?.id === f.id;
                                        return (
                                            <div
                                                key={f.id}
                                                onClick={() => setSelectedFriend(sel ? null : f)}
                                                style={{
                                                    display: 'flex', alignItems: 'center', gap: '0.7rem', padding: '0.7rem 0.9rem',
                                                    borderRadius: '12px', cursor: 'pointer', transition: 'all 0.18s', position: 'relative',
                                                    border: sel ? '2px solid var(--color-primary)' : '1px solid rgba(255,255,255,0.08)',
                                                    background: sel ? 'rgba(99,102,241,0.12)' : 'rgba(255,255,255,0.02)',
                                                    boxShadow: sel ? '0 0 0 3px rgba(99,102,241,0.15)' : 'none',
                                                }}
                                            >
                                                <Avatar uid={f.id} avatarUrl={f.avatar_url} avatarStyle={f.avatar_style} size={34} />
                                                <div className="min-w-0 flex-1">
                                                    <div style={{ fontWeight: 600, fontSize: '0.88rem' }} className="truncate">{f.full_name || f.email}</div>
                                                    <div style={{ fontSize: '0.72rem', opacity: 0.4 }} className="truncate">{f.email}</div>
                                                </div>
                                                {sel && (
                                                    <div style={{ width: '18px', height: '18px', borderRadius: '50%', background: 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                        <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Divider */}
                                <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)', margin: '0 0 1.25rem' }} />

                                {/* Options */}
                                <p style={{ fontSize: '0.78rem', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', opacity: 0.4, marginBottom: '1rem' }}>Paramètres</p>

                                {/* Goal toggle row */}
                                <div style={{ marginBottom: '0.875rem' }}>
                                    <div className="flex items-center justify-between" style={{ marginBottom: goalEnabled ? '0.75rem' : '0' }}>
                                        <div>
                                            <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Objectif commun</div>
                                            <div style={{ fontSize: '0.78rem', opacity: 0.45, marginTop: '1px' }}>Fixez un nombre d'heures à atteindre ensemble</div>
                                        </div>
                                        {/* Toggle switch */}
                                        <div
                                            onClick={() => setGoalEnabled(v => !v)}
                                            style={{
                                                width: '42px', height: '24px', borderRadius: '12px', cursor: 'pointer', flexShrink: 0,
                                                background: goalEnabled ? 'var(--color-primary)' : 'rgba(255,255,255,0.12)',
                                                position: 'relative', transition: 'background 0.2s',
                                            }}
                                        >
                                            <div style={{
                                                position: 'absolute', top: '3px', left: goalEnabled ? '21px' : '3px',
                                                width: '18px', height: '18px', borderRadius: '50%', background: '#fff',
                                                transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                                            }} />
                                        </div>
                                    </div>
                                    {goalEnabled && (
                                        <div className="flex items-center gap-2" style={{ padding: '0.75rem 1rem', borderRadius: '10px', background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)' }}>
                                            <input
                                                type="number"
                                                min="1"
                                                max="40"
                                                value={weeklyGoalInput}
                                                onChange={e => setWeeklyGoalInput(e.target.value)}
                                                className="input"
                                                style={{ width: '64px', textAlign: 'center', fontWeight: 700, fontSize: '1.1rem', padding: '4px 8px' }}
                                            />
                                            <span style={{ fontSize: '0.85rem', opacity: 0.6 }}>heures /</span>
                                            <div className="flex gap-1">
                                                {(['daily', 'weekly', 'monthly'] as const).map(f => (
                                                    <button
                                                        key={f}
                                                        onClick={() => setGoalFrequencyInput(f)}
                                                        style={{
                                                            padding: '4px 10px', borderRadius: '8px', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 600,
                                                            background: goalFrequencyInput === f ? 'var(--color-primary)' : 'rgba(255,255,255,0.06)',
                                                            border: goalFrequencyInput === f ? 'none' : '1px solid rgba(255,255,255,0.1)',
                                                            color: goalFrequencyInput === f ? '#fff' : 'rgba(255,255,255,0.55)',
                                                            transition: 'all 0.15s',
                                                        }}
                                                    >
                                                        {f === 'daily' ? 'jour' : f === 'weekly' ? 'semaine' : 'mois'}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Salon toggle row */}
                                {myObjectives.length > 0 && (
                                    <div style={{ marginBottom: '1.25rem' }}>
                                        <div className="flex items-center justify-between" style={{ marginBottom: salonEnabled ? '0.75rem' : '0' }}>
                                            <div>
                                                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Salon lié</div>
                                                <div style={{ fontSize: '0.78rem', opacity: 0.45, marginTop: '1px' }}>Associez un salon de travail à ce partenariat</div>
                                            </div>
                                            <div
                                                onClick={() => setSalonEnabled(v => !v)}
                                                style={{
                                                    width: '42px', height: '24px', borderRadius: '12px', cursor: 'pointer', flexShrink: 0,
                                                    background: salonEnabled ? 'var(--color-primary)' : 'rgba(255,255,255,0.12)',
                                                    position: 'relative', transition: 'background 0.2s',
                                                }}
                                            >
                                                <div style={{
                                                    position: 'absolute', top: '3px', left: salonEnabled ? '21px' : '3px',
                                                    width: '18px', height: '18px', borderRadius: '50%', background: '#fff',
                                                    transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                                                }} />
                                            </div>
                                        </div>
                                        {salonEnabled && (
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.5rem' }}>
                                                {myObjectives.map(o => (
                                                    <div
                                                        key={o.id}
                                                        onClick={() => setSelectedObjectiveId(selectedObjectiveId === o.id ? '' : o.id)}
                                                        style={{
                                                            padding: '0.6rem 0.9rem', borderRadius: '10px', cursor: 'pointer', transition: 'all 0.15s',
                                                            display: 'flex', alignItems: 'center', gap: '0.6rem',
                                                            border: selectedObjectiveId === o.id ? '2px solid var(--color-primary)' : '1px solid rgba(255,255,255,0.08)',
                                                            background: selectedObjectiveId === o.id ? 'rgba(99,102,241,0.1)' : 'rgba(255,255,255,0.02)',
                                                        }}
                                                    >
                                                        <div style={{ fontSize: '0.85rem', fontWeight: 600 }} className="truncate flex-1">{o.title}</div>
                                                        {selectedObjectiveId === o.id && (
                                                            <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                                <svg width="9" height="7" viewBox="0 0 9 7" fill="none"><path d="M1 3.5L3 6L8 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Title field */}
                                <div style={{ marginBottom: '1.25rem' }}>
                                    <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '4px' }}>Titre du partenariat <span style={{ opacity: 0.4, fontWeight: 400, fontSize: '0.8rem' }}>(optionnel)</span></div>
                                    <div style={{ fontSize: '0.78rem', opacity: 0.45, marginBottom: '0.6rem' }}>Donnez un nom à cette collaboration</div>
                                    <input
                                        type="text"
                                        placeholder="ex: Projet de fin d'études, Routine matin, …"
                                        maxLength={60}
                                        value={inviteTitle}
                                        onChange={e => setInviteTitle(e.target.value)}
                                        className="input w-full"
                                        style={{ fontSize: '0.88rem', padding: '0.55rem 0.85rem' }}
                                    />
                                </div>

                                {/* Send button */}
                                <button
                                    className="btn btn-primary w-full"
                                    onClick={handleSendInvite}
                                    disabled={!selectedFriend || sending}
                                    style={{ opacity: !selectedFriend ? 0.45 : 1, justifyContent: 'center', padding: '0.75rem', fontSize: '0.95rem', fontWeight: 700 }}
                                >
                                    {sending ? (
                                        <div style={{ width: '16px', height: '16px', borderRadius: '50%', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', animation: 'spin 1s linear infinite' }} />
                                    ) : (
                                        <>Envoyer l'invitation{selectedFriend ? ` à ${selectedFriend.full_name?.split(' ')[0] || 'cet ami'}` : ''}</>
                                    )}
                                </button>
                            </>
                        )}
                    </div>
                </div>
            )}

            {loading ? (
                <div className="card card-glass text-center py-16">
                    <div style={{ width: '2rem', height: '2rem', borderRadius: '50%', border: '3px solid var(--color-border)', borderTopColor: 'var(--color-primary)', animation: 'spin 1s linear infinite', margin: '0 auto' }} />
                    <p className="text-secondary mt-4">Chargement...</p>
                </div>
            ) : (
                <>
                    {/* Pending invitations */}
                    {pendingPartners.length > 0 && (
                        <div className="mb-8">
                            <h4 className="text-secondary mb-4" style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                                Invitations en attente ({pendingPartners.length})
                            </h4>
                            <div className="flex flex-col gap-3">
                                {pendingPartners.map(p => (
                                    <div key={p.id} className="card card-glass fade-enter" style={{ padding: '1.25rem', border: '1px solid rgba(251,191,36,0.25)', background: 'rgba(251,191,36,0.04)' }}>
                                        <div className="flex items-center gap-4 flex-wrap">
                                            <Avatar uid={p.partnerProfile.id} avatarUrl={p.partnerProfile.avatar_url} avatarStyle={p.partnerProfile.avatar_style} size={44} />
                                            <div className="flex-1 min-w-0">
                                                <div style={{ fontWeight: 700, fontSize: '1rem' }}>{p.partnerProfile.full_name}</div>
                                                {p.invite_title && (
                                                    <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--color-primary)', marginTop: '2px' }}>"{p.invite_title}"</div>
                                                )}
                                                <div style={{ fontSize: '0.82rem', opacity: 0.55, marginTop: '2px' }}>
                                                    {p.isInviter ? 'Vous avez envoyé une invitation' : 'Vous a invité'} · {p.weeklyGoal > 0 ? `Objectif : ${p.weeklyGoal}h/${p.goalFrequency === 'daily' ? 'jour' : p.goalFrequency === 'monthly' ? 'mois' : 'sem'}` : 'Sans objectif'}
                                                </div>
                                            </div>
                                            {!p.isInviter ? (
                                                <div className="flex gap-2">
                                                    <button
                                                        className="btn btn-sm btn-primary"
                                                        onClick={() => handleAccept(p.id, p.partnerProfile.id)}
                                                    >
                                                        ✓ Accepter
                                                    </button>
                                                    <button
                                                        className="btn btn-sm btn-ghost text-secondary"
                                                        style={{ border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}
                                                        onClick={() => handleDecline(p.id)}
                                                    >
                                                        Refuser
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-2">
                                                    <span style={{ fontSize: '0.8rem', opacity: 0.5 }}>En attente de réponse</span>
                                                    <button
                                                        onClick={() => handleDecline(p.id)}
                                                        title="Annuler l'invitation"
                                                        style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: 0.4, padding: '2px' }}
                                                    >
                                                        <X size={14} />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Active partners */}
                    {activePartners.length > 0 ? (
                        <div>
                            <h4 className="text-secondary mb-4" style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                                Partenaires actifs ({activePartners.length})
                            </h4>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1rem' }}>
                                {activePartners.map(p => {
                                    const daysSince = getDaysSinceLastSeen(p.last_active);
                                    const isInactive = daysSince !== null && daysSince >= 2;
                                    const isNudgeSent = nudging === p.partnerProfile.id;

                                    return (
                                        <div key={p.id} className="card card-glass fade-enter" style={{ padding: '1.5rem', border: isInactive ? '1px solid rgba(251,191,36,0.25)' : '1px solid var(--color-border)' }}>
                                            {/* Partner header */}
                                            <div className="flex items-center gap-3 mb-4">
                                                <Avatar uid={p.partnerProfile.id} avatarUrl={p.partnerProfile.avatar_url} avatarStyle={p.partnerProfile.avatar_style} size={48} style={{ cursor: 'pointer' }} onClick={() => router.push(`/user/${p.partnerProfile.id}`)} />
                                                <div className="flex-1 min-w-0" style={{ cursor: 'pointer' }} onClick={() => router.push(`/user/${p.partnerProfile.id}`)}>
                                                    <div style={{ fontWeight: 700, fontSize: '1rem' }} className="truncate">{p.partnerProfile.full_name}</div>
                                                    {p.invite_title ? (
                                                        <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--color-primary)', marginTop: '1px' }} className="truncate">"{p.invite_title}"</div>
                                                    ) : (
                                                        <div style={{ fontSize: '0.78rem', opacity: 0.45 }} className="truncate">{p.partnerProfile.email}</div>
                                                    )}
                                                </div>
                                                <button
                                                    onClick={() => handleDecline(p.id)}
                                                    title="Retirer le partenariat"
                                                    style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: 0.3, padding: '4px' }}
                                                >
                                                    <X size={14} />
                                                </button>
                                            </div>

                                            {/* Weekly goal */}
                                            <div className="flex items-center gap-2 mb-4" style={{ background: 'rgba(99,102,241,0.08)', borderRadius: '10px', padding: '0.6rem 0.9rem' }}>
                                                <Target size={14} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
                                                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                                                    Objectif commun : <span style={{ color: 'var(--color-primary)' }}>{p.weeklyGoal > 0 ? `${p.weeklyGoal}h / ${p.goalFrequency === 'daily' ? 'jour' : p.goalFrequency === 'monthly' ? 'mois' : 'semaine'}` : 'Sans objectif'}</span>
                                                </span>
                                            </div>

                                            {/* Last activity */}
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2" style={{ fontSize: '0.82rem' }}>
                                                    {daysSince === null ? (
                                                        <span style={{ opacity: 0.4 }}><Clock size={13} className="inline mr-1" />Activité inconnue</span>
                                                    ) : daysSince === 0 ? (
                                                        <span style={{ color: '#10b981' }}><CheckCircle size={13} className="inline mr-1" />Actif aujourd'hui</span>
                                                    ) : daysSince === 1 ? (
                                                        <span style={{ opacity: 0.6 }}><Clock size={13} className="inline mr-1" />Actif hier</span>
                                                    ) : (
                                                        <span style={{ color: '#fbbf24' }}><AlertCircle size={13} className="inline mr-1" />Inactif depuis {daysSince} jours</span>
                                                    )}
                                                </div>

                                                {isInactive && (
                                                    <button
                                                        onClick={() => handleNudge(p.partnerProfile.id, p.partnerProfile.full_name)}
                                                        disabled={!!nudging}
                                                        className="btn btn-sm"
                                                        style={{
                                                            background: isNudgeSent ? 'rgba(16,185,129,0.2)' : 'rgba(251,191,36,0.15)',
                                                            color: isNudgeSent ? '#10b981' : '#fbbf24',
                                                            border: `1px solid ${isNudgeSent ? 'rgba(16,185,129,0.3)' : 'rgba(251,191,36,0.3)'}`,
                                                            fontSize: '0.78rem',
                                                        }}
                                                    >
                                                        {isNudgeSent ? '✓ Nudge envoyé !' : <><Zap size={12} /> Envoyer un nudge</>}
                                                    </button>
                                                )}
                                            </div>
                                            {/* Open detail page */}
                                            <button
                                                onClick={() => router.push(`/accountability/${p.id}`)}
                                                className="btn btn-sm w-full mt-3"
                                                style={{ justifyContent: 'center', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', fontSize: '0.82rem', color: 'rgba(255,255,255,0.7)' }}
                                            >
                                                Voir le détail & chat →
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ) : pendingPartners.length === 0 ? (
                        <div className="card card-glass text-center py-16 fade-enter">
                            <Users size={52} style={{ margin: '0 auto 1rem', opacity: 0.15 }} />
                            <h3 className="text-secondary mb-2">Aucun partenaire pour l'instant</h3>
                            <p style={{ opacity: 0.5, marginBottom: '1.5rem', fontSize: '0.9rem' }}>
                                Invitez un ami avec qui vous partagez une catégorie d'objectif pour vous motiver mutuellement.
                            </p>
                            {friends.length > 0 ? (
                                <button className="btn btn-primary shadow-glow" onClick={() => setShowInviteForm(true)}>
                                    + Inviter un ami
                                </button>
                            ) : (
                                <button className="btn btn-outline" onClick={() => router.push('/friends')}>
                                    Ajouter des amis d'abord →
                                </button>
                            )}
                        </div>
                    ) : null}

                    {/* Geo-located accountability */}
                    <div style={{ marginTop: '2.5rem', paddingTop: '2rem', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                        <div className="flex items-start justify-between flex-wrap gap-3 mb-5">
                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    <MapPin size={16} style={{ color: '#10b981' }} />
                                    <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Trouver près de vous</h4>
                                </div>
                                <p style={{ margin: 0, fontSize: '0.82rem', opacity: 0.5 }}>
                                    Rencontrez des partenaires dans votre ville ou quartier pour travailler ensemble en personne.
                                </p>
                            </div>
                            {myGeo?.visible ? (
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => myGeo && loadNearbyUsers(myGeo.lat, myGeo.lng, myGeo.city)}
                                        disabled={geoLoading}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: geoLoading ? 0.4 : 0.6, padding: '4px' }}
                                        title="Rafraîchir"
                                    >
                                        <RefreshCw size={14} style={{ animation: geoLoading ? 'spin 1s linear infinite' : 'none' }} />
                                    </button>
                                    <button
                                        onClick={handleDisableGeo}
                                        style={{ fontSize: '0.78rem', padding: '4px 10px', borderRadius: '20px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', cursor: 'pointer', color: 'rgba(255,255,255,0.5)' }}
                                    >
                                        Masquer ma position
                                    </button>
                                </div>
                            ) : (
                                <button
                                    onClick={handleEnableGeo}
                                    disabled={geoLoading}
                                    className="btn btn-sm"
                                    style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.35)', color: '#10b981', gap: '6px', display: 'flex', alignItems: 'center' }}
                                >
                                    {geoLoading ? (
                                        <div style={{ width: '13px', height: '13px', borderRadius: '50%', border: '2px solid rgba(16,185,129,0.3)', borderTopColor: '#10b981', animation: 'spin 1s linear infinite' }} />
                                    ) : (
                                        <Navigation2 size={13} />
                                    )}
                                    Activer la géolocalisation
                                </button>
                            )}
                        </div>

                        {myGeo?.visible && (
                            <>
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', padding: '4px 10px', borderRadius: '20px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)', color: '#10b981', marginBottom: '1.25rem' }}>
                                    <MapPin size={11} />
                                    {myGeo.neighborhood ? `${myGeo.neighborhood}, ` : ''}{myGeo.city || 'Position partagée'}
                                    <span style={{ opacity: 0.6 }}>· Visible</span>
                                </div>

                                {geoLoading ? (
                                    <div className="text-center py-8">
                                        <div style={{ width: '1.5rem', height: '1.5rem', borderRadius: '50%', border: '2px solid var(--color-border)', borderTopColor: '#10b981', animation: 'spin 1s linear infinite', margin: '0 auto' }} />
                                        <p style={{ opacity: 0.4, fontSize: '0.82rem', marginTop: '0.75rem' }}>Recherche en cours...</p>
                                    </div>
                                ) : nearbyUsers.length === 0 ? (
                                    <div className="card card-glass text-center py-10 fade-enter" style={{ border: '1px solid rgba(16,185,129,0.12)', background: 'rgba(16,185,129,0.03)' }}>
                                        <MapPin size={36} style={{ margin: '0 auto 0.75rem', opacity: 0.15 }} />
                                        <p style={{ opacity: 0.45, fontSize: '0.88rem', margin: 0 }}>Aucun utilisateur trouvé dans un rayon de 50 km.</p>
                                        <p style={{ opacity: 0.3, fontSize: '0.78rem', marginTop: '4px' }}>D'autres utilisateurs apparaîtront ici quand ils activeront la géolocalisation.</p>
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                                        {nearbyUsers.map(u => {
                                            const badge = distanceBadge(u._distanceKm);
                                            const isInviting = invitingNearby === u.id;
                                            const isExpanded = geoInviteTarget === u.id;
                                            return (
                                                <div key={u.id} className="card card-glass fade-enter" style={{ border: isExpanded ? '1px solid rgba(99,102,241,0.35)' : '1px solid rgba(16,185,129,0.15)', overflow: 'hidden', transition: 'border-color 0.2s' }}>
                                                    {/* User row */}
                                                    <div style={{ padding: '0.9rem 1.1rem', display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
                                                        <Avatar uid={u.id} avatarUrl={u.avatar_url} avatarStyle={u.avatar_style} size={40} />
                                                        <div className="flex-1 min-w-0">
                                                            <div style={{ fontWeight: 600, fontSize: '0.9rem' }} className="truncate">{u.full_name || 'Utilisateur'}</div>
                                                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', padding: '1px 7px', borderRadius: '12px', background: `${badge.color}22`, color: badge.color, marginTop: '3px' }}>
                                                                <MapPin size={9} />
                                                                {badge.label}
                                                            </div>
                                                        </div>
                                                        <button
                                                            onClick={() => {
                                                                if (isExpanded) { setGeoInviteTarget(null); }
                                                                else { setGeoInviteTarget(u.id); setGeoGoalEnabled(true); setGeoGoalInput('5'); setGeoFreqInput('weekly'); setGeoSalonEnabled(false); setGeoSalonObjectiveId(''); setGeoInviteTitle(''); }
                                                            }}
                                                            disabled={!!invitingNearby}
                                                            className="btn btn-sm"
                                                            style={{ flexShrink: 0, background: isExpanded ? 'rgba(255,255,255,0.06)' : 'rgba(99,102,241,0.15)', border: isExpanded ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(99,102,241,0.3)', color: isExpanded ? 'rgba(255,255,255,0.5)' : 'var(--color-primary)', fontSize: '0.78rem' }}
                                                        >
                                                            {isExpanded ? '✕' : '+ Inviter'}
                                                        </button>
                                                    </div>

                                                    {/* Expanded invite form */}
                                                    {isExpanded && (
                                                        <div style={{ padding: '0 1.1rem 1.1rem', borderTop: '1px solid rgba(255,255,255,0.06)' }} className="fade-enter">
                                                            <p style={{ fontSize: '0.78rem', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', opacity: 0.4, margin: '0.875rem 0 0.75rem' }}>Paramètres</p>

                                                            {/* Goal toggle */}
                                                            <div style={{ marginBottom: '0.75rem' }}>
                                                                <div className="flex items-center justify-between" style={{ marginBottom: geoGoalEnabled ? '0.6rem' : 0 }}>
                                                                    <div>
                                                                        <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>Objectif commun</div>
                                                                        <div style={{ fontSize: '0.75rem', opacity: 0.4 }}>Heures à atteindre ensemble</div>
                                                                    </div>
                                                                    <div onClick={() => setGeoGoalEnabled(v => !v)} style={{ width: '38px', height: '22px', borderRadius: '11px', cursor: 'pointer', flexShrink: 0, background: geoGoalEnabled ? 'var(--color-primary)' : 'rgba(255,255,255,0.12)', position: 'relative', transition: 'background 0.2s' }}>
                                                                        <div style={{ position: 'absolute', top: '2px', left: geoGoalEnabled ? '18px' : '2px', width: '18px', height: '18px', borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
                                                                    </div>
                                                                </div>
                                                                {geoGoalEnabled && (
                                                                    <div className="flex items-center gap-2" style={{ padding: '0.6rem 0.875rem', borderRadius: '10px', background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)' }}>
                                                                        <input type="number" min="1" max="40" value={geoGoalInput} onChange={e => setGeoGoalInput(e.target.value)} className="input" style={{ width: '56px', textAlign: 'center', fontWeight: 700, fontSize: '1rem', padding: '3px 6px' }} />
                                                                        <span style={{ fontSize: '0.82rem', opacity: 0.55 }}>h /</span>
                                                                        <div className="flex gap-1">
                                                                            {(['daily', 'weekly', 'monthly'] as const).map(f => (
                                                                                <button key={f} onClick={() => setGeoFreqInput(f)} style={{ padding: '3px 9px', borderRadius: '7px', fontSize: '0.77rem', cursor: 'pointer', fontWeight: 600, background: geoFreqInput === f ? 'var(--color-primary)' : 'rgba(255,255,255,0.06)', border: geoFreqInput === f ? 'none' : '1px solid rgba(255,255,255,0.1)', color: geoFreqInput === f ? '#fff' : 'rgba(255,255,255,0.5)', transition: 'all 0.15s' }}>
                                                                                    {f === 'daily' ? 'jour' : f === 'weekly' ? 'sem.' : 'mois'}
                                                                                </button>
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>

                                                            {/* Salon toggle */}
                                                            {myObjectives.length > 0 && (
                                                                <div style={{ marginBottom: '0.875rem' }}>
                                                                    <div className="flex items-center justify-between" style={{ marginBottom: geoSalonEnabled ? '0.6rem' : 0 }}>
                                                                        <div>
                                                                            <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>Salon lié</div>
                                                                            <div style={{ fontSize: '0.75rem', opacity: 0.4 }}>Associez un salon de travail</div>
                                                                        </div>
                                                                        <div onClick={() => setGeoSalonEnabled(v => !v)} style={{ width: '38px', height: '22px', borderRadius: '11px', cursor: 'pointer', flexShrink: 0, background: geoSalonEnabled ? 'var(--color-primary)' : 'rgba(255,255,255,0.12)', position: 'relative', transition: 'background 0.2s' }}>
                                                                            <div style={{ position: 'absolute', top: '2px', left: geoSalonEnabled ? '18px' : '2px', width: '18px', height: '18px', borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
                                                                        </div>
                                                                    </div>
                                                                    {geoSalonEnabled && (
                                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                                                            {myObjectives.map(o => (
                                                                                <div key={o.id} onClick={() => setGeoSalonObjectiveId(geoSalonObjectiveId === o.id ? '' : o.id)} style={{ padding: '0.5rem 0.8rem', borderRadius: '9px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', border: geoSalonObjectiveId === o.id ? '2px solid var(--color-primary)' : '1px solid rgba(255,255,255,0.08)', background: geoSalonObjectiveId === o.id ? 'rgba(99,102,241,0.1)' : 'rgba(255,255,255,0.02)', transition: 'all 0.15s' }}>
                                                                                    <div style={{ fontSize: '0.83rem', fontWeight: 600 }} className="truncate flex-1">{o.title}</div>
                                                                                    {geoSalonObjectiveId === o.id && <div style={{ width: '15px', height: '15px', borderRadius: '50%', background: 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><svg width="8" height="6" viewBox="0 0 8 6" fill="none"><path d="M1 3L3 5L7 1" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg></div>}
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}

                                                            {/* Title field */}
                                                            <div style={{ marginBottom: '0.875rem' }}>
                                                                <div style={{ fontWeight: 600, fontSize: '0.88rem', marginBottom: '4px' }}>Titre <span style={{ opacity: 0.4, fontWeight: 400, fontSize: '0.76rem' }}>(optionnel)</span></div>
                                                                <input
                                                                    type="text"
                                                                    placeholder='ex: "Session matin Strasbourg", …'
                                                                    maxLength={60}
                                                                    value={geoInviteTitle}
                                                                    onChange={e => setGeoInviteTitle(e.target.value)}
                                                                    className="input w-full"
                                                                    style={{ fontSize: '0.85rem', padding: '0.5rem 0.75rem' }}
                                                                />
                                                            </div>

                                                            <button
                                                                className="btn btn-primary w-full"
                                                                onClick={() => handleInviteNearby(u)}
                                                                disabled={!!invitingNearby}
                                                                style={{ justifyContent: 'center', padding: '0.6rem', fontSize: '0.88rem', fontWeight: 700 }}
                                                            >
                                                                {isInviting ? <div style={{ width: '14px', height: '14px', borderRadius: '50%', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', animation: 'spin 1s linear infinite' }} /> : `Envoyer l'invitation à ${u.full_name?.split(' ')[0] || 'cet utilisateur'}`}
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
