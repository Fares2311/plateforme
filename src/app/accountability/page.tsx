'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, getDoc, addDoc, updateDoc, deleteDoc, setDoc, serverTimestamp, Timestamp, limit } from 'firebase/firestore';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { Users, Target, Zap, CheckCircle, Clock, AlertCircle, X, ChevronRight, MapPin, Navigation2, RefreshCw, Plus } from 'lucide-react';
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
        <div style={{ paddingLeft: '228px', paddingRight: '3rem', paddingTop: '2rem', paddingBottom: '4rem', minHeight: '100vh' }}>
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=DM+Sans:wght@300;400;500;600;700&display=swap');

                @keyframes ac-fade-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
                @keyframes ac-pulse-dot { 0%, 100% { box-shadow: 0 0 0 0 rgba(16,185,129,0.5); } 50% { box-shadow: 0 0 0 5px rgba(16,185,129,0); } }
                @keyframes spin { to { transform: rotate(360deg); } }

                .ac-wrap { font-family: 'DM Sans', system-ui; color: #e2e2ea; }
                .ac-title { font-family: 'Outfit', system-ui; font-weight: 800; letter-spacing: -0.04em; }
                .ac-label-upper { font-size: 0.68rem; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: rgba(255,255,255,0.28); font-family: 'DM Sans', system-ui; }

                /* ── partner card (grid item) ── */
                .ac-card {
                    border-radius: 14px;
                    border: 1px solid rgba(255,255,255,0.07);
                    background: rgba(14,14,20,0.9);
                    padding: 16px;
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                    animation: ac-fade-in 0.3s cubic-bezier(0.22,1,0.36,1) both;
                    transition: border-color 0.2s, transform 0.18s, box-shadow 0.2s;
                    position: relative;
                    overflow: hidden;
                }
                .ac-card:hover {
                    border-color: rgba(217,119,6,0.3);
                    transform: translateY(-2px);
                    box-shadow: 0 8px 28px rgba(0,0,0,0.4);
                }
                .ac-card::after {
                    content: '';
                    position: absolute;
                    top: 0; left: 0; right: 0;
                    height: 2px;
                    background: linear-gradient(90deg, #d97706, #f59e0b);
                    opacity: 0;
                    transition: opacity 0.2s;
                }
                .ac-card:hover::after { opacity: 1; }

                .ac-card-name { font-family: 'Outfit', system-ui; font-size: 0.88rem; font-weight: 700; color: #eeeef2; line-height: 1.2; }
                .ac-card-sub { font-size: 0.71rem; color: rgba(255,255,255,0.32); font-family: 'DM Sans', system-ui; }

                /* ── nearby card ── */
                .ac-nearby-card {
                    border-radius: 14px;
                    border: 1px solid rgba(16,185,129,0.14);
                    background: rgba(14,14,20,0.88);
                    padding: 14px;
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                    animation: ac-fade-in 0.3s cubic-bezier(0.22,1,0.36,1) both;
                    transition: border-color 0.2s, transform 0.18s;
                }
                .ac-nearby-card:hover { border-color: rgba(16,185,129,0.3); transform: translateY(-2px); }

                /* ── pending row (stays list since it needs accept/decline inline) ── */
                .ac-pending-row {
                    display: flex; align-items: center; gap: 12px;
                    padding: 10px 14px;
                    border-radius: 11px;
                    border: 1px solid rgba(99,102,241,0.18);
                    background: rgba(14,14,20,0.88);
                    transition: border-color 0.2s;
                    animation: ac-fade-in 0.3s cubic-bezier(0.22,1,0.36,1) both;
                }
                .ac-pending-row:hover { border-color: rgba(99,102,241,0.35); }

                /* ── invite form panel ── */
                .ac-invite-panel {
                    border-radius: 16px; overflow: hidden;
                    border: 1px solid rgba(217,119,6,0.25);
                    background: rgba(12,12,18,0.98);
                    animation: ac-fade-in 0.25s cubic-bezier(0.22,1,0.36,1);
                }
                .ac-invite-head {
                    padding: 14px 18px;
                    border-bottom: 1px solid rgba(255,255,255,0.06);
                    background: rgba(217,119,6,0.04);
                    display: flex; align-items: center; justify-content: space-between;
                }
                .ac-invite-body { padding: 16px 18px; display: flex; flex-direction: column; gap: 13px; }

                .ac-field-label { font-size: 0.67rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: rgba(255,255,255,0.3); display: block; margin-bottom: 5px; font-family: 'DM Sans', system-ui; }

                .ac-input {
                    width: 100%; padding: 8px 11px;
                    background: rgba(255,255,255,0.04);
                    border: 1px solid rgba(255,255,255,0.08);
                    border-radius: 9px; color: #f0f0f5;
                    font-family: 'DM Sans', system-ui; font-size: 0.85rem;
                    outline: none; transition: border-color 0.2s, box-shadow 0.2s; box-sizing: border-box;
                }
                .ac-input:focus { border-color: rgba(217,119,6,0.45); box-shadow: 0 0 0 3px rgba(217,119,6,0.08); }
                .ac-input::placeholder { color: rgba(255,255,255,0.18); }

                .ac-select {
                    background: rgba(255,255,255,0.04);
                    border: 1px solid rgba(255,255,255,0.08);
                    border-radius: 9px; color: #f0f0f5;
                    font-family: 'DM Sans', system-ui; font-size: 0.84rem;
                    padding: 8px 11px; outline: none; cursor: pointer;
                }
                .ac-friend-btn {
                    padding: 7px 11px; border-radius: 9px;
                    border: 1px solid rgba(255,255,255,0.06);
                    background: rgba(255,255,255,0.02); color: rgba(255,255,255,0.55);
                    font-family: 'DM Sans', system-ui; font-size: 0.83rem; font-weight: 500;
                    cursor: pointer; text-align: left; transition: all 0.16s;
                    display: flex; align-items: center; gap: 9px;
                }
                .ac-friend-btn:hover { border-color: rgba(217,119,6,0.3); background: rgba(217,119,6,0.04); color: #fbbf24; }
                .ac-friend-btn.selected { border-color: rgba(217,119,6,0.5); background: rgba(217,119,6,0.08); color: #fbbf24; }

                /* ── buttons ── */
                .ac-btn-amber {
                    padding: 8px 16px; border-radius: 9px; border: none;
                    background: linear-gradient(135deg, #d97706, #f59e0b);
                    color: #0a0a10; font-family: 'Outfit', system-ui;
                    font-size: 0.8rem; font-weight: 700;
                    cursor: pointer; transition: all 0.18s;
                    box-shadow: 0 3px 10px rgba(217,119,6,0.28);
                    display: flex; align-items: center; gap: 5px; white-space: nowrap;
                }
                .ac-btn-amber:hover { box-shadow: 0 5px 18px rgba(217,119,6,0.45); transform: translateY(-1px); }
                .ac-btn-amber:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

                .ac-btn-ghost {
                    padding: 6px 11px; border-radius: 8px;
                    border: 1px solid rgba(255,255,255,0.08);
                    background: rgba(255,255,255,0.03); color: rgba(255,255,255,0.42);
                    font-family: 'DM Sans', system-ui; font-size: 0.78rem; font-weight: 600;
                    cursor: pointer; transition: all 0.16s;
                    display: flex; align-items: center; gap: 5px;
                }
                .ac-btn-ghost:hover { border-color: rgba(255,255,255,0.16); color: rgba(255,255,255,0.72); background: rgba(255,255,255,0.06); }

                .ac-btn-nudge {
                    flex: 1; padding: 7px 0; border-radius: 8px;
                    border: 1px solid rgba(217,119,6,0.2);
                    background: rgba(217,119,6,0.06); color: #f59e0b;
                    font-family: 'DM Sans', system-ui; font-size: 0.74rem; font-weight: 700;
                    cursor: pointer; transition: all 0.16s;
                    display: flex; align-items: center; justify-content: center; gap: 4px;
                }
                .ac-btn-nudge:hover { background: rgba(217,119,6,0.13); border-color: rgba(217,119,6,0.38); }
                .ac-btn-nudge:disabled { opacity: 0.38; cursor: not-allowed; }

                .ac-btn-enter {
                    flex: 1; padding: 7px 0; border-radius: 8px; border: none;
                    background: linear-gradient(135deg, #d97706, #f59e0b);
                    color: #0a0a10; font-family: 'Outfit', system-ui;
                    font-size: 0.74rem; font-weight: 700;
                    cursor: pointer; transition: all 0.16s;
                    display: flex; align-items: center; justify-content: center; gap: 4px;
                    box-shadow: 0 2px 8px rgba(217,119,6,0.25);
                }
                .ac-btn-enter:hover { box-shadow: 0 4px 14px rgba(217,119,6,0.4); transform: translateY(-1px); }

                /* ── progress bar ── */
                .ac-progress-bar { height: 3px; border-radius: 3px; background: rgba(255,255,255,0.06); overflow: hidden; }
                .ac-progress-fill { height: 100%; border-radius: 3px; background: linear-gradient(90deg, #d97706, #f59e0b); transition: width 0.6s cubic-bezier(0.22,1,0.36,1); }

                /* ── section header ── */
                .ac-section-head { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
                .ac-section-line { flex: 1; height: 1px; background: rgba(255,255,255,0.05); }

                /* ── goal badge ── */
                .ac-goal-badge {
                    display: inline-flex; align-items: center; gap: 3px;
                    padding: 2px 7px; border-radius: 5px;
                    background: rgba(217,119,6,0.1); border: 1px solid rgba(217,119,6,0.2);
                    font-size: 0.68rem; color: #f59e0b; font-family: 'DM Sans', system-ui; font-weight: 700;
                }

                /* ── toggle ── */
                .ac-toggle { width: 34px; height: 19px; border-radius: 10px; border: none; padding: 2px; position: relative; cursor: pointer; transition: background 0.2s; flex-shrink: 0; }
                .ac-toggle-thumb { display: block; width: 15px; height: 15px; border-radius: 50%; background: #fff; position: absolute; top: 2px; transition: left 0.2s; box-shadow: 0 1px 4px rgba(0,0,0,0.35); }
                .ac-toggle-on { background: rgba(217,119,6,0.65); }
                .ac-toggle-off { background: rgba(255,255,255,0.1); }

                .ac-dot-live { animation: ac-pulse-dot 2s ease-in-out infinite; }

                /* ── grid layout ── */
                .ac-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
                @media (max-width: 1100px) { .ac-grid { grid-template-columns: repeat(2, 1fr); } }
            `}</style>

            <div className="ac-wrap">
                {/* ── Header ── */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 32, gap: 16, flexWrap: 'wrap' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                            <div style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(217,119,6,0.13)', border: '1px solid rgba(217,119,6,0.26)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Target size={15} style={{ color: '#f59e0b' }} />
                            </div>
                            <h1 className="ac-title" style={{ margin: 0, fontSize: '1.75rem', background: 'linear-gradient(135deg, #fff 40%, rgba(255,255,255,0.38))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                                Accountability
                            </h1>
                        </div>
                        <p style={{ margin: 0, fontSize: '0.8rem', color: 'rgba(255,255,255,0.3)', fontFamily: 'DM Sans, system-ui' }}>
                            Fixez des objectifs, mesurez-vous, avancez ensemble.
                        </p>
                    </div>
                    {friends.length > 0 && (
                        <button className="ac-btn-amber" onClick={() => setShowInviteForm(v => !v)}>
                            {showInviteForm ? <><X size={12} /> Annuler</> : <><Plus size={12} /> Inviter un ami</>}
                        </button>
                    )}
                </div>

                {/* ── Invite Form ── */}
                {showInviteForm && (
                    <div className="ac-invite-panel" style={{ marginBottom: 26 }}>
                        <div className="ac-invite-head">
                            <div>
                                <div style={{ fontFamily: 'Outfit, system-ui', fontSize: '0.88rem', fontWeight: 700, color: '#f0f0f5' }}>Nouvelle invitation</div>
                                <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>Choisissez un ami et définissez votre objectif commun</div>
                            </div>
                            <button className="ac-btn-ghost" onClick={() => setShowInviteForm(false)}><X size={12} /></button>
                        </div>
                        <div className="ac-invite-body">
                            <div>
                                <span className="ac-field-label">Choisir un ami</span>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    {friends.map(f => (
                                        <button key={f.id} className={`ac-friend-btn${selectedFriend?.id === f.id ? ' selected' : ''}`}
                                            onClick={() => setSelectedFriend(f)}>
                                            <Avatar uid={f.id} avatarUrl={f.avatar_url} avatarStyle={f.avatar_style} size={24} />
                                            <span>{f.full_name}</span>
                                            {selectedFriend?.id === f.id && <CheckCircle size={12} style={{ marginLeft: 'auto', color: '#f59e0b' }} />}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            {selectedFriend && (
                                <>
                                    <div>
                                        <span className="ac-field-label">Titre (optionnel)</span>
                                        <input className="ac-input" placeholder={`${selectedFriend.full_name} & ${user!.displayName || 'Moi'}`}
                                            value={inviteTitle} onChange={e => setInviteTitle(e.target.value)} />
                                    </div>
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                                            <span className="ac-field-label" style={{ margin: 0 }}>Objectif horaire</span>
                                            <button className={`ac-toggle ${goalEnabled ? 'ac-toggle-on' : 'ac-toggle-off'}`} onClick={() => setGoalEnabled(v => !v)}>
                                                <span className="ac-toggle-thumb" style={{ left: goalEnabled ? '17px' : '2px' }} />
                                            </button>
                                        </div>
                                        {goalEnabled && (
                                            <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
                                                <input type="number" min="1" max="500" className="ac-input"
                                                    value={weeklyGoalInput} onChange={e => setWeeklyGoalInput(e.target.value)}
                                                    style={{ width: 64, textAlign: 'center' }} />
                                                <span style={{ fontSize: '0.77rem', color: 'rgba(255,255,255,0.3)' }}>h /</span>
                                                <select className="ac-select" value={goalFrequencyInput} onChange={e => setGoalFrequencyInput(e.target.value)}>
                                                    <option value="daily">jour</option>
                                                    <option value="weekly">semaine</option>
                                                    <option value="monthly">mois</option>
                                                </select>
                                            </div>
                                        )}
                                    </div>
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                                            <span className="ac-field-label" style={{ margin: 0 }}>Lier un salon</span>
                                            <button className={`ac-toggle ${salonEnabled ? 'ac-toggle-on' : 'ac-toggle-off'}`} onClick={() => setSalonEnabled(v => !v)}>
                                                <span className="ac-toggle-thumb" style={{ left: salonEnabled ? '17px' : '2px' }} />
                                            </button>
                                        </div>
                                        {salonEnabled && myObjectives.length > 0 && (
                                            <select className="ac-select" style={{ width: '100%' }} value={selectedObjectiveId} onChange={e => setSelectedObjectiveId(e.target.value)}>
                                                <option value="">— Choisir un salon</option>
                                                {myObjectives.map(o => <option key={o.id} value={o.id}>{o.title}</option>)}
                                            </select>
                                        )}
                                    </div>
                                    <button className="ac-btn-amber" disabled={sending || !selectedFriend}
                                        onClick={async () => {
                                            if (!selectedFriend || !user || sending) return;
                                            setSending(true);
                                            try { await (window as any).__accHandleInvite?.(); }
                                            finally { setSending(false); }
                                        }}
                                        style={{ alignSelf: 'flex-end' }}>
                                        {sending ? 'Envoi...' : 'Envoyer l\'invitation →'}
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                )}

                {/* ── Pending ── */}
                {pendingPartners.length > 0 && (
                    <div style={{ marginBottom: 26 }}>
                        <div className="ac-section-head">
                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#6366f1', boxShadow: '0 0 6px rgba(99,102,241,0.7)', flexShrink: 0 }} />
                            <span className="ac-label-upper">Invitations reçues · {pendingPartners.length}</span>
                            <div className="ac-section-line" />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                            {pendingPartners.map((p, idx) => (
                                <div key={p.id} className="ac-pending-row" style={{ animationDelay: `${idx * 0.06}s` }}>
                                    <Avatar uid={p.partnerProfile?.id || ''} avatarUrl={p.partnerProfile?.avatar_url} avatarStyle={p.partnerProfile?.avatar_style} size={32} />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div className="ac-card-name">{p.full_name}</div>
                                        {p.invite_title && <div className="ac-card-sub">"{p.invite_title}"</div>}
                                        {p.weeklyGoal > 0 && (
                                            <span className="ac-goal-badge" style={{ marginTop: 2, display: 'inline-flex' }}>
                                                {p.weeklyGoal}h / {p.goalFrequency === 'daily' ? 'jour' : p.goalFrequency === 'monthly' ? 'mois' : 'semaine'}
                                            </span>
                                        )}
                                    </div>
                                    {p.isInviter ? (
                                        <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                                            <button onClick={() => handleAccept(p.id, p.partnerProfile?.id || '')} className="ac-btn-amber" style={{ padding: '6px 11px', fontSize: '0.76rem' }}>
                                                <CheckCircle size={11} /> Accepter
                                            </button>
                                            <button onClick={() => handleDecline(p.id)} className="ac-btn-ghost">
                                                <X size={11} /> Décliner
                                            </button>
                                        </div>
                                    ) : (
                                        <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.26)', fontStyle: 'italic', flexShrink: 0 }}>En attente</span>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* ── Active Partners ── */}
                <div style={{ marginBottom: 36 }}>
                    <div className="ac-section-head">
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#d97706', boxShadow: '0 0 6px rgba(217,119,6,0.6)', flexShrink: 0 }} className="ac-dot-live" />
                        <span className="ac-label-upper">Partenaires actifs · {activePartners.length}</span>
                        <div className="ac-section-line" />
                    </div>

                    {loading ? (
                        <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem 0' }}>
                            <div style={{ width: 22, height: 22, borderRadius: '50%', border: '2px solid rgba(217,119,6,0.22)', borderTopColor: '#d97706', animation: 'spin 0.85s linear infinite' }} />
                        </div>
                    ) : activePartners.length === 0 && pendingPartners.length === 0 ? (
                        <div style={{ borderRadius: 14, border: '1px dashed rgba(255,255,255,0.07)', padding: '2.5rem 2rem', textAlign: 'center', background: 'rgba(255,255,255,0.01)' }}>
                            <div style={{ width: 42, height: 42, borderRadius: 12, background: 'rgba(217,119,6,0.09)', border: '1px solid rgba(217,119,6,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                                <Users size={18} style={{ color: '#d97706' }} />
                            </div>
                            <div style={{ fontFamily: 'Outfit, system-ui', fontWeight: 700, fontSize: '1rem', color: 'rgba(255,255,255,0.6)', marginBottom: 6 }}>Aucun partenaire encore</div>
                            <p style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.26)', margin: '0 0 16px' }}>
                                Invitez un ami pour vous tenir mutuellement responsables.
                            </p>
                            <button className="ac-btn-amber" onClick={() => setShowInviteForm(true)}>
                                <Plus size={12} /> Inviter un ami
                            </button>
                        </div>
                    ) : (
                        <div className="ac-grid">
                            {activePartners.map((p, idx) => {
                                const progress = p.weeklyGoal > 0 ? Math.min(1, (p.partnerProfile?.weeklyHours || 0) / p.weeklyGoal) : 0;
                                const isActive = !!p.activeSessionId;
                                const canNudge = !p.last_nudged_at || (Date.now() - (p.last_nudged_at?.toDate?.()?.getTime?.() || 0)) > 3600000;
                                return (
                                    <div key={p.id} className="ac-card" style={{ animationDelay: `${idx * 0.06}s` }}>
                                        {/* Top row: avatar + name */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                            <div style={{ position: 'relative', flexShrink: 0 }}>
                                                <Avatar uid={p.partnerProfile?.id || ''} avatarUrl={p.partnerProfile?.avatar_url} avatarStyle={p.partnerProfile?.avatar_style} size={38} />
                                                {isActive && (
                                                    <div className="ac-dot-live" style={{ position: 'absolute', bottom: 0, right: -1, width: 8, height: 8, borderRadius: '50%', background: '#10b981', border: '2px solid #0e0e14' }} />
                                                )}
                                            </div>
                                            <div style={{ minWidth: 0 }}>
                                                <div className="ac-card-name">{p.full_name}</div>
                                                <div className="ac-card-sub">{isActive ? 'En session' : 'Hors ligne'}</div>
                                            </div>
                                            {p.weeklyGoal > 0 && (
                                                <span className="ac-goal-badge" style={{ marginLeft: 'auto', flexShrink: 0 }}>
                                                    {p.weeklyGoal}h<span style={{ opacity: 0.5, fontWeight: 400 }}>/{p.goalFrequency === 'daily' ? 'j' : p.goalFrequency === 'monthly' ? 'm' : 'sem'}</span>
                                                </span>
                                            )}
                                        </div>

                                        {/* Progress bar */}
                                        {p.weeklyGoal > 0 && (
                                            <div className="ac-progress-bar">
                                                <div className="ac-progress-fill" style={{ width: `${progress * 100}%` }} />
                                            </div>
                                        )}

                                        {/* Actions */}
                                        <div style={{ display: 'flex', gap: 6, marginTop: 'auto' }}>
                                            <button
                                                className="ac-btn-nudge"
                                                disabled={!canNudge}
                                                onClick={async () => {
                                                    if (!canNudge || !user) return;
                                                    try {
                                                        await addDoc(collection(db, 'notifications'), {
                                                            user_id: p.partnerProfile?.id,
                                                            type: 'nudge',
                                                            from_user_id: user.uid,
                                                            from_user_name: user.displayName || 'Quelqu\'un',
                                                            message: `${user.displayName || 'Quelqu\'un'} vous encourage à bosser ! 💪`,
                                                            read: false,
                                                            created_at: serverTimestamp(),
                                                        });
                                                        await updateDoc(doc(db, 'accountability_pairs', p.id), { last_nudged_at: serverTimestamp() });
                                                        setPartners(prev => prev.map(pp => pp.id === p.id ? { ...pp, last_nudged_at: { toDate: () => new Date() } } : pp));
                                                    } catch {}
                                                }}
                                            ><Zap size={11} /> Nudge</button>
                                            <button
                                                className="ac-btn-enter"
                                                onClick={() => router.push(`/accountability/${p.id}`)}
                                            ><ChevronRight size={12} /> Ouvrir</button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {friends.length === 0 && activePartners.length === 0 && !loading && (
                        <div style={{ marginTop: 16, padding: '12px 16px', borderRadius: 11, background: 'rgba(217,119,6,0.05)', border: '1px solid rgba(217,119,6,0.16)' }}>
                            <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.42)', fontFamily: 'DM Sans, system-ui' }}>
                                Commencez par <span style={{ color: '#f59e0b', fontWeight: 600 }}>ajouter des amis</span> pour pouvoir les inviter.
                            </div>
                        </div>
                    )}
                </div>

                {/* ── À proximité ── */}
                {nearbyUsers.length > 0 && (
                    <div>
                        <div className="ac-section-head">
                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', boxShadow: '0 0 6px rgba(16,185,129,0.6)', flexShrink: 0 }} />
                            <span className="ac-label-upper">À proximité</span>
                            <div className="ac-section-line" />
                            <button onClick={handleDisableGeo} style={{ padding: '3px 10px', borderRadius: 7, border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)', color: 'rgba(255,255,255,0.35)', fontSize: '0.69rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'DM Sans, system-ui', display: 'flex', alignItems: 'center', gap: 4, letterSpacing: '0.04em' }}>
                                <MapPin size={10} /> Désactiver
                            </button>
                        </div>
                        <div className="ac-grid">
                            {nearbyUsers.map((u, idx) => {
                                const badge = distanceBadge(u.distanceKm);
                                const isAlreadyPartner = partners.some(pp => pp.partnerProfile?.id === u.id);
                                return (
                                    <div key={u.id} className="ac-nearby-card" style={{ animationDelay: `${idx * 0.05}s` }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                            <Avatar uid={u.id} avatarUrl={u.avatar_url} avatarStyle={u.avatar_style} size={36} />
                                            <div style={{ minWidth: 0 }}>
                                                <div className="ac-card-name">{u.full_name}</div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                                                    <div style={{ width: 5, height: 5, borderRadius: '50%', background: badge.color }} />
                                                    <span className="ac-card-sub">{badge.label}</span>
                                                </div>
                                            </div>
                                        </div>
                                        {!isAlreadyPartner && (
                                            <button className="ac-btn-amber" style={{ width: '100%', justifyContent: 'center', fontSize: '0.75rem', padding: '6px 0' }}
                                                onClick={() => handleInviteNearby(u)}>
                                                + Inviter
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {!myGeo?.visible && (
                    <div>
                        <div className="ac-section-head">
                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', flexShrink: 0 }} />
                            <span className="ac-label-upper">À proximité</span>
                            <div className="ac-section-line" />
                        </div>
                        <div style={{ padding: '18px', borderRadius: 12, border: '1px dashed rgba(255,255,255,0.07)', textAlign: 'center', background: 'rgba(255,255,255,0.01)' }}>
                            <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.32)', marginBottom: 10, fontFamily: 'DM Sans, system-ui' }}>
                                Activez la localisation pour voir les autres utilisateurs près de vous.
                            </div>
                            <button className="ac-btn-amber" style={{ margin: '0 auto', fontSize: '0.76rem', padding: '7px 14px' }} onClick={handleEnableGeo}>
                                <Navigation2 size={11} /> Activer la localisation
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
