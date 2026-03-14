'use client';

import { createContext, useContext, useRef, useState, ReactNode } from 'react';

export interface AccCallInfo {
    pairId: string;
    partnerName: string;
    partnerId: string;
    partnerAvatarUrl?: string | null;
    partnerAvatarStyle?: any;
}

interface AccCallCtx {
    callInfo: AccCallInfo | null;
    zpRef: React.MutableRefObject<any>;
    containerRef: React.RefObject<HTMLDivElement | null>;
    callMinimized: boolean;
    activateCall: (info: AccCallInfo) => void;
    endCall: () => void;
    minimizeCall: () => void;
    maximizeCall: () => void;
}

const Ctx = createContext<AccCallCtx>({} as AccCallCtx);

export function AccCallProvider({ children }: { children: ReactNode }) {
    const [callInfo, setCallInfo] = useState<AccCallInfo | null>(null);
    const [callMinimized, setCallMinimized] = useState(false);
    const zpRef = useRef<any>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const activateCall = (info: AccCallInfo) => {
        setCallMinimized(false);
        setCallInfo(info);
    };

    const endCall = () => {
        // Restore container before destroy to avoid ZegoCloud crash (same pattern as LiveSessionContext)
        if (containerRef.current) {
            const el = containerRef.current;
            el.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;visibility:hidden;pointer-events:none;z-index:-1;';
        }
        try { zpRef.current?.destroy(); } catch { /* ignore */ }
        zpRef.current = null;
        setCallInfo(null);
        setCallMinimized(false);
    };

    const minimizeCall = () => setCallMinimized(true);
    const maximizeCall = () => setCallMinimized(false);

    return (
        <Ctx.Provider value={{ callInfo, zpRef, containerRef, callMinimized, activateCall, endCall, minimizeCall, maximizeCall }}>
            {children}
        </Ctx.Provider>
    );
}

export const useAccCall = () => useContext(Ctx);
