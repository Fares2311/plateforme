'use client';

import { useLiveSession } from '@/context/LiveSessionContext';
import { usePathname, useRouter } from 'next/navigation';
import { PhoneOff, Maximize2, Timer } from 'lucide-react';
import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import Avatar from '@/components/Avatar';

const SIDEBAR_W = 272;

export default function LiveSessionOverlay() {
    const { sessionInfo, containerRef, endSession, timeLeft, running, activeModeIdx, modeIdx, durations } = useLiveSession();
    const pathname = usePathname();
    const router = useRouter();

    const isOnSession = pathname?.startsWith('/session');
    const isMini = !!sessionInfo && !isOnSession;

    const [members, setMembers] = useState<{ uid: string; full_name: string; avatar_style: any; avatar_url: any }[]>([]);

    // Live participants for avatar display in mini mode
    useEffect(() => {
        if (!isMini || !sessionInfo?.objectiveId) { setMembers([]); return; }
        const unsub = onSnapshot(
            collection(db, 'objectives', sessionInfo.objectiveId, 'live_session'),
            snap => setMembers(snap.docs.map(d => ({
                uid: d.id,
                full_name: d.data().full_name || 'Membre',
                avatar_style: d.data().avatar_style ?? null,
                avatar_url: d.data().avatar_url ?? null,
            })))
        );
        return () => unsub();
    }, [isMini, sessionInfo?.objectiveId]);

    // ── containerRef: full-screen on session page, off-screen (audio alive) in mini ──
    const containerStyle: React.CSSProperties = !sessionInfo
        ? { display: 'none' }
        : isOnSession
            ? {
                position: 'fixed', top: 0, left: 0,
                right: SIDEBAR_W, bottom: 0,
                zIndex: 2, background: '#0d0d10', overflow: 'hidden',
            }
            : {
                // Off-screen but same size — ZegoCloud stays alive, audio continues
                position: 'fixed', top: 0, left: '-200vw',
                width: `calc(100vw - ${SIDEBAR_W}px)`, height: '100vh',
                overflow: 'hidden', pointerEvents: 'none', zIndex: -1,
            };

    // Max 3 avatars shown, rest shown as +N
    const visibleMembers = members.slice(0, 3);
    const extraCount = members.length - visibleMembers.length;

    // Timer display logic
    const hasStartedTimer = running || timeLeft < durations?.[activeModeIdx] * 60;
    const mm = Math.floor(timeLeft / 60).toString().padStart(2, '0');
    const ss = Math.floor(timeLeft % 60).toString().padStart(2, '0');

    return (
        <>
            {isMini && (
                <style>{`
                    @keyframes livePulse {
                        0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(239,68,68,0.5); }
                        50%       { opacity: 0.7; box-shadow: 0 0 0 4px rgba(239,68,68,0); }
                    }
                    @keyframes miniIn {
                        from { opacity: 0; transform: translateY(14px) scale(0.94); }
                        to   { opacity: 1; transform: translateY(0)     scale(1); }
                    }
                `}</style>
            )}

            {/* Persistent ZegoCloud container — always same DOM node */}
            <div ref={containerRef} style={containerStyle} />

            {/* Mini player card — avatar-based, no video */}
            {isMini && (
                <div
                    onClick={() => router.push(`/session?id=${sessionInfo.objectiveId}`)}
                    style={{
                        position: 'fixed', bottom: 20, right: 20,
                        width: 220,
                        zIndex: 9999,
                        background: 'linear-gradient(135deg, #141416 0%, #1a1a1f 100%)',
                        border: '1px solid rgba(99,102,241,0.25)',
                        borderRadius: 16,
                        boxShadow: '0 8px 32px rgba(0,0,0,0.65), 0 0 0 1px rgba(99,102,241,0.12)',
                        cursor: 'pointer',
                        overflow: 'hidden',
                        animation: 'miniIn 0.28s cubic-bezier(0.16,1,0.3,1)',
                        transition: 'box-shadow 0.2s, transform 0.2s, border-color 0.2s',
                        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
                    }}
                    onMouseEnter={e => {
                        e.currentTarget.style.boxShadow = '0 12px 40px rgba(0,0,0,0.8), 0 0 0 1px rgba(99,102,241,0.4)';
                        e.currentTarget.style.transform = 'translateY(-2px) scale(1.02)';
                        e.currentTarget.style.borderColor = 'rgba(99,102,241,0.45)';
                    }}
                    onMouseLeave={e => {
                        e.currentTarget.style.boxShadow = '0 8px 32px rgba(0,0,0,0.65), 0 0 0 1px rgba(99,102,241,0.12)';
                        e.currentTarget.style.transform = 'translateY(0) scale(1)';
                        e.currentTarget.style.borderColor = 'rgba(99,102,241,0.25)';
                    }}
                >
                    {/* Subtle top gradient accent */}
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(90deg, transparent, rgba(99,102,241,0.5), transparent)' }} />

                    <div style={{ padding: '12px 12px 10px' }}>
                        {/* Row 1: LIVE badge + leave */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{
                                    width: 7, height: 7, borderRadius: '50%', background: '#ef4444',
                                    display: 'inline-block', flexShrink: 0,
                                    animation: 'livePulse 1.6s ease-in-out infinite',
                                }} />
                                <span style={{ fontSize: '0.6rem', fontWeight: 800, color: '#fca5a5', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                                    Live
                                </span>
                                {members.length > 0 && (
                                    <span style={{ fontSize: '0.6rem', color: '#52525b', fontWeight: 500 }}>
                                        · {members.length} connecté{members.length > 1 ? 's' : ''}
                                    </span>
                                )}
                            </div>
                            <button
                                title="Quitter"
                                onClick={e => { e.stopPropagation(); endSession(); }}
                                style={{
                                    width: 22, height: 22, borderRadius: 7, flexShrink: 0,
                                    background: 'rgba(239,68,68,0.12)',
                                    border: '1px solid rgba(239,68,68,0.25)',
                                    color: '#fca5a5', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    cursor: 'pointer', transition: 'background 0.15s',
                                }}
                                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.3)')}
                                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.12)')}
                            >
                                <PhoneOff size={10} />
                            </button>
                        </div>

                        {/* Row 2: Overlapping avatars */}
                        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
                            <div style={{ display: 'flex', alignItems: 'center' }}>
                                {visibleMembers.map((m, i) => (
                                    <div key={m.uid} style={{
                                        marginLeft: i === 0 ? 0 : -8,
                                        zIndex: visibleMembers.length - i,
                                        borderRadius: '50%',
                                        border: '2px solid #141416',
                                        boxShadow: '0 0 0 1px rgba(99,102,241,0.2)',
                                        flexShrink: 0,
                                        overflow: 'hidden',
                                        width: 32, height: 32,
                                    }}>
                                        <Avatar uid={m.uid} avatarStyle={m.avatar_style} avatarUrl={m.avatar_url} size={32} />
                                    </div>
                                ))}
                                {extraCount > 0 && (
                                    <div style={{
                                        marginLeft: -8, zIndex: 0,
                                        width: 32, height: 32, borderRadius: '50%',
                                        background: 'rgba(99,102,241,0.15)',
                                        border: '2px solid #141416',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: '0.6rem', fontWeight: 700, color: '#818cf8', flexShrink: 0,
                                    }}>
                                        +{extraCount}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Row 3: Title + expand */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                            <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: '0.6rem', color: '#10b981', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 2 }}>
                                    Coworking
                                </div>
                                <div style={{ fontSize: '0.75rem', color: '#e4e4e7', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {sessionInfo.title || 'Session focus'}
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
                                title="Retourner à la salle"
                                onClick={e => { e.stopPropagation(); router.push(`/session?id=${sessionInfo.objectiveId}`); }}
                                style={{
                                    width: 28, height: 28, borderRadius: 9, flexShrink: 0,
                                    background: 'rgba(99,102,241,0.12)',
                                    border: '1px solid rgba(99,102,241,0.25)',
                                    color: '#818cf8', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    cursor: 'pointer', transition: 'background 0.15s',
                                }}
                                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(99,102,241,0.25)')}
                                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(99,102,241,0.12)')}
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
