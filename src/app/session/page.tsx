'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useUI } from '@/context/UIContext';
import { useLiveSession } from '@/context/LiveSessionContext';
import { db, storage } from '@/lib/firebase';
import { collection, onSnapshot, doc, setDoc, getDoc, deleteDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { Zap, RotateCcw, Play, Pause, PhoneOff, Timer, Menu, X, LayoutDashboard, Compass, Users, MessageCircle, Calendar, Link2, Trash2, Plus, ExternalLink, FileText, Upload, Download, Settings2, PenLine } from 'lucide-react';
import Avatar from '@/components/Avatar';
import CollabWhiteboard from '@/components/CollabWhiteboard';

// ─── Pomodoro default durations (minutes) ──────────────────────────────────────
const DEFAULT_DURATIONS = [25, 5, 15];
const MODE_META = [
    { label: 'Focus', color: '#6366f1' },
    { label: 'Pause', color: '#10b981' },
    { label: 'Longue', color: '#06b6d4' },
];

const NAV_LINKS = [
    { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { label: 'Explorer', href: '/explore', icon: Compass },
    { label: 'Amis', href: '/friends', icon: Users },
    { label: 'Messages', href: '/messages', icon: MessageCircle },
    { label: 'Calendrier', href: '/calendar', icon: Calendar },
];

// ─── Circular timer ────────────────────────────────────────────────────────────
function CircleTimer({ timeLeft, total, color, running }: {
    timeLeft: number; total: number; color: string; running: boolean;
}) {
    const r = 52, circ = 2 * Math.PI * r;
    const offset = circ * (1 - timeLeft / total);
    const mm = Math.floor(timeLeft / 60).toString().padStart(2, '0');
    const ss = (timeLeft % 60).toString().padStart(2, '0');
    return (
        <div style={{ position: 'relative', width: 136, height: 136 }}>
            <svg width={136} height={136} style={{ transform: 'rotate(-90deg)' }}>
                <circle cx={68} cy={68} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={5} />
                <circle cx={68} cy={68} r={r} fill="none" stroke={color} strokeWidth={5} strokeLinecap="round"
                    strokeDasharray={circ} strokeDashoffset={offset}
                    style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.3s' }} />
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: '1.6rem', fontWeight: 800, letterSpacing: '-0.05em', fontVariantNumeric: 'tabular-nums', color: '#f8f9fa', lineHeight: 1 }}>
                    {mm}:{ss}
                </span>
                <span style={{ fontSize: '0.55rem', color: running ? color : '#52525b', fontWeight: 700, marginTop: 4, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                    {running ? '● En cours' : 'En pause'}
                </span>
            </div>
        </div>
    );
}

// ─── Session page ──────────────────────────────────────────────────────────────
function SessionPage() {
    const { user, loading } = useAuth();
    const { setNavbarVisible } = useUI();
    const {
        containerRef, zpRef, sessionInfo, activateSession, endSession,
        modeIdx, setModeIdx, durations, setDurations,
        activeModeIdx, setActiveModeIdx, timeLeft, setTimeLeft,
        running, setRunning, pomCount, setPomCount,
        showAnim, setShowAnim
    } = useLiveSession();
    const router = useRouter();
    const params = useSearchParams();
    const objectiveId = params.get('id');
    const sessionType = params.get('type') === 'project' ? 'projects' : 'objectives';
    const targetRouteType = params.get('type') === 'project' ? 'project' : 'objective';

    const [objectiveTitle, setObjectiveTitle] = useState('');
    const [roomMembers, setRoomMembers] = useState<any[]>([]);
    const [navOpen, setNavOpen] = useState(false);
    const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
    const [showWhiteboard, setShowWhiteboard] = useState(false);

    // Resources
    const [resources, setResources] = useState<{ id: string; title: string; url: string; type?: string; file_name?: string; file_size?: number; added_by: string; added_by_name: string }[]>([]);
    const [showAddResource, setShowAddResource] = useState(false);
    const [resType, setResType] = useState<'link' | 'file'>('link');
    const [resTitle, setResTitle] = useState('');
    const [resUrl, setResUrl] = useState('');
    const [resFile, setResFile] = useState<File | null>(null);
    const [resUploading, setResUploading] = useState(false);
    const [resUploadProgress, setResUploadProgress] = useState(0);

    // Timer (local UI state)
    const [showTimerSettings, setShowTimerSettings] = useState(false);
    const [draftDurations, setDraftDurations] = useState(DEFAULT_DURATIONS);
    const MODES = MODE_META.map((m, i) => ({ ...m, seconds: durations[i] * 60 }));
    const mode = MODES[modeIdx];

    // Presence heartbeat ref for coworking session
    const presenceHeartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Hide global navbar
    useEffect(() => {
        setNavbarVisible(false);
        return () => setNavbarVisible(true);
    }, [setNavbarVisible]);

    // Auth guard
    useEffect(() => {
        if (!loading && !user) router.push('/login');
    }, [user, loading, router]);

    // Objective title
    useEffect(() => {
        if (!objectiveId) return;
        getDoc(doc(db, sessionType, objectiveId)).then(s => {
            if (s.exists()) setObjectiveTitle(s.data().title || '');
        });
    }, [objectiveId]);

    // Activate session in context (makes overlay switch to full-screen mode)
    useEffect(() => {
        if (!objectiveId || !objectiveTitle) return;
        activateSession({ objectiveId, title: objectiveTitle, type: targetRouteType === 'project' ? 'project' : 'objective' });
    }, [objectiveId, objectiveTitle]); // eslint-disable-line react-hooks/exhaustive-deps

    // Register in live_session with profile data
    useEffect(() => {
        if (!objectiveId || !user) return;
        const liveRef = doc(db, sessionType, objectiveId, 'live_session', user.uid);
        getDoc(doc(db, 'users', user.uid)).then(uSnap => {
            const ud = uSnap.exists() ? uSnap.data() : {};
            setDoc(liveRef, {
                joined_at: serverTimestamp(),
                full_name: ud.full_name || (user as any).displayName || user.email?.split('@')[0] || 'Membre',
                avatar_style: ud.avatar_style ?? null,
                avatar_url: ud.avatar_url ?? null,
            });
        });
        // Do NOT delete liveRef here — navigating away keeps the session alive in mini-player.
        // Deletion happens in onLeaveRoom below when the session is truly ended.
    }, [objectiveId, user]);

    // Live participants — sync read from snapshot
    useEffect(() => {
        if (!objectiveId) return;
        const liveCol = collection(db, sessionType, objectiveId, 'live_session');
        const unsub = onSnapshot(liveCol, (snap) => {
            setRoomMembers(snap.docs.map(d => ({
                uid: d.id,
                full_name: d.data().full_name || 'Membre',
                avatar_style: d.data().avatar_style,
                avatar_url: d.data().avatar_url,
            })));
        });
        return () => unsub();
    }, [objectiveId]);

    // Shared resources
    useEffect(() => {
        if (!objectiveId) return;
        const unsub = onSnapshot(collection(db, sessionType, objectiveId, 'session_resources'), snap => {
            setResources(snap.docs.map(d => ({
                id: d.id,
                title: d.data().title || '',
                url: d.data().url || '',
                added_by: d.data().added_by || '',
                added_by_name: d.data().added_by_name || 'Membre',
            })));
        });
        return () => unsub();
    }, [objectiveId]);

    const addResource = async () => {
        if (!objectiveId || !user) return;
        const addedByName = (user as any).displayName || user.email?.split('@')[0] || 'Membre';

        if (resType === 'file') {
            if (!resFile) return;
            setResUploading(true);
            setResUploadProgress(0);
            try {
                const storageRef = ref(storage, `objectives/${objectiveId}/session_resources/${user.uid}_${Date.now()}_${resFile.name}`);
                const task = uploadBytesResumable(storageRef, resFile);
                await new Promise<void>((resolve, reject) => {
                    task.on('state_changed',
                        snap => setResUploadProgress(Math.round(snap.bytesTransferred / snap.totalBytes * 100)),
                        reject,
                        async () => {
                            const url = await getDownloadURL(task.snapshot.ref);
                            await addDoc(collection(db, sessionType, objectiveId, 'session_resources'), {
                                title: resTitle.trim() || resFile.name,
                                url,
                                type: 'file',
                                file_name: resFile.name,
                                file_size: resFile.size,
                                storage_path: task.snapshot.ref.fullPath,
                                added_by: user.uid,
                                added_by_name: addedByName,
                                added_at: serverTimestamp(),
                            });
                            resolve();
                        }
                    );
                });
            } finally {
                setResUploading(false);
                setResUploadProgress(0);
            }
        } else {
            if (!resTitle.trim()) return;
            const url = resUrl.trim();
            const normalized = url && !/^https?:\/\//i.test(url) ? `https://${url}` : url;
            await addDoc(collection(db, sessionType, objectiveId, 'session_resources'), {
                title: resTitle.trim(),
                url: normalized,
                type: 'link',
                added_by: user.uid,
                added_by_name: addedByName,
                added_at: serverTimestamp(),
            });
        }
        setResTitle(''); setResUrl(''); setResFile(null); setShowAddResource(false);
    };

    const deleteResource = async (id: string, storagePath?: string) => {
        if (!objectiveId) return;
        if (storagePath) {
            try { await deleteObject(ref(storage, storagePath)); } catch { /* already deleted */ }
        }
        deleteDoc(doc(db, sessionType, objectiveId, 'session_resources', id));
    };

    // ─── ZegoCloud — uses persistent containerRef from context ─────────────────
    useEffect(() => {
        // Wait until activateSession has been called so the container is visible (not display:none)
        if (!user || !objectiveId || !sessionInfo || !containerRef.current) return;
        if (zpRef.current) return; // already joined

        const appID = parseInt(process.env.NEXT_PUBLIC_ZEGO_APP_ID || '0');
        const serverSecret = process.env.NEXT_PUBLIC_ZEGO_SERVER_SECRET || '';
        if (!appID || !serverSecret || serverSecret === 'REMPLACE_PAR_TON_SERVER_SECRET') return;

        let cancelled = false;

        // Delay until after the browser paints the container (it was display:none before sessionInfo was set)
        const rafId = requestAnimationFrame(() => {
            if (cancelled || !containerRef.current) return;

            (async () => {
                try {
                    const { ZegoUIKitPrebuilt } = await import('@zegocloud/zego-uikit-prebuilt');
                    if (cancelled || zpRef.current) return;

                    const userName = (user as any).full_name || user.displayName || user.email?.split('@')[0] || 'Membre';
                    const kitToken = ZegoUIKitPrebuilt.generateKitTokenForTest(appID, serverSecret, objectiveId, user.uid, userName);
                    const zp = ZegoUIKitPrebuilt.create(kitToken);
                    if (cancelled) { try { zp.destroy(); } catch { /* ignore */ } return; }

                    zpRef.current = zp;

                    // Auto-enable working state when entering coworking
                    if (user && objectiveId) {
                        const presRef = doc(db, sessionType, objectiveId, 'presence', user.uid);
                        getDoc(doc(db, 'users', user.uid)).then(uSnap => {
                            const ud = uSnap.exists() ? uSnap.data() : {};
                            setDoc(presRef, {
                                user_id: user.uid,
                                is_working: true,
                                started_at: serverTimestamp(),
                                last_seen: serverTimestamp(),
                                full_name: ud.full_name || user.displayName || user.email?.split('@')[0] || 'Membre',
                            }, { merge: true });
                        });
                        // Heartbeat every 30s to keep presence alive
                        presenceHeartbeatRef.current = setInterval(() => {
                            setDoc(presRef, { last_seen: serverTimestamp() }, { merge: true });
                        }, 30_000);
                    }

                    zp.joinRoom({
                        container: containerRef.current,
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
                        onLeaveRoom: () => {
                            // Stop presence heartbeat before endSession cleans up
                            if (presenceHeartbeatRef.current) {
                                clearInterval(presenceHeartbeatRef.current);
                                presenceHeartbeatRef.current = null;
                            }
                            // endSession handles: hours increment, presence reset, live_session delete, ZP destroy
                            endSession();
                            router.push(objectiveId ? `/${targetRouteType}/${objectiveId}` : '/dashboard');
                        },
                    });
                } catch (e) { console.error('[ZegoCloud] init error', e); }
            })();
        }); // end requestAnimationFrame

        return () => {
            cancelled = true;
            cancelAnimationFrame(rafId);
            if (presenceHeartbeatRef.current) {
                clearInterval(presenceHeartbeatRef.current);
                presenceHeartbeatRef.current = null;
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user, objectiveId, sessionInfo]);

    // Timer tick is now handled centrally in LiveSessionProvider


    const switchMode = (i: number) => {
        setModeIdx(i);
    };
    const resetTimer = () => {
        if (modeIdx === activeModeIdx) {
            setTimeLeft(MODES[modeIdx].seconds);
            setRunning(false);
        }
    };

    const toggleTimer = () => {
        if (modeIdx === activeModeIdx) {
            setRunning(r => !r);
        } else {
            // Start a new timer in a different tab
            setActiveModeIdx(modeIdx);
            setTimeLeft(MODES[modeIdx].seconds);
            setRunning(true);
        }
    };

    const applyDurations = () => {
        const clamped = draftDurations.map(v => Math.max(1, Math.min(180, v)));
        setDurations(clamped);
        setDraftDurations(clamped);

        // If timer is NOT running, apply new time immediately (if viewing active)
        if (!running && modeIdx === activeModeIdx) {
            setTimeLeft(clamped[modeIdx] * 60);
        }
        setShowTimerSettings(false);
    };

    const handleLeave = () => {
        endSession();
        router.push(objectiveId ? `/${targetRouteType}/${objectiveId}` : '/dashboard');
    };

    const confirmLeave = () => setShowLeaveConfirm(true);

    const openLink = (href: string) => { router.push(href); setNavOpen(false); };

    if (loading || !user) return null;

    return (
        <>
            <style>{`
                @keyframes slideInLeft {
                    from { transform: translateX(-100%); }
                    to   { transform: translateX(0); }
                }
                @keyframes fadeOverlay {
                    from { opacity: 0; }
                    to   { opacity: 1; }
                }
                @keyframes scaleIn {
                    from { transform: translate(-50%, -50%) scale(0.92); opacity: 0; }
                    to   { transform: translate(-50%, -50%) scale(1);    opacity: 1; }
                }
                /* ── Override ZegoCloud's native Leave dialog ── */
                .zp-confirm-dialog-bg, [class*="confirmDialog"], [class*="leaveDialog"] {
                    background: rgba(0,0,0,0.7) !important;
                    backdrop-filter: blur(8px) !important;
                }
                .zp-confirm-dialog, [class*="confirmDialogContent"] {
                    background: #18181b !important;
                    border: 1px solid rgba(255,255,255,0.08) !important;
                    border-radius: 16px !important;
                    box-shadow: 0 24px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(99,102,241,0.1) !important;
                    color: #e4e4e7 !important;
                    padding: 28px !important;
                    font-family: Inter, -apple-system, BlinkMacSystemFont, sans-serif !important;
                }
                .zp-confirm-dialog h4, .zp-confirm-dialog h3,
                [class*="confirmDialogContent"] h4, [class*="confirmDialogContent"] h3 {
                    color: #f4f4f5 !important;
                    font-size: 1.05rem !important;
                    font-weight: 700 !important;
                }
                .zp-confirm-dialog p, [class*="confirmDialogContent"] p {
                    color: #71717a !important;
                    font-size: 0.875rem !important;
                }
                .zp-confirm-dialog button, [class*="confirmDialogContent"] button {
                    border-radius: 10px !important;
                    font-weight: 600 !important;
                    font-size: 0.85rem !important;
                    padding: 9px 20px !important;
                    border: none !important;
                    cursor: pointer !important;
                    transition: opacity 0.15s !important;
                }
                .zp-confirm-dialog button:first-of-type, [class*="confirmDialogContent"] button:first-of-type {
                    background: transparent !important;
                    color: #a1a1aa !important;
                    border: 1px solid rgba(255,255,255,0.1) !important;
                }
                .zp-confirm-dialog button:last-of-type, [class*="confirmDialogContent"] button:last-of-type {
                    background: linear-gradient(135deg, #ef4444, #dc2626) !important;
                    color: #fff !important;
                    box-shadow: 0 4px 14px rgba(239,68,68,0.35) !important;
                }
            `}</style>

            {/*
             * Full-screen layout from top.
             * marginTop: calc(-6.5rem) cancels global <main> paddingTop.
             * The video (left area) is rendered by LiveSessionOverlay (position:fixed).
             * This page only renders the sidebar + floating top bar.
             */}
            <div style={{
                height: '100vh',
                marginTop: 'calc(-6.5rem)',
                display: 'flex',
                overflow: 'hidden',
                fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
            }}>
                {/* ── Collaborative whiteboard overlay ── */}
                {showWhiteboard && objectiveId && (
                    <CollabWhiteboard
                        boardPath={`objectives/${objectiveId}/whiteboard/board`}
                        onClose={() => setShowWhiteboard(false)}
                    />
                )}

                {/* ── Left area placeholder (video is in LiveSessionOverlay, position:fixed) ── */}
                <div style={{ flex: 1, position: 'relative', zIndex: 5, pointerEvents: 'none' }}>
                    {/* Floating top bar over the video */}
                    <div style={{
                        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '12px 16px',
                        background: 'linear-gradient(to bottom, rgba(0,0,0,0.7) 0%, transparent 100%)',
                        pointerEvents: 'none',
                    }}>
                        {/* Menu button */}
                        <button
                            onClick={() => setNavOpen(true)}
                            style={{
                                width: 36, height: 36, borderRadius: 10,
                                background: 'rgba(18,18,22,0.75)', backdropFilter: 'blur(10px)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                color: '#e4e4e7', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                cursor: 'pointer', pointerEvents: 'auto', flexShrink: 0, transition: 'background 0.2s',
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
                            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#e4e4e7', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {objectiveTitle || 'Session focus'}
                            </span>
                            {roomMembers.length > 0 && (
                                <span style={{ fontSize: '0.65rem', color: '#71717a', flexShrink: 0 }}>
                                    · {roomMembers.length} connecté{roomMembers.length > 1 ? 's' : ''}
                                </span>
                            )}
                        </div>

                        {/* Right button group */}
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

                            {/* Back to salon (keeps session as mini-player) */}
                            {objectiveId && (
                                <button
                                    onClick={() => router.push(`/${targetRouteType}/${objectiveId}`)}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 6,
                                        background: 'rgba(18,18,22,0.75)', backdropFilter: 'blur(10px)',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        borderRadius: 10, padding: '7px 14px',
                                        color: '#a1a1aa', fontSize: '0.75rem', fontWeight: 600,
                                        cursor: 'pointer', transition: 'background 0.2s',
                                    }}
                                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(40,40,50,0.9)')}
                                    onMouseLeave={e => (e.currentTarget.style.background = 'rgba(18,18,22,0.75)')}
                                >
                                    <LayoutDashboard size={13} /> Retour au salon
                                </button>
                            )}
                            {/* Leave / end session */}
                            <button
                                onClick={confirmLeave}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 6,
                                    background: 'rgba(239,68,68,0.15)', backdropFilter: 'blur(10px)',
                                    border: '1px solid rgba(239,68,68,0.3)',
                                    borderRadius: 10, padding: '7px 14px',
                                    color: '#fca5a5', fontSize: '0.75rem', fontWeight: 600,
                                    cursor: 'pointer', transition: 'background 0.2s',
                                }}
                                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.28)')}
                                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.15)')}
                            >
                                <PhoneOff size={13} /> Quitter
                            </button>
                        </div>
                    </div>
                </div>

                {/* ── Right sidebar ────────────────────────────────────────────── */}
                <div style={{
                    width: 272, flexShrink: 0,
                    borderLeft: '1px solid rgba(255,255,255,0.06)',
                    background: '#121214',
                    display: 'flex', flexDirection: 'column',
                    overflow: 'hidden', zIndex: 5,
                }}>
                    <div style={{ flex: 1, overflowY: 'auto', padding: '18px 14px', display: 'flex', flexDirection: 'column', gap: 18 }}>

                        {/* Session Focus label */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, marginBottom: 20 }}>
                            <span style={{ fontSize: '0.58rem', fontWeight: 700, color: '#52525b', textTransform: 'uppercase', letterSpacing: '0.12em' }}>Session Focus</span>
                        </div>

                        {/* Mode tabs + settings toggle */}
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                            <div style={{ flex: 1, display: 'flex', gap: 3, background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 3, border: '1px solid rgba(255,255,255,0.05)' }}>
                                {MODES.map((m, i) => (
                                    <button key={m.label} onClick={() => switchMode(i)} style={{
                                        flex: 1, padding: '5px 2px', borderRadius: 7, border: 'none',
                                        background: modeIdx === i ? m.color : 'transparent',
                                        color: modeIdx === i ? '#fff' : '#71717a',
                                        fontSize: '0.67rem', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s',
                                        boxShadow: modeIdx === i ? `0 0 10px ${m.color}44` : 'none',
                                    }}>
                                        {m.label}
                                    </button>
                                ))}
                            </div>
                            <button
                                onClick={() => { setShowTimerSettings(s => !s); setDraftDurations(durations); }}
                                title="Personnaliser les durées"
                                style={{
                                    width: 28, height: 28, borderRadius: 8, border: '1px solid rgba(255,255,255,0.07)',
                                    background: showTimerSettings ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.03)',
                                    color: showTimerSettings ? '#818cf8' : '#52525b',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
                                }}
                            >
                                <Settings2 size={13} />
                            </button>
                        </div>

                        {/* Timer settings panel */}
                        {showTimerSettings && (
                            <div style={{ background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 10, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                                <span style={{ fontSize: '0.6rem', fontWeight: 700, color: '#52525b', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Durées (minutes)</span>
                                {MODE_META.map((m, i) => (
                                    <div key={m.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                                        <span style={{ fontSize: '0.65rem', color: m.color, fontWeight: 700, width: 40, flexShrink: 0 }}>{m.label}</span>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                            <button onClick={() => setDraftDurations(d => d.map((v, j) => j === i ? Math.max(1, v - 1) : v))}
                                                style={{ width: 24, height: 24, borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: '#a1a1aa', cursor: 'pointer', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>−</button>
                                            <input
                                                type="text"
                                                inputMode="numeric"
                                                value={draftDurations[i]}
                                                onChange={e => {
                                                    const raw = e.target.value.replace(/\D/g, '');
                                                    if (raw === '') return;
                                                    const n = Math.min(180, Math.max(1, parseInt(raw)));
                                                    setDraftDurations(d => d.map((v, j) => j === i ? n : v));
                                                }}
                                                style={{ width: 44, textAlign: 'center', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.13)', borderRadius: 6, color: '#f8f9fa', fontSize: '0.88rem', fontWeight: 700, padding: '4px 2px', outline: 'none' }}
                                            />
                                            <button onClick={() => setDraftDurations(d => d.map((v, j) => j === i ? Math.min(180, v + 1) : v))}
                                                style={{ width: 24, height: 24, borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: '#a1a1aa', cursor: 'pointer', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>+</button>
                                        </div>
                                    </div>
                                ))}
                                <button onClick={applyDurations} style={{ marginTop: 2, padding: '5px', borderRadius: 7, border: 'none', background: 'rgba(99,102,241,0.3)', color: '#a5b4fc', fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer' }}>
                                    ✓ Appliquer
                                </button>
                            </div>
                        )}

                        {/* Timer */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
                            <style>{`
                                @keyframes pulse-ring {
                                    0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.7); }
                                    50% { transform: scale(1.05); box-shadow: 0 0 0 15px rgba(99, 102, 241, 0); }
                                    100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(99, 102, 241, 0); }
                                }
                            `}</style>
                            {/* Compute display values based on active mode */}
                            <div style={{ animation: showAnim ? 'pulse-ring 1s ease-out 3' : 'none', borderRadius: '50%' }}>
                                <CircleTimer
                                    timeLeft={modeIdx === activeModeIdx ? timeLeft : MODES[modeIdx].seconds}
                                    total={MODES[modeIdx].seconds}
                                    color={MODES[modeIdx].color}
                                    running={modeIdx === activeModeIdx ? running : false}
                                />
                            </div>
                            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                                <button onClick={resetTimer} style={{
                                    width: 34, height: 34, borderRadius: '50%',
                                    border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.03)',
                                    color: '#71717a', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    cursor: 'pointer', transition: 'background 0.2s',
                                }}
                                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
                                    onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}>
                                    <RotateCcw size={13} />
                                </button>
                                <button onClick={toggleTimer} style={{
                                    width: 46, height: 46, borderRadius: '50%', border: 'none',
                                    background: `linear-gradient(135deg, ${mode.color}, ${mode.color}cc)`,
                                    color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    cursor: 'pointer', boxShadow: `0 0 20px ${mode.color}55`, transition: 'transform 0.15s',
                                }}
                                    onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.07)'; }}
                                    onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}>
                                    {(modeIdx === activeModeIdx && running) ? <Pause size={17} style={{ fill: '#fff' }} /> : <Play size={17} style={{ fill: '#fff', marginLeft: 2 }} />}
                                </button>
                            </div>
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

                        {/* Participants */}
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                                <span style={{ fontSize: '0.58rem', fontWeight: 700, color: '#52525b', textTransform: 'uppercase', letterSpacing: '0.12em' }}>Dans la salle</span>
                                <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#6366f1', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 6, padding: '1px 7px' }}>
                                    {roomMembers.length}
                                </span>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {roomMembers.map(m => (
                                    <div key={m.uid} style={{
                                        display: 'flex', alignItems: 'center', gap: 9,
                                        padding: '8px 10px', borderRadius: 10,
                                        background: m.uid === user.uid ? 'rgba(99,102,241,0.08)' : 'rgba(255,255,255,0.025)',
                                        border: m.uid === user.uid ? '1px solid rgba(99,102,241,0.18)' : '1px solid rgba(255,255,255,0.05)',
                                    }}>
                                        <div style={{ position: 'relative', flexShrink: 0 }}>
                                            <Avatar uid={m.uid} avatarStyle={m.avatar_style} avatarUrl={m.avatar_url} size={28} />
                                            <span style={{ position: 'absolute', bottom: 0, right: 0, width: 8, height: 8, borderRadius: '50%', background: '#10b981', border: '1.5px solid #121214', boxShadow: '0 0 5px rgba(16,185,129,0.7)' }} />
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: '0.78rem', fontWeight: 600, color: m.uid === user.uid ? '#c7d2fe' : '#e4e4e7', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {m.full_name || 'Membre'}
                                                {m.uid === user.uid && <span style={{ fontSize: '0.6rem', color: '#6366f1', marginLeft: 5 }}>vous</span>}
                                            </div>
                                            <div style={{ fontSize: '0.6rem', color: '#10b981', fontWeight: 500, marginTop: 1 }}>● En ligne</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div style={{ height: 1, background: 'rgba(255,255,255,0.05)' }} />

                        {/* Resources */}
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <Link2 size={12} style={{ color: '#6366f1' }} />
                                    <span style={{ fontSize: '0.58rem', fontWeight: 700, color: '#52525b', textTransform: 'uppercase', letterSpacing: '0.12em' }}>Ressources</span>
                                </div>
                                <button
                                    onClick={() => setShowAddResource(v => !v)}
                                    title="Ajouter une ressource"
                                    style={{
                                        width: 22, height: 22, borderRadius: 7, border: '1px solid rgba(99,102,241,0.25)',
                                        background: showAddResource ? 'rgba(99,102,241,0.2)' : 'rgba(99,102,241,0.08)',
                                        color: '#818cf8', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        cursor: 'pointer', transition: 'background 0.15s',
                                    }}
                                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(99,102,241,0.25)')}
                                    onMouseLeave={e => (e.currentTarget.style.background = showAddResource ? 'rgba(99,102,241,0.2)' : 'rgba(99,102,241,0.08)')}
                                >
                                    <Plus size={11} />
                                </button>
                            </div>

                            {/* Add resource form */}
                            {showAddResource && (
                                <div style={{ marginBottom: 10, padding: '10px', background: 'rgba(99,102,241,0.05)', borderRadius: 10, border: '1px solid rgba(99,102,241,0.12)', display: 'flex', flexDirection: 'column', gap: 7 }}>
                                    {/* Type toggle */}
                                    <div style={{ display: 'flex', gap: 4, background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 3 }}>
                                        {(['link', 'file'] as const).map(t => (
                                            <button key={t} onClick={() => { setResType(t); setResTitle(''); setResUrl(''); setResFile(null); }} style={{
                                                flex: 1, padding: '5px 0', borderRadius: 6, border: 'none', fontSize: '0.67rem', fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s',
                                                background: resType === t ? 'rgba(99,102,241,0.35)' : 'transparent',
                                                color: resType === t ? '#c7d2fe' : '#52525b',
                                            }}>
                                                {t === 'link' ? '🔗 Lien' : '📁 Fichier'}
                                            </button>
                                        ))}
                                    </div>

                                    {resType === 'link' ? (
                                        <>
                                            <input placeholder="Titre *" value={resTitle} onChange={e => setResTitle(e.target.value)}
                                                style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '7px 9px', color: '#e4e4e7', fontSize: '0.73rem', outline: 'none', fontFamily: 'inherit' }}
                                                onFocus={e => (e.currentTarget.style.borderColor = 'rgba(99,102,241,0.4)')}
                                                onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)')} />
                                            <input placeholder="URL (optionnel)" value={resUrl} onChange={e => setResUrl(e.target.value)}
                                                style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '7px 9px', color: '#e4e4e7', fontSize: '0.73rem', outline: 'none', fontFamily: 'inherit' }}
                                                onFocus={e => (e.currentTarget.style.borderColor = 'rgba(99,102,241,0.4)')}
                                                onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)')}
                                                onKeyDown={e => { if (e.key === 'Enter') addResource(); }} />
                                        </>
                                    ) : (
                                        <>
                                            <label style={{
                                                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5,
                                                padding: '12px 8px', borderRadius: 8, border: `1px dashed ${resFile ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.12)'}`,
                                                background: resFile ? 'rgba(99,102,241,0.07)' : 'rgba(255,255,255,0.02)',
                                                cursor: 'pointer', transition: 'all 0.15s',
                                            }}>
                                                <Upload size={14} style={{ color: resFile ? '#818cf8' : '#52525b' }} />
                                                <span style={{ fontSize: '0.68rem', color: resFile ? '#c7d2fe' : '#52525b', textAlign: 'center', wordBreak: 'break-all' }}>
                                                    {resFile ? resFile.name : 'Cliquer pour choisir un fichier'}
                                                </span>
                                                <input type="file" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) { setResFile(f); if (!resTitle) setResTitle(f.name); } }} />
                                            </label>
                                            <input placeholder="Titre (optionnel)" value={resTitle} onChange={e => setResTitle(e.target.value)}
                                                style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '7px 9px', color: '#e4e4e7', fontSize: '0.73rem', outline: 'none', fontFamily: 'inherit' }}
                                                onFocus={e => (e.currentTarget.style.borderColor = 'rgba(99,102,241,0.4)')}
                                                onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)')} />
                                        </>
                                    )}

                                    {/* Upload progress */}
                                    {resUploading && (
                                        <div style={{ height: 4, borderRadius: 4, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                                            <div style={{ height: '100%', borderRadius: 4, background: 'linear-gradient(90deg, #6366f1, #818cf8)', width: `${resUploadProgress}%`, transition: 'width 0.2s' }} />
                                        </div>
                                    )}

                                    <div style={{ display: 'flex', gap: 6 }}>
                                        <button onClick={() => { setShowAddResource(false); setResTitle(''); setResUrl(''); setResFile(null); setResType('link'); }} style={{
                                            flex: 1, padding: '6px 0', borderRadius: 7, border: '1px solid rgba(255,255,255,0.08)',
                                            background: 'transparent', color: '#71717a', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer',
                                        }}>Annuler</button>
                                        <button onClick={addResource} disabled={resUploading || (resType === 'link' ? !resTitle.trim() : !resFile)} style={{
                                            flex: 1, padding: '6px 0', borderRadius: 7, border: 'none',
                                            background: (!resUploading && (resType === 'link' ? resTitle.trim() : resFile)) ? 'linear-gradient(135deg, #6366f1, #4f46e5)' : 'rgba(99,102,241,0.2)',
                                            color: (!resUploading && (resType === 'link' ? resTitle.trim() : resFile)) ? '#fff' : '#52525b',
                                            fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', transition: 'opacity 0.15s',
                                        }}>{resUploading ? `${resUploadProgress}%` : 'Ajouter'}</button>
                                    </div>
                                </div>
                            )}

                            {/* Resource list */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {resources.length === 0 && (
                                    <div style={{ padding: '10px', textAlign: 'center', color: '#3f3f46', fontSize: '0.68rem' }}>
                                        Aucune ressource partagée
                                    </div>
                                )}
                                {resources.map(r => {
                                    const isFile = r.type === 'file';
                                    return (
                                        <div key={r.id} style={{
                                            display: 'flex', alignItems: 'center', gap: 9,
                                            padding: '9px 11px', borderRadius: 12,
                                            background: 'rgba(255,255,255,0.02)',
                                            border: '1px solid rgba(255,255,255,0.06)',
                                            backdropFilter: 'blur(10px)',
                                            transition: 'all 0.2s ease',
                                        }}>
                                            <div style={{
                                                width: 32, height: 32, borderRadius: 10,
                                                background: isFile ? 'rgba(16,185,129,0.1)' : 'rgba(99,102,241,0.1)',
                                                border: `1px solid ${isFile ? 'rgba(16,185,129,0.15)' : 'rgba(99,102,241,0.15)'}`,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                flexShrink: 0,
                                                boxShadow: isFile ? '0 0 15px rgba(16,185,129,0.05)' : '0 0 15px rgba(99,102,241,0.05)'
                                            }}>
                                                {isFile ? <FileText size={16} style={{ color: '#34d399' }} /> : <ExternalLink size={16} style={{ color: '#818cf8' }} />}
                                            </div>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#f4f4f5', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</div>
                                                <div style={{ fontSize: '0.65rem', color: '#71717a', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                                                    <span style={{ width: 3, height: 3, borderRadius: '50%', background: '#ff0080' }}></span>
                                                    par {r.added_by_name}
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', gap: 6 }}>
                                                {r.url && (
                                                    <a href={r.url} target="_blank" rel="noopener noreferrer" title={isFile ? 'Télécharger' : 'Ouvrir'} style={{
                                                        width: 24, height: 24, borderRadius: 8, flexShrink: 0,
                                                        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                                                        color: '#f4f4f5', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        textDecoration: 'none', transition: 'all 0.15s',
                                                    }}
                                                        onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(99,102,241,0.2)'; (e.currentTarget as HTMLAnchorElement).style.borderColor = 'rgba(99,102,241,0.3)'; }}
                                                        onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(255,255,255,0.04)'; (e.currentTarget as HTMLAnchorElement).style.borderColor = 'rgba(255,255,255,0.08)'; }}>
                                                        {isFile ? <Download size={13} /> : <ExternalLink size={13} />}
                                                    </a>
                                                )}
                                                {r.added_by === user.uid && (
                                                    <button onClick={() => deleteResource(r.id, (r as any).storage_path)} title="Supprimer" style={{
                                                        width: 24, height: 24, borderRadius: 8, flexShrink: 0,
                                                        background: 'transparent', border: '1px solid transparent',
                                                        color: '#52525b', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        cursor: 'pointer', transition: 'all 0.15s',
                                                    }}
                                                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.12)'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.2)'; e.currentTarget.style.color = '#fca5a5'; }}
                                                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.color = '#52525b'; }}>
                                                        <Trash2 size={13} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {/* Bottom tip */}
                    <div style={{ flexShrink: 0, margin: '0 14px 14px', padding: '9px 12px', background: 'rgba(99,102,241,0.05)', borderRadius: 10, border: '1px solid rgba(99,102,241,0.1)' }}>
                        <p style={{ fontSize: '0.65rem', color: '#6366f1', margin: 0, lineHeight: 1.5, opacity: 0.8 }}>
                            💡 25 min focus · 5 min pause · ×4 → longue pause
                        </p>
                    </div>
                </div>
            </div>

            {/* ── Left nav drawer ─────────────────────────────────────────────── */}
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

                        {/* Session badge */}
                        <div style={{ padding: '12px 14px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 10, background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.15)' }}>
                                <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#10b981', flexShrink: 0, boxShadow: '0 0 6px rgba(16,185,129,0.6)' }} />
                                <div style={{ minWidth: 0 }}>
                                    <div style={{ fontSize: '0.6rem', color: '#10b981', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Salle active</div>
                                    <div style={{ fontSize: '0.77rem', color: '#d1fae5', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{objectiveTitle || 'Session focus'}</div>
                                </div>
                            </div>
                        </div>

                        {/* Nav links — same tab, session stays alive via LiveSessionContext */}
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

                        {/* Quit */}
                        <div style={{ padding: '12px 14px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                            <button onClick={confirmLeave} style={{
                                width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                                padding: '10px 14px', borderRadius: 10,
                                background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.15)',
                                color: '#ef4444', fontSize: '0.83rem', fontWeight: 600, cursor: 'pointer', transition: 'background 0.2s',
                            }}
                                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.14)')}
                                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.07)')}>
                                <PhoneOff size={15} /> Quitter la salle
                            </button>
                        </div>
                    </div>
                </>
            )}

            {/* ── Custom leave confirmation modal ─────────────────────────── */}
            {showLeaveConfirm && (
                <>
                    <div
                        onClick={() => setShowLeaveConfirm(false)}
                        style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)', animation: 'fadeOverlay 0.18s ease' }}
                    />
                    <div style={{
                        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
                        zIndex: 101, width: 340,
                        background: '#18181b',
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: 18,
                        boxShadow: '0 32px 72px rgba(0,0,0,0.8), 0 0 0 1px rgba(99,102,241,0.12)',
                        padding: '28px 28px 24px',
                        animation: 'scaleIn 0.2s cubic-bezier(0.16,1,0.3,1)',
                        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
                    }}>
                        {/* Icon */}
                        <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                            <PhoneOff size={20} style={{ color: '#ef4444' }} />
                        </div>
                        {/* Title */}
                        <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#f4f4f5', marginBottom: 8 }}>
                            Quitter la salle ?
                        </div>
                        {/* Subtitle */}
                        <div style={{ fontSize: '0.85rem', color: '#71717a', lineHeight: 1.55, marginBottom: 24 }}>
                            Tu vas quitter la session de coworking. Tu pourras rejoindre à nouveau depuis la page de l&apos;objectif.
                        </div>
                        {/* Buttons */}
                        <div style={{ display: 'flex', gap: 10 }}>
                            <button
                                onClick={() => setShowLeaveConfirm(false)}
                                style={{
                                    flex: 1, padding: '10px 0', borderRadius: 10,
                                    background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
                                    color: '#a1a1aa', fontSize: '0.85rem', fontWeight: 600,
                                    cursor: 'pointer', transition: 'background 0.15s, color 0.15s',
                                }}
                                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = '#e4e4e7'; }}
                                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#a1a1aa'; }}
                            >
                                Annuler
                            </button>
                            <button
                                onClick={handleLeave}
                                style={{
                                    flex: 1, padding: '10px 0', borderRadius: 10,
                                    background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                                    border: 'none',
                                    color: '#fff', fontSize: '0.85rem', fontWeight: 700,
                                    cursor: 'pointer',
                                    boxShadow: '0 4px 16px rgba(239,68,68,0.4)',
                                    transition: 'opacity 0.15s, transform 0.15s',
                                }}
                                onMouseEnter={e => { e.currentTarget.style.opacity = '0.88'; e.currentTarget.style.transform = 'scale(1.02)'; }}
                                onMouseLeave={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'scale(1)'; }}
                            >
                                Quitter
                            </button>
                        </div>
                    </div>
                </>
            )}
        </>
    );
}

export default function SessionPageWrapper() {
    return (
        <Suspense fallback={<div style={{ height: '100vh', background: '#09090b' }} />}>
            <SessionPage />
        </Suspense>
    );
}
