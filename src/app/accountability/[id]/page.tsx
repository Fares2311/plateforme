'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import {
    doc, getDoc, collection, onSnapshot, addDoc, serverTimestamp,
    query, orderBy, updateDoc, where, getDocs, deleteDoc, setDoc, arrayUnion, arrayRemove
} from 'firebase/firestore';
import { useAuth } from '@/context/AuthContext';
import { useUI } from '@/context/UIContext';
import { useAccCall } from '@/context/AccCallContext';
import { ACC_SIDEBAR_W } from '@/components/AccCallOverlay';
import {
    ArrowLeft, Send, Target, Zap, CheckCircle, Clock, AlertCircle,
    ExternalLink, Edit3, Save, X, Link as LinkIcon, FileText,
    Calendar, Bot, Trash2, Plus, Play, Pause, RotateCcw, Video,
    CheckSquare, Square, Flag, Settings2, PhoneOff, Timer, LayoutDashboard,
    Menu, Compass, Users, MessageCircle, PenLine
} from 'lucide-react';
import Avatar from '@/components/Avatar';
import Link from 'next/link';
import CollabWhiteboard from '@/components/CollabWhiteboard';

const fmtHours = (h: number) => h < 1 ? `${Math.round(h * 60)}min` : `${parseFloat(h.toFixed(2))}h`;
const fmtTime = (s: number) => {
    const sec = Math.max(0, Math.round(s));
    return `${Math.floor(sec / 60).toString().padStart(2, '0')}:${(sec % 60).toString().padStart(2, '0')}`;
};

const POMODORO_DURATIONS: Record<string, number> = { focus: 25 * 60, short: 5 * 60, long: 15 * 60 };
const POMODORO_LABELS: Record<string, string> = { focus: 'Focus', short: 'Pause', long: 'Pause longue' };
const POMODORO_COLORS: Record<string, string> = { focus: '#6366f1', short: '#10b981', long: '#06b6d4' };

type Tab = 'resume' | 'etapes' | 'ressources' | 'agenda' | 'coworking' | 'ia';

function CircleTimer({ remaining, total, color, running }: { remaining: number; total: number; color: string; running: boolean }) {
    const r = 60, circ = 2 * Math.PI * r;
    const offset = circ * (1 - Math.max(0, remaining) / total);
    return (
        <div style={{ position: 'relative', width: 156, height: 156 }}>
            <svg width={156} height={156} style={{ transform: 'rotate(-90deg)' }}>
                <circle cx={78} cy={78} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={6} />
                <circle cx={78} cy={78} r={r} fill="none" stroke={color} strokeWidth={6} strokeLinecap="round"
                    strokeDasharray={circ} strokeDashoffset={offset}
                    style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.3s' }} />
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: '2rem', fontWeight: 900, letterSpacing: '-0.05em', fontVariantNumeric: 'tabular-nums', color: '#f8f9fa', lineHeight: 1 }}>
                    {fmtTime(remaining)}
                </span>
                <span style={{ fontSize: '0.6rem', color: running ? color : '#52525b', fontWeight: 700, marginTop: 5, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                    {running ? '● En cours' : 'En pause'}
                </span>
            </div>
        </div>
    );
}

const BURST_PARTICLES = [
    { angle: 0,   color: '#6366f1', size: 7, anim: 'cburst-a', delay: '0s' },
    { angle: 30,  color: '#10b981', size: 5, anim: 'cburst-b', delay: '0.03s' },
    { angle: 60,  color: '#f59e0b', size: 6, anim: 'cburst-c', delay: '0.06s' },
    { angle: 90,  color: '#ec4899', size: 7, anim: 'cburst-a', delay: '0.02s' },
    { angle: 120, color: '#06b6d4', size: 5, anim: 'cburst-b', delay: '0.05s' },
    { angle: 150, color: '#a78bfa', size: 6, anim: 'cburst-c', delay: '0.01s' },
    { angle: 180, color: '#f97316', size: 7, anim: 'cburst-a', delay: '0.04s' },
    { angle: 210, color: '#34d399', size: 5, anim: 'cburst-b', delay: '0.07s' },
    { angle: 240, color: '#818cf8', size: 6, anim: 'cburst-c', delay: '0.02s' },
    { angle: 270, color: '#fbbf24', size: 7, anim: 'cburst-a', delay: '0.05s' },
    { angle: 300, color: '#f472b6', size: 5, anim: 'cburst-b', delay: '0.08s' },
    { angle: 330, color: '#22d3ee', size: 6, anim: 'cburst-c', delay: '0.03s' },
];

function CelebrationBurst({ show }: { show: boolean }) {
    if (!show) return null;
    return (
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'visible', zIndex: 20 }}>
            <style>{`
                @keyframes cburst-a {
                    0%   { transform: translateY(0px)   scale(1.4); opacity: 1; }
                    80%  { opacity: 0.8; }
                    100% { transform: translateY(-95px) scale(0);   opacity: 0; }
                }
                @keyframes cburst-b {
                    0%   { transform: translateY(0px)   scale(1.4); opacity: 1; }
                    80%  { opacity: 0.8; }
                    100% { transform: translateY(-72px) scale(0);   opacity: 0; }
                }
                @keyframes cburst-c {
                    0%   { transform: translateY(0px)   scale(1.4); opacity: 1; }
                    80%  { opacity: 0.8; }
                    100% { transform: translateY(-54px) scale(0);   opacity: 0; }
                }
                @keyframes cburst-star {
                    0%   { transform: translateX(-50%) translateY(0px)   scale(1);   opacity: 1; }
                    100% { transform: translateX(-50%) translateY(-48px) scale(0.4); opacity: 0; }
                }
            `}</style>

            {BURST_PARTICLES.map((p, i) => (
                <div key={i} style={{
                    position: 'absolute', top: '50%', left: '50%',
                    width: 0, height: 0,
                    transform: `rotate(${p.angle}deg)`,
                }}>
                    <div style={{
                        position: 'absolute',
                        width: p.size, height: p.size,
                        borderRadius: '50%',
                        background: p.color,
                        boxShadow: `0 0 ${p.size * 2}px ${p.color}`,
                        top: -p.size / 2, left: -p.size / 2,
                        animation: `${p.anim} 1.1s cubic-bezier(0.15,0.8,0.3,1) ${p.delay} both`,
                    }} />
                </div>
            ))}

            {/* Floating star */}
            <div style={{
                position: 'absolute', top: '22%', left: '50%',
                fontSize: '1.3rem', lineHeight: 1,
                animation: 'cburst-star 1.4s ease-out 0.1s both',
            }}>
                ✦
            </div>
        </div>
    );
}

export default function AccountabilityDetail() {
    const { id } = useParams();
    const { user } = useAuth();
    const { setNavbarVisible, setIsWorking } = useUI();
    const router = useRouter();
    const { callInfo, zpRef: callZpRef, containerRef: callContainerRef, activateCall, endCall, callMinimized, minimizeCall } = useAccCall();
    const isOnCall = !!callInfo && callInfo.pairId === (id as string);

    // Core state
    const [pair, setPair] = useState<any>(null);
    const [partner, setPartner] = useState<any>(null);
    const [objective, setObjective] = useState<any>(null);
    const [myObjectives, setMyObjectives] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [partnerMembership, setPartnerMembership] = useState<any>(null);
    const [myMembership, setMyMembership] = useState<any>(null);
    const [partnerPresence, setPartnerPresence] = useState<any>(null);
    const [nudging, setNudging] = useState(false);
    const [nudgeSent, setNudgeSent] = useState(false);
    const [confirmLeave, setConfirmLeave] = useState(false);
    const [leaving, setLeaving] = useState(false);

    // Goal editing
    const [editingGoal, setEditingGoal] = useState(false);
    const [goalInput, setGoalInput] = useState('');
    const [goalFreq, setGoalFreq] = useState('weekly');
    const [editingSalon, setEditingSalon] = useState(false);
    const [editingTitle, setEditingTitle] = useState(false);
    const [titleInput, setTitleInput] = useState('');
    const [savingTitle, setSavingTitle] = useState(false);
    const [showSettingsPanel, setShowSettingsPanel] = useState(false);
    const [showWhiteboard, setShowWhiteboard] = useState(false);
    const [hoursEnabled, setHoursEnabled] = useState(true);
    const settingsPanelRef = useRef<HTMLDivElement>(null);

    // Tabs
    const [activeTab, setActiveTab] = useState<Tab>('resume');

    // Chat
    const [messages, setMessages] = useState<any[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [sending, setSending] = useState(false);
    const chatRef = useRef<HTMLDivElement>(null);

    // Resources
    const [resources, setResources] = useState<any[]>([]);
    const [showResForm, setShowResForm] = useState(false);
    const [resType, setResType] = useState<'link' | 'note'>('link');
    const [resTitle, setResTitle] = useState('');
    const [resUrl, setResUrl] = useState('');
    const [resNote, setResNote] = useState('');
    const [savingRes, setSavingRes] = useState(false);

    // Agenda
    const [sessions, setSessions] = useState<any[]>([]);
    const [showSessionForm, setShowSessionForm] = useState(false);
    const [sessionTitle, setSessionTitle] = useState('');
    const [sessionDate, setSessionDate] = useState('');
    const [sessionNote, setSessionNote] = useState('');
    const [savingSession, setSavingSession] = useState(false);

    // Étapes (milestones)
    const [milestones, setMilestones] = useState<any[]>([]);
    const [showMilestoneForm, setShowMilestoneForm] = useState(false);
    const [milestoneTitle, setMilestoneTitle] = useState('');
    const [milestoneDue, setMilestoneDue] = useState('');
    const [savingMilestone, setSavingMilestone] = useState(false);

    // Coworking direct
    const [liveDoc, setLiveDoc] = useState<any>(null);
    const [timerRemaining, setTimerRemaining] = useState(POMODORO_DURATIONS.focus);
    const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const liveDocRef = useRef<any>(null); // always-fresh liveDoc for callbacks
    const [cwLog, setCwLog] = useState<any[]>([]);
    const [showTimerSettings, setShowTimerSettings] = useState(false);
    const [draftDurations, setDraftDurations] = useState({ focus: 25, short: 5, long: 15 });
    const [showAnim, setShowAnim] = useState(false);

    const [viewMode, setViewMode] = useState('focus');
    useEffect(() => {
        if (liveDoc?.timer_mode) {
            if (liveDoc.timer_mode !== viewMode) pauseCountRef.current = 0;
            setViewMode(liveDoc.timer_mode);
        }
    }, [liveDoc?.timer_mode]);
    const [callLoading, setCallLoading] = useState(false);
    const [pomCount, setPomCount] = useState(0);
    const [navOpen, setNavOpen] = useState(false);
    const sessionHeartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Coworking state — consider participant stale if last heartbeat > 2min ago
    const isPresenceFresh = (uid: string) => {
        const lastSeen = liveDoc?.last_seen_map?.[uid];
        if (!lastSeen) return true; // no map yet = old data, trust participants array
        const lastSeenDate = lastSeen instanceof Date ? lastSeen : lastSeen?.toDate?.() ?? new Date(lastSeen);
        return Date.now() - lastSeenDate.getTime() < 2 * 60 * 1000;
    };
    const amInSession = !!user && (liveDoc?.participants?.includes(user.uid) ?? false) && isPresenceFresh(user.uid);
    const partnerInSession = !!partner && (liveDoc?.participants?.includes(partner.id) ?? false) && isPresenceFresh(partner.id);

    // AI coach
    const [aiTips, setAiTips] = useState<string[]>([]);
    const [aiLoading, setAiLoading] = useState(false);
    const [aiQuestion, setAiQuestion] = useState('');

    // Focus Guard
    const pauseCountRef = useRef(0);
    const [focusGuardMsg, setFocusGuardMsg] = useState<string | null>(null);
    const [focusGuardSubtasks, setFocusGuardSubtasks] = useState<string[]>([]);
    const [focusGuardLoading, setFocusGuardLoading] = useState(false);

    // Smart agenda
    const [agendaRhythm, setAgendaRhythm] = useState<'leger' | 'regulier' | 'intensif'>('regulier');
    const [agendaTimePref, setAgendaTimePref] = useState('');
    const [agendaLoading, setAgendaLoading] = useState(false);
    const [generatedSessions, setGeneratedSessions] = useState<{ title: string; description: string; type: string; scheduled_at: string }[]>([]);
    const [savingAgenda, setSavingAgenda] = useState(false);

    useEffect(() => { if (!user || !id) return; loadPair(); }, [user, id]);
    useEffect(() => { if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight; }, [messages]);

    // Hide navbar during full-screen call (not when minimized)
    useEffect(() => {
        if (isOnCall && !callMinimized) { setNavbarVisible(false); return () => setNavbarVisible(true); }
    }, [isOnCall, callMinimized, setNavbarVisible]);

    // Logo turns green when in coworking session (same as objective page)
    useEffect(() => {
        setIsWorking(amInSession);
        return () => setIsWorking(false);
    }, [amInSession]);


    // Timer completion: when it reaches 0, reset and show animation — never auto-restart
    useEffect(() => {
        if (!liveDoc?.timer_running || timerRemaining > 0) return;
        const timerMode = liveDoc.timer_mode ?? 'focus';

        // Focus session completed → celebration + pomCount
        if (timerMode === 'focus') {
            setPomCount(c => c + 1);
            setShowAnim(true);
            setTimeout(() => setShowAnim(false), 3000);
        }

        // Reset timer to full duration, don't auto-restart (direct write, bypasses viewMode guard)
        updateDoc(liveRef, {
            timer_running: false,
            timer_base_seconds: 0,
            timer_started_at: null,
        }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [timerRemaining, liveDoc?.timer_running]);

    const loadPair = async () => {
        setLoading(true);
        try {
            const pairDoc = await getDoc(doc(db, 'accountability_pairs', id as string));
            if (!pairDoc.exists()) { router.push('/accountability'); return; }
            const pairData = { id: pairDoc.id, ...pairDoc.data() } as any;
            setPair(pairData);
            setGoalInput(String(pairData.weekly_hours_goal ?? 5));
            setGoalFreq(pairData.goal_frequency || 'weekly');
            setTitleInput(pairData.title || '');
            setHoursEnabled((pairData.weekly_hours_goal ?? 5) > 0);

            const partnerUid = pairData.user1_id === user!.uid ? pairData.user2_id : pairData.user1_id;
            const partnerDoc = await getDoc(doc(db, 'users', partnerUid));
            const partnerData = partnerDoc.exists() ? { id: partnerDoc.id, ...partnerDoc.data() } : { id: partnerUid, full_name: 'Partenaire' };
            setPartner(partnerData);

            if (pairData.objective_id) {
                const objDoc = await getDoc(doc(db, 'objectives', pairData.objective_id));
                if (objDoc.exists()) setObjective({ id: objDoc.id, ...objDoc.data() });

                const memQ = query(collection(db, 'memberships'), where('objective_id', '==', pairData.objective_id));
                const memSnap = await getDocs(memQ);
                memSnap.docs.forEach(d => {
                    const data = d.data();
                    if (data.user_id === user!.uid) setMyMembership(data);
                    if (data.user_id === partnerUid) setPartnerMembership(data);
                });

                const presRef = doc(db, 'objectives', pairData.objective_id, 'presence', partnerUid);
                onSnapshot(presRef, snap => { if (snap.exists()) setPartnerPresence(snap.data()); });
            }

            const myMemQ = query(collection(db, 'memberships'), where('user_id', '==', user!.uid));
            const myMemSnap = await getDocs(myMemQ);
            const objIds = myMemSnap.docs.map(d => d.data().objective_id);
            const objDocs = await Promise.all(objIds.map(oid => getDoc(doc(db, 'objectives', oid))));
            setMyObjectives(objDocs.filter(d => d.exists()).map(d => ({ id: d.id, ...d.data() })));
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    };

    // Real-time listeners
    useEffect(() => {
        if (!id) return;
        const unsubs = [
            onSnapshot(query(collection(db, 'accountability_pairs', id as string, 'messages'), orderBy('created_at', 'asc')),
                snap => setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })))),
            onSnapshot(query(collection(db, 'accountability_pairs', id as string, 'resources'), orderBy('created_at', 'desc')),
                snap => setResources(snap.docs.map(d => ({ id: d.id, ...d.data() })))),
            onSnapshot(query(collection(db, 'accountability_pairs', id as string, 'sessions'), orderBy('scheduled_at', 'asc')),
                snap => setSessions(snap.docs.map(d => ({ id: d.id, ...d.data() })))),
            onSnapshot(query(collection(db, 'accountability_pairs', id as string, 'milestones'), orderBy('created_at', 'asc')),
                snap => setMilestones(snap.docs.map(d => ({ id: d.id, ...d.data() })))),
            onSnapshot(doc(db, 'accountability_pairs', id as string, 'coworking', 'live'),
                snap => setLiveDoc(snap.exists() ? snap.data() : null)),
            onSnapshot(query(collection(db, 'accountability_pairs', id as string, 'coworking_log'), orderBy('started_at', 'desc')),
                snap => setCwLog(snap.docs.map(d => ({ id: d.id, ...d.data() })).slice(0, 5))),
        ];
        return () => unsubs.forEach(u => u());
    }, [id]);

    // Keep liveDocRef always fresh for use in stale closures (onLeaveRoom, etc.)
    useEffect(() => { liveDocRef.current = liveDoc; }, [liveDoc]);

    // Pomodoro client tick
    useEffect(() => {
        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
        if (!liveDoc) { setTimerRemaining(POMODORO_DURATIONS.focus); return; }
        const computeRemaining = () => {
            const base = liveDoc.timer_base_seconds ?? 0;
            const duration = liveDoc.timer_duration ?? POMODORO_DURATIONS.focus;
            if (!liveDoc.timer_running) return Math.max(0, duration - base);
            const startedAt = liveDoc.timer_started_at?.toDate?.() ?? new Date();
            const elapsed = base + (Date.now() - startedAt.getTime()) / 1000;
            return Math.max(0, duration - elapsed);
        };
        setTimerRemaining(computeRemaining());
        if (liveDoc.timer_running) {
            timerIntervalRef.current = setInterval(() => setTimerRemaining(computeRemaining()), 1000);
        }
        return () => { if (timerIntervalRef.current) clearInterval(timerIntervalRef.current); };
    }, [liveDoc]);

    // Chat
    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim() || !user || sending) return;
        setSending(true);
        const text = newMessage.trim();
        setNewMessage('');
        try {
            await addDoc(collection(db, 'accountability_pairs', id as string, 'messages'), {
                sender_id: user.uid,
                sender_name: user.displayName || user.email?.split('@')[0] || 'Moi',
                content: text,
                created_at: serverTimestamp(),
            });
        } finally { setSending(false); }
    };

    // Nudge
    const handleNudge = async () => {
        if (!partner || nudging || nudgeSent) return;
        setNudging(true);
        try {
            await addDoc(collection(db, 'users', partner.id, 'notifications'), {
                type: 'accountability_nudge',
                message: `${user!.displayName || user!.email?.split('@')[0] || 'Votre partenaire'} vous envoie un coup de pouce — allez, au travail ! 💪`,
                link: `/accountability/${id}`,
                read: false,
                created_at: serverTimestamp(),
            });
            setNudgeSent(true);
            setTimeout(() => setNudgeSent(false), 4000);
        } finally { setNudging(false); }
    };

    // Leave partnership
    const handleLeave = async () => {
        if (!pair || leaving) return;
        setLeaving(true);
        try {
            await deleteDoc(doc(db, 'accountability_pairs', id as string));
            router.push('/accountability');
        } catch (err) { console.error(err); setLeaving(false); }
    };

    // Goal
    const handleSaveGoal = async () => {
        const g = hoursEnabled ? (parseFloat(goalInput) || 0) : 0;
        if (hoursEnabled && (!g || g <= 0)) return;
        await updateDoc(doc(db, 'accountability_pairs', id as string), {
            weekly_hours_goal: g,
            goal_frequency: goalFreq
        });
        setPair((p: any) => ({ ...p, weekly_hours_goal: g, goal_frequency: goalFreq }));
        setEditingGoal(false);
    };

    const handleSaveTitle = async () => {
        setSavingTitle(true);
        try {
            await updateDoc(doc(db, 'accountability_pairs', id as string), { title: titleInput.trim() || null });
            setPair((p: any) => ({ ...p, title: titleInput.trim() || null }));
            setEditingTitle(false);
        } finally { setSavingTitle(false); }
    };

    // Salon
    const handleLinkSalon = async (objectiveId: string) => {
        await updateDoc(doc(db, 'accountability_pairs', id as string), { objective_id: objectiveId || null });
        setEditingSalon(false);
        loadPair();
    };

    // Resources
    const handleAddResource = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!resTitle.trim() || !user) return;
        setSavingRes(true);
        try {
            await addDoc(collection(db, 'accountability_pairs', id as string, 'resources'), {
                type: resType,
                title: resTitle.trim(),
                url: resType === 'link' ? resUrl.trim() : null,
                content: resType === 'note' ? resNote.trim() : null,
                added_by: user.uid,
                added_by_name: user.displayName || user.email?.split('@')[0] || 'Moi',
                created_at: serverTimestamp(),
            });
            setResTitle(''); setResUrl(''); setResNote(''); setShowResForm(false);
        } finally { setSavingRes(false); }
    };

    const handleDeleteResource = async (resId: string) => {
        await deleteDoc(doc(db, 'accountability_pairs', id as string, 'resources', resId));
    };

    // Agenda
    const handleAddSession = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!sessionTitle.trim() || !sessionDate || !user) return;
        setSavingSession(true);
        try {
            await addDoc(collection(db, 'accountability_pairs', id as string, 'sessions'), {
                title: sessionTitle.trim(),
                scheduled_at: new Date(sessionDate),
                note: sessionNote.trim(),
                creator_id: user.uid,
                creator_name: user.displayName || user.email?.split('@')[0] || 'Moi',
                attendees: [user.uid],
                created_at: serverTimestamp(),
            });
            await addDoc(collection(db, 'users', partner.id, 'notifications'), {
                type: 'accountability_invite',
                message: `${user.displayName || user.email?.split('@')[0] || 'Votre partenaire'} a planifié une session "${sessionTitle.trim()}" le ${new Date(sessionDate).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}.`,
                link: `/accountability/${id}`,
                read: false,
                created_at: serverTimestamp(),
            });
            setSessionTitle(''); setSessionDate(''); setSessionNote(''); setShowSessionForm(false);
        } finally { setSavingSession(false); }
    };

    const handleToggleAttendee = async (session: any) => {
        if (!user) return;
        const sRef = doc(db, 'accountability_pairs', id as string, 'sessions', session.id);
        const attending = session.attendees?.includes(user.uid);
        await updateDoc(sRef, { attendees: attending ? arrayRemove(user.uid) : arrayUnion(user.uid) });
    };

    const handleDeleteSession = async (sessionId: string) => {
        await deleteDoc(doc(db, 'accountability_pairs', id as string, 'sessions', sessionId));
    };

    // Milestones
    const handleAddMilestone = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!milestoneTitle.trim() || !user) return;
        setSavingMilestone(true);
        try {
            await addDoc(collection(db, 'accountability_pairs', id as string, 'milestones'), {
                title: milestoneTitle.trim(),
                due_date: milestoneDue ? new Date(milestoneDue) : null,
                completed: false,
                completed_by: null,
                completed_by_name: null,
                completed_at: null,
                created_by: user.uid,
                created_by_name: user.displayName || user.email?.split('@')[0] || 'Moi',
                created_at: serverTimestamp(),
            });
            setMilestoneTitle(''); setMilestoneDue(''); setShowMilestoneForm(false);
        } finally { setSavingMilestone(false); }
    };

    const handleToggleMilestone = async (milestone: any) => {
        if (!user) return;
        const mRef = doc(db, 'accountability_pairs', id as string, 'milestones', milestone.id);
        if (milestone.completed) {
            await updateDoc(mRef, { completed: false, completed_by: null, completed_by_name: null, completed_at: null });
        } else {
            await updateDoc(mRef, {
                completed: true,
                completed_by: user.uid,
                completed_by_name: user.displayName || user.email?.split('@')[0] || 'Moi',
                completed_at: serverTimestamp(),
            });
        }
    };

    const handleDeleteMilestone = async (milestoneId: string) => {
        await deleteDoc(doc(db, 'accountability_pairs', id as string, 'milestones', milestoneId));
    };

    // Coworking — timer controls
    const liveRef = doc(db, 'accountability_pairs', id as string, 'coworking', 'live');

    const handleJoinCoworking = async () => {
        if (!user) return;
        // Initialize presence map immediately to bypass staleness check
        await setDoc(liveRef, {
            participants: arrayUnion(user.uid),
            last_seen_map: { [user.uid]: serverTimestamp() },
            timer_running: liveDoc?.timer_running ?? false,
            timer_mode: liveDoc?.timer_mode ?? 'focus',
            timer_duration: liveDoc?.timer_duration ?? (POMODORO_DURATIONS[liveDoc?.timer_mode || 'focus']),
        }, { merge: true });
    };

    const handleLeaveCoworking = async () => {
        if (!user) return;
        await updateDoc(liveRef, {
            participants: arrayRemove(user.uid),
            timer_running: false,
            timer_base_seconds: 0,
            timer_started_at: null,
        });
    };

    // End call — reset timer first so partner isn't left with a ghost running timer
    const handleEndCall = () => {
        const doc_ = liveDocRef.current;
        if (doc_?.timer_running) {
            updateDoc(liveRef, { timer_running: false, timer_base_seconds: 0, timer_started_at: null }).catch(() => {});
        }
        endCall();
    };

    const handleTimerStart = async () => {
        if (!liveDoc) return;
        await updateDoc(liveRef, { timer_running: true, timer_started_at: serverTimestamp() });
    };

    const triggerFocusGuard = async (resetEarly = false) => {
        if (focusGuardLoading || focusGuardMsg) return;
        setFocusGuardLoading(true);
        try {
            const res = await fetch('/api/focus-guard', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userName: user?.displayName || user?.email?.split('@')[0] || 'toi',
                    partnerName: partner?.full_name || 'ton partenaire',
                    pauseCount: pauseCountRef.current,
                    resetEarly,
                    weeklyGoal: pair?.weekly_hours_goal ?? 5,
                }),
            });
            const data = await res.json();
            setFocusGuardMsg(data.message ?? null);
            setFocusGuardSubtasks(data.subtasks ?? []);
        } catch { /* silent */ }
        finally { setFocusGuardLoading(false); }
    };

    const handleTimerPause = async () => {
        if (!liveDoc) return;
        const base = liveDoc.timer_base_seconds ?? 0;
        const startedAt = liveDoc.timer_started_at?.toDate?.() ?? new Date();
        const elapsed = base + (Date.now() - startedAt.getTime()) / 1000;
        await updateDoc(liveRef, { timer_running: false, timer_base_seconds: elapsed });
        // Focus Guard: only watch focus sessions
        if ((liveDoc.timer_mode ?? 'focus') === 'focus') {
            pauseCountRef.current += 1;
            if (pauseCountRef.current >= 2) triggerFocusGuard(false);
        }
    };

    // Reset — only resets if currently viewing the active mode (mirrors session page resetTimer)
    const handleTimerReset = async () => {
        if (!liveDoc) return;
        const isViewingActive = (liveDoc.timer_mode ?? 'focus') === viewMode;
        if (!isViewingActive) return; // can only reset the active timer
        // Focus Guard: trigger if resetting a focus session with meaningful progress
        const duration = liveDoc.timer_duration ?? (25 * 60);
        const base = liveDoc.timer_base_seconds ?? 0;
        const startedAt = liveDoc.timer_started_at?.toDate?.() ?? new Date();
        const elapsed = liveDoc.timer_running ? base + (Date.now() - startedAt.getTime()) / 1000 : base;
        const isFocus = (liveDoc.timer_mode ?? 'focus') === 'focus';
        await updateDoc(liveRef, { timer_running: false, timer_base_seconds: 0, timer_started_at: null });
        if (isFocus && elapsed > duration * 0.15) {
            pauseCountRef.current = 0;
            triggerFocusGuard(true);
        }
    };

    // Mode tab click — purely visual navigation, no Firestore write (mirrors session page switchMode)
    const handleSwitchMode = (mode: string) => {
        if (mode !== viewMode) pauseCountRef.current = 0;
        setViewMode(mode);
    };

    // Smart toggle — mirrors session page toggleTimer exactly:
    // • viewing active mode → pause/resume
    // • viewing a different mode → start fresh on that mode
    const handleToggleTimer = async () => {
        if (!liveDoc) return;
        const isViewingActive = (liveDoc.timer_mode ?? 'focus') === viewMode;
        if (isViewingActive) {
            if (liveDoc.timer_running) {
                await handleTimerPause();
            } else {
                await handleTimerStart();
            }
        } else {
            // Start fresh on the viewed mode (change active timer)
            pauseCountRef.current = 0;
            const newDuration = liveDoc?.custom_durations?.[viewMode]
                ? liveDoc.custom_durations[viewMode] * 60
                : POMODORO_DURATIONS[viewMode];
            await updateDoc(liveRef, {
                timer_mode: viewMode,
                timer_running: true,
                timer_base_seconds: 0,
                timer_started_at: serverTimestamp(),
                timer_duration: newDuration,
            });
        }
    };

    // Timer settings – sync draftDurations when liveDoc changes
    useEffect(() => {
        if (liveDoc?.custom_durations) {
            setDraftDurations({
                focus: liveDoc.custom_durations.focus ?? 25,
                short: liveDoc.custom_durations.short ?? 5,
                long: liveDoc.custom_durations.long ?? 15,
            });
        }
    }, [liveDoc?.custom_durations?.focus, liveDoc?.custom_durations?.short, liveDoc?.custom_durations?.long]);

    const handleApplyDurations = async () => {
        const f = Math.max(1, Math.min(180, draftDurations.focus));
        const s = Math.max(1, Math.min(60, draftDurations.short));
        const l = Math.max(1, Math.min(60, draftDurations.long));
        const newModeDuration = (viewMode === 'focus' ? f : viewMode === 'short' ? s : l) * 60;

        if (liveDoc?.timer_running) {
            // Keep timer running, do not interrupt
            await updateDoc(liveRef, {
                custom_durations: { focus: f, short: s, long: l },
                // DO NOT overwrite timer_running, timer_base_seconds, etc.
            });
        } else {
            // Reset and apply current mode duration if stopped
            await updateDoc(liveRef, {
                custom_durations: { focus: f, short: s, long: l },
                timer_running: false,
                timer_base_seconds: 0,
                timer_started_at: null,
                timer_duration: newModeDuration,
            });
        }
        setShowTimerSettings(false);
    };

    // Video call — init ZegoCloud when this page becomes the active call page
    useEffect(() => {
        if (!isOnCall || !user) return;
        if (callZpRef.current) return;

        const appID = parseInt(process.env.NEXT_PUBLIC_ZEGO_APP_ID || '0');
        const serverSecret = process.env.NEXT_PUBLIC_ZEGO_SERVER_SECRET || '';
        if (!appID || !serverSecret || serverSecret === 'REMPLACE_PAR_TON_SERVER_SECRET') return;

        let cancelled = false;
        setCallLoading(true);

        const rafId = requestAnimationFrame(() => {
            if (cancelled || !callContainerRef.current) return;
            (async () => {
                try {
                    const { ZegoUIKitPrebuilt } = await import('@zegocloud/zego-uikit-prebuilt');
                    if (cancelled || callZpRef.current) return;
                    const roomId = `acc-${id}`;
                    const userName = (user as any).full_name || user.displayName || user.email?.split('@')[0] || 'Membre';
                    const kitToken = ZegoUIKitPrebuilt.generateKitTokenForTest(appID, serverSecret, roomId, user.uid, userName);
                    const zp = ZegoUIKitPrebuilt.create(kitToken);
                    if (cancelled) { try { zp.destroy(); } catch { /* ignore */ } return; }
                    callZpRef.current = zp;
                    zp.joinRoom({
                        container: callContainerRef.current,
                        scenario: { mode: ZegoUIKitPrebuilt.VideoConference },
                        showPreJoinView: false,
                        turnOnCameraWhenJoining: true,
                        turnOnMicrophoneWhenJoining: true,
                        showLeavingView: false,
                        showRoomDetailsButton: false,
                        showInviteToCohostButton: false,
                        showRemoveCohostButton: false,
                        showRequestToCohostButton: false,
                        layout: 'Auto',
                        showUserList: false,
                        onLeaveRoom: () => handleEndCall(),
                    });
                } catch (e) { console.error('[ZegoCall] error', e); }
                finally { setCallLoading(false); }
            })();
        });

        return () => {
            cancelled = true;
            cancelAnimationFrame(rafId);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOnCall]);

    // ─── UNIFIED PRESENCE: Heartbeat + Tab Close Cleanup ───
    // Whenever I am in the session (manually or via call), keep my status "fresh"
    useEffect(() => {
        if (!user || !id || !amInSession) {
            if (sessionHeartbeatRef.current) {
                clearInterval(sessionHeartbeatRef.current);
                sessionHeartbeatRef.current = null;
            }
            return;
        }

        const liveRef = doc(db, 'accountability_pairs', id as string, 'coworking', 'live');

        // Initial heartbeat
        setDoc(liveRef, { last_seen_map: { [user.uid]: serverTimestamp() } }, { merge: true });

        // Regular heartbeat every 30s
        sessionHeartbeatRef.current = setInterval(() => {
            setDoc(liveRef, { last_seen_map: { [user.uid]: serverTimestamp() } }, { merge: true });
        }, 30_000);

        return () => {
            if (sessionHeartbeatRef.current) {
                clearInterval(sessionHeartbeatRef.current);
                sessionHeartbeatRef.current = null;
            }
        };
    }, [amInSession, user, id]); // eslint-disable-line react-hooks/exhaustive-deps

    // ─── Call → Session Transition ───
    // Join when call starts. Leave when call ends (IF no active timer).
    useEffect(() => {
        if (!user || !id) return;
        if (isOnCall) {
            handleJoinCoworking();
        } else if (!isOnCall && !liveDoc?.timer_running && amInSession) {
            // Only leave if the call ended AND no timer is running
            handleLeaveCoworking();
        }
    }, [isOnCall, user, id]); // eslint-disable-line react-hooks/exhaustive-deps

    // AI Coach
    const handleAskCoach = async () => {
        if (!pair || !partner || aiLoading) return;
        setAiLoading(true);
        setAiTips([]);
        try {
            const myName = user!.displayName || user!.email?.split('@')[0] || 'Moi';
            const res = await fetch('/api/accountability-coach', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    myName,
                    partnerName: partner.full_name,
                    weeklyGoal: pair.weekly_hours_goal ?? 5,
                    linkedSalon: objective?.title ?? null,
                    myProgress: fmtHours(myMembership?.completed_hours ?? 0),
                    partnerProgress: fmtHours(partnerMembership?.completed_hours ?? 0),
                    userQuestion: aiQuestion,
                }),
            });
            const data = await res.json();
            setAiTips(data.tips ?? []);
        } catch (err) { console.error(err); }
        finally { setAiLoading(false); }
    };

    const handleGenerateAgenda = async () => {
        if (agendaLoading) return;
        setAgendaLoading(true);
        setGeneratedSessions([]);
        try {
            const myName = user!.displayName || user!.email?.split('@')[0] || 'Moi';
            const title = pair.title || `${myName} & ${partner.full_name}`;
            const res = await fetch('/api/generate-agenda', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title,
                    category: 'Accountability duo',
                    targetHours: pair.weekly_hours_goal ?? 5,
                    rhythm: agendaRhythm,
                    timePref: agendaTimePref.trim() || undefined,
                }),
            });
            const data = await res.json();
            setGeneratedSessions(data.sessions ?? []);
        } catch (err) { console.error(err); }
        finally { setAgendaLoading(false); }
    };

    const handleSaveGeneratedAgenda = async () => {
        if (!user || savingAgenda || generatedSessions.length === 0) return;
        setSavingAgenda(true);
        try {
            await Promise.all(generatedSessions.map(s =>
                addDoc(collection(db, 'accountability_pairs', id as string, 'sessions'), {
                    title: s.title,
                    scheduled_at: new Date(s.scheduled_at),
                    note: s.description,
                    creator_id: user.uid,
                    creator_name: user.displayName || user.email?.split('@')[0] || 'Moi',
                    attendees: [user.uid],
                    created_at: serverTimestamp(),
                })
            ));
            setGeneratedSessions([]);
            setActiveTab('agenda');
        } finally { setSavingAgenda(false); }
    };

    const getDaysSince = (ts: any): number | null => {
        if (!ts?.toDate) return null;
        return Math.floor((Date.now() - ts.toDate().getTime()) / (1000 * 60 * 60 * 24));
    };

    const isPartnerActive = partnerPresence?.is_working &&
        partnerPresence?.last_seen?.toDate &&
        Date.now() - partnerPresence.last_seen.toDate().getTime() < 2 * 60 * 1000;

    if (loading) return (
        <div className="container py-16 text-center fade-enter" style={{ maxWidth: '980px' }}>
            <div style={{ width: '2rem', height: '2rem', borderRadius: '50%', border: '3px solid var(--color-border)', borderTopColor: 'var(--color-primary)', animation: 'spin 1s linear infinite', margin: '0 auto' }} />
        </div>
    );
    if (!pair || !partner) return null;

    const targetHours = objective?.target_hours ?? 0;
    const myProgress = myMembership?.completed_hours ?? 0;
    const partnerProgress = partnerMembership?.completed_hours ?? 0;
    const weeklyGoal = pair.weekly_hours_goal ?? 5;
    const completedMilestones = milestones.filter(m => m.completed).length;
    const totalMilestones = milestones.length;


    // Determine what to display based on selected view vs active running timer
    const isActiveMode = liveDoc ? (liveDoc.timer_mode === viewMode) : false;
    const getModeDuration = (m: string) => {
        if (liveDoc?.custom_durations && liveDoc.custom_durations[m]) {
            return liveDoc.custom_durations[m] * 60;
        }
        return POMODORO_DURATIONS[m];
    };

    // Note: displayRemaining and displayDuration show the live ticking values if the active timer matches the view, 
    // otherwise they show the default (or customized) static duration for the chosen view.
    const timerColor = POMODORO_COLORS[viewMode] || '#6366f1';
    const viewDuration = getModeDuration(viewMode);
    const displayRemaining = isActiveMode ? timerRemaining : viewDuration;
    const displayDuration = isActiveMode ? (liveDoc.timer_duration ?? viewDuration) : viewDuration;
    const displayRunning = isActiveMode ? (liveDoc.timer_running ?? false) : false;

    const TABS: { key: Tab; label: string; icon: string }[] = [
        { key: 'resume', label: 'Résumé', icon: '📊' },
        { key: 'etapes', label: 'Étapes', icon: '✅' },
        { key: 'ressources', label: 'Ressources', icon: '🔗' },
        { key: 'agenda', label: 'Agenda', icon: '📅' },
        { key: 'coworking', label: 'Coworking', icon: '🖥️' },
        { key: 'ia', label: 'Coach IA', icon: '🤖' },
    ];

    // ── Full-screen call mode (same structure as session page) ─────────────────
    if (isOnCall && !callMinimized && partner) {
        const NAV_LINKS = [
            { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
            { label: 'Explorer', href: '/explore', icon: Compass },
            { label: 'Amis', href: '/friends', icon: Users },
            { label: 'Messages', href: '/messages', icon: MessageCircle },
            { label: 'Accountability', href: '/accountability', icon: Target },
        ];
        const openLink = (href: string) => { router.push(href); setNavOpen(false); };

        return (
            <>
                <style>{`
                    @keyframes spin { to { transform: rotate(360deg); } }
                    @keyframes slideInLeft {
                        from { transform: translateX(-100%); }
                        to   { transform: translateX(0); }
                    }
                    @keyframes fadeOverlay {
                        from { opacity: 0; }
                        to   { opacity: 1; }
                    }
                    .zp-confirm-dialog-bg,[class*="confirmDialog"],[class*="leaveDialog"]{background:rgba(0,0,0,0.7)!important;backdrop-filter:blur(8px)!important}
                    .zp-confirm-dialog,[class*="confirmDialogContent"]{background:#18181b!important;border:1px solid rgba(255,255,255,0.08)!important;border-radius:16px!important;box-shadow:0 24px 60px rgba(0,0,0,0.7)!important;color:#e4e4e7!important;padding:28px!important;font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif!important}
                    .zp-confirm-dialog h4,.zp-confirm-dialog h3,[class*="confirmDialogContent"] h4,[class*="confirmDialogContent"] h3{color:#f4f4f5!important;font-size:1.05rem!important;font-weight:700!important}
                    .zp-confirm-dialog p,[class*="confirmDialogContent"] p{color:#71717a!important;font-size:0.875rem!important}
                    .zp-confirm-dialog button,[class*="confirmDialogContent"] button{border-radius:10px!important;font-weight:600!important;font-size:0.85rem!important;padding:9px 20px!important;border:none!important;cursor:pointer!important}
                    .zp-confirm-dialog button:first-of-type,[class*="confirmDialogContent"] button:first-of-type{background:transparent!important;color:#a1a1aa!important;border:1px solid rgba(255,255,255,0.1)!important}
                    .zp-confirm-dialog button:last-of-type,[class*="confirmDialogContent"] button:last-of-type{background:linear-gradient(135deg,#ef4444,#dc2626)!important;color:#fff!important;box-shadow:0 4px 14px rgba(239,68,68,0.35)!important}
                `}</style>

                <div style={{
                    height: '100vh', marginTop: 'calc(-6.5rem)',
                    display: 'flex', overflow: 'hidden',
                    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
                }}>
                    {/* Collaborative whiteboard overlay */}
                    {showWhiteboard && (
                        <CollabWhiteboard
                            boardPath={`accountability_pairs/${id}/whiteboard/board`}
                            onClose={() => setShowWhiteboard(false)}
                        />
                    )}

                    {/* Left: transparent placeholder — video lives here via AccCallOverlay (position:fixed) */}
                    <div style={{ flex: 1, position: 'relative', zIndex: 5, pointerEvents: 'none' }}>
                        {/* Floating top bar */}
                        <div style={{
                            position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '12px 16px',
                            background: 'linear-gradient(to bottom, rgba(0,0,0,0.7) 0%, transparent 100%)',
                            pointerEvents: 'none',
                        }}>
                            {/* Hamburger menu */}
                            <button
                                onClick={() => setNavOpen(true)}
                                style={{
                                    width: 36, height: 36, borderRadius: 10,
                                    background: 'rgba(18,18,22,0.75)', backdropFilter: 'blur(10px)',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    color: '#e4e4e7', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    cursor: 'pointer', pointerEvents: 'auto', flexShrink: 0,
                                }}
                                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(40,40,50,0.9)')}
                                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(18,18,22,0.75)')}
                            >
                                <Menu size={16} />
                            </button>

                            {/* Title pill */}
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                background: 'rgba(18,18,22,0.7)', backdropFilter: 'blur(10px)',
                                border: '1px solid rgba(255,255,255,0.08)',
                                borderRadius: 10, padding: '6px 12px', pointerEvents: 'auto',
                            }}>
                                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', boxShadow: '0 0 6px rgba(16,185,129,0.7)', flexShrink: 0 }} />
                                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#e4e4e7' }}>
                                    {partner.full_name} · En appel
                                </span>
                            </div>

                            {/* Right buttons */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, pointerEvents: 'auto' }}>
                                {/* Whiteboard toggle */}
                                <button
                                    onClick={() => setShowWhiteboard(v => !v)}
                                    title={showWhiteboard ? 'Masquer le tableau' : 'Tableau blanc collaboratif'}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 6,
                                        background: showWhiteboard ? 'rgba(99,102,241,0.25)' : 'rgba(18,18,22,0.75)',
                                        backdropFilter: 'blur(10px)',
                                        border: showWhiteboard ? '1px solid rgba(99,102,241,0.6)' : '1px solid rgba(255,255,255,0.1)',
                                        borderRadius: 10, padding: '7px 14px',
                                        color: showWhiteboard ? '#a5b4fc' : '#a1a1aa',
                                        fontSize: '0.75rem', fontWeight: 600,
                                        cursor: 'pointer', transition: 'all 0.18s',
                                    }}
                                >
                                    <PenLine size={13} /> Tableau
                                </button>

                                {/* Retour (minimizes call, shows pair page + mini player) */}
                                <button
                                    onClick={minimizeCall}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 6,
                                        background: 'rgba(18,18,22,0.75)', backdropFilter: 'blur(10px)',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        borderRadius: 10, padding: '7px 14px',
                                        color: '#a1a1aa', fontSize: '0.75rem', fontWeight: 600,
                                        cursor: 'pointer',
                                    }}
                                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(40,40,50,0.9)')}
                                    onMouseLeave={e => (e.currentTarget.style.background = 'rgba(18,18,22,0.75)')}
                                >
                                    <LayoutDashboard size={13} /> Retour à l'accountability
                                </button>
                                {/* Raccrocher */}
                                <button
                                    onClick={handleEndCall}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 6,
                                        background: 'rgba(239,68,68,0.15)', backdropFilter: 'blur(10px)',
                                        border: '1px solid rgba(239,68,68,0.3)',
                                        borderRadius: 10, padding: '7px 14px',
                                        color: '#fca5a5', fontSize: '0.75rem', fontWeight: 600,
                                        cursor: 'pointer',
                                    }}
                                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.28)')}
                                    onMouseLeave={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.15)')}
                                >
                                    <PhoneOff size={13} /> Raccrocher
                                </button>
                            </div>
                        </div>

                        {/* Loading spinner */}
                        {callLoading && (
                            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem', pointerEvents: 'none' }}>
                                <div style={{ width: 48, height: 48, borderRadius: '50%', border: '3px solid rgba(16,185,129,0.3)', borderTopColor: '#10b981', animation: 'spin 1s linear infinite' }} />
                                <span style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.5)' }}>Connexion en cours…</span>
                            </div>
                        )}
                    </div>

                    {/* Right sidebar */}
                    <div style={{
                        width: ACC_SIDEBAR_W, flexShrink: 0,
                        borderLeft: '1px solid rgba(255,255,255,0.06)',
                        background: '#121214',
                        display: 'flex', flexDirection: 'column',
                        overflow: 'hidden', zIndex: 5,
                    }}>
                        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 14px', display: 'flex', flexDirection: 'column', gap: 18 }}>

                            {/* Partner info */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                                <div style={{ position: 'relative', flexShrink: 0 }}>
                                    <Avatar uid={partner.id} avatarUrl={partner.avatar_url} avatarStyle={partner.avatar_style} size={36} />
                                    <span style={{ position: 'absolute', bottom: 0, right: 0, width: 9, height: 9, borderRadius: '50%', background: '#10b981', border: '2px solid #121214', boxShadow: '0 0 5px rgba(16,185,129,0.7)' }} />
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#e4e4e7', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{partner.full_name}</div>
                                    <div style={{ fontSize: '0.65rem', color: '#10b981', fontWeight: 500, marginTop: 2 }}>● En appel</div>
                                </div>
                            </div>

                            <div style={{ height: 1, background: 'rgba(255,255,255,0.05)' }} />

                            {/* Session Focus label */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <Timer size={12} style={{ color: '#6366f1' }} />
                                <span style={{ fontSize: '0.58rem', fontWeight: 700, color: '#52525b', textTransform: 'uppercase', letterSpacing: '0.12em' }}>Session Focus</span>
                            </div>

                            {/* Mode tabs + settings */}
                            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                <div style={{ flex: 1, display: 'flex', gap: 3, background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 3, border: '1px solid rgba(255,255,255,0.05)' }}>
                                    {Object.entries(POMODORO_LABELS).map(([key, label]) => (
                                        <button key={key} onClick={() => handleSwitchMode(key)} style={{ flex: 1, padding: '5px 2px', borderRadius: 7, border: 'none', background: viewMode === key ? POMODORO_COLORS[key] : 'transparent', color: viewMode === key ? '#fff' : '#71717a', fontSize: '0.62rem', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s', boxShadow: viewMode === key ? `0 0 10px ${POMODORO_COLORS[key]}44` : 'none' }}>
                                            {label}
                                        </button>
                                    ))}
                                </div>
                                <button onClick={() => setShowTimerSettings(s => !s)} title="Personnaliser les durées"
                                    style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid rgba(255,255,255,0.07)', background: showTimerSettings ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.03)', color: showTimerSettings ? '#818cf8' : '#52525b', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                                    <Settings2 size={13} />
                                </button>
                            </div>

                            {/* Timer settings panel */}
                            {showTimerSettings && (
                                <div style={{ background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 10, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    <span style={{ fontSize: '0.6rem', fontWeight: 700, color: '#52525b', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Durées (minutes)</span>
                                    {(['focus', 'short', 'long'] as const).map(key => (
                                        <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                                            <span style={{ fontSize: '0.65rem', color: POMODORO_COLORS[key], fontWeight: 700, width: 60, flexShrink: 0 }}>{POMODORO_LABELS[key]}</span>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                                <button onClick={() => setDraftDurations(d => ({ ...d, [key]: Math.max(1, d[key] - 1) }))} style={{ width: 24, height: 24, borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: '#a1a1aa', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                                                <input type="text" inputMode="numeric" value={draftDurations[key]}
                                                    onChange={e => { const n = parseInt(e.target.value.replace(/\D/g, '') || '1'); setDraftDurations(d => ({ ...d, [key]: Math.min(180, Math.max(1, n)) })); }}
                                                    style={{ width: 44, textAlign: 'center', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.13)', borderRadius: 6, color: '#f8f9fa', fontSize: '0.88rem', fontWeight: 700, padding: '4px 2px', outline: 'none' }} />
                                                <button onClick={() => setDraftDurations(d => ({ ...d, [key]: Math.min(180, d[key] + 1) }))} style={{ width: 24, height: 24, borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: '#a1a1aa', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                                            </div>
                                        </div>
                                    ))}
                                    <button onClick={handleApplyDurations} style={{ marginTop: 2, padding: '5px', borderRadius: 7, border: 'none', background: 'rgba(99,102,241,0.3)', color: '#a5b4fc', fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer' }}>✓ Appliquer</button>
                                </div>
                            )}

                            {/* Circle timer */}
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
                                <style>{`
                                    @keyframes pulse-ring-acc {
                                        0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.7); }
                                        50% { transform: scale(1.05); box-shadow: 0 0 0 15px rgba(99, 102, 241, 0); }
                                        100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(99, 102, 241, 0); }
                                    }
                                `}</style>
                                <div style={{ animation: showAnim ? 'pulse-ring-acc 1s ease-out 3' : 'none', borderRadius: '50%', position: 'relative' }}>
                                    <CircleTimer remaining={displayRemaining} total={displayDuration} color={timerColor} running={displayRunning} />
                                    <CelebrationBurst show={showAnim} />
                                </div>
                                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                                    <button onClick={handleTimerReset}
                                        style={{ width: 34, height: 34, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.03)', color: '#71717a', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
                                        onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}>
                                        <RotateCcw size={13} />
                                    </button>
                                    <button onClick={handleToggleTimer}
                                        style={{ width: 46, height: 46, borderRadius: '50%', border: 'none', background: `linear-gradient(135deg,${timerColor},${timerColor}cc)`, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: `0 0 20px ${timerColor}55` }}
                                        onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.07)'; }}
                                        onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}>
                                        {displayRunning ? <Pause size={17} style={{ fill: '#fff' }} /> : <Play size={17} style={{ fill: '#fff', marginLeft: 2 }} />}
                                    </button>
                                </div>
                                {/* Pomodoro dots */}
                                <div style={{ display: 'flex', gap: 5 }}>
                                    {[...Array(4)].map((_, i) => (
                                        <div key={i} style={{
                                            width: 7, height: 7, borderRadius: '50%',
                                            background: i < (pomCount % 4) ? '#6366f1' : 'rgba(255,255,255,0.06)',
                                            transition: 'background 0.3s',
                                            boxShadow: i < (pomCount % 4) ? '0 0 6px rgba(99,102,241,0.5)' : 'none',
                                        }} />
                                    ))}
                                </div>
                                <p style={{ fontSize: '0.65rem', color: '#3f3f46', margin: 0 }}>
                                    {pomCount} session{pomCount !== 1 ? 's' : ''} focus terminée{pomCount !== 1 ? 's' : ''}
                                </p>
                            </div>

                            <div style={{ height: 1, background: 'rgba(255,255,255,0.05)' }} />

                            {/* Raccrocher */}
                            <button onClick={handleEndCall}
                                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px', borderRadius: 12, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.12)', color: '#fca5a5', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer' }}
                                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.22)')}
                                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.12)')}>
                                <PhoneOff size={15} /> Raccrocher
                            </button>
                        </div>

                        {/* Bottom tip */}
                        <div style={{ padding: '10px 14px', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                            <p style={{ fontSize: '0.62rem', color: '#3f3f46', margin: 0, lineHeight: 1.5 }}>
                                💡 {draftDurations.focus} min focus · {draftDurations.short} min pause · ×4 → longue pause
                            </p>
                        </div>
                    </div>
                </div>

                {/* ── Sliding left nav panel (same as session page) ── */}
                {navOpen && (
                    <>
                        <div onClick={() => setNavOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)', animation: 'fadeOverlay 0.2s ease' }} />
                        <div style={{
                            position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 60,
                            width: 260, background: '#121214',
                            borderRight: '1px solid rgba(255,255,255,0.07)',
                            boxShadow: '4px 0 32px rgba(0,0,0,0.6)',
                            display: 'flex', flexDirection: 'column',
                            animation: 'slideInLeft 0.22s cubic-bezier(0.16,1,0.3,1)',
                        }}>
                            {/* Header */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 18px 14px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <Zap size={18} style={{ color: '#6366f1', fill: '#6366f1' }} />
                                    <span style={{ fontSize: '1rem', fontWeight: 800, color: '#f8f9fa', letterSpacing: '-0.03em' }}>Gitsync</span>
                                </div>
                                <button onClick={() => setNavOpen(false)} style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', background: 'transparent', color: '#71717a', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = '#e4e4e7'; }}
                                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#71717a'; }}>
                                    <X size={14} />
                                </button>
                            </div>

                            {/* Call badge */}
                            <div style={{ padding: '12px 14px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 10, background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.15)' }}>
                                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#10b981', flexShrink: 0, boxShadow: '0 0 6px rgba(16,185,129,0.6)' }} />
                                    <div style={{ minWidth: 0 }}>
                                        <div style={{ fontSize: '0.6rem', color: '#10b981', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Appel actif</div>
                                        <div style={{ fontSize: '0.77rem', color: '#d1fae5', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>avec {partner.full_name}</div>
                                    </div>
                                </div>
                            </div>

                            {/* Nav links */}
                            <div style={{ padding: '10px 10px', flex: 1 }}>
                                <p style={{ fontSize: '0.58rem', fontWeight: 700, color: '#3f3f46', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '6px 8px 8px' }}>Navigation</p>
                                {NAV_LINKS.map(({ label, href, icon: Icon }) => (
                                    <button key={href} onClick={() => openLink(href)} style={{
                                        width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                                        padding: '10px 12px', borderRadius: 10, border: 'none',
                                        background: 'transparent', color: '#a1a1aa',
                                        fontSize: '0.85rem', fontWeight: 500, cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
                                    }}
                                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = '#f8f9fa'; }}
                                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#a1a1aa'; }}>
                                        <Icon size={16} style={{ flexShrink: 0, opacity: 0.7 }} />
                                        {label}
                                    </button>
                                ))}
                            </div>

                            {/* End call */}
                            <div style={{ padding: '12px 14px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                                <button onClick={handleEndCall} style={{
                                    width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                                    padding: '10px 14px', borderRadius: 10,
                                    background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.15)',
                                    color: '#ef4444', fontSize: '0.83rem', fontWeight: 600, cursor: 'pointer', transition: 'background 0.2s',
                                }}
                                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.14)')}
                                    onMouseLeave={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.07)')}>
                                    <PhoneOff size={15} /> Raccrocher
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </>
        );
    }

    return (
        <>
        <div style={{ paddingLeft: '228px', paddingRight: '3rem', paddingTop: '2rem', paddingBottom: '4rem', minHeight: '100vh' }}>
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=DM+Sans:wght@300;400;500;600;700&display=swap');

                @keyframes ad-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
                @keyframes ad-pulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(16,185,129,0.5); } 50% { box-shadow: 0 0 0 5px rgba(16,185,129,0); } }
                @keyframes spin { to { transform: rotate(360deg); } }
                @keyframes pulse-ring-acc {
                    0%   { box-shadow: 0 0 0 0   rgba(99,102,241, 0.7); }
                    70%  { box-shadow: 0 0 0 24px rgba(99,102,241, 0); }
                    100% { box-shadow: 0 0 0 0   rgba(99,102,241, 0); }
                }
                @keyframes fgSlideIn {
                    from { opacity: 0; transform: translateY(16px) scale(0.96); }
                    to   { opacity: 1; transform: translateY(0) scale(1); }
                }

                .ad-wrap { font-family: 'DM Sans', system-ui; color: #e8e8ef; }
                .ad-heading { font-family: 'Outfit', system-ui; font-weight: 800; letter-spacing: -0.03em; }
                .ad-mono { font-family: 'DM Sans', system-ui; }

                /* Tab nav */
                .ad-tabbar {
                    display: flex; gap: 2px;
                    background: rgba(255,255,255,0.03);
                    border: 1px solid rgba(255,255,255,0.06);
                    border-radius: 14px; padding: 4px;
                    margin-bottom: 20px;
                    flex-wrap: wrap;
                }
                .ad-tab {
                    flex: 1 1 auto;
                    padding: 8px 10px;
                    border-radius: 10px; border: none;
                    font-family: 'DM Sans', system-ui;
                    font-size: 0.78rem; font-weight: 600;
                    cursor: pointer; transition: all 0.2s;
                    display: flex; align-items: center; justify-content: center; gap: 5px;
                    white-space: nowrap;
                }
                .ad-tab-active {
                    background: rgba(217,119,6,0.18);
                    color: #f59e0b;
                    box-shadow: 0 0 0 1px rgba(217,119,6,0.35);
                }
                .ad-tab-inactive {
                    background: transparent;
                    color: rgba(255,255,255,0.38);
                }
                .ad-tab-inactive:hover { background: rgba(255,255,255,0.05); color: rgba(255,255,255,0.65); }

                /* Cards */
                .ad-card {
                    background: rgba(14,14,20,0.95);
                    border: 1px solid rgba(255,255,255,0.07);
                    border-radius: 18px;
                    padding: 20px 22px;
                    animation: ad-in 0.3s cubic-bezier(0.22,1,0.36,1) both;
                }

                /* Inputs */
                .ad-input {
                    width: 100%; box-sizing: border-box;
                    background: rgba(255,255,255,0.04);
                    border: 1px solid rgba(255,255,255,0.09);
                    border-radius: 11px;
                    color: #f0f0f5;
                    font-family: 'DM Sans', system-ui; font-size: 0.88rem;
                    padding: 10px 14px; outline: none;
                    transition: border-color 0.2s, box-shadow 0.2s;
                }
                .ad-input:focus { border-color: rgba(217,119,6,0.5); box-shadow: 0 0 0 3px rgba(217,119,6,0.1); }
                .ad-label { font-size: 0.7rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: rgba(255,255,255,0.32); display: block; margin-bottom: 7px; }

                /* Buttons */
                .ad-btn-amber {
                    padding: 9px 18px; border-radius: 11px; border: none;
                    background: linear-gradient(135deg, #d97706, #f59e0b);
                    color: #0a0a10; font-family: 'Outfit', system-ui; font-size: 0.82rem; font-weight: 700;
                    cursor: pointer; transition: all 0.2s;
                    box-shadow: 0 3px 12px rgba(217,119,6,0.3);
                    display: flex; align-items: center; gap: 6px;
                }
                .ad-btn-amber:hover { box-shadow: 0 5px 18px rgba(217,119,6,0.45); transform: translateY(-1px); }
                .ad-btn-amber:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

                .ad-btn-ghost {
                    padding: 8px 14px; border-radius: 10px;
                    border: 1px solid rgba(255,255,255,0.09);
                    background: rgba(255,255,255,0.04);
                    color: rgba(255,255,255,0.5);
                    font-family: 'DM Sans', system-ui; font-size: 0.82rem; font-weight: 600;
                    cursor: pointer; transition: all 0.18s;
                    display: flex; align-items: center; gap: 6px;
                }
                .ad-btn-ghost:hover { border-color: rgba(255,255,255,0.18); color: rgba(255,255,255,0.8); }

                /* Progress bar */
                .ad-pbar { height: 5px; border-radius: 5px; background: rgba(255,255,255,0.06); overflow: hidden; }
                .ad-pbar-fill { height: 100%; border-radius: 5px; transition: width 0.6s cubic-bezier(0.22,1,0.36,1); }

                /* Chat */
                .ad-chat-bubble-me {
                    max-width: 82%; padding: 9px 13px;
                    border-radius: 16px 16px 4px 16px;
                    background: linear-gradient(135deg, #d97706, #f59e0b);
                    color: #0a0a10; font-size: 0.85rem; line-height: 1.4;
                }
                .ad-chat-bubble-partner {
                    max-width: 82%; padding: 9px 13px;
                    border-radius: 16px 16px 16px 4px;
                    background: rgba(255,255,255,0.07);
                    border: 1px solid rgba(255,255,255,0.08);
                    color: #e0e0ea; font-size: 0.85rem; line-height: 1.4;
                }

                /* Milestone */
                .ad-milestone {
                    padding: 13px 16px; border-radius: 13px;
                    background: rgba(14,14,20,0.95);
                    border: 1px solid rgba(255,255,255,0.07);
                    display: flex; align-items: flex-start; gap: 12px;
                    transition: border-color 0.2s;
                }
                .ad-milestone:hover { border-color: rgba(255,255,255,0.14); }

                /* Session row */
                .ad-session {
                    padding: 14px 18px; border-radius: 14px;
                    background: rgba(14,14,20,0.95);
                    border: 1px solid rgba(255,255,255,0.07);
                    border-left: 3px solid #d97706;
                    transition: border-color 0.2s;
                }
                .ad-session:hover { border-color: rgba(217,119,6,0.4); }

                /* Resource row */
                .ad-resource {
                    padding: 13px 16px; border-radius: 13px;
                    background: rgba(14,14,20,0.95);
                    border: 1px solid rgba(255,255,255,0.07);
                    display: flex; align-items: flex-start; gap: 12px;
                }

                /* Coworking status pill */
                .ad-presence-pill {
                    display: flex; align-items: center; gap: 8px;
                    padding: 10px 16px; border-radius: 12px;
                    border: 1px solid rgba(255,255,255,0.08);
                    background: rgba(255,255,255,0.03);
                    transition: all 0.2s; flex: 1;
                }

                /* Toggle */
                .ad-toggle { width: 38px; height: 21px; border-radius: 11px; border: none; padding: 2px; position: relative; cursor: pointer; transition: background 0.25s; flex-shrink: 0; }
                .ad-toggle-thumb { display: block; width: 17px; height: 17px; border-radius: 50%; background: #fff; position: absolute; top: 2px; transition: left 0.25s; box-shadow: 0 1px 4px rgba(0,0,0,0.4); }

                /* Mode button */
                .ad-mode-btn { flex: 1; padding: 8px 4px; border-radius: 10px; border: none; font-family: 'DM Sans', system-ui; font-size: 0.76rem; font-weight: 700; cursor: pointer; transition: all 0.2s; }

                /* AI tip */
                .ad-ai-tip { display: flex; gap: 11px; padding: 12px 14px; border-radius: 12px; background: rgba(99,102,241,0.06); border: 1px solid rgba(99,102,241,0.14); }

                /* Rhythm button */
                .ad-rhythm-btn { flex: 1; padding: 10px 6px; border-radius: 11px; cursor: pointer; transition: all 0.2s; border: 1px solid; }
            `}</style>

            <div className="ad-wrap">

                {/* ── Back ── */}
                <button onClick={() => router.push('/accountability')} className="ad-btn-ghost" style={{ marginBottom: 24, fontSize: '0.8rem' }}>
                    <ArrowLeft size={14} /> Retour
                </button>

                {/* ── Header ── */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 18, marginBottom: 32, flexWrap: 'wrap' }}>
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                        <Avatar uid={partner.id} avatarUrl={partner.avatar_url} avatarStyle={partner.avatar_style} size={68}
                            style={{ border: `3px solid ${isPartnerActive ? '#10b981' : 'rgba(217,119,6,0.4)'}`, cursor: 'pointer', transition: 'border-color 0.3s' }}
                            onClick={() => router.push(`/user/${partner.id}`)} />
                        {isPartnerActive && (
                            <span style={{ position: 'absolute', bottom: 3, right: 3, width: 14, height: 14, borderRadius: '50%', background: '#10b981', border: '2px solid #090a0f', animation: 'ad-pulse 2s ease infinite' }} />
                        )}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                        <h2 className="ad-heading" style={{ margin: '0 0 4px', fontSize: '1.7rem', color: '#f0f0f5' }}>
                            {pair.title || partner.full_name}
                        </h2>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
                            {isPartnerActive ? (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.78rem', color: '#10b981', fontWeight: 600 }}>
                                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981' }} /> En train de travailler
                                </span>
                            ) : (() => {
                                const days = getDaysSince(partnerPresence?.last_seen);
                                if (days === null) return <span style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.3)' }}>Activité inconnue</span>;
                                if (days === 0) return <span style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)' }}>Vu aujourd'hui</span>;
                                if (days === 1) return <span style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.45)' }}>Vu hier</span>;
                                return <span style={{ fontSize: '0.78rem', color: '#fbbf24' }}><AlertCircle size={11} style={{ display: 'inline', marginRight: 4 }} />Inactif depuis {days}j</span>;
                            })()}
                            <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'rgba(255,255,255,0.2)' }} />
                            <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.3)' }}>
                                {pair.created_at?.toDate ? pair.created_at.toDate().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'}
                            </span>
                            {totalMilestones > 0 && (
                                <>
                                    <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'rgba(255,255,255,0.2)' }} />
                                    <span style={{ fontSize: '0.75rem', color: completedMilestones === totalMilestones ? '#10b981' : 'rgba(255,255,255,0.35)' }}>
                                        {completedMilestones}/{totalMilestones} étapes
                                    </span>
                                </>
                            )}
                        </div>
                        {weeklyGoal > 0 && (
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px', borderRadius: 8, background: 'rgba(217,119,6,0.1)', border: '1px solid rgba(217,119,6,0.2)' }}>
                                <Target size={12} style={{ color: '#f59e0b' }} />
                                <span className="ad-mono" style={{ fontSize: '0.82rem', fontWeight: 700, color: '#f59e0b' }}>{weeklyGoal}h</span>
                                <span style={{ fontSize: '0.73rem', color: 'rgba(255,255,255,0.35)' }}>/ {pair.goal_frequency === 'daily' ? 'jour' : pair.goal_frequency === 'monthly' ? 'mois' : 'semaine'}</span>
                            </div>
                        )}
                    </div>

                    {/* Action buttons */}
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexShrink: 0 }}>
                        <button onClick={handleNudge} disabled={nudging || nudgeSent}
                            style={{ padding: '9px 14px', borderRadius: 11, border: `1px solid ${nudgeSent ? 'rgba(16,185,129,0.3)' : 'rgba(217,119,6,0.25)'}`, background: nudgeSent ? 'rgba(16,185,129,0.1)' : 'rgba(217,119,6,0.08)', color: nudgeSent ? '#10b981' : '#f59e0b', fontFamily: 'DM Sans, system-ui', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, transition: 'all 0.2s' }}>
                            {nudgeSent ? <><CheckCircle size={13} /> Envoyé</> : <><Zap size={13} /> Nudge</>}
                        </button>

                        {/* Settings */}
                        <div style={{ position: 'relative' }} ref={settingsPanelRef}>
                            <button onClick={() => setShowSettingsPanel(v => !v)}
                                style={{ width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${showSettingsPanel ? 'rgba(217,119,6,0.4)' : 'rgba(255,255,255,0.09)'}`, background: showSettingsPanel ? 'rgba(217,119,6,0.12)' : 'rgba(255,255,255,0.04)', color: showSettingsPanel ? '#f59e0b' : 'rgba(255,255,255,0.4)', cursor: 'pointer', transition: 'all 0.2s' }}>
                                <Settings2 size={15} />
                            </button>
                            {showSettingsPanel && (
                                <div style={{ position: 'absolute', top: 42, right: 0, zIndex: 200, width: 310, borderRadius: 18, background: 'rgba(14,14,20,0.99)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 24px 60px rgba(0,0,0,0.7)', padding: '1.2rem', display: 'flex', flexDirection: 'column', gap: '1rem', animation: 'ad-in 0.15s ease' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <div style={{ fontFamily: 'Outfit, system-ui', fontWeight: 700, fontSize: '0.88rem', color: '#f0f0f5', display: 'flex', alignItems: 'center', gap: 7 }}>
                                            <Settings2 size={14} style={{ color: '#f59e0b' }} /> Paramètres
                                        </div>
                                        <button onClick={() => setShowSettingsPanel(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.35)', padding: 2, display: 'flex' }}><X size={14} /></button>
                                    </div>

                                    <div>
                                        <span className="ad-label">Titre</span>
                                        <div style={{ display: 'flex', gap: 6 }}>
                                            <input className="ad-input" placeholder={partner.full_name} value={titleInput} onChange={e => setTitleInput(e.target.value)} style={{ height: 36, padding: '0 10px' }} />
                                            <button onClick={handleSaveTitle} disabled={savingTitle || titleInput.trim() === (pair.title || '')}
                                                style={{ height: 36, padding: '0 12px', borderRadius: 9, fontSize: '0.78rem', fontWeight: 700, background: 'rgba(217,119,6,0.2)', color: '#f59e0b', border: '1px solid rgba(217,119,6,0.3)', cursor: 'pointer', flexShrink: 0, opacity: titleInput.trim() === (pair.title || '') ? 0.4 : 1, fontFamily: 'DM Sans, system-ui' }}>
                                                {savingTitle ? '...' : 'OK'}
                                            </button>
                                        </div>
                                    </div>

                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                            <span className="ad-label" style={{ margin: 0 }}>Objectif hebdomadaire</span>
                                            <button className="ad-toggle" style={{ background: hoursEnabled ? 'rgba(217,119,6,0.7)' : 'rgba(255,255,255,0.12)' }}
                                                onClick={() => { const next = !hoursEnabled; setHoursEnabled(next); if (!next) { updateDoc(doc(db, 'accountability_pairs', id as string), { weekly_hours_goal: 0 }); setPair((p: any) => ({ ...p, weekly_hours_goal: 0 })); } }}>
                                                <span className="ad-toggle-thumb" style={{ left: hoursEnabled ? '19px' : '2px' }} />
                                            </button>
                                        </div>
                                        {hoursEnabled && (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <input type="number" min="1" max="500" className="ad-input" value={goalInput} onChange={e => setGoalInput(e.target.value)} style={{ width: 64, textAlign: 'center', height: 36, padding: '0 8px' }} />
                                                <span style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.35)' }}>h /</span>
                                                <select value={goalFreq} onChange={e => setGoalFreq(e.target.value)} style={{ height: 36, fontSize: '0.85rem', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 9, padding: '0 8px', color: '#fff', fontFamily: 'DM Sans, system-ui' }}>
                                                    <option value="daily">jour</option>
                                                    <option value="weekly">semaine</option>
                                                    <option value="monthly">mois</option>
                                                </select>
                                                <button onClick={() => { handleSaveGoal(); }} disabled={goalInput === String(pair.weekly_hours_goal ?? 0) && goalFreq === (pair.goal_frequency || 'weekly')}
                                                    style={{ marginLeft: 'auto', height: 36, padding: '0 12px', borderRadius: 9, fontSize: '0.78rem', fontWeight: 700, background: 'rgba(217,119,6,0.2)', color: '#f59e0b', border: '1px solid rgba(217,119,6,0.3)', cursor: 'pointer', opacity: (goalInput === String(pair.weekly_hours_goal ?? 0) && goalFreq === (pair.goal_frequency || 'weekly')) ? 0.4 : 1, fontFamily: 'DM Sans, system-ui' }}>OK</button>
                                            </div>
                                        )}
                                    </div>

                                    <div>
                                        <span className="ad-label">Salon lié</span>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                            <button onClick={() => handleLinkSalon('')} style={{ textAlign: 'left', padding: '7px 10px', borderRadius: 9, fontSize: '0.82rem', background: !pair.objective_id ? 'rgba(255,255,255,0.08)' : 'transparent', border: !pair.objective_id ? '1px solid rgba(255,255,255,0.15)' : '1px solid transparent', color: !pair.objective_id ? '#fff' : 'rgba(255,255,255,0.4)', cursor: 'pointer', fontFamily: 'DM Sans, system-ui' }}>
                                                ✕ Aucun salon
                                            </button>
                                            {myObjectives.map(o => (
                                                <button key={o.id} onClick={() => handleLinkSalon(o.id)} style={{ textAlign: 'left', padding: '7px 10px', borderRadius: 9, fontSize: '0.82rem', background: pair.objective_id === o.id ? 'rgba(217,119,6,0.12)' : 'transparent', border: pair.objective_id === o.id ? '1px solid rgba(217,119,6,0.35)' : '1px solid transparent', color: pair.objective_id === o.id ? '#f59e0b' : 'rgba(255,255,255,0.55)', cursor: 'pointer', fontFamily: 'DM Sans, system-ui' }}>
                                                    {o.title}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Leave */}
                        {!confirmLeave ? (
                            <button onClick={() => setConfirmLeave(true)} className="ad-btn-ghost" style={{ color: 'rgba(239,68,68,0.7)', borderColor: 'rgba(239,68,68,0.2)' }}>
                                <X size={13} /> Quitter
                            </button>
                        ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10, padding: '4px 10px' }}>
                                <span style={{ fontSize: '0.76rem', color: '#f87171', whiteSpace: 'nowrap' }}>Quitter ?</span>
                                <button onClick={handleLeave} disabled={leaving} style={{ padding: '4px 10px', borderRadius: 8, background: 'rgba(239,68,68,0.2)', color: '#f87171', border: '1px solid rgba(239,68,68,0.4)', fontSize: '0.76rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, system-ui' }}>
                                    {leaving ? '...' : 'Confirmer'}
                                </button>
                                <button onClick={() => setConfirmLeave(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.35)', padding: 2, display: 'flex' }}>
                                    <X size={12} />
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* ── Two-column layout ── */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '1.5rem', alignItems: 'start' }}>

                    {/* LEFT: tabs + content */}
                    <div>
                        {/* Tab bar */}
                        <div className="ad-tabbar">
                            {TABS.map(t => (
                                <button key={t.key} onClick={() => setActiveTab(t.key)}
                                    className={`ad-tab ${activeTab === t.key ? 'ad-tab-active' : 'ad-tab-inactive'}`}>
                                    {t.icon} {t.label}
                                    {t.key === 'coworking' && (amInSession || partnerInSession) && (
                                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', marginLeft: 2 }} />
                                    )}
                                </button>
                            ))}
                        </div>

                        {/* ── TAB: RÉSUMÉ ── */}
                        {activeTab === 'resume' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, animation: 'ad-in 0.3s ease' }}>
                                {/* Goal card */}
                                <div className="ad-card" style={{ borderColor: 'rgba(217,119,6,0.2)', background: 'rgba(217,119,6,0.04)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <Target size={16} style={{ color: '#f59e0b' }} />
                                            <span className="ad-heading" style={{ fontSize: '0.88rem', color: '#f0f0f5' }}>Objectif commun</span>
                                        </div>
                                        <button onClick={() => setShowSettingsPanel(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.3)', padding: '2px 6px', display: 'flex' }}><Settings2 size={13} /></button>
                                    </div>
                                    {weeklyGoal > 0 ? (
                                        <>
                                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
                                                <span className="ad-mono" style={{ fontSize: '2.8rem', fontWeight: 700, color: '#f59e0b', lineHeight: 1 }}>{weeklyGoal}</span>
                                                <span style={{ fontSize: '1rem', color: 'rgba(217,119,6,0.7)', fontWeight: 600 }}>h</span>
                                                <span style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.35)', marginLeft: 4 }}>/ {pair.goal_frequency === 'daily' ? 'jour' : pair.goal_frequency === 'monthly' ? 'mois' : 'semaine'}</span>
                                            </div>
                                            <p style={{ margin: 0, fontSize: '0.78rem', color: 'rgba(255,255,255,0.3)' }}>Objectif partagé · mis à jour par les deux partenaires</p>
                                        </>
                                    ) : (
                                        <div style={{ fontSize: '1rem', fontWeight: 600, color: 'rgba(255,255,255,0.25)', fontStyle: 'italic' }}>Pas d'objectif fixé</div>
                                    )}
                                </div>

                                {/* Progress if salon linked */}
                                {objective && (
                                    <div className="ad-card">
                                        <div className="ad-heading" style={{ fontSize: '0.88rem', color: 'rgba(255,255,255,0.7)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <span>📊</span> Progression dans le salon
                                        </div>
                                        {[
                                            { label: 'Vous', val: myProgress, color: '#d97706' },
                                            { label: partner.full_name, val: partnerProgress, color: '#10b981' },
                                        ].map(({ label, val, color }) => (
                                            <div key={label} style={{ marginBottom: 14 }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'rgba(255,255,255,0.7)' }}>{label}</span>
                                                    <span className="ad-mono" style={{ fontSize: '0.82rem', fontWeight: 700, color }}>{fmtHours(val)} <span style={{ color: 'rgba(255,255,255,0.3)', fontWeight: 400 }}>/ {targetHours}h</span></span>
                                                </div>
                                                <div className="ad-pbar">
                                                    <div className="ad-pbar-fill" style={{ width: `${Math.min(100, (val / (targetHours || 1)) * 100)}%`, background: color }} />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Linked salon */}
                                <div className="ad-card">
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                                        <span className="ad-heading" style={{ fontSize: '0.88rem', color: 'rgba(255,255,255,0.7)' }}>🔗 Salon lié</span>
                                        <button onClick={() => setEditingSalon(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.3)', padding: '2px 6px', display: 'flex' }}><Edit3 size={13} /></button>
                                    </div>
                                    {editingSalon ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                            <button onClick={() => handleLinkSalon('')} className="ad-btn-ghost" style={{ fontSize: '0.82rem' }}>✕ Aucun salon</button>
                                            {myObjectives.map(o => (
                                                <button key={o.id} onClick={() => handleLinkSalon(o.id)} className="ad-btn-ghost"
                                                    style={{ fontSize: '0.82rem', borderColor: pair.objective_id === o.id ? 'rgba(217,119,6,0.4)' : undefined, color: pair.objective_id === o.id ? '#f59e0b' : undefined }}>
                                                    {o.title}
                                                </button>
                                            ))}
                                        </div>
                                    ) : objective ? (
                                        <Link href={`/objective/${objective.id}`} style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: 12, background: 'rgba(217,119,6,0.07)', border: '1px solid rgba(217,119,6,0.2)' }}>
                                            <div>
                                                <div style={{ fontWeight: 700, fontSize: '0.92rem', color: '#f0f0f5' }}>{objective.title}</div>
                                                <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.38)', marginTop: 2 }}>Objectif : {objective.target_hours}h</div>
                                            </div>
                                            <ExternalLink size={13} style={{ color: 'rgba(255,255,255,0.3)', flexShrink: 0 }} />
                                        </Link>
                                    ) : (
                                        <div style={{ padding: '14px', background: 'rgba(255,255,255,0.02)', borderRadius: 11, border: '1px dashed rgba(255,255,255,0.09)', textAlign: 'center' }}>
                                            <p style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.3)', margin: '0 0 8px' }}>Aucun salon lié</p>
                                            <button onClick={() => setEditingSalon(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8rem', color: '#f59e0b' }}>+ Lier un salon →</button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* ── TAB: ÉTAPES ── */}
                        {activeTab === 'etapes' && (
                            <div style={{ animation: 'ad-in 0.3s ease' }}>
                                {totalMilestones > 0 && (
                                    <div className="ad-card" style={{ marginBottom: 14, borderColor: 'rgba(217,119,6,0.2)', background: 'rgba(217,119,6,0.04)' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                            <span style={{ fontSize: '0.85rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 7 }}>
                                                <Flag size={14} style={{ color: '#f59e0b' }} /> Progression
                                            </span>
                                            <span className="ad-mono" style={{ fontSize: '0.9rem', fontWeight: 800, color: completedMilestones === totalMilestones ? '#10b981' : '#f59e0b' }}>
                                                {completedMilestones}/{totalMilestones}
                                            </span>
                                        </div>
                                        <div className="ad-pbar">
                                            <div className="ad-pbar-fill" style={{ width: `${(completedMilestones / totalMilestones) * 100}%`, background: completedMilestones === totalMilestones ? '#10b981' : 'linear-gradient(90deg, #d97706, #f59e0b)' }} />
                                        </div>
                                        {completedMilestones === totalMilestones && <p style={{ fontSize: '0.8rem', color: '#10b981', margin: '10px 0 0', fontWeight: 600 }}>🎉 Toutes les étapes complétées !</p>}
                                    </div>
                                )}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                                    <p style={{ margin: 0, fontSize: '0.82rem', color: 'rgba(255,255,255,0.38)' }}>Jalons vers votre objectif commun</p>
                                    <button onClick={() => setShowMilestoneForm(v => !v)} className="ad-btn-amber" style={{ padding: '7px 14px', fontSize: '0.8rem' }}>
                                        {showMilestoneForm ? <><X size={12} /> Annuler</> : <><Plus size={12} /> Ajouter</>}
                                    </button>
                                </div>
                                {showMilestoneForm && (
                                    <form onSubmit={handleAddMilestone} className="ad-card" style={{ marginBottom: 14, borderColor: 'rgba(217,119,6,0.3)', background: 'rgba(217,119,6,0.04)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                                        <input className="ad-input" placeholder="Nom de l'étape *" value={milestoneTitle} onChange={e => setMilestoneTitle(e.target.value)} required />
                                        <div>
                                            <span className="ad-label">Échéance (optionnel)</span>
                                            <input type="date" className="ad-input" value={milestoneDue} onChange={e => setMilestoneDue(e.target.value)} />
                                        </div>
                                        <button type="submit" className="ad-btn-amber" disabled={savingMilestone || !milestoneTitle.trim()} style={{ alignSelf: 'flex-end' }}>
                                            {savingMilestone ? 'Enregistrement...' : '✓ Ajouter l\'étape'}
                                        </button>
                                    </form>
                                )}
                                {milestones.length === 0 ? (
                                    <div style={{ padding: '3rem 2rem', textAlign: 'center', borderRadius: 18, border: '1px dashed rgba(255,255,255,0.08)' }}>
                                        <CheckSquare size={32} style={{ margin: '0 auto 12px', color: 'rgba(255,255,255,0.1)', display: 'block' }} />
                                        <p style={{ opacity: 0.35, fontSize: '0.88rem', margin: '0 0 10px' }}>Aucune étape définie</p>
                                        <button onClick={() => setShowMilestoneForm(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8rem', color: '#f59e0b' }}>+ Ajouter →</button>
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        {milestones.map((m, idx) => {
                                            const due = m.due_date?.toDate ? m.due_date.toDate() : m.due_date ? new Date(m.due_date) : null;
                                            const isOverdue = due && !m.completed && due < new Date();
                                            return (
                                                <div key={m.id} className="ad-milestone" style={{ borderLeftWidth: 3, borderLeftStyle: 'solid', borderLeftColor: m.completed ? '#10b981' : isOverdue ? '#ef4444' : 'rgba(217,119,6,0.3)', opacity: m.completed ? 0.7 : 1, animationDelay: `${idx * 0.05}s` }}>
                                                    <button onClick={() => handleToggleMilestone(m)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: m.completed ? '#10b981' : 'rgba(255,255,255,0.3)', flexShrink: 0, marginTop: 1, display: 'flex' }}>
                                                        {m.completed ? <CheckSquare size={18} /> : <Square size={18} />}
                                                    </button>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{ fontWeight: 600, fontSize: '0.9rem', textDecoration: m.completed ? 'line-through' : 'none', color: m.completed ? 'rgba(255,255,255,0.4)' : '#e8e8ef' }}>
                                                            {idx + 1}. {m.title}
                                                        </div>
                                                        <div style={{ display: 'flex', gap: 10, marginTop: 5, flexWrap: 'wrap' }}>
                                                            {due && <span style={{ fontSize: '0.72rem', color: isOverdue ? '#ef4444' : 'rgba(255,255,255,0.3)' }}>{isOverdue ? '⚠ ' : '📅 '}{due.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</span>}
                                                            {m.completed && m.completed_by_name && <span style={{ fontSize: '0.72rem', color: '#10b981' }}>✓ {m.completed_by_name}</span>}
                                                        </div>
                                                    </div>
                                                    <button onClick={() => handleDeleteMilestone(m.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.2)', padding: 2, flexShrink: 0, display: 'flex' }}>
                                                        <Trash2 size={13} />
                                                    </button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ── TAB: RESSOURCES ── */}
                        {activeTab === 'ressources' && (
                            <div>
                                <style>{`
                                    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=DM+Sans:wght@300;400;500;600;700&display=swap');
                                    .rc-wrap { font-family: 'DM Sans', system-ui; }
                                    .rc-section-head { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 20px; gap: 12px; flex-wrap: wrap; }
                                    .rc-section-title { display: flex; align-items: center; gap: 9px; font-family: 'Outfit', system-ui; font-size: 1.05rem; font-weight: 700; color: #eeeef0; margin: 0; letter-spacing: -0.015em; }
                                    .rc-section-icon { width: 32px; height: 32px; border-radius: 9px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
                                    .rc-section-sub { font-size: 0.77rem; color: rgba(255,255,255,0.32); margin: 4px 0 0 41px; }
                                    .rc-btn-ghost { padding: 7px 14px; border-radius: 10px; font-size: 0.8rem; font-weight: 600; cursor: pointer; border: 1px solid rgba(255,255,255,0.09); background: rgba(255,255,255,0.04); color: rgba(255,255,255,0.5); font-family: 'DM Sans', system-ui; transition: all 0.2s; display: flex; align-items: center; gap: 6px; }
                                    .rc-btn-ghost:hover { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.75); }
                                    .rc-form-panel { border-radius: 15px; padding: 18px; background: rgba(12,12,16,0.85); border: 1px solid rgba(99,102,241,0.28); margin-bottom: 18px; animation: rc-in 0.25s cubic-bezier(0.22,1,0.36,1); }
                                    .rc-type-tabs { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; background: rgba(255,255,255,0.03); border-radius: 10px; padding: 4px; margin-bottom: 14px; }
                                    .rc-type-tab { display: flex; align-items: center; justify-content: center; gap: 6px; padding: 8px; border-radius: 7px; border: none; font-size: 0.8rem; font-weight: 700; cursor: pointer; transition: all 0.18s; font-family: 'DM Sans', system-ui; }
                                    .rc-type-tab.active { background: linear-gradient(135deg,#6366f1,#4f46e5); color: #fff; box-shadow: 0 2px 8px rgba(99,102,241,0.35); }
                                    .rc-type-tab.inactive { background: transparent; color: rgba(255,255,255,0.4); }
                                    .rc-type-tab.inactive:hover { background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.65); }
                                    .rc-input { width: 100%; padding: 10px 13px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.09); border-radius: 10px; color: #eeeeef; font-size: 0.88rem; font-family: 'DM Sans', system-ui; outline: none; transition: border-color 0.2s; box-sizing: border-box; }
                                    .rc-input:focus { border-color: rgba(99,102,241,0.45); background: rgba(99,102,241,0.04); }
                                    .rc-input::placeholder { color: rgba(255,255,255,0.2); }
                                    .rc-form-footer { display: flex; gap: 8px; justify-content: flex-end; margin-top: 4px; }
                                    .rc-btn-cancel { padding: 8px 16px; border-radius: 9px; font-size: 0.82rem; font-weight: 600; cursor: pointer; border: 1px solid rgba(255,255,255,0.09); background: rgba(255,255,255,0.04); color: rgba(255,255,255,0.45); font-family: 'DM Sans', system-ui; transition: all 0.2s; }
                                    .rc-btn-cancel:hover { background: rgba(255,255,255,0.08); }
                                    .rc-btn-add { padding: 8px 20px; border-radius: 9px; font-size: 0.82rem; font-weight: 700; cursor: pointer; border: none; background: linear-gradient(135deg,#6366f1,#4f46e5); color: #fff; font-family: 'DM Sans', system-ui; transition: all 0.2s; box-shadow: 0 2px 10px rgba(99,102,241,0.35); }
                                    .rc-btn-add:hover { box-shadow: 0 4px 16px rgba(99,102,241,0.52); transform: translateY(-1px); }
                                    .rc-btn-add:disabled { opacity: 0.35; cursor: not-allowed; transform: none; box-shadow: none; }
                                    .rc-files-grid { display: flex; flex-direction: column; gap: 8px; margin-bottom: 8px; }
                                    .rc-file-card { display: flex; align-items: center; gap: 12px; padding: 13px 15px; border-radius: 13px; background: rgba(18,18,24,0.7); border: 1px solid rgba(255,255,255,0.06); transition: all 0.2s; animation: rc-in 0.3s cubic-bezier(0.22,1,0.36,1); }
                                    .rc-file-card:hover { border-color: rgba(255,255,255,0.11); box-shadow: 0 4px 16px rgba(0,0,0,0.28); }
                                    .rc-file-icon { width: 38px; height: 38px; border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
                                    .rc-file-info { flex: 1; min-width: 0; }
                                    .rc-file-name { font-size: 0.88rem; font-weight: 600; color: #eeeef0; margin-bottom: 3px; }
                                    .rc-file-meta { font-size: 0.72rem; color: rgba(255,255,255,0.32); }
                                    .rc-file-actions { display: flex; gap: 4px; flex-shrink: 0; }
                                    .rc-icon-btn { width: 30px; height: 30px; border-radius: 7px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s; border: 1px solid transparent; background: transparent; color: rgba(255,255,255,0.38); text-decoration: none; }
                                    .rc-icon-btn:hover { background: rgba(255,255,255,0.08); border-color: rgba(255,255,255,0.12); color: rgba(255,255,255,0.7); }
                                    .rc-icon-btn.del:hover { background: rgba(239,68,68,0.1); border-color: rgba(239,68,68,0.25); color: #f87171; }
                                    .rc-empty { border-radius: 14px; padding: 32px 20px; background: rgba(255,255,255,0.02); border: 1px dashed rgba(255,255,255,0.07); text-align: center; }
                                    @keyframes rc-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
                                `}</style>

                                <div className="rc-wrap">
                                    <div className="rc-section-head">
                                        <div>
                                            <h3 className="rc-section-title">
                                                <span className="rc-section-icon" style={{ background: 'rgba(99,102,241,0.13)', border: '1px solid rgba(99,102,241,0.25)', color: '#818cf8' }}>
                                                    <LinkIcon size={15} />
                                                </span>
                                                Ressources partagées
                                            </h3>
                                            <p className="rc-section-sub">Liens et notes partagés entre vous deux</p>
                                        </div>
                                        <button className="rc-btn-ghost" onClick={() => setShowResForm(v => !v)}>
                                            {showResForm ? <><X size={13} /> Annuler</> : <><Plus size={13} /> Ajouter</>}
                                        </button>
                                    </div>

                                    {showResForm && (
                                        <form onSubmit={handleAddResource} className="rc-form-panel">
                                            <div className="rc-type-tabs">
                                                {(['link', 'note'] as const).map(tp => (
                                                    <button key={tp} type="button"
                                                        className={`rc-type-tab ${resType === tp ? 'active' : 'inactive'}`}
                                                        onClick={() => setResType(tp)}>
                                                        {tp === 'link' ? <><LinkIcon size={13} /> Lien</> : <><FileText size={13} /> Note</>}
                                                    </button>
                                                ))}
                                            </div>
                                            <input className="rc-input" placeholder="Titre *" value={resTitle} onChange={e => setResTitle(e.target.value)} required style={{ marginBottom: 10 }} />
                                            {resType === 'link'
                                                ? <input className="rc-input" placeholder="URL (https://...)" value={resUrl} onChange={e => setResUrl(e.target.value)} type="url" />
                                                : <textarea className="rc-input" rows={3} placeholder="Contenu de la note..." value={resNote} onChange={e => setResNote(e.target.value)} style={{ resize: 'none' }} />}
                                            <div className="rc-form-footer" style={{ marginTop: 12 }}>
                                                <button type="button" className="rc-btn-cancel" onClick={() => setShowResForm(false)}>Annuler</button>
                                                <button type="submit" className="rc-btn-add" disabled={savingRes || !resTitle.trim()}>
                                                    {savingRes ? 'Enregistrement...' : '✓ Ajouter'}
                                                </button>
                                            </div>
                                        </form>
                                    )}

                                    {resources.length === 0 ? (
                                        <div className="rc-empty">
                                            <LinkIcon size={28} style={{ margin: '0 auto 10px', color: 'rgba(255,255,255,0.12)', display: 'block' }} />
                                            <p style={{ opacity: 0.35, fontSize: '0.85rem', margin: '0 0 10px', fontFamily: 'DM Sans, system-ui' }}>Aucune ressource partagée</p>
                                            <button onClick={() => setShowResForm(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8rem', color: '#818cf8', fontFamily: 'DM Sans, system-ui' }}>+ Ajouter →</button>
                                        </div>
                                    ) : (
                                        <div className="rc-files-grid">
                                            {resources.map(r => (
                                                <div key={r.id} className="rc-file-card">
                                                    <div className="rc-file-icon" style={{ background: r.type === 'link' ? 'rgba(99,102,241,0.13)' : 'rgba(16,185,129,0.12)', border: `1px solid ${r.type === 'link' ? 'rgba(99,102,241,0.25)' : 'rgba(16,185,129,0.22)'}` }}>
                                                        {r.type === 'link'
                                                            ? <LinkIcon size={15} style={{ color: '#818cf8' }} />
                                                            : <FileText size={15} style={{ color: '#10b981' }} />}
                                                    </div>
                                                    <div className="rc-file-info">
                                                        <div className="rc-file-name">{r.title}</div>
                                                        {r.type === 'link' && r.url && (
                                                            <a href={r.url} target="_blank" rel="noreferrer" style={{ fontSize: '0.73rem', color: '#818cf8', wordBreak: 'break-all', textDecoration: 'none' }}>{r.url}</a>
                                                        )}
                                                        {r.type === 'note' && r.content && (
                                                            <p style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.45)', margin: '3px 0 0', lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>{r.content}</p>
                                                        )}
                                                        <div className="rc-file-meta" style={{ marginTop: 5 }}>par {r.added_by_name} · {r.created_at?.toDate ? r.created_at.toDate().toLocaleDateString('fr-FR') : ''}</div>
                                                    </div>
                                                    <div className="rc-file-actions">
                                                        {r.type === 'link' && r.url && (
                                                            <a href={r.url} target="_blank" rel="noreferrer" className="rc-icon-btn" title="Ouvrir">
                                                                <ExternalLink size={13} />
                                                            </a>
                                                        )}
                                                        {r.added_by === user?.uid && (
                                                            <button onClick={() => handleDeleteResource(r.id)} className="rc-icon-btn del" title="Supprimer">
                                                                <Trash2 size={13} />
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* ── TAB: AGENDA ── */}
                        {activeTab === 'agenda' && (
                            <div>
                                <style>{`
                                    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=DM+Sans:wght@300;400;500;600;700&display=swap');
                                    .ag-wrap { font-family: 'DM Sans', system-ui, sans-serif; }
                                    .ag-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; gap: 12px; flex-wrap: wrap; }
                                    .ag-title { display: flex; align-items: center; gap: 10px; font-family: 'Outfit', system-ui; font-size: 1.05rem; font-weight: 700; color: #eeeef0; margin: 0; letter-spacing: -0.02em; }
                                    .ag-title-icon { width: 34px; height: 34px; border-radius: 10px; background: rgba(99,102,241,0.14); border: 1px solid rgba(99,102,241,0.28); display: flex; align-items: center; justify-content: center; color: #818cf8; flex-shrink: 0; }
                                    .ag-btn-ghost { padding: 7px 14px; border-radius: 10px; font-size: 0.8rem; font-weight: 600; cursor: pointer; border: 1px solid rgba(255,255,255,0.09); background: rgba(255,255,255,0.04); color: rgba(255,255,255,0.5); font-family: 'DM Sans', system-ui; transition: all 0.2s; display: flex; align-items: center; gap: 6px; }
                                    .ag-btn-ghost:hover { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.75); }
                                    .ag-btn-primary { padding: 7px 16px; border-radius: 10px; font-size: 0.82rem; font-weight: 700; cursor: pointer; border: none; background: linear-gradient(135deg,#6366f1,#4f46e5); color: #fff; font-family: 'DM Sans', system-ui; transition: all 0.2s; display: flex; align-items: center; gap: 6px; box-shadow: 0 3px 12px rgba(99,102,241,0.35); }
                                    .ag-btn-primary:hover { box-shadow: 0 5px 18px rgba(99,102,241,0.5); transform: translateY(-1px); }
                                    .ag-btn-primary:disabled { opacity: 0.38; cursor: not-allowed; transform: none; box-shadow: none; }
                                    .ag-form-panel { border-radius: 16px; padding: 20px; background: rgba(12,12,16,0.85); border: 1px solid rgba(99,102,241,0.28); margin-bottom: 20px; animation: ag-in 0.25s cubic-bezier(0.22,1,0.36,1); display: flex; flex-direction: column; gap: 12px; }
                                    .ag-input { width: 100%; padding: 10px 13px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.09); border-radius: 10px; color: #eeeeef; font-size: 0.88rem; font-family: 'DM Sans', system-ui; outline: none; transition: border-color 0.2s; box-sizing: border-box; }
                                    .ag-input:focus { border-color: rgba(99,102,241,0.45); background: rgba(99,102,241,0.04); }
                                    .ag-input::placeholder { color: rgba(255,255,255,0.2); }
                                    .ag-label { display: block; font-size: 0.7rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(255,255,255,0.3); margin-bottom: 6px; font-family: 'DM Sans', system-ui; }
                                    .ag-form-footer { display: flex; gap: 8px; justify-content: flex-end; }
                                    .ag-btn-cancel { padding: 8px 16px; border-radius: 9px; font-size: 0.82rem; font-weight: 600; cursor: pointer; border: 1px solid rgba(255,255,255,0.09); background: rgba(255,255,255,0.04); color: rgba(255,255,255,0.45); font-family: 'DM Sans', system-ui; transition: all 0.2s; }
                                    .ag-btn-cancel:hover { background: rgba(255,255,255,0.08); }
                                    .ag-list { display: flex; flex-direction: column; gap: 10px; }
                                    .ag-card { display: flex; gap: 0; border-radius: 14px; overflow: hidden; border: 1px solid rgba(255,255,255,0.07); background: rgba(14,14,20,0.9); animation: ag-in 0.3s cubic-bezier(0.22,1,0.36,1); transition: border-color 0.2s; }
                                    .ag-card:hover { border-color: rgba(255,255,255,0.12); }
                                    .ag-card.past { opacity: 0.55; }
                                    .ag-date-col { width: 62px; flex-shrink: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 14px 0; background: rgba(255,255,255,0.02); border-right: 1px solid rgba(255,255,255,0.06); gap: 2px; }
                                    .ag-dot { width: 6px; height: 6px; border-radius: 50%; border: 2px solid; margin-bottom: 4px; }
                                    .ag-day-num { font-family: 'Outfit', system-ui; font-size: 1.45rem; font-weight: 800; line-height: 1; }
                                    .ag-day-name { font-size: 0.66rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: rgba(255,255,255,0.38); }
                                    .ag-month { font-size: 0.66rem; color: rgba(255,255,255,0.28); text-transform: uppercase; letter-spacing: 0.04em; }
                                    .ag-time { font-size: 0.7rem; color: rgba(255,255,255,0.4); margin-top: 4px; font-family: 'DM Sans', system-ui; }
                                    .ag-body { flex: 1; padding: 14px 16px; border-left: 3px solid transparent; min-width: 0; }
                                    .ag-body-inner { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
                                    .ag-pill-row { display: flex; gap: 5px; flex-wrap: wrap; margin-bottom: 6px; }
                                    .ag-pill { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 20px; font-size: 0.68rem; font-weight: 700; }
                                    .ag-session-title { font-family: 'Outfit', system-ui; font-size: 0.95rem; font-weight: 700; color: #eeeef0; margin: 0 0 4px; line-height: 1.3; }
                                    .ag-desc { font-size: 0.78rem; color: rgba(255,255,255,0.42); margin: 5px 0 0; line-height: 1.4; }
                                    .ag-meta { font-size: 0.7rem; color: rgba(255,255,255,0.3); margin-top: 5px; display: flex; gap: 10px; flex-wrap: wrap; }
                                    .ag-side { display: flex; flex-direction: column; gap: 6px; align-items: flex-end; flex-shrink: 0; }
                                    .ag-join-btn { padding: 6px 13px; border-radius: 9px; font-size: 0.77rem; font-weight: 700; cursor: pointer; border: none; font-family: 'DM Sans', system-ui; transition: all 0.2s; display: flex; align-items: center; gap: 5px; }
                                    .ag-join-btn.join { background: linear-gradient(135deg,#6366f1,#4f46e5); color: #fff; box-shadow: 0 2px 8px rgba(99,102,241,0.35); }
                                    .ag-join-btn.join:hover { box-shadow: 0 4px 14px rgba(99,102,241,0.5); transform: translateY(-1px); }
                                    .ag-join-btn.leave { background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.4); border: 1px solid rgba(255,255,255,0.09); }
                                    .ag-icon-btn { width: 28px; height: 28px; border-radius: 7px; display: flex; align-items: center; justify-content: center; cursor: pointer; border: 1px solid transparent; background: transparent; color: rgba(255,255,255,0.25); transition: all 0.2s; }
                                    .ag-icon-btn.del:hover { background: rgba(239,68,68,0.1); border-color: rgba(239,68,68,0.25); color: #f87171; }
                                    .ag-empty { border-radius: 16px; padding: 3rem 2rem; background: rgba(255,255,255,0.01); border: 1px dashed rgba(255,255,255,0.07); text-align: center; }
                                    @keyframes ag-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
                                `}</style>

                                <div className="ag-wrap">
                                    <div className="ag-header">
                                        <h3 className="ag-title">
                                            <span className="ag-title-icon"><Calendar size={16} /></span>
                                            Agenda
                                            {sessions.length > 0 && (
                                                <span style={{ fontSize: '0.72rem', padding: '2px 9px', borderRadius: 20, background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)', color: '#818cf8', fontWeight: 700, marginLeft: 4 }}>
                                                    {sessions.length}
                                                </span>
                                            )}
                                        </h3>
                                        <button className="ag-btn-primary" onClick={() => setShowSessionForm(v => !v)}>
                                            {showSessionForm ? <><X size={13} /> Annuler</> : <><Calendar size={13} /> Planifier</>}
                                        </button>
                                    </div>

                                    {showSessionForm && (
                                        <form onSubmit={handleAddSession} className="ag-form-panel">
                                            <div>
                                                <label className="ag-label">Titre de la session *</label>
                                                <input className="ag-input" placeholder="ex: Session de travail commun" value={sessionTitle} onChange={e => setSessionTitle(e.target.value)} required />
                                            </div>
                                            <div>
                                                <label className="ag-label">Date et heure *</label>
                                                <input type="datetime-local" className="ag-input" value={sessionDate} onChange={e => setSessionDate(e.target.value)} required />
                                            </div>
                                            <div>
                                                <label className="ag-label">Note (optionnel)</label>
                                                <textarea className="ag-input" rows={2} placeholder="Objectifs de la session..." value={sessionNote} onChange={e => setSessionNote(e.target.value)} style={{ resize: 'none' }} />
                                            </div>
                                            <div className="ag-form-footer">
                                                <button type="button" className="ag-btn-cancel" onClick={() => setShowSessionForm(false)}>Annuler</button>
                                                <button type="submit" className="ag-btn-primary" disabled={savingSession || !sessionTitle.trim() || !sessionDate}>
                                                    {savingSession ? 'Enregistrement...' : '📅 Planifier la session'}
                                                </button>
                                            </div>
                                        </form>
                                    )}

                                    {sessions.length === 0 ? (
                                        <div className="ag-empty">
                                            <Calendar size={30} style={{ margin: '0 auto 12px', color: 'rgba(255,255,255,0.1)', display: 'block' }} />
                                            <p style={{ opacity: 0.35, fontSize: '0.85rem', margin: '0 0 10px', fontFamily: 'DM Sans, system-ui' }}>Aucune session planifiée</p>
                                            <button onClick={() => setShowSessionForm(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8rem', color: '#818cf8', fontFamily: 'DM Sans, system-ui' }}>+ Planifier →</button>
                                        </div>
                                    ) : (
                                        <div className="ag-list">
                                            {sessions.map((s, idx) => {
                                                const dateObj = s.scheduled_at?.toDate ? s.scheduled_at.toDate() : new Date(s.scheduled_at);
                                                const isPast = dateObj < new Date();
                                                const attending = s.attendees?.includes(user!.uid);
                                                const dayNum = dateObj.getDate();
                                                const dayName = dateObj.toLocaleDateString('fr-FR', { weekday: 'short' });
                                                const monthName = dateObj.toLocaleDateString('fr-FR', { month: 'short' });
                                                const timeStr = dateObj.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
                                                const typeColor = '#6366f1';
                                                return (
                                                    <div key={s.id} className={`ag-card${isPast ? ' past' : ''}`} style={{ animationDelay: `${idx * 0.05}s` }}>
                                                        <div className="ag-date-col">
                                                            <div className="ag-dot" style={{ borderColor: isPast ? 'rgba(255,255,255,0.15)' : typeColor, boxShadow: isPast ? 'none' : `0 0 6px ${typeColor}60` }} />
                                                            <div className="ag-day-num" style={{ color: isPast ? 'rgba(255,255,255,0.3)' : typeColor }}>{dayNum}</div>
                                                            <div className="ag-day-name">{dayName}</div>
                                                            <div className="ag-month">{monthName}</div>
                                                            <div className="ag-time">{timeStr}</div>
                                                        </div>
                                                        <div className="ag-body" style={{ borderLeftColor: isPast ? 'rgba(255,255,255,0.06)' : `${typeColor}35` }}>
                                                            <div className="ag-body-inner">
                                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                                    <div className="ag-session-title">{s.title}</div>
                                                                    {s.note && <div className="ag-desc">{s.note}</div>}
                                                                    <div className="ag-meta">
                                                                        <span>par {s.creator_name}</span>
                                                                        <span>{s.attendees?.length ?? 0} participant{(s.attendees?.length ?? 0) !== 1 ? 's' : ''}</span>
                                                                    </div>
                                                                </div>
                                                                <div className="ag-side">
                                                                    {!isPast && (
                                                                        <button className={`ag-join-btn ${attending ? 'leave' : 'join'}`} onClick={() => handleToggleAttendee(s)}>
                                                                            {attending ? 'Se désinscrire' : '✓ Participer'}
                                                                        </button>
                                                                    )}
                                                                    {s.creator_id === user?.uid && (
                                                                        <button className="ag-icon-btn del" onClick={() => handleDeleteSession(s.id)} title="Supprimer">
                                                                            <Trash2 size={13} />
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* ── TAB: COWORKING ── */}
                        {activeTab === 'coworking' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, animation: 'ad-in 0.3s ease' }}>
                                {/* Presence + Join/Leave */}
                                <div className="ad-card" style={{ borderColor: 'rgba(16,185,129,0.2)', background: 'rgba(16,185,129,0.03)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 14 }}>
                                        <Video size={15} style={{ color: '#10b981' }} />
                                        <span className="ad-heading" style={{ fontSize: '0.88rem', color: '#10b981' }}>Session live</span>
                                    </div>
                                    <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
                                        {[{ label: 'Vous', active: amInSession }, { label: partner.full_name, active: partnerInSession }].map(({ label, active }) => (
                                            <div key={label} className="ad-presence-pill" style={{ borderColor: active ? 'rgba(16,185,129,0.35)' : 'rgba(255,255,255,0.08)', background: active ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0.03)' }}>
                                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: active ? '#10b981' : 'rgba(255,255,255,0.2)', boxShadow: active ? '0 0 6px rgba(16,185,129,0.6)' : 'none', flexShrink: 0, display: 'inline-block', ...(active ? { animation: 'ad-pulse 2s ease infinite' } : {}) }} />
                                                <span style={{ fontSize: '0.82rem', fontWeight: 600, color: active ? '#10b981' : 'rgba(255,255,255,0.38)' }}>{label}</span>
                                            </div>
                                        ))}
                                    </div>
                                    {!amInSession ? (
                                        <button onClick={handleJoinCoworking} style={{ width: '100%', padding: '11px', borderRadius: 12, border: '1px solid rgba(16,185,129,0.35)', background: 'rgba(16,185,129,0.12)', color: '#10b981', fontFamily: 'Outfit, system-ui', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, transition: 'all 0.2s' }}>
                                            <Video size={14} /> Rejoindre la session
                                        </button>
                                    ) : (
                                        <button onClick={handleLeaveCoworking} className="ad-btn-ghost" style={{ width: '100%', justifyContent: 'center' }}>
                                            <X size={14} /> Quitter la session
                                        </button>
                                    )}
                                    {amInSession && partnerInSession && (
                                        <div style={{ marginTop: 10, padding: '8px 14px', borderRadius: 10, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', fontSize: '0.8rem', color: '#10b981', textAlign: 'center', fontWeight: 600 }}>
                                            ✦ Vous êtes en session ensemble !
                                        </div>
                                    )}
                                </div>

                                {/* Pomodoro timer */}
                                {amInSession && (
                                    <div className="ad-card" style={{ borderColor: `${timerColor}30`, background: `${timerColor}06`, padding: '24px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                                                <Timer size={15} style={{ color: timerColor }} />
                                                <span className="ad-heading" style={{ fontSize: '0.88rem', color: timerColor }}>Focus partagé</span>
                                            </div>
                                            <button onClick={() => setShowTimerSettings(v => !v)}
                                                style={{ background: showTimerSettings ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.05)', border: `1px solid ${showTimerSettings ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.09)'}`, borderRadius: 8, color: showTimerSettings ? '#818cf8' : 'rgba(255,255,255,0.3)', padding: '5px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', transition: 'all 0.2s' }}>
                                                <Settings2 size={13} />
                                            </button>
                                        </div>

                                        {showTimerSettings && (
                                            <div style={{ background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 12, padding: '14px', marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 9 }}>
                                                <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Durées (minutes)</span>
                                                {(['focus', 'short', 'long'] as const).map(key => (
                                                    <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                                                        <span style={{ fontSize: '0.75rem', color: POMODORO_COLORS[key], fontWeight: 700, width: 80 }}>{POMODORO_LABELS[key]}</span>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                                            <button onClick={() => setDraftDurations(d => ({ ...d, [key]: Math.max(1, d[key] - 1) }))} style={{ width: 24, height: 24, borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: '#a1a1aa', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem' }}>−</button>
                                                            <input type="text" inputMode="numeric" value={draftDurations[key]} onChange={e => { const n = parseInt(e.target.value.replace(/\D/g, '') || '1'); setDraftDurations(d => ({ ...d, [key]: Math.min(180, Math.max(1, n)) })); }} style={{ width: 44, textAlign: 'center', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.13)', borderRadius: 6, color: '#f8f9fa', fontSize: '0.88rem', fontWeight: 700, padding: '4px 2px', outline: 'none', fontFamily: 'DM Sans, system-ui' }} />
                                                            <button onClick={() => setDraftDurations(d => ({ ...d, [key]: Math.min(180, d[key] + 1) }))} style={{ width: 24, height: 24, borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: '#a1a1aa', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem' }}>+</button>
                                                        </div>
                                                    </div>
                                                ))}
                                                <button onClick={handleApplyDurations} style={{ marginTop: 2, padding: '7px', borderRadius: 8, border: 'none', background: 'rgba(99,102,241,0.3)', color: '#a5b4fc', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'DM Sans, system-ui' }}>
                                                    ✓ Appliquer (synchronisé)
                                                </button>
                                            </div>
                                        )}

                                        {/* Mode tabs */}
                                        <div style={{ display: 'flex', gap: 6, marginBottom: 22 }}>
                                            {Object.entries(POMODORO_LABELS).map(([key, label]) => (
                                                <button key={key} onClick={() => handleSwitchMode(key)} className="ad-mode-btn"
                                                    style={{ background: viewMode === key ? `${POMODORO_COLORS[key]}20` : 'rgba(255,255,255,0.04)', color: viewMode === key ? POMODORO_COLORS[key] : 'rgba(255,255,255,0.38)', boxShadow: viewMode === key ? `0 0 0 1px ${POMODORO_COLORS[key]}44` : 'none' }}>
                                                    {label}
                                                </button>
                                            ))}
                                        </div>

                                        {/* Circle timer */}
                                        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 22 }}>
                                            <div style={{ animation: showAnim ? 'pulse-ring-acc 1s ease-out 3' : 'none', borderRadius: '50%', position: 'relative' }}>
                                                <CircleTimer remaining={displayRemaining} total={displayDuration} color={timerColor} running={displayRunning} />
                                                <CelebrationBurst show={showAnim} />
                                            </div>
                                        </div>

                                        {/* Controls */}
                                        <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
                                            <button onClick={handleTimerReset} title="Réinitialiser"
                                                style={{ width: 36, height: 36, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.03)', color: '#71717a', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', opacity: isActiveMode ? 1 : 0.3, transition: 'background 0.2s' }}
                                                onMouseEnter={e => { if (isActiveMode) e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
                                                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}>
                                                <RotateCcw size={13} />
                                            </button>
                                            <button onClick={handleToggleTimer}
                                                style={{ width: 50, height: 50, borderRadius: '50%', border: 'none', background: `linear-gradient(135deg, ${timerColor}, ${timerColor}cc)`, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: `0 0 24px ${timerColor}55`, transition: 'transform 0.15s' }}
                                                onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.07)'; }}
                                                onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}>
                                                {displayRunning ? <Pause size={18} style={{ fill: '#fff' }} /> : <Play size={18} style={{ fill: '#fff', marginLeft: 2 }} />}
                                            </button>
                                        </div>
                                        <p style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.2)', textAlign: 'center', margin: 0 }}>Synchronisé avec {partner.full_name}</p>
                                    </div>
                                )}

                                {!amInSession && (
                                    <div style={{ padding: '2.5rem 2rem', textAlign: 'center', borderRadius: 18, border: '1px dashed rgba(255,255,255,0.08)' }}>
                                        <Video size={30} style={{ margin: '0 auto 12px', color: 'rgba(255,255,255,0.1)', display: 'block' }} />
                                        <p style={{ opacity: 0.3, fontSize: '0.85rem', margin: 0 }}>Rejoignez la session pour accéder au minuteur partagé</p>
                                    </div>
                                )}

                                {/* Session log */}
                                {cwLog.length > 0 && (
                                    <div className="ad-card">
                                        <span className="ad-heading" style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.4)', marginBottom: 12, display: 'block' }}>Historique récent</span>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                                            {cwLog.map((entry, i) => {
                                                const mins = Math.round(entry.duration_seconds / 60);
                                                const date = entry.started_at?.toDate ? entry.started_at.toDate() : new Date();
                                                return (
                                                    <div key={entry.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: i < cwLog.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                                                        <div>
                                                            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'rgba(255,255,255,0.7)' }}>{entry.user_name}</span>
                                                            <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.3)', marginLeft: 8 }}>{POMODORO_LABELS[entry.mode] ?? 'Focus'}</span>
                                                        </div>
                                                        <div style={{ textAlign: 'right' }}>
                                                            <span className="ad-mono" style={{ fontSize: '0.82rem', fontWeight: 700, color: POMODORO_COLORS[entry.mode] ?? '#d97706' }}>{mins}min</span>
                                                            <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.25)' }}>{date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ── TAB: COACH IA ── */}
                        {activeTab === 'ia' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, animation: 'ad-in 0.3s ease' }}>
                                <div className="ad-card" style={{ borderColor: 'rgba(99,102,241,0.2)', background: 'rgba(99,102,241,0.03)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                                        <Bot size={15} style={{ color: '#818cf8' }} />
                                        <span className="ad-heading" style={{ fontSize: '0.88rem', color: '#818cf8' }}>Coach IA</span>
                                    </div>
                                    <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.32)', margin: '0 0 14px' }}>Conseils personnalisés pour progresser avec {partner.full_name}.</p>
                                    <textarea value={aiQuestion} onChange={e => setAiQuestion(e.target.value)} placeholder="Question spécifique ? (optionnel)" className="ad-input" rows={2} style={{ resize: 'none', marginBottom: 10 }} />
                                    <button onClick={handleAskCoach} disabled={aiLoading} style={{ width: '100%', padding: '10px', borderRadius: 12, border: '1px solid rgba(99,102,241,0.35)', background: 'rgba(99,102,241,0.16)', color: '#818cf8', fontFamily: 'Outfit, system-ui', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, transition: 'all 0.2s' }}>
                                        {aiLoading ? <><span style={{ width: 12, height: 12, borderRadius: '50%', border: '2px solid #818cf8', borderTopColor: 'transparent', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} /> Analyse...</> : <><Bot size={13} /> Demander au coach</>}
                                    </button>
                                    {aiTips.length > 0 && (
                                        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                                            {aiTips.map((tip, i) => (
                                                <div key={i} className="ad-ai-tip">
                                                    <span style={{ flexShrink: 0, width: 21, height: 21, borderRadius: '50%', background: 'rgba(99,102,241,0.25)', color: '#818cf8', fontSize: '0.62rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span>
                                                    <p style={{ margin: 0, fontSize: '0.82rem', color: 'rgba(255,255,255,0.72)', lineHeight: 1.55 }}>{tip}</p>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Smart Agenda */}
                                <div className="ad-card" style={{ borderColor: 'rgba(16,185,129,0.2)', background: 'rgba(16,185,129,0.02)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                                        <Zap size={15} style={{ color: '#10b981' }} />
                                        <span className="ad-heading" style={{ fontSize: '0.88rem', color: '#10b981' }}>Smart Agenda</span>
                                    </div>
                                    <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.32)', margin: '0 0 16px' }}>Planning optimisé généré par l'IA pour votre duo.</p>

                                    <span className="ad-label">Rythme</span>
                                    <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                                        {([{ key: 'leger', label: '🌱 Léger', sub: '2-3 sessions' }, { key: 'regulier', label: '⚡ Régulier', sub: '4-6 sessions' }, { key: 'intensif', label: '🔥 Intensif', sub: '8-10 sessions' }] as const).map(r => (
                                            <button key={r.key} onClick={() => setAgendaRhythm(r.key)} className="ad-rhythm-btn"
                                                style={{ borderColor: agendaRhythm === r.key ? 'rgba(16,185,129,0.45)' : 'rgba(255,255,255,0.08)', background: agendaRhythm === r.key ? 'rgba(16,185,129,0.14)' : 'rgba(255,255,255,0.03)' }}>
                                                <div style={{ fontSize: '0.74rem', fontWeight: 700, color: agendaRhythm === r.key ? '#10b981' : 'rgba(255,255,255,0.38)', fontFamily: 'DM Sans, system-ui' }}>{r.label}</div>
                                                <div style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.22)', marginTop: 2, fontFamily: 'DM Sans, system-ui' }}>{r.sub}</div>
                                            </button>
                                        ))}
                                    </div>

                                    <span className="ad-label">Préférences horaires (optionnel)</span>
                                    <input className="ad-input" value={agendaTimePref} onChange={e => setAgendaTimePref(e.target.value)} placeholder="ex: soir après 18h, week-end matin..." style={{ marginBottom: 12 }} />

                                    <button onClick={handleGenerateAgenda} disabled={agendaLoading} style={{ width: '100%', padding: '10px', borderRadius: 12, border: '1px solid rgba(16,185,129,0.35)', background: 'rgba(16,185,129,0.14)', color: '#10b981', fontFamily: 'Outfit, system-ui', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, transition: 'all 0.2s' }}>
                                        {agendaLoading ? <><span style={{ width: 12, height: 12, borderRadius: '50%', border: '2px solid #10b981', borderTopColor: 'transparent', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} /> Génération...</> : <><Calendar size={13} /> Générer le planning</>}
                                    </button>

                                    {generatedSessions.length > 0 && (
                                        <div style={{ marginTop: 14 }}>
                                            <span className="ad-label">{generatedSessions.length} sessions générées</span>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                                                {generatedSessions.map((s, i) => {
                                                    const date = new Date(s.scheduled_at);
                                                    const typeColor = s.type === 'travail' ? '#6366f1' : s.type === 'discussion' ? '#10b981' : '#f59e0b';
                                                    return (
                                                        <div key={i} style={{ padding: '10px 14px', borderRadius: 11, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderLeft: `3px solid ${typeColor}` }}>
                                                            <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#e4e4e7', marginBottom: 3 }}>{s.title}</div>
                                                            <div style={{ fontSize: '0.72rem', color: '#f59e0b', marginBottom: 4 }}>📅 {date.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
                                                            {s.description && <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.32)', lineHeight: 1.4 }}>{s.description}</div>}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                            <button onClick={handleSaveGeneratedAgenda} disabled={savingAgenda} style={{ width: '100%', padding: '9px', borderRadius: 11, border: '1px solid rgba(99,102,241,0.35)', background: 'rgba(99,102,241,0.16)', color: '#818cf8', fontFamily: 'Outfit, system-ui', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
                                                {savingAgenda ? 'Enregistrement...' : '✓ Sauvegarder dans l\'agenda'}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* RIGHT: Chat */}
                    <div style={{ background: 'rgba(14,14,20,0.95)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 20, height: '600px', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'sticky', top: 100 }}>
                        <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                            <span className="ad-heading" style={{ fontSize: '0.88rem', color: '#f0f0f5' }}>💬 Chat privé</span>
                            <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.3)', marginLeft: 'auto', marginRight: 8 }}>avec {partner.full_name}</span>
                            <button onClick={() => partner && activateCall({ pairId: id as string, partnerName: partner.full_name, partnerId: partner.id, partnerAvatarUrl: partner.avatar_url ?? null, partnerAvatarStyle: partner.avatar_style ?? null })} disabled={callLoading || isOnCall}
                                style={{ background: isOnCall ? 'rgba(16,185,129,0.2)' : 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 9, color: '#10b981', padding: '5px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.75rem', fontWeight: 700, flexShrink: 0, fontFamily: 'DM Sans, system-ui' }}>
                                <Video size={13} /> {isOnCall ? 'En appel' : callLoading ? '...' : 'Appel'}
                            </button>
                        </div>

                        <div ref={chatRef} style={{ flex: 1, overflowY: 'auto', padding: '14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {messages.length === 0 ? (
                                <div style={{ margin: 'auto', textAlign: 'center', color: 'rgba(255,255,255,0.2)' }}>
                                    <div style={{ fontSize: '1.8rem', marginBottom: 8 }}>💬</div>
                                    <div style={{ fontSize: '0.78rem' }}>Encouragez-vous !</div>
                                </div>
                            ) : messages.map(msg => {
                                const isMe = msg.sender_id === user!.uid;
                                const time = msg.created_at?.toDate ? msg.created_at.toDate().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '';
                                return (
                                    <div key={msg.id} style={{ display: 'flex', flexDirection: isMe ? 'row-reverse' : 'row', gap: 8, alignItems: 'flex-end' }}>
                                        <div className={isMe ? 'ad-chat-bubble-me' : 'ad-chat-bubble-partner'}>
                                            {msg.content}
                                            <div style={{ fontSize: '0.62rem', opacity: 0.6, marginTop: 3, textAlign: isMe ? 'right' : 'left' }}>{time}</div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <form onSubmit={handleSendMessage} style={{ padding: '10px 14px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: 8, flexShrink: 0 }}>
                            <input type="text" value={newMessage} onChange={e => setNewMessage(e.target.value)} placeholder="Encouragez-vous..." className="ad-input" style={{ fontSize: '0.85rem', flex: 1, width: 'auto' }} autoComplete="off" />
                            <button type="submit" disabled={sending || !newMessage.trim()}
                                style={{ padding: '0 14px', borderRadius: 11, border: 'none', background: !newMessage.trim() ? 'rgba(255,255,255,0.06)' : 'linear-gradient(135deg, #d97706, #f59e0b)', color: !newMessage.trim() ? 'rgba(255,255,255,0.2)' : '#0a0a10', cursor: 'pointer', display: 'flex', alignItems: 'center', flexShrink: 0, transition: 'all 0.2s' }}>
                                <Send size={14} />
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        </div>

        {/* ── Focus Guard overlay ── */}
        {(focusGuardMsg || focusGuardLoading) && (
            <>
                <div style={{ position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', width: 'min(420px, calc(100vw - 40px))', zIndex: 9998, background: 'rgba(14,14,20,0.99)', border: '1px solid rgba(99,102,241,0.35)', borderRadius: 20, boxShadow: '0 16px 52px rgba(0,0,0,0.8), 0 0 0 1px rgba(99,102,241,0.15)', animation: 'fgSlideIn 0.32s cubic-bezier(0.16,1,0.3,1)', overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(90deg, transparent, rgba(99,102,241,0.6), transparent)' }} />
                    <div style={{ padding: '16px 18px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div style={{ width: 28, height: 28, borderRadius: 9, background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Bot size={14} color="#818cf8" />
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#a5b4fc', fontFamily: 'Outfit, system-ui' }}>Focus Guard</div>
                                    <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.28)' }}>Coach anti-procrastination</div>
                                </div>
                            </div>
                            <button onClick={() => { setFocusGuardMsg(null); setFocusGuardSubtasks([]); pauseCountRef.current = 0; }} style={{ width: 24, height: 24, borderRadius: 7, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                                <X size={11} />
                            </button>
                        </div>
                        {focusGuardLoading ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 10, background: 'rgba(99,102,241,0.07)' }}>
                                <span style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid #818cf8', borderTopColor: 'transparent', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} />
                                <span style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.4)' }}>Analyse ta session...</span>
                            </div>
                        ) : (
                            <>
                                <p style={{ margin: '0 0 12px', fontSize: '0.85rem', color: 'rgba(255,255,255,0.78)', lineHeight: 1.55, padding: '10px 12px', borderRadius: 10, background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.12)' }}>{focusGuardMsg}</p>
                                {focusGuardSubtasks.length > 0 && (
                                    <div style={{ marginBottom: 12 }}>
                                        <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'rgba(255,255,255,0.28)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 7 }}>3 sous-tâches pour démarrer</div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                                            {focusGuardSubtasks.map((task, i) => (
                                                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                                                    <span style={{ flexShrink: 0, width: 18, height: 18, borderRadius: 6, background: 'rgba(99,102,241,0.2)', color: '#818cf8', fontSize: '0.6rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span>
                                                    <span style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.62)', lineHeight: 1.4 }}>{task}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <button onClick={() => { setFocusGuardMsg(null); setFocusGuardSubtasks([]); pauseCountRef.current = 0; handleTimerStart(); }} style={{ flex: 1, padding: '9px', borderRadius: 11, border: 'none', background: 'linear-gradient(135deg, #6366f1, #818cf8)', color: '#fff', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'Outfit, system-ui' }}>Je continue !</button>
                                    <button onClick={() => { setFocusGuardMsg(null); setFocusGuardSubtasks([]); pauseCountRef.current = 0; }} style={{ padding: '9px 14px', borderRadius: 11, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.38)', fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'DM Sans, system-ui' }}>Fermer</button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </>
        )}
        </>
    );
}
