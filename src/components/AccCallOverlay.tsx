'use client';

import { useAccCall } from '@/context/AccCallContext';
import { usePathname, useRouter } from 'next/navigation';
import { PhoneOff, Maximize2, Timer } from 'lucide-react';
import { useEffect, useState, useRef } from 'react';
import { db } from '@/lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import Avatar from '@/components/Avatar';

export const ACC_SIDEBAR_W = 272;

export default function AccCallOverlay() {
    const { callInfo, containerRef, endCall, callMinimized, maximizeCall } = useAccCall();
    const pathname = usePathname();
    const router = useRouter();

    // Full-screen only when on the pair page AND not minimized
    const isOnCallFull = !!callInfo && pathname?.startsWith(`/accountability/${callInfo.pairId}`) && !callMinimized;
    const isMini = !!callInfo && !isOnCallFull;

    const [liveDoc, setLiveDoc] = useState<any>(null);
    const [timerRemaining, setTimerRemaining] = useState(0);
    const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Fetch liveDoc for shared timer
    useEffect(() => {
        if (!isMini || !callInfo?.pairId) return;
        const liveRef = doc(db, 'accountability_pairs', callInfo.pairId, 'coworking', 'live');
        const unsub = onSnapshot(liveRef, snap => {
            setLiveDoc(snap.exists() ? snap.data() : null);
        });
        return () => unsub();
    }, [isMini, callInfo?.pairId]);

    // Timer tick computation
    useEffect(() => {
        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
        if (!liveDoc) return;

        const computeRemaining = () => {
            const base = liveDoc.timer_base_seconds ?? 0;
            const duration = liveDoc.timer_duration ?? (25 * 60);
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

    const hasStartedTimer = liveDoc?.timer_running || timerRemaining < (liveDoc?.timer_duration ?? (25 * 60));
    const mm = Math.floor(timerRemaining / 60).toString().padStart(2, '0');
    const ss = Math.floor(timerRemaining % 60).toString().padStart(2, '0');

    const containerStyle: React.CSSProperties = !callInfo
        ? { display: 'none' }
        : isOnCallFull
            ? {
                position: 'fixed', top: 0, left: 0,
                right: ACC_SIDEBAR_W, bottom: 0,
                zIndex: 2, background: '#0d0d10', overflow: 'hidden',
            }
            : {
                position: 'fixed', top: 0, left: '-200vw',
                width: `calc(100vw - ${ACC_SIDEBAR_W}px)`, height: '100vh',
                overflow: 'hidden', pointerEvents: 'none', zIndex: -1,
            };

    const handleMiniClick = () => {
        maximizeCall();
        router.push(`/accountability/${callInfo!.pairId}`);
    };

    return (
        <>
            {isMini && (
                <style>{`
                    @keyframes accLivePulse {
                        0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(239,68,68,0.5); }
                        50%       { opacity: 0.7; box-shadow: 0 0 0 4px rgba(239,68,68,0); }
                    }
                    @keyframes accMiniIn {
                        from { opacity: 0; transform: translateY(14px) scale(0.94); }
                        to   { opacity: 1; transform: translateY(0) scale(1); }
                    }
                `}</style>
            )}

            {/* Persistent ZegoCloud container — always same DOM node */}
            <div ref={containerRef} style={containerStyle} />

            {/* Mini player card — shown when navigated away or minimized */}
            {isMini && callInfo && (
                <div
                    onClick={handleMiniClick}
                    style={{
                        position: 'fixed', bottom: 20, right: 20,
                        width: 220, zIndex: 9999,
                        background: 'linear-gradient(135deg, #141416 0%, #1a1a1f 100%)',
                        border: '1px solid rgba(16,185,129,0.25)',
                        borderRadius: 16,
                        boxShadow: '0 8px 32px rgba(0,0,0,0.65), 0 0 0 1px rgba(16,185,129,0.12)',
                        cursor: 'pointer', overflow: 'hidden',
                        animation: 'accMiniIn 0.28s cubic-bezier(0.16,1,0.3,1)',
                        transition: 'box-shadow 0.2s, transform 0.2s, border-color 0.2s',
                        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
                    }}
                    onMouseEnter={e => {
                        e.currentTarget.style.boxShadow = '0 12px 40px rgba(0,0,0,0.8), 0 0 0 1px rgba(16,185,129,0.4)';
                        e.currentTarget.style.transform = 'translateY(-2px) scale(1.02)';
                        e.currentTarget.style.borderColor = 'rgba(16,185,129,0.45)';
                    }}
                    onMouseLeave={e => {
                        e.currentTarget.style.boxShadow = '0 8px 32px rgba(0,0,0,0.65), 0 0 0 1px rgba(16,185,129,0.12)';
                        e.currentTarget.style.transform = 'translateY(0) scale(1)';
                        e.currentTarget.style.borderColor = 'rgba(16,185,129,0.25)';
                    }}
                >
                    {/* Top gradient accent */}
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(90deg, transparent, rgba(16,185,129,0.5), transparent)' }} />

                    <div style={{ padding: '12px 12px 10px' }}>
                        {/* Row 1: LIVE badge + hang up */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#ef4444', display: 'inline-block', flexShrink: 0, animation: 'accLivePulse 1.6s ease-in-out infinite' }} />
                                <span style={{ fontSize: '0.6rem', fontWeight: 800, color: '#fca5a5', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                                    En appel
                                </span>
                            </div>
                            <button
                                title="Raccrocher"
                                onClick={e => { e.stopPropagation(); endCall(); }}
                                style={{ width: 22, height: 22, borderRadius: 7, flexShrink: 0, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)', color: '#fca5a5', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'background 0.15s' }}
                                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.3)')}
                                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.12)')}
                            >
                                <PhoneOff size={10} />
                            </button>
                        </div>

                        {/* Row 2: Partner avatar */}
                        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
                            <div style={{ borderRadius: '50%', border: '2px solid #141416', boxShadow: '0 0 0 1px rgba(16,185,129,0.2)', overflow: 'hidden', width: 32, height: 32, flexShrink: 0 }}>
                                <Avatar uid={callInfo.partnerId} avatarUrl={callInfo.partnerAvatarUrl ?? undefined} avatarStyle={callInfo.partnerAvatarStyle} size={32} />
                            </div>
                        </div>

                        {/* Row 3: Partner name + expand */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                            <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: '0.6rem', color: '#10b981', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 2 }}>
                                    Accountability
                                </div>
                                <div style={{ fontSize: '0.75rem', color: '#e4e4e7', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {callInfo.partnerName}
                                </div>
                            </div>

                            {hasStartedTimer && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(99,102,241,0.15)', padding: '3px 6px', borderRadius: 6, border: '1px solid rgba(99,102,241,0.3)' }}>
                                    <Timer size={10} color="#818cf8" />
                                    <span style={{ fontSize: '0.65rem', color: '#818cf8', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                                        {mm}:{ss}
                                    </span>
                                </div>
                            )}

                            <button
                                title="Agrandir l'appel"
                                onClick={e => { e.stopPropagation(); handleMiniClick(); }}
                                style={{ width: 28, height: 28, borderRadius: 9, flexShrink: 0, background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.25)', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'background 0.15s' }}
                                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(16,185,129,0.25)')}
                                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(16,185,129,0.12)')}
                            >
                                <Maximize2 size={11} />
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
