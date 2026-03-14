'use client';

import { createContext, useContext, useRef, useState, useEffect, ReactNode } from 'react';
import { db, auth } from '@/lib/firebase';
import { doc, deleteDoc, setDoc, serverTimestamp, increment } from 'firebase/firestore';

export interface SessionInfo {
    objectiveId: string;
    title: string;
    type?: 'project' | 'objective';
}

interface LiveSessionCtx {
    sessionInfo: SessionInfo | null;
    zpRef: React.MutableRefObject<any>;
    containerRef: React.RefObject<HTMLDivElement | null>;
    activateSession: (info: SessionInfo) => void;
    endSession: () => void;

    // Timer state
    modeIdx: number; setModeIdx: (i: number) => void;
    durations: number[]; setDurations: (d: number[]) => void;
    activeModeIdx: number; setActiveModeIdx: (i: number) => void;
    timeLeft: number; setTimeLeft: (t: number) => void;
    running: boolean; setRunning: (r: boolean | ((r: boolean) => boolean)) => void;
    pomCount: number; setPomCount: (c: number | ((c: number) => number)) => void;
    showAnim: boolean; setShowAnim: (s: boolean) => void;
}

const Ctx = createContext<LiveSessionCtx>({} as LiveSessionCtx);

export function LiveSessionProvider({ children }: { children: ReactNode }) {
    const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null);
    const zpRef = useRef<any>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const joinedAtMsRef = useRef<number | null>(null);

    // Timer State
    const [modeIdx, setModeIdx] = useState(0);
    const [durations, setDurations] = useState([25, 5, 15]);
    const [activeModeIdx, setActiveModeIdx] = useState(0);
    const [timeLeft, setTimeLeft] = useState(25 * 60);
    const [running, setRunning] = useState(false);
    const [pomCount, setPomCount] = useState(0);
    const [showAnim, setShowAnim] = useState(false);

    // Timer tick loop
    useEffect(() => {
        if (!running || timeLeft <= 0) {
            if (timeLeft === 0 && running) {
                setRunning(false);
                if (activeModeIdx === 0) {
                    setPomCount(c => c + 1);
                    setShowAnim(true);
                    setTimeout(() => setShowAnim(false), 3000);
                }
                setTimeLeft(durations[activeModeIdx] * 60);
            }
            return;
        }
        const t = setTimeout(() => setTimeLeft(v => v - 1), 1000);
        return () => clearTimeout(t);
    }, [running, timeLeft, activeModeIdx, durations]);

    const activateSession = (info: SessionInfo) => {
        setSessionInfo(info);
        joinedAtMsRef.current = Date.now();
        try { localStorage.setItem('activeSession', JSON.stringify(info)); } catch { /* ignore */ }
    };

    const endSession = () => {
        const uid = auth.currentUser?.uid;
        const objId = sessionInfo?.objectiveId;

        if (uid && objId) {
            const collectionName = sessionInfo?.type === 'project' ? 'projects' : 'objectives';
            
            // Add elapsed coworking time to completed_hours (ignore very short sessions < 36s)
            if (joinedAtMsRef.current) {
                const elapsedHours = (Date.now() - joinedAtMsRef.current) / (1000 * 3600);
                if (elapsedHours > 0.01) {
                    try {
                        // Wait, membership mapping is different for projects/objectives, but we stick to existing behavior
                        setDoc(doc(db, sessionInfo?.type === 'project' ? 'project_memberships' : 'memberships', `${uid}_${objId}`),
                            { completed_hours: increment(elapsedHours) }, { merge: true });
                    } catch { /* ignore */ }
                }
                joinedAtMsRef.current = null;
            }
            // Reset working state
            try {
                setDoc(doc(db, collectionName, objId, 'presence', uid),
                    { is_working: false, started_at: null, last_seen: serverTimestamp() }, { merge: true });
            } catch { /* ignore */ }
            // Remove from live_session
            try { deleteDoc(doc(db, collectionName, objId, 'live_session', uid)); } catch { /* ignore */ }
        }

        // Restore container to a valid DOM position before ZegoCloud unmounts.
        // When in mini mode the container is off-screen (left: -200vw); calling
        // destroy() from that state causes ZegoCloud's internal logger to crash
        // with "Cannot read properties of null (reading 'createSpan')".
        if (containerRef.current) {
            const el = containerRef.current;
            el.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;visibility:hidden;pointer-events:none;z-index:-1;';
        }
        try { zpRef.current?.destroy(); } catch { /* ignore */ }
        zpRef.current = null;
        setSessionInfo(null);
        try { localStorage.removeItem('activeSession'); } catch { /* ignore */ }
    };

    return (
        <Ctx.Provider value={{
            sessionInfo, zpRef, containerRef, activateSession, endSession,
            modeIdx, setModeIdx, durations, setDurations,
            activeModeIdx, setActiveModeIdx, timeLeft, setTimeLeft,
            running, setRunning, pomCount, setPomCount,
            showAnim, setShowAnim
        }}>
            {children}
        </Ctx.Provider>
    );
}

export const useLiveSession = () => useContext(Ctx);
