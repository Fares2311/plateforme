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
        <div className="container fade-enter" style={{ maxWidth: '980px', padding: '2rem 1.5rem' }}>
            {/* Back */}
            <button onClick={() => router.push('/accountability')} className="btn btn-sm btn-ghost text-secondary mb-6" style={{ gap: '6px' }}>
                <ArrowLeft size={15} /> Retour
            </button>

            {/* Header */}
            <div className="flex items-center gap-4 mb-8 flex-wrap">
                <div style={{ position: 'relative' }}>
                    <Avatar uid={partner.id} avatarUrl={partner.avatar_url} avatarStyle={partner.avatar_style} size={64}
                        style={{ border: '3px solid var(--color-primary)', cursor: 'pointer' }}
                        onClick={() => router.push(`/user/${partner.id}`)} />
                    {isPartnerActive && (
                        <span style={{ position: 'absolute', bottom: 2, right: 2, width: 14, height: 14, borderRadius: '50%', background: '#10b981', border: '2px solid var(--color-bg)', boxShadow: '0 0 6px rgba(16,185,129,0.7)' }} />
                    )}
                </div>
                <div className="flex-1 min-w-0">
                    <h2 className="m-0" style={{ fontSize: '1.6rem', fontWeight: 800 }}>{pair.title || partner.full_name}</h2>
                    <p className="text-secondary m-0 text-sm">{partner.email}</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px', flexWrap: 'wrap' }}>
                        {isPartnerActive ? (
                            <span style={{ fontSize: '0.78rem', color: '#10b981', fontWeight: 600 }}><CheckCircle size={12} className="inline mr-1" />En train de travailler</span>
                        ) : (() => {
                            const days = getDaysSince(partnerPresence?.last_seen);
                            if (days === null) return <span style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.35)' }}><Clock size={12} className="inline mr-1" />Activité inconnue</span>;
                            if (days === 0) return <span style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.6)' }}><Clock size={12} className="inline mr-1" />Vu aujourd'hui</span>;
                            if (days === 1) return <span style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)' }}><Clock size={12} className="inline mr-1" />Vu hier</span>;
                            return <span style={{ fontSize: '0.78rem', color: '#fbbf24' }}><AlertCircle size={12} className="inline mr-1" />Inactif depuis {days} jour{days > 1 ? 's' : ''}</span>;
                        })()}
                        <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'rgba(255,255,255,0.2)' }} />
                        <span style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.4)' }}>
                            Partenaires depuis {pair.created_at?.toDate ? pair.created_at.toDate().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'}
                        </span>
                        {totalMilestones > 0 && (
                            <>
                                <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'rgba(255,255,255,0.2)' }} />
                                <span style={{ fontSize: '0.78rem', color: completedMilestones === totalMilestones ? '#10b981' : 'rgba(255,255,255,0.4)' }}>
                                    {completedMilestones}/{totalMilestones} étapes
                                </span>
                            </>
                        )}
                    </div>
                </div>
                <div className="flex gap-2 flex-shrink-0" style={{ alignItems: 'flex-start' }}>
                    {/* Nudge button */}
                    <button onClick={handleNudge} disabled={nudging || nudgeSent} className="btn btn-sm"
                        style={{ background: nudgeSent ? 'rgba(16,185,129,0.12)' : 'rgba(251,191,36,0.1)', color: nudgeSent ? '#10b981' : '#fbbf24', border: `1px solid ${nudgeSent ? 'rgba(16,185,129,0.3)' : 'rgba(251,191,36,0.25)'}`, gap: '6px', borderRadius: '10px' }}>
                        {nudgeSent ? <><CheckCircle size={13} /> Envoyé</> : <><Zap size={13} /> Nudge</>}
                    </button>

                    {/* Settings button + popover */}
                    <div style={{ position: 'relative' }} ref={settingsPanelRef}>
                        <button
                            onClick={() => setShowSettingsPanel(v => !v)}
                            title="Paramètres de la session"
                            style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                width: 34, height: 34, borderRadius: '10px',
                                background: showSettingsPanel ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.05)',
                                border: `1px solid ${showSettingsPanel ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.1)'}`,
                                color: showSettingsPanel ? 'var(--color-primary)' : 'rgba(255,255,255,0.45)',
                                cursor: 'pointer', transition: 'all 0.2s', flexShrink: 0,
                            }}
                            onMouseEnter={e => { if (!showSettingsPanel) { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = 'rgba(255,255,255,0.75)'; } }}
                            onMouseLeave={e => { if (!showSettingsPanel) { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = 'rgba(255,255,255,0.45)'; } }}
                        >
                            <Settings2 size={15} />
                        </button>

                        {/* Floating settings panel */}
                        {showSettingsPanel && (
                            <div style={{
                                position: 'absolute', top: '42px', right: 0, zIndex: 200,
                                width: 320, borderRadius: '16px',
                                background: 'rgba(18,18,26,0.97)',
                                backdropFilter: 'blur(20px)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                boxShadow: '0 24px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(99,102,241,0.15)',
                                padding: '1.25rem',
                                display: 'flex', flexDirection: 'column', gap: '1rem',
                                animation: 'fadeIn 0.15s ease',
                            }}>
                                {/* Header */}
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '0.88rem' }}>
                                        <Settings2 size={14} style={{ color: 'var(--color-primary)' }} />
                                        Paramètres de la session
                                    </div>
                                    <button onClick={() => setShowSettingsPanel(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', padding: '2px', display: 'flex' }}>
                                        <X size={14} />
                                    </button>
                                </div>

                                {/* Title */}
                                <div>
                                    <label style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.45)', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
                                        Titre
                                    </label>
                                    <div style={{ display: 'flex', gap: '6px' }}>
                                        <input
                                            type="text"
                                            className="input flex-1"
                                            placeholder={partner.full_name}
                                            value={titleInput}
                                            onChange={e => setTitleInput(e.target.value)}
                                            style={{ fontSize: '0.85rem', height: '34px', padding: '0 10px' }}
                                        />
                                        <button
                                            onClick={handleSaveTitle}
                                            disabled={savingTitle || titleInput.trim() === (pair.title || '')}
                                            style={{ height: '34px', padding: '0 12px', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 600, background: 'rgba(99,102,241,0.2)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.3)', cursor: 'pointer', flexShrink: 0, opacity: titleInput.trim() === (pair.title || '') ? 0.4 : 1 }}
                                        >
                                            {savingTitle ? '...' : 'OK'}
                                        </button>
                                    </div>
                                </div>

                                {/* Weekly hours toggle */}
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                                        <label style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.45)', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                                            Objectif hebdomadaire
                                        </label>
                                        {/* Toggle */}
                                        <button
                                            onClick={() => {
                                                const next = !hoursEnabled;
                                                setHoursEnabled(next);
                                                if (!next) {
                                                    // Disable: save 0 immediately
                                                    updateDoc(doc(db, 'accountability_pairs', id as string), { weekly_hours_goal: 0 });
                                                    setPair((p: any) => ({ ...p, weekly_hours_goal: 0 }));
                                                }
                                            }}
                                            style={{
                                                width: 40, height: 22, borderRadius: '11px', border: 'none', cursor: 'pointer', padding: 2, transition: 'background 0.25s',
                                                background: hoursEnabled ? 'rgba(99,102,241,0.7)' : 'rgba(255,255,255,0.12)',
                                                position: 'relative', flexShrink: 0,
                                            }}
                                        >
                                            <span style={{
                                                display: 'block', width: 18, height: 18, borderRadius: '50%', background: '#fff',
                                                position: 'absolute', top: '50%', transform: `translateX(${hoursEnabled ? '18px' : '0px'}) translateY(-50%)`,
                                                transition: 'transform 0.25s', boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
                                            }} />
                                        </button>
                                    </div>
                                    {hoursEnabled && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <input
                                                type="number" min="1" max="500"
                                                className="input"
                                                value={goalInput}
                                                onChange={e => setGoalInput(e.target.value)}
                                                style={{ width: '64px', textAlign: 'center', fontSize: '0.88rem', height: '34px', padding: '0 8px' }}
                                            />
                                            <span style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.45)' }}>h / </span>
                                            <select
                                                value={goalFreq}
                                                onChange={e => setGoalFreq(e.target.value)}
                                                style={{ height: '34px', fontSize: '0.85rem', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', padding: '0 4px', color: '#fff' }}
                                            >
                                                <option value="daily">jour</option>
                                                <option value="weekly">semaine</option>
                                                <option value="monthly">mois</option>
                                            </select>
                                            <button
                                                onClick={() => { handleSaveGoal(); }}
                                                disabled={goalInput === String(pair.weekly_hours_goal ?? 0) && goalFreq === (pair.goal_frequency || 'weekly')}
                                                style={{ marginLeft: 'auto', height: '34px', padding: '0 12px', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 600, background: 'rgba(99,102,241,0.2)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.3)', cursor: 'pointer', opacity: (goalInput === String(pair.weekly_hours_goal ?? 0) && goalFreq === (pair.goal_frequency || 'weekly')) ? 0.4 : 1 }}
                                            >
                                                OK
                                            </button>
                                        </div>
                                    )}
                                    {!hoursEnabled && (
                                        <p style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.3)', margin: 0 }}>Aucun objectif d'heures défini</p>
                                    )}
                                </div>

                                {/* Linked Salon */}
                                <div>
                                    <label style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.45)', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
                                        Salon lié
                                    </label>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        <button onClick={() => handleLinkSalon('')} style={{ textAlign: 'left', padding: '6px 10px', borderRadius: '8px', fontSize: '0.82rem', background: !pair.objective_id ? 'rgba(255,255,255,0.08)' : 'transparent', border: !pair.objective_id ? '1px solid rgba(255,255,255,0.15)' : '1px solid transparent', color: !pair.objective_id ? '#fff' : 'rgba(255,255,255,0.4)', cursor: 'pointer' }}>
                                            ✕ Aucun salon
                                        </button>
                                        {myObjectives.map(o => (
                                            <button key={o.id} onClick={() => handleLinkSalon(o.id)} style={{ textAlign: 'left', padding: '6px 10px', borderRadius: '8px', fontSize: '0.82rem', background: pair.objective_id === o.id ? 'rgba(99,102,241,0.15)' : 'transparent', border: pair.objective_id === o.id ? '1px solid rgba(99,102,241,0.4)' : '1px solid transparent', color: pair.objective_id === o.id ? 'var(--color-primary)' : 'rgba(255,255,255,0.6)', cursor: 'pointer' }}>
                                                {o.title}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Leave button */}
                    {!confirmLeave ? (
                        <button onClick={() => setConfirmLeave(true)} className="btn btn-sm btn-ghost"
                            style={{ color: 'rgba(239,68,68,0.7)', border: '1px solid rgba(239,68,68,0.18)', gap: '5px', borderRadius: '10px' }}>
                            <X size={13} /> Quitter
                        </button>
                    ) : (
                        <div className="flex items-center gap-2" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.28)', borderRadius: '10px', padding: '4px 10px' }}>
                            <span style={{ fontSize: '0.78rem', color: '#f87171', whiteSpace: 'nowrap' }}>Quitter ?</span>
                            <button onClick={handleLeave} disabled={leaving} className="btn btn-sm" style={{ background: 'rgba(239,68,68,0.22)', color: '#f87171', border: '1px solid rgba(239,68,68,0.4)', fontSize: '0.78rem', padding: '3px 10px' }}>
                                {leaving ? '...' : 'Confirmer'}
                            </button>
                            <button onClick={() => setConfirmLeave(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', padding: '2px' }}>
                                <X size={13} />
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Two-column layout */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '1.5rem', alignItems: 'start' }}>

                {/* LEFT: tabs */}
                <div>
                    {/* Tab bar */}
                    <div className="flex gap-1 mb-5" style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '14px', padding: '4px', border: '1px solid rgba(255,255,255,0.06)', flexWrap: 'wrap' }}>
                        {TABS.map(t => (
                            <button key={t.key} onClick={() => setActiveTab(t.key)}
                                style={{
                                    flex: '1 1 auto', padding: '8px 6px', borderRadius: '10px', fontSize: '0.78rem', fontWeight: 600,
                                    border: 'none', cursor: 'pointer', transition: 'all 0.2s', gap: '4px',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    background: activeTab === t.key ? 'rgba(99,102,241,0.2)' : 'transparent',
                                    color: activeTab === t.key ? 'var(--color-primary)' : 'rgba(255,255,255,0.45)',
                                    boxShadow: activeTab === t.key ? '0 0 0 1px rgba(99,102,241,0.3)' : 'none',
                                }}>
                                {t.icon} {t.label}
                                {t.key === 'coworking' && (amInSession || partnerInSession) && (
                                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', marginLeft: 2, display: 'inline-block' }} />
                                )}
                            </button>
                        ))}
                    </div>

                    {/* ── TAB: RÉSUMÉ ── */}
                    {activeTab === 'resume' && (
                        <div className="flex flex-col gap-4 fade-enter">
                            {/* Weekly goal */}
                            <div className="card card-glass" style={{ padding: '1.25rem', border: '1px solid rgba(99,102,241,0.2)', background: 'rgba(99,102,241,0.04)' }}>
                                <div className="flex items-center justify-between mb-3">
                                    <h4 className="flex items-center gap-2 m-0 text-primary" style={{ fontSize: '0.9rem' }}>
                                        <Target size={16} /> Objectif hebdomadaire
                                    </h4>
                                    <button onClick={() => setShowSettingsPanel(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: 0.4, padding: '2px 6px' }}><Settings2 size={13} /></button>
                                </div>
                                {weeklyGoal > 0 ? (
                                    <>
                                        <div style={{ fontSize: '2.5rem', fontWeight: 900, color: 'var(--color-primary)', lineHeight: 1 }}>{weeklyGoal}h</div>
                                        <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.45)', marginTop: '4px' }}>par {pair.goal_frequency === 'daily' ? 'jour' : pair.goal_frequency === 'monthly' ? 'mois' : 'semaine'} · objectif commun</div>
                                    </>
                                ) : (
                                    <div style={{ fontSize: '1.1rem', fontWeight: 600, color: 'rgba(255,255,255,0.3)', fontStyle: 'italic' }}>Pas d'objectif fixé</div>
                                )}
                            </div>

                            {/* Progress if salon linked */}
                            {objective && (
                                <div className="card card-glass" style={{ padding: '1.25rem' }}>
                                    <h4 className="flex items-center gap-2 m-0 mb-4" style={{ fontSize: '0.9rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.75rem' }}>
                                        📊 Progression dans le salon
                                    </h4>
                                    {[
                                        { label: 'Vous', val: myProgress, color: 'linear-gradient(90deg, var(--color-primary), var(--color-secondary))' },
                                        { label: partner.full_name, val: partnerProgress, color: 'linear-gradient(90deg, #10b981, #34d399)' },
                                    ].map(({ label, val, color }) => (
                                        <div key={label} className="mb-4 last:mb-0">
                                            <div className="flex justify-between items-center mb-2">
                                                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{label}</span>
                                                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: color.includes('primary') ? 'var(--color-primary)' : '#10b981' }}>{fmtHours(val)} / {targetHours}h</span>
                                            </div>
                                            <div style={{ height: '8px', borderRadius: '6px', background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                                                <div style={{ height: '100%', width: `${Math.min(100, (val / (targetHours || 1)) * 100)}%`, borderRadius: '6px', background: color, transition: 'width 0.5s ease' }} />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Linked salon */}
                            <div className="card card-glass" style={{ padding: '1.25rem' }}>
                                <div className="flex items-center justify-between mb-3">
                                    <h4 className="m-0" style={{ fontSize: '0.9rem' }}>🔗 Salon lié</h4>
                                    <button onClick={() => setEditingSalon(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: 0.4, padding: '2px 6px' }}><Edit3 size={13} /></button>
                                </div>
                                {editingSalon ? (
                                    <div className="flex flex-col gap-2">
                                        <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', margin: 0 }}>Choisissez un salon pour suivre la progression :</p>
                                        <button onClick={() => handleLinkSalon('')} className="btn btn-sm btn-ghost text-secondary" style={{ justifyContent: 'flex-start', border: '1px solid var(--color-border)', fontSize: '0.82rem' }}>✕ Aucun salon</button>
                                        {myObjectives.map(o => (
                                            <button key={o.id} onClick={() => handleLinkSalon(o.id)} className="btn btn-sm"
                                                style={{ justifyContent: 'flex-start', fontSize: '0.82rem', textAlign: 'left', background: pair.objective_id === o.id ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.04)', border: pair.objective_id === o.id ? '1px solid rgba(99,102,241,0.4)' : '1px solid var(--color-border)', color: pair.objective_id === o.id ? 'var(--color-primary)' : 'inherit' }}>
                                                {o.title}
                                            </button>
                                        ))}
                                    </div>
                                ) : objective ? (
                                    <Link href={`/objective/${objective.id}`} style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', borderRadius: '12px', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)' }}>
                                        <div>
                                            <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{objective.title}</div>
                                            <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.45)', marginTop: '2px' }}>Objectif : {objective.target_hours}h</div>
                                        </div>
                                        <ExternalLink size={14} style={{ opacity: 0.4, flexShrink: 0 }} />
                                    </Link>
                                ) : (
                                    <div style={{ padding: '0.75rem', background: 'rgba(255,255,255,0.03)', borderRadius: '10px', border: '1px dashed rgba(255,255,255,0.1)', textAlign: 'center' }}>
                                        <p style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.4)', margin: 0 }}>Aucun salon lié</p>
                                        <button onClick={() => setEditingSalon(true)} style={{ marginTop: '6px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8rem', color: 'var(--color-primary)' }}>+ Lier un salon →</button>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ── TAB: ÉTAPES ── */}
                    {activeTab === 'etapes' && (
                        <div className="fade-enter">
                            {/* Progress bar */}
                            {totalMilestones > 0 && (
                                <div className="card card-glass mb-4" style={{ padding: '1.25rem', border: '1px solid rgba(99,102,241,0.2)', background: 'rgba(99,102,241,0.04)' }}>
                                    <div className="flex justify-between items-center mb-3">
                                        <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>
                                            <Flag size={14} className="inline mr-2" style={{ color: 'var(--color-primary)' }} />
                                            Progression des étapes
                                        </span>
                                        <span style={{ fontSize: '0.9rem', fontWeight: 800, color: completedMilestones === totalMilestones ? '#10b981' : 'var(--color-primary)' }}>
                                            {completedMilestones}/{totalMilestones}
                                        </span>
                                    </div>
                                    <div style={{ height: '8px', borderRadius: '6px', background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                                        <div style={{ height: '100%', width: `${(completedMilestones / totalMilestones) * 100}%`, borderRadius: '6px', background: completedMilestones === totalMilestones ? 'linear-gradient(90deg,#10b981,#34d399)' : 'linear-gradient(90deg,var(--color-primary),var(--color-secondary))', transition: 'width 0.5s ease' }} />
                                    </div>
                                    {completedMilestones === totalMilestones && totalMilestones > 0 && (
                                        <div style={{ fontSize: '0.8rem', color: '#10b981', marginTop: '8px', fontWeight: 600 }}>🎉 Toutes les étapes sont complétées !</div>
                                    )}
                                </div>
                            )}

                            <div className="flex justify-between items-center mb-4">
                                <p className="text-secondary m-0 text-sm">Étapes et jalons vers votre objectif commun</p>
                                <button onClick={() => setShowMilestoneForm(v => !v)} className="btn btn-sm btn-primary" style={{ gap: '5px' }}>
                                    {showMilestoneForm ? <><X size={13} /> Annuler</> : <><Plus size={13} /> Ajouter</>}
                                </button>
                            </div>

                            {showMilestoneForm && (
                                <form onSubmit={handleAddMilestone} className="card card-glass mb-4 fade-enter" style={{ padding: '1.25rem', border: '1px solid rgba(99,102,241,0.3)', background: 'rgba(99,102,241,0.04)', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                    <input className="input" placeholder="Nom de l'étape *" value={milestoneTitle} onChange={e => setMilestoneTitle(e.target.value)} required />
                                    <div>
                                        <label style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '4px' }}>Échéance (optionnel)</label>
                                        <input type="date" className="input" value={milestoneDue} onChange={e => setMilestoneDue(e.target.value)} />
                                    </div>
                                    <button type="submit" className="btn btn-primary btn-sm" disabled={savingMilestone || !milestoneTitle.trim()}>
                                        {savingMilestone ? 'Enregistrement...' : '✓ Ajouter l\'étape'}
                                    </button>
                                </form>
                            )}

                            {milestones.length === 0 ? (
                                <div className="card card-glass text-center py-12">
                                    <CheckSquare size={36} style={{ margin: '0 auto 0.75rem', opacity: 0.15 }} />
                                    <p style={{ opacity: 0.4, fontSize: '0.9rem' }}>Aucune étape définie</p>
                                    <p style={{ opacity: 0.3, fontSize: '0.8rem', margin: '4px 0 0' }}>Décomposez votre objectif en étapes concrètes</p>
                                    <button onClick={() => setShowMilestoneForm(true)} style={{ marginTop: '8px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.82rem', color: 'var(--color-primary)' }}>+ Ajouter la première →</button>
                                </div>
                            ) : (
                                <div className="flex flex-col gap-2">
                                    {milestones.map((m, idx) => {
                                        const due = m.due_date?.toDate ? m.due_date.toDate() : m.due_date ? new Date(m.due_date) : null;
                                        const isOverdue = due && !m.completed && due < new Date();
                                        return (
                                            <div key={m.id} className="card card-glass fade-enter" style={{ padding: '0.9rem 1.1rem', display: 'flex', gap: '0.9rem', alignItems: 'flex-start', borderLeft: `3px solid ${m.completed ? '#10b981' : isOverdue ? '#ef4444' : 'rgba(255,255,255,0.08)'}`, opacity: m.completed ? 0.75 : 1, transition: 'opacity 0.2s' }}>
                                                <button onClick={() => handleToggleMilestone(m)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', flexShrink: 0, marginTop: '1px', color: m.completed ? '#10b981' : 'rgba(255,255,255,0.3)' }}>
                                                    {m.completed ? <CheckSquare size={18} /> : <Square size={18} />}
                                                </button>
                                                <div className="flex-1 min-w-0">
                                                    <div style={{ fontWeight: 600, fontSize: '0.92rem', textDecoration: m.completed ? 'line-through' : 'none', color: m.completed ? 'rgba(255,255,255,0.45)' : 'inherit' }}>
                                                        {idx + 1}. {m.title}
                                                    </div>
                                                    <div className="flex gap-3 mt-1" style={{ flexWrap: 'wrap' }}>
                                                        {due && (
                                                            <span style={{ fontSize: '0.72rem', color: isOverdue ? '#ef4444' : 'rgba(255,255,255,0.35)' }}>
                                                                {isOverdue ? '⚠ ' : '📅 '}Échéance {due.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                                                            </span>
                                                        )}
                                                        {m.completed && m.completed_by_name && (
                                                            <span style={{ fontSize: '0.72rem', color: '#10b981' }}>✓ Complété par {m.completed_by_name}</span>
                                                        )}
                                                        {!m.completed && (
                                                            <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.28)' }}>par {m.created_by_name}</span>
                                                        )}
                                                    </div>
                                                </div>
                                                <button onClick={() => handleDeleteMilestone(m.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: 0.25, padding: '2px', flexShrink: 0 }}>
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
                        <div className="fade-enter">
                            <div className="flex justify-between items-center mb-4">
                                <p className="text-secondary m-0 text-sm">Liens et notes partagés entre vous deux</p>
                                <button onClick={() => setShowResForm(v => !v)} className="btn btn-sm btn-primary" style={{ gap: '5px' }}>
                                    {showResForm ? <><X size={13} /> Annuler</> : <><Plus size={13} /> Ajouter</>}
                                </button>
                            </div>

                            {showResForm && (
                                <form onSubmit={handleAddResource} className="card card-glass mb-4 fade-enter" style={{ padding: '1.25rem', border: '1px solid rgba(99,102,241,0.3)', background: 'rgba(99,102,241,0.04)', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                    <div className="flex gap-2">
                                        {(['link', 'note'] as const).map(t => (
                                            <button key={t} type="button" onClick={() => setResType(t)}
                                                style={{ flex: 1, padding: '7px', borderRadius: '10px', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', background: resType === t ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.05)', color: resType === t ? 'var(--color-primary)' : 'rgba(255,255,255,0.5)', boxShadow: resType === t ? '0 0 0 1px rgba(99,102,241,0.4)' : 'none', transition: 'all 0.2s' }}>
                                                {t === 'link' ? <><LinkIcon size={13} /> Lien</> : <><FileText size={13} /> Note</>}
                                            </button>
                                        ))}
                                    </div>
                                    <input className="input" placeholder="Titre *" value={resTitle} onChange={e => setResTitle(e.target.value)} required />
                                    {resType === 'link'
                                        ? <input className="input" placeholder="URL (https://...)" value={resUrl} onChange={e => setResUrl(e.target.value)} type="url" />
                                        : <textarea className="input" rows={3} placeholder="Contenu de la note..." value={resNote} onChange={e => setResNote(e.target.value)} />
                                    }
                                    <button type="submit" className="btn btn-primary btn-sm" disabled={savingRes || !resTitle.trim()}>
                                        {savingRes ? 'Enregistrement...' : '✓ Ajouter'}
                                    </button>
                                </form>
                            )}

                            {resources.length === 0 ? (
                                <div className="card card-glass text-center py-12">
                                    <LinkIcon size={36} style={{ margin: '0 auto 0.75rem', opacity: 0.15 }} />
                                    <p style={{ opacity: 0.4, fontSize: '0.9rem' }}>Aucune ressource partagée</p>
                                    <button onClick={() => setShowResForm(true)} style={{ marginTop: '8px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.82rem', color: 'var(--color-primary)' }}>+ Ajouter la première →</button>
                                </div>
                            ) : (
                                <div className="flex flex-col gap-3">
                                    {resources.map(r => (
                                        <div key={r.id} className="card card-glass fade-enter" style={{ padding: '1rem 1.25rem', display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                                            <div style={{ width: 32, height: 32, borderRadius: '9px', background: r.type === 'link' ? 'rgba(99,102,241,0.15)' : 'rgba(16,185,129,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '2px' }}>
                                                {r.type === 'link' ? <LinkIcon size={14} style={{ color: '#818cf8' }} /> : <FileText size={14} style={{ color: '#10b981' }} />}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{r.title}</div>
                                                {r.type === 'link' && r.url && (
                                                    <a href={r.url} target="_blank" rel="noreferrer" style={{ fontSize: '0.78rem', color: '#818cf8', wordBreak: 'break-all', textDecoration: 'none' }}>{r.url}</a>
                                                )}
                                                {r.type === 'note' && r.content && (
                                                    <p style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.6)', margin: '4px 0 0', lineHeight: '1.4', whiteSpace: 'pre-wrap' }}>{r.content}</p>
                                                )}
                                                <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.3)', marginTop: '6px' }}>par {r.added_by_name} · {r.created_at?.toDate ? r.created_at.toDate().toLocaleDateString('fr-FR') : ''}</div>
                                            </div>
                                            {r.added_by === user?.uid && (
                                                <button onClick={() => handleDeleteResource(r.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: 0.3, padding: '2px', flexShrink: 0 }}>
                                                    <Trash2 size={13} />
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── TAB: AGENDA ── */}
                    {activeTab === 'agenda' && (
                        <div className="fade-enter">
                            <div className="flex justify-between items-center mb-4">
                                <p className="text-secondary m-0 text-sm">Sessions de travail planifiées ensemble</p>
                                <button onClick={() => setShowSessionForm(v => !v)} className="btn btn-sm btn-primary" style={{ gap: '5px' }}>
                                    {showSessionForm ? <><X size={13} /> Annuler</> : <><Plus size={13} /> Planifier</>}
                                </button>
                            </div>

                            {showSessionForm && (
                                <form onSubmit={handleAddSession} className="card card-glass mb-4 fade-enter" style={{ padding: '1.25rem', border: '1px solid rgba(99,102,241,0.3)', background: 'rgba(99,102,241,0.04)', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                    <input className="input" placeholder="Titre de la session *" value={sessionTitle} onChange={e => setSessionTitle(e.target.value)} required />
                                    <div>
                                        <label style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '4px' }}>Date et heure *</label>
                                        <input type="datetime-local" className="input" value={sessionDate} onChange={e => setSessionDate(e.target.value)} required />
                                    </div>
                                    <textarea className="input" rows={2} placeholder="Note (optionnel)" value={sessionNote} onChange={e => setSessionNote(e.target.value)} />
                                    <button type="submit" className="btn btn-primary btn-sm" disabled={savingSession || !sessionTitle.trim() || !sessionDate}>
                                        {savingSession ? 'Enregistrement...' : '📅 Planifier la session'}
                                    </button>
                                </form>
                            )}

                            {sessions.length === 0 ? (
                                <div className="card card-glass text-center py-12">
                                    <Calendar size={36} style={{ margin: '0 auto 0.75rem', opacity: 0.15 }} />
                                    <p style={{ opacity: 0.4, fontSize: '0.9rem' }}>Aucune session planifiée</p>
                                    <button onClick={() => setShowSessionForm(true)} style={{ marginTop: '8px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.82rem', color: 'var(--color-primary)' }}>+ Planifier →</button>
                                </div>
                            ) : (
                                <div className="flex flex-col gap-3">
                                    {sessions.map(s => {
                                        const date = s.scheduled_at?.toDate ? s.scheduled_at.toDate() : new Date(s.scheduled_at);
                                        const isPast = date < new Date();
                                        const attending = s.attendees?.includes(user!.uid);
                                        const dateStr = date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
                                        return (
                                            <div key={s.id} className="card card-glass fade-enter" style={{ padding: '1rem 1.25rem', borderLeft: '3px solid var(--color-primary)', opacity: isPast ? 0.6 : 1 }}>
                                                <div className="flex justify-between items-start gap-3">
                                                    <div className="flex-1 min-w-0">
                                                        <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{s.title}</div>
                                                        <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', marginTop: '3px' }}>📅 {dateStr}</div>
                                                        {s.note && <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.55)', margin: '6px 0 0', lineHeight: '1.4' }}>{s.note}</p>}
                                                        <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.35)', marginTop: '6px' }}>
                                                            {s.attendees?.length ?? 0} participant{s.attendees?.length !== 1 ? 's' : ''} · par {s.creator_name}
                                                        </div>
                                                    </div>
                                                    <div className="flex flex-col gap-2 items-end flex-shrink-0">
                                                        {!isPast && (
                                                            <button onClick={() => handleToggleAttendee(s)} className={`btn btn-sm ${attending ? 'btn-ghost text-secondary' : 'btn-primary'}`} style={{ fontSize: '0.78rem' }}>
                                                                {attending ? 'Se désinscrire' : '✓ Participer'}
                                                            </button>
                                                        )}
                                                        {s.creator_id === user?.uid && (
                                                            <button onClick={() => handleDeleteSession(s.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: 0.3, padding: '2px' }}>
                                                                <Trash2 size={13} />
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── TAB: COWORKING ── */}
                    {activeTab === 'coworking' && (
                        <div className="fade-enter flex flex-col gap-4">
                            {/* Join/leave session */}
                            <div className="card card-glass" style={{ padding: '1.25rem', border: '1px solid rgba(16,185,129,0.2)', background: 'rgba(16,185,129,0.03)' }}>
                                <h4 className="flex items-center gap-2 m-0 mb-3" style={{ fontSize: '0.9rem', color: '#10b981' }}>
                                    <Video size={16} /> Session live
                                </h4>
                                <div className="flex items-center gap-3 mb-4">
                                    {/* Your status */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 14px', borderRadius: '12px', background: amInSession ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.04)', border: `1px solid ${amInSession ? 'rgba(16,185,129,0.3)' : 'rgba(255,255,255,0.08)'}` }}>
                                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: amInSession ? '#10b981' : 'rgba(255,255,255,0.2)', boxShadow: amInSession ? '0 0 6px rgba(16,185,129,0.6)' : 'none', display: 'inline-block' }} />
                                        <span style={{ fontSize: '0.82rem', fontWeight: 600, color: amInSession ? '#10b981' : 'rgba(255,255,255,0.4)' }}>Vous</span>
                                    </div>
                                    <span style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.2)' }}>·</span>
                                    {/* Partner status */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 14px', borderRadius: '12px', background: partnerInSession ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.04)', border: `1px solid ${partnerInSession ? 'rgba(16,185,129,0.3)' : 'rgba(255,255,255,0.08)'}` }}>
                                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: partnerInSession ? '#10b981' : 'rgba(255,255,255,0.2)', boxShadow: partnerInSession ? '0 0 6px rgba(16,185,129,0.6)' : 'none', display: 'inline-block' }} />
                                        <span style={{ fontSize: '0.82rem', fontWeight: 600, color: partnerInSession ? '#10b981' : 'rgba(255,255,255,0.4)' }}>{partner.full_name}</span>
                                    </div>
                                </div>
                                {!amInSession ? (
                                    <button onClick={handleJoinCoworking} className="btn btn-sm w-full" style={{ justifyContent: 'center', background: 'rgba(16,185,129,0.15)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)', gap: '6px' }}>
                                        <Video size={14} /> Rejoindre la session
                                    </button>
                                ) : (
                                    <button onClick={handleLeaveCoworking} className="btn btn-sm w-full btn-ghost text-secondary" style={{ justifyContent: 'center', border: '1px solid rgba(255,255,255,0.1)', gap: '6px' }}>
                                        <X size={14} /> Quitter la session
                                    </button>
                                )}
                                {amInSession && partnerInSession && (
                                    <div style={{ marginTop: '10px', padding: '8px 12px', borderRadius: '10px', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', fontSize: '0.8rem', color: '#10b981', textAlign: 'center' }}>
                                        ✦ Vous êtes en session ensemble !
                                    </div>
                                )}
                            </div>

                            {/* Session focus timer */}
                            {amInSession && (
                                <div className="card card-glass" style={{ padding: '1.5rem', border: `1px solid ${timerColor}30`, background: `${timerColor}06` }}>
                                    <div className="flex items-center justify-between mb-4">
                                        <h4 className="flex items-center gap-2 m-0" style={{ fontSize: '0.9rem', color: timerColor }}>
                                            ⏱ Session Focus partagée
                                        </h4>
                                        <button onClick={() => setShowTimerSettings(v => !v)} title="Régler les durées"
                                            style={{ background: showTimerSettings ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.05)', border: `1px solid ${showTimerSettings ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.1)'}`, borderRadius: '8px', color: showTimerSettings ? '#818cf8' : 'rgba(255,255,255,0.35)', padding: '5px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                                            <Settings2 size={13} />
                                        </button>
                                    </div>

                                    {/* Duration settings panel */}
                                    {showTimerSettings && (
                                        <div style={{ background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: '10px', padding: '12px', marginBottom: '1rem', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Durées (minutes)</span>
                                            {(['focus', 'short', 'long'] as const).map(key => (
                                                <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                                                    <span style={{ fontSize: '0.75rem', color: POMODORO_COLORS[key], fontWeight: 700, width: '80px' }}>{POMODORO_LABELS[key]}</span>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                        <button onClick={() => setDraftDurations(d => ({ ...d, [key]: Math.max(1, d[key] - 1) }))}
                                                            style={{ width: 24, height: 24, borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: '#a1a1aa', cursor: 'pointer', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                                                        <input type="text" inputMode="numeric" value={draftDurations[key]}
                                                            onChange={e => { const n = parseInt(e.target.value.replace(/\D/g, '') || '1'); setDraftDurations(d => ({ ...d, [key]: Math.min(180, Math.max(1, n)) })); }}
                                                            style={{ width: '44px', textAlign: 'center', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.13)', borderRadius: '6px', color: '#f8f9fa', fontSize: '0.88rem', fontWeight: 700, padding: '4px 2px', outline: 'none' }} />
                                                        <button onClick={() => setDraftDurations(d => ({ ...d, [key]: Math.min(180, d[key] + 1) }))}
                                                            style={{ width: 24, height: 24, borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: '#a1a1aa', cursor: 'pointer', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                                                    </div>
                                                </div>
                                            ))}
                                            <button onClick={handleApplyDurations}
                                                style={{ marginTop: '2px', padding: '6px', borderRadius: '7px', border: 'none', background: 'rgba(99,102,241,0.3)', color: '#a5b4fc', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>
                                                ✓ Appliquer (synchronisé avec {partner.full_name})
                                            </button>
                                        </div>
                                    )}

                                    {/* Mode selector */}
                                    <div className="flex gap-2 mb-5">
                                        {Object.entries(POMODORO_LABELS).map(([key, label]) => (
                                            <button key={key} onClick={() => handleSwitchMode(key)} type="button"
                                                style={{ flex: 1, padding: '6px 4px', borderRadius: '10px', fontSize: '0.76rem', fontWeight: 600, border: 'none', cursor: 'pointer', background: viewMode === key ? `${POMODORO_COLORS[key]}22` : 'rgba(255,255,255,0.04)', color: viewMode === key ? POMODORO_COLORS[key] : 'rgba(255,255,255,0.4)', boxShadow: viewMode === key ? `0 0 0 1px ${POMODORO_COLORS[key]}44` : 'none', transition: 'all 0.2s' }}>
                                                {label}
                                            </button>
                                        ))}
                                    </div>

                                    {/* Circle timer */}
                                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem' }}>
                                        <div style={{ animation: showAnim ? 'pulse-ring-acc 1s ease-out 3' : 'none', borderRadius: '50%', position: 'relative' }}>
                                            <CircleTimer remaining={displayRemaining} total={displayDuration} color={timerColor} running={displayRunning} />
                                            <CelebrationBurst show={showAnim} />
                                        </div>
                                    </div>

                                    {/* Controls — same layout as session page */}
                                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'center' }}>
                                        <button onClick={handleTimerReset}
                                            style={{ width: 34, height: 34, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.03)', color: '#71717a', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', opacity: isActiveMode ? 1 : 0.3, transition: 'background 0.2s' }}
                                            title="Réinitialiser"
                                            onMouseEnter={e => { if (isActiveMode) e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
                                            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}>
                                            <RotateCcw size={13} />
                                        </button>
                                        <button onClick={handleToggleTimer}
                                            style={{ width: 46, height: 46, borderRadius: '50%', border: 'none', background: `linear-gradient(135deg, ${timerColor}, ${timerColor}cc)`, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: `0 0 20px ${timerColor}55`, transition: 'transform 0.15s' }}
                                            onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.07)'; }}
                                            onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}>
                                            {displayRunning ? <Pause size={17} style={{ fill: '#fff' }} /> : <Play size={17} style={{ fill: '#fff', marginLeft: 2 }} />}
                                        </button>
                                    </div>
                                    <p style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.2)', textAlign: 'center', margin: '10px 0 0' }}>
                                        Minuteur synchronisé avec {partner.full_name}
                                    </p>
                                </div>
                            )}

                            {/* Session log */}
                            {cwLog.length > 0 && (
                                <div className="card card-glass" style={{ padding: '1.25rem' }}>
                                    <h4 className="m-0 mb-3" style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.5)' }}>Historique récent</h4>
                                    <div className="flex flex-col gap-2">
                                        {cwLog.map(entry => {
                                            const mins = Math.round(entry.duration_seconds / 60);
                                            const date = entry.started_at?.toDate ? entry.started_at.toDate() : new Date();
                                            return (
                                                <div key={entry.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                                    <div>
                                                        <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>{entry.user_name}</span>
                                                        <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', marginLeft: '8px' }}>{POMODORO_LABELS[entry.mode] ?? 'Focus'}</span>
                                                    </div>
                                                    <div style={{ textAlign: 'right' }}>
                                                        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: POMODORO_COLORS[entry.mode] ?? '#6366f1' }}>{mins}min</span>
                                                        <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.3)' }}>{date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {!amInSession && (
                                <div className="card card-glass text-center py-10" style={{ border: '1px dashed rgba(255,255,255,0.08)' }}>
                                    <Video size={36} style={{ margin: '0 auto 0.75rem', opacity: 0.12 }} />
                                    <p style={{ opacity: 0.35, fontSize: '0.88rem', margin: 0 }}>Rejoignez la session pour accéder au minuteur partagé</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── TAB: COACH IA ── */}
                    {activeTab === 'ia' && (
                        <div className="fade-enter flex flex-col gap-4">

                            {/* AI Coach */}
                            <div className="card card-glass" style={{ padding: '1.25rem', border: '1px solid rgba(99,102,241,0.2)', background: 'rgba(99,102,241,0.03)' }}>
                                <h4 className="flex items-center gap-2 m-0 mb-1" style={{ fontSize: '0.9rem', color: '#818cf8' }}>
                                    <Bot size={16} /> Coach IA
                                </h4>
                                <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.35)', margin: '0 0 14px' }}>
                                    Conseils personnalisés pour progresser ensemble avec {partner.full_name}.
                                </p>
                                <textarea
                                    value={aiQuestion}
                                    onChange={e => setAiQuestion(e.target.value)}
                                    placeholder="Question spécifique ? (optionnel) — ex: Comment rester motivés en période de rush ?"
                                    className="input w-full"
                                    rows={2}
                                    style={{ fontSize: '0.82rem', resize: 'none', marginBottom: '10px' }}
                                />
                                <button
                                    onClick={handleAskCoach}
                                    disabled={aiLoading}
                                    className="btn btn-sm w-full"
                                    style={{ justifyContent: 'center', background: 'rgba(99,102,241,0.2)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.35)', gap: '6px' }}
                                >
                                    {aiLoading ? (
                                        <><span style={{ width: 12, height: 12, borderRadius: '50%', border: '2px solid #818cf8', borderTopColor: 'transparent', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} /> Analyse en cours...</>
                                    ) : (
                                        <><Bot size={13} /> Demander au coach</>
                                    )}
                                </button>

                                {aiTips.length > 0 && (
                                    <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        {aiTips.map((tip, i) => (
                                            <div key={i} style={{ display: 'flex', gap: '10px', padding: '10px 12px', borderRadius: '10px', background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.15)' }}>
                                                <span style={{ flexShrink: 0, width: 20, height: 20, borderRadius: '50%', background: 'rgba(99,102,241,0.25)', color: '#818cf8', fontSize: '0.65rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span>
                                                <p style={{ margin: 0, fontSize: '0.82rem', color: 'rgba(255,255,255,0.75)', lineHeight: '1.5' }}>{tip}</p>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Smart Agenda */}
                            <div className="card card-glass" style={{ padding: '1.25rem', border: '1px solid rgba(16,185,129,0.2)', background: 'rgba(16,185,129,0.02)' }}>
                                <h4 className="flex items-center gap-2 m-0 mb-1" style={{ fontSize: '0.9rem', color: '#10b981' }}>
                                    <Zap size={16} /> Smart Agenda
                                </h4>
                                <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.35)', margin: '0 0 14px' }}>
                                    Génère un planning de sessions optimisé pour votre duo.
                                </p>

                                {/* Rhythm selector */}
                                <div style={{ marginBottom: '10px' }}>
                                    <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: '6px' }}>Rythme</label>
                                    <div className="flex gap-2">
                                        {([
                                            { key: 'leger', label: '🌱 Léger', sub: '2-3 sessions' },
                                            { key: 'regulier', label: '⚡ Régulier', sub: '4-6 sessions' },
                                            { key: 'intensif', label: '🔥 Intensif', sub: '8-10 sessions' },
                                        ] as const).map(r => (
                                            <button key={r.key} onClick={() => setAgendaRhythm(r.key)}
                                                style={{ flex: 1, padding: '8px 4px', borderRadius: '10px', border: `1px solid ${agendaRhythm === r.key ? 'rgba(16,185,129,0.45)' : 'rgba(255,255,255,0.08)'}`, background: agendaRhythm === r.key ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.03)', cursor: 'pointer', transition: 'all 0.2s' }}>
                                                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: agendaRhythm === r.key ? '#10b981' : 'rgba(255,255,255,0.4)' }}>{r.label}</div>
                                                <div style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.25)', marginTop: '2px' }}>{r.sub}</div>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Time preference */}
                                <div style={{ marginBottom: '12px' }}>
                                    <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: '6px' }}>Préférences horaires (optionnel)</label>
                                    <input
                                        className="input w-full"
                                        value={agendaTimePref}
                                        onChange={e => setAgendaTimePref(e.target.value)}
                                        placeholder="ex: soir après 18h, week-end matin..."
                                        style={{ fontSize: '0.82rem' }}
                                    />
                                </div>

                                <button
                                    onClick={handleGenerateAgenda}
                                    disabled={agendaLoading}
                                    className="btn btn-sm w-full"
                                    style={{ justifyContent: 'center', background: 'rgba(16,185,129,0.18)', color: '#10b981', border: '1px solid rgba(16,185,129,0.35)', gap: '6px' }}
                                >
                                    {agendaLoading ? (
                                        <><span style={{ width: 12, height: 12, borderRadius: '50%', border: '2px solid #10b981', borderTopColor: 'transparent', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} /> Génération en cours...</>
                                    ) : (
                                        <><Calendar size={13} /> Générer le planning</>
                                    )}
                                </button>

                                {generatedSessions.length > 0 && (
                                    <div style={{ marginTop: '14px' }}>
                                        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>
                                            {generatedSessions.length} sessions générées
                                        </div>
                                        <div className="flex flex-col gap-2" style={{ marginBottom: '12px' }}>
                                            {generatedSessions.map((s, i) => {
                                                const date = new Date(s.scheduled_at);
                                                const dateStr = date.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
                                                const typeColor = s.type === 'travail' ? '#6366f1' : s.type === 'discussion' ? '#10b981' : '#f59e0b';
                                                return (
                                                    <div key={i} style={{ padding: '10px 12px', borderRadius: '10px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderLeft: `3px solid ${typeColor}` }}>
                                                        <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#e4e4e7', marginBottom: '2px' }}>{s.title}</div>
                                                        <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)', marginBottom: '4px' }}>📅 {dateStr}</div>
                                                        {s.description && <div style={{ fontSize: '0.76rem', color: 'rgba(255,255,255,0.35)', lineHeight: 1.4 }}>{s.description}</div>}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        <button
                                            onClick={handleSaveGeneratedAgenda}
                                            disabled={savingAgenda}
                                            className="btn btn-sm w-full"
                                            style={{ justifyContent: 'center', background: 'rgba(99,102,241,0.2)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.35)', gap: '6px' }}
                                        >
                                            {savingAgenda ? 'Enregistrement...' : '✓ Sauvegarder dans l\'agenda'}
                                        </button>
                                    </div>
                                )}
                            </div>

                        </div>
                    )}

                </div>

                {/* RIGHT: Chat */}
                <div className="card card-glass flex flex-col" style={{ height: '580px', border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden', position: 'sticky', top: '100px' }}>

                    {/* Header with call button */}
                    <div style={{ padding: '0.85rem 1.25rem', borderBottom: '1px solid rgba(255,255,255,0.06)', fontWeight: 700, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                        💬 Chat privé
                        <span style={{ fontSize: '0.72rem', fontWeight: 400, color: 'rgba(255,255,255,0.35)', marginLeft: 'auto', marginRight: '8px' }}>avec {partner.full_name}</span>
                        <button onClick={() => partner && activateCall({ pairId: id as string, partnerName: partner.full_name, partnerId: partner.id, partnerAvatarUrl: partner.avatar_url ?? null, partnerAvatarStyle: partner.avatar_style ?? null })} disabled={callLoading || isOnCall}
                            title="Démarrer un appel vidéo"
                            style={{ background: isOnCall ? 'rgba(16,185,129,0.25)' : 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '8px', color: '#10b981', padding: '5px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.75rem', fontWeight: 600, flexShrink: 0 }}>
                            <Video size={13} /> {isOnCall ? 'En appel' : callLoading ? '...' : 'Appel'}
                        </button>
                    </div>

                    {/* Messages */}
                    <div ref={chatRef} style={{ flex: 1, overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {messages.length === 0 ? (
                            <div style={{ margin: 'auto', textAlign: 'center', opacity: 0.3 }}>
                                <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>💬</div>
                                <div style={{ fontSize: '0.82rem' }}>Commencez à vous encourager !</div>
                            </div>
                        ) : messages.map(msg => {
                            const isMe = msg.sender_id === user!.uid;
                            const time = msg.created_at?.toDate ? msg.created_at.toDate().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '';
                            return (
                                <div key={msg.id} style={{ display: 'flex', flexDirection: isMe ? 'row-reverse' : 'row', gap: '8px', alignItems: 'flex-end' }}>
                                    <div style={{
                                        maxWidth: '80%', padding: '8px 12px',
                                        borderRadius: isMe ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                                        background: isMe ? 'linear-gradient(135deg, var(--color-primary), var(--color-secondary))' : 'rgba(255,255,255,0.07)',
                                        fontSize: '0.85rem', lineHeight: '1.4', color: '#fff',
                                        border: isMe ? 'none' : '1px solid rgba(255,255,255,0.08)',
                                    }}>
                                        {msg.content}
                                        <div style={{ fontSize: '0.65rem', opacity: 0.6, marginTop: '3px', textAlign: isMe ? 'right' : 'left' }}>{time}</div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <form onSubmit={handleSendMessage} style={{ padding: '0.75rem 1rem', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: '8px', flexShrink: 0 }}>
                        <input type="text" value={newMessage} onChange={e => setNewMessage(e.target.value)}
                            placeholder="Encouragez-vous..." className="input flex-1" style={{ fontSize: '0.85rem' }} autoComplete="off" />
                        <button type="submit" className="btn btn-primary btn-sm" disabled={sending || !newMessage.trim()} style={{ flexShrink: 0 }}>
                            <Send size={14} />
                        </button>
                    </form>
                </div>
            </div>
        </div>

        {/* ── Focus Guard floating overlay ── */}
        {(focusGuardMsg || focusGuardLoading) && (
            <>
                <style>{`
                    @keyframes fgSlideIn {
                        from { opacity: 0; transform: translateY(16px) scale(0.96); }
                        to   { opacity: 1; transform: translateY(0) scale(1); }
                    }
                `}</style>
                <div style={{
                    position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)',
                    width: 'min(420px, calc(100vw - 40px))',
                    zIndex: 9998,
                    background: 'linear-gradient(135deg, #141416 0%, #1c1c24 100%)',
                    border: '1px solid rgba(99,102,241,0.35)',
                    borderRadius: 18,
                    boxShadow: '0 12px 48px rgba(0,0,0,0.75), 0 0 0 1px rgba(99,102,241,0.15)',
                    animation: 'fgSlideIn 0.32s cubic-bezier(0.16,1,0.3,1)',
                    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
                    overflow: 'hidden',
                }}>
                    {/* Top accent */}
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(90deg, transparent, rgba(99,102,241,0.6), transparent)' }} />

                    <div style={{ padding: '16px 18px 14px' }}>
                        {/* Header */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div style={{ width: 28, height: 28, borderRadius: 9, background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    <Bot size={14} color="#818cf8" />
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#a5b4fc', letterSpacing: '0.04em' }}>Focus Guard</div>
                                    <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.3)', fontWeight: 500 }}>Coach anti-procrastination</div>
                                </div>
                            </div>
                            <button onClick={() => { setFocusGuardMsg(null); setFocusGuardSubtasks([]); pauseCountRef.current = 0; }}
                                style={{ width: 24, height: 24, borderRadius: 7, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                                <X size={11} />
                            </button>
                        </div>

                        {/* Message */}
                        {focusGuardLoading ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 10, background: 'rgba(99,102,241,0.07)' }}>
                                <span style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid #818cf8', borderTopColor: 'transparent', animation: 'spin 0.7s linear infinite', display: 'inline-block', flexShrink: 0 }} />
                                <span style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.45)' }}>Focus Guard analyse ta session...</span>
                            </div>
                        ) : (
                            <>
                                <p style={{ margin: '0 0 12px', fontSize: '0.85rem', color: 'rgba(255,255,255,0.8)', lineHeight: 1.55, padding: '10px 12px', borderRadius: 10, background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.12)' }}>
                                    {focusGuardMsg}
                                </p>

                                {focusGuardSubtasks.length > 0 && (
                                    <div style={{ marginBottom: 12 }}>
                                        <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 7 }}>
                                            3 sous-tâches pour démarrer
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                                            {focusGuardSubtasks.map((task, i) => (
                                                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                                                    <span style={{ flexShrink: 0, width: 18, height: 18, borderRadius: 6, background: 'rgba(99,102,241,0.2)', color: '#818cf8', fontSize: '0.6rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>{i + 1}</span>
                                                    <span style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.65)', lineHeight: 1.4 }}>{task}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <div style={{ display: 'flex', gap: 8 }}>
                                    <button
                                        onClick={() => { setFocusGuardMsg(null); setFocusGuardSubtasks([]); pauseCountRef.current = 0; handleTimerStart(); }}
                                        style={{ flex: 1, padding: '8px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #6366f1, #818cf8)', color: '#fff', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}>
                                        Je continue !
                                    </button>
                                    <button
                                        onClick={() => { setFocusGuardMsg(null); setFocusGuardSubtasks([]); pauseCountRef.current = 0; }}
                                        style={{ padding: '8px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem', cursor: 'pointer' }}>
                                        Fermer
                                    </button>
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
