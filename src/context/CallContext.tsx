'use client';

import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, getDoc, addDoc, onSnapshot, updateDoc, setDoc, deleteDoc, Timestamp } from 'firebase/firestore';
import { useAuth } from './AuthContext';
import { Phone, Video, PhoneOff, Mic, MicOff, Camera, CameraOff, Maximize2, Minimize2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

export type CallState = 'idle' | 'calling' | 'ringing' | 'connected';

interface CallContextType {
    callState: CallState;
    isAudioOnly: boolean;
    localStream: MediaStream | null;
    remoteStream: MediaStream | null;
    micMuted: boolean;
    videoMuted: boolean;
    activeProfile: any | null;
    startCall: (receiverId: string, audioOnly: boolean) => Promise<void>;
    answerCall: () => Promise<void>;
    endCall: () => Promise<void>;
    toggleMic: () => void;
    toggleVideo: () => void;
}

const CallContext = createContext<CallContextType | undefined>(undefined);

const servers = {
    iceServers: [
        { urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] }
    ]
};

export const CallProvider = ({ children }: { children: ReactNode }) => {
    const { user } = useAuth();
    const router = useRouter();

    const [callState, setCallState] = useState<CallState>('idle');
    const callStateRef = useRef<CallState>('idle');
    const isCallerRef = useRef(false);
    const hasWrittenCallDoc = useRef(false);

    const [isAudioOnly, setIsAudioOnly] = useState(false);
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
    const [micMuted, setMicMuted] = useState(false);
    const [videoMuted, setVideoMuted] = useState(false);
    const [isFullScreen, setIsFullScreen] = useState(true);

    const [activeProfile, setActiveProfile] = useState<any | null>(null);
    const [currentCallId, setCurrentCallId] = useState<string | null>(null);

    const localVideoRef = useRef<HTMLVideoElement>(null);
    const remoteVideoRef = useRef<HTMLVideoElement>(null);
    const peerConnectionRef = useRef<RTCPeerConnection | null>(null);

    // Web Audio API refs — not controlled by media keys unlike HTMLAudioElement
    const audioCtxRef = useRef<AudioContext | null>(null);
    const stopToneRef = useRef<(() => void) | null>(null);

    const pendingCandidates = useRef<RTCIceCandidateInit[]>([]);

    const getAudioCtx = () => {
        if (!audioCtxRef.current) {
            audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        // Resume if suspended (browser autoplay policy)
        if (audioCtxRef.current.state === 'suspended') {
            audioCtxRef.current.resume().catch(() => {});
        }
        return audioCtxRef.current;
    };

    /** Play a dual-tone burst (freq1 + freq2) for `onDuration` seconds, repeating every `period` seconds */
    const playToneBurst = (freq1: number, freq2: number, onDuration: number, period: number): () => void => {
        const ctx = getAudioCtx();
        let stopped = false;
        let timerId: ReturnType<typeof setTimeout> | null = null;

        const scheduleBurst = () => {
            if (stopped) return;
            const now = ctx.currentTime;
            const gain = ctx.createGain();
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(0.22, now + 0.015);
            gain.gain.setValueAtTime(0.22, now + onDuration - 0.02);
            gain.gain.linearRampToValueAtTime(0, now + onDuration);
            gain.connect(ctx.destination);

            [freq1, freq2].forEach(freq => {
                const osc = ctx.createOscillator();
                osc.type = 'sine';
                osc.frequency.value = freq;
                osc.connect(gain);
                osc.start(now);
                osc.stop(now + onDuration);
            });

            timerId = setTimeout(scheduleBurst, period * 1000);
        };

        scheduleBurst();
        return () => {
            stopped = true;
            if (timerId !== null) clearTimeout(timerId);
        };
    };

    /** Classic "ring-ring" pattern: two short bursts then a pause */
    const playRingRing = (): () => void => {
        const ctx = getAudioCtx();
        let stopped = false;
        let timerId: ReturnType<typeof setTimeout> | null = null;

        const scheduleDouble = () => {
            if (stopped) return;

            const playBurst = (offset: number) => {
                if (stopped) return;
                const now = ctx.currentTime + offset;
                const gain = ctx.createGain();
                gain.gain.setValueAtTime(0, now);
                gain.gain.linearRampToValueAtTime(0.22, now + 0.015);
                gain.gain.setValueAtTime(0.22, now + 0.38);
                gain.gain.linearRampToValueAtTime(0, now + 0.4);
                gain.connect(ctx.destination);
                [440, 480].forEach(freq => {
                    const osc = ctx.createOscillator();
                    osc.type = 'sine';
                    osc.frequency.value = freq;
                    osc.connect(gain);
                    osc.start(now);
                    osc.stop(now + 0.4);
                });
            };

            playBurst(0);      // first burst
            playBurst(0.55);   // second burst 0.55s later

            timerId = setTimeout(scheduleDouble, 3800); // repeat every ~3.8s
        };

        scheduleDouble();
        return () => {
            stopped = true;
            if (timerId !== null) clearTimeout(timerId);
        };
    };

    const stopCurrentTone = () => {
        if (stopToneRef.current) {
            stopToneRef.current();
            stopToneRef.current = null;
        }
        // Block media keys from touching anything (no-op handlers)
        if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
            try {
                navigator.mediaSession.setActionHandler('play', null);
                navigator.mediaSession.setActionHandler('pause', null);
            } catch { /* ignore */ }
        }
    };

    // SFX State Manager
    useEffect(() => {
        stopCurrentTone();

        if (callState === 'calling') {
            // Outgoing: steady "bip... bip..." (1s on, 3s off)
            stopToneRef.current = playToneBurst(400, 425, 1.0, 4.0);
        } else if (callState === 'ringing') {
            // Incoming: classic "ring-ring" double burst
            stopToneRef.current = playRingRing();
        }

        // Override media keys so Play/Pause keyboard button does nothing during a call
        if ((callState === 'calling' || callState === 'ringing') && typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
            try {
                navigator.mediaSession.setActionHandler('play', () => {});
                navigator.mediaSession.setActionHandler('pause', () => {});
            } catch { /* ignore */ }
        }

        return () => { stopCurrentTone(); };
    }, [callState]);

    const updateCallState = (newState: CallState) => {
        callStateRef.current = newState;
        setCallState(newState);
    };

    // Listen for incoming calls
    useEffect(() => {
        if (!user) return;

        const callsRef = collection(db, 'calls');
        const q = query(callsRef, where('receiverId', '==', user.uid));

        const unsub = onSnapshot(q, async (snap) => {
            const incomingDoc = snap.docs.find(d => d.data().status === 'ringing');

            if (incomingDoc) {
                const data = incomingDoc.data();

                // Anti-ghost-call fallback (Delete stale calls from DB)
                const createdAt = data.created_at?.toDate?.();
                if (createdAt) {
                    const ageMs = Date.now() - createdAt.getTime();
                    if (ageMs > 1000 * 60 * 5) { // Older than 5 minutes -> ghost call
                        deleteDoc(doc(db, 'calls', incomingDoc.id)).catch(() => { });
                        return; // Don't ring
                    }
                }

                if (callStateRef.current === 'idle') {
                    setCurrentCallId(incomingDoc.id);
                    setIsAudioOnly(data.isAudioOnly || false);
                    isCallerRef.current = false;
                    setIsFullScreen(true);
                    updateCallState('ringing');

                    try {
                        const callerSnap = await getDoc(doc(db, 'users', data.callerId));
                        if (callerSnap.exists()) {
                            setActiveProfile({ id: callerSnap.id, ...callerSnap.data() });
                        }
                    } catch (e) { console.error(e); }
                }
            } else {
                if (callStateRef.current === 'ringing') {
                    cleanupCall();
                }
            }
        });

        return () => unsub();
    }, [user]);

    // Track active call document for answers / hangups
    useEffect(() => {
        if (!currentCallId) return;

        const callDoc = doc(db, 'calls', currentCallId);
        const unsub = onSnapshot(callDoc, async (docSnap) => {
            const data = docSnap.data();

            if (!docSnap.exists()) {
                if (!isCallerRef.current || callStateRef.current === 'connected' || hasWrittenCallDoc.current) {
                    if (callStateRef.current !== 'idle') cleanupCall();
                }
                return;
            }

            if (data?.status === 'ended') {
                if (callStateRef.current !== 'idle') cleanupCall();
            } else if (data?.answer && data.callerId === user?.uid && peerConnectionRef.current) {
                // Remote answered our call
                if (peerConnectionRef.current.signalingState !== 'stable') {
                    try {
                        const rtcSessionDescription = new RTCSessionDescription(data.answer);
                        await peerConnectionRef.current.setRemoteDescription(rtcSessionDescription);

                        pendingCandidates.current.forEach(candidate => {
                            peerConnectionRef.current?.addIceCandidate(new RTCIceCandidate(candidate)).catch(console.warn);
                        });
                        pendingCandidates.current = [];
                    } catch (e) { console.error('Error setting remote description', e); }
                }
                updateCallState('connected');
            } else if (data?.status === 'connected' && callStateRef.current === 'ringing') {
                updateCallState('connected');
            }
        });

        return () => unsub();
    }, [currentCallId, user?.uid]);

    const cleanupCall = () => {
        updateCallState('idle');
        setCurrentCallId(null);
        setActiveProfile(null);
        isCallerRef.current = false;
        hasWrittenCallDoc.current = false;
        pendingCandidates.current = [];

        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
            setLocalStream(null);
        }

        if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = null;
        }

        setRemoteStream(null);

        if (peerConnectionRef.current) {
            peerConnectionRef.current.onicecandidate = null;
            peerConnectionRef.current.ontrack = null;
            peerConnectionRef.current.close();
            peerConnectionRef.current = null;
        }

        // Stop all SFX safely
        stopCurrentTone();

        setMicMuted(false);
        setVideoMuted(false);
    };

    const toggleMic = () => {
        if (localStream) {
            const audioTrack = localStream.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                setMicMuted(!audioTrack.enabled);
            }
        }
    };

    const toggleVideo = () => {
        if (localStream) {
            const videoTrack = localStream.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = !videoTrack.enabled;
                setVideoMuted(!videoTrack.enabled);
            }
        }
    };

    const setupPeerConnection = async (callDocId: string, isAudioOnlyCall: boolean) => {
        const pc = new RTCPeerConnection(servers);
        peerConnectionRef.current = pc;

        // Force browser to fetch media
        let stream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({
                video: !isAudioOnlyCall,
                audio: true
            });
            setLocalStream(stream);
        } catch (err) {
            console.error("Failed to get local media", err);
            return null;
        }

        stream.getTracks().forEach((track) => {
            pc.addTrack(track, stream);
        });

        pc.oniceconnectionstatechange = () => {
            console.log("[WebRTC] ICE Connection State:", pc.iceConnectionState);
        };

        // Store a dedicated stream for this connection strictly outside React's lifecycle
        const connectionStream = new MediaStream();

        pc.ontrack = (event) => {
            console.log("[WebRTC] Received remote track:", event.track.kind);

            // Immediately add track to our stable stream
            connectionStream.addTrack(event.track);

            // Sync React for UI updates (like showing/hiding audio-only icon)
            setRemoteStream(connectionStream);

            // Directly, synchronously force the DOM to play this stream
            if (remoteVideoRef.current) {
                if (remoteVideoRef.current.srcObject !== connectionStream) {
                    remoteVideoRef.current.srcObject = connectionStream;
                }

                // Force play command just in case autoplay was blocked during this microtick
                remoteVideoRef.current.play().catch(e => console.warn("Play block:", e));
            }
        };

        const callDoc = doc(db, 'calls', callDocId);
        const callerCandidates = collection(callDoc, 'callerCandidates');
        const calleeCandidates = collection(callDoc, 'calleeCandidates');

        pc.onicecandidate = async (event) => {
            if (event.candidate) {
                if (isCallerRef.current) {
                    await addDoc(callerCandidates, event.candidate.toJSON());
                } else {
                    await addDoc(calleeCandidates, event.candidate.toJSON());
                }
            }
        };

        // Listen for remote candidates
        onSnapshot(isCallerRef.current ? calleeCandidates : callerCandidates, (snapshot) => {
            snapshot.docChanges().forEach((change) => {
                if (change.type === 'added') {
                    const candidate = new RTCIceCandidate(change.doc.data());
                    if (pc.remoteDescription) {
                        pc.addIceCandidate(candidate).catch(console.warn);
                    } else {
                        pendingCandidates.current.push(change.doc.data() as RTCIceCandidateInit);
                    }
                }
            });
        });

        return { pc, stream };
    };

    const startCall = async (receiverId: string, audioOnly: boolean) => {
        if (!user) return;
        const callDocRef = doc(collection(db, 'calls'));

        isCallerRef.current = true;
        setCurrentCallId(callDocRef.id);
        setIsAudioOnly(audioOnly);
        setIsFullScreen(true);
        updateCallState('calling');

        try {
            const receiverSnap = await getDoc(doc(db, 'users', receiverId));
            if (receiverSnap.exists()) setActiveProfile({ id: receiverSnap.id, ...receiverSnap.data() });
        } catch (e) { }

        const setupResult = await setupPeerConnection(callDocRef.id, audioOnly);
        if (!setupResult) { cleanupCall(); return; }
        const { pc } = setupResult;

        const offerDescription = await pc.createOffer();
        await pc.setLocalDescription(offerDescription);

        const callData = {
            offer: {
                type: offerDescription.type,
                sdp: offerDescription.sdp,
            },
            status: 'ringing',
            callerId: user.uid,
            receiverId: receiverId,
            isAudioOnly: audioOnly,
            created_at: Timestamp.now()
        };

        await setDoc(callDocRef, callData);
        hasWrittenCallDoc.current = true;
    };

    const answerCall = async () => {
        if (!currentCallId || !user) return;

        setIsFullScreen(true);
        updateCallState('connected');

        const setupResult = await setupPeerConnection(currentCallId, isAudioOnly);
        if (!setupResult) { cleanupCall(); return; }
        const { pc, stream } = setupResult;

        // Unmute audio just in case
        setTimeout(() => {
            stream.getAudioTracks().forEach(t => t.enabled = true);
        }, 500);

        const callDoc = doc(db, 'calls', currentCallId);
        const callData = (await getDoc(callDoc)).data();

        if (callData?.offer) {
            const offerDescription = new RTCSessionDescription(callData.offer);
            await pc.setRemoteDescription(offerDescription);

            pendingCandidates.current.forEach(candidate => {
                pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(console.warn);
            });
            pendingCandidates.current = [];

            const answerDescription = await pc.createAnswer();
            await pc.setLocalDescription(answerDescription);

            const answer = {
                type: answerDescription.type,
                sdp: answerDescription.sdp,
            };

            await updateDoc(callDoc, { answer, status: 'connected' });
        }
    };

    const endCall = async () => {
        if (callStateRef.current === 'idle') return;
        const callIdToClose = currentCallId;
        cleanupCall();
        if (callIdToClose) {
            await deleteDoc(doc(db, 'calls', callIdToClose)).catch(() => { });
        }
    };

    // Keep local and remote video updated as fallback if the ref was missed during the initial track event
    useEffect(() => {
        if (localVideoRef.current && localStream) {
            localVideoRef.current.srcObject = localStream;
        }
    }, [localStream, callState]);

    useEffect(() => {
        if (remoteVideoRef.current && remoteStream && remoteVideoRef.current.srcObject !== remoteStream) {
            remoteVideoRef.current.srcObject = remoteStream;
        }
    }, [remoteStream, callState]);

    // ── Mini player drag & resize ──
    const [miniPos, setMiniPos] = useState({ x: 0, y: 0 });
    const [miniSize, setMiniSize] = useState({ w: 320, h: 448 });
    const [isDragging, setIsDragging] = useState(false);
    const miniInitRef = useRef(false);

    useEffect(() => {
        if (!isFullScreen) {
            if (!miniInitRef.current) {
                miniInitRef.current = true;
                setMiniPos({
                    x: window.innerWidth - miniSize.w - 24,
                    y: window.innerHeight - miniSize.h - 24,
                });
            }
        } else {
            miniInitRef.current = false;
        }
    }, [isFullScreen]);

    const handleDragStart = (e: React.MouseEvent) => {
        if (isFullScreen || e.button !== 0) return;
        // Don't drag when clicking a button inside the header
        if ((e.target as HTMLElement).closest('button')) return;
        e.preventDefault();
        setIsDragging(true);
        const startX = e.clientX;
        const startY = e.clientY;
        const startLeft = miniPos.x;
        const startTop = miniPos.y;

        const onMove = (ev: MouseEvent) => {
            const newX = Math.max(0, Math.min(window.innerWidth - miniSize.w, startLeft + ev.clientX - startX));
            const newY = Math.max(0, Math.min(window.innerHeight - miniSize.h, startTop + ev.clientY - startY));
            setMiniPos({ x: newX, y: newY });
        };
        const onUp = () => {
            setIsDragging(false);
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    };

    const handleResizeStart = (e: React.MouseEvent) => {
        if (isFullScreen || e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        const startX = e.clientX;
        const startY = e.clientY;
        const startW = miniSize.w;
        const startH = miniSize.h;

        const onMove = (ev: MouseEvent) => {
            const newW = Math.max(240, Math.min(720, startW + ev.clientX - startX));
            const newH = Math.max(180, Math.min(600, startH + ev.clientY - startY));
            setMiniSize({ w: newW, h: newH });
            // Keep player on screen after resize
            setMiniPos(prev => ({
                x: Math.min(prev.x, window.innerWidth - newW),
                y: Math.min(prev.y, window.innerHeight - newH),
            }));
        };
        const onUp = () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    };

    return (
        <CallContext.Provider value={{
            callState, isAudioOnly, localStream, remoteStream, micMuted, videoMuted, activeProfile,
            startCall, answerCall, endCall, toggleMic, toggleVideo
        }}>
            {children}

            {callState !== 'idle' && (
                <div
                    style={{
                        position: 'fixed',
                        zIndex: 999999,
                        background: '#050505',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                        overflow: 'hidden',
                        ...(isFullScreen ? {
                            inset: 0,
                            borderRadius: '0px',
                            border: 'none',
                            transition: 'border-radius 0.3s',
                        } : {
                            left: `${miniPos.x}px`,
                            top: `${miniPos.y}px`,
                            width: `${miniSize.w}px`,
                            height: `${miniSize.h}px`,
                            borderRadius: '1rem',
                            border: '1px solid rgba(255,255,255,0.15)',
                            boxShadow: '0 25px 60px rgba(0,0,0,0.7)',
                            transition: isDragging ? 'none' : 'box-shadow 0.2s',
                        })
                    }}
                >
                    {/* Remote Video (Always mount to catch stream, hide if not connected) */}
                    <div style={{ position: 'absolute', inset: 0, background: '#0A0A0B', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>

                        {/* The Actual Video Tag - Must exist before tracks arrive! */}
                        <video
                            ref={remoteVideoRef}
                            autoPlay
                            playsInline
                            style={{
                                width: '100%',
                                height: '100%',
                                objectFit: 'cover',
                                display: (callState === 'connected' && remoteStream) ? 'block' : 'none'
                            }}
                            onLoadedMetadata={(e) => {
                                (e.target as HTMLVideoElement).play().catch(e => console.error("WebRTC Autoplay blocker", e));
                            }}
                        />

                        {/* Caller waiting screen or Receiver ringing screen overlay */}
                        {(!(callState === 'connected' && remoteStream)) && (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'absolute', zIndex: 10 }}>
                                <div style={{ width: '6rem', height: '6rem', background: 'rgba(255,255,255,0.05)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.5rem', border: '1px solid rgba(255,255,255,0.1)' }}>
                                    <div style={{ fontSize: '2.5rem', animation: '2s infinite alternate' }}>📞</div>
                                </div>
                                <div style={{ fontSize: '1.5rem', fontWeight: 600, color: 'white', marginBottom: '0.5rem' }}>{activeProfile?.full_name || '...'}</div>
                                <div style={{ color: 'rgba(255,255,255,0.5)' }}>{callState === 'calling' ? 'Sonnerie en cours...' : 'Appel entrant...'}</div>
                            </div>
                        )}

                        {/* Audio-only Avatar Fallback */}
                        {isAudioOnly && callState === 'connected' && (
                            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#18181B', zIndex: 15 }}>
                                <div style={{ width: '8rem', height: '8rem', borderRadius: '50%', background: 'rgba(59, 130, 246, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid rgba(59, 130, 246, 0.5)' }}>
                                    <span style={{ fontSize: '3rem', color: '#60A5FA', fontWeight: 'bold' }}>
                                        {activeProfile?.full_name?.charAt(0).toUpperCase() || '?'}
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Local Video PIP (WhatsApp Style) */}
                    {localStream && !isAudioOnly && (
                        <div style={{
                            position: 'absolute',
                            bottom: isFullScreen ? '7rem' : '5rem',
                            right: isFullScreen ? '1.5rem' : '1rem',
                            width: isFullScreen ? '7rem' : '5rem',
                            height: isFullScreen ? '10rem' : '7.5rem',
                            backgroundColor: '#27272a',
                            borderRadius: '0.75rem',
                            overflow: 'hidden',
                            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)',
                            border: '2px solid rgba(255,255,255,0.2)',
                            transition: 'all 0.3s ease',
                            zIndex: 20
                        }}>
                            <video
                                ref={localVideoRef}
                                autoPlay
                                playsInline
                                muted
                                style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}
                            />
                        </div>
                    )}

                    {/* App Bar Controls — drag handle in mini mode */}
                    <div
                        onMouseDown={!isFullScreen ? handleDragStart : undefined}
                        style={{
                            position: 'absolute', top: 0, left: 0, right: 0,
                            padding: '1.25rem',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                            background: 'linear-gradient(to bottom, rgba(0,0,0,0.7), transparent)',
                            zIndex: 30,
                            cursor: isFullScreen ? 'default' : isDragging ? 'grabbing' : 'grab',
                            userSelect: 'none',
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <div style={{ width: '2.5rem', height: '2.5rem', borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.9)', fontWeight: 'bold' }}>
                                {activeProfile?.full_name?.charAt(0).toUpperCase() || 'U'}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <div style={{ color: 'white', fontWeight: 600, textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>{activeProfile?.full_name || '...'}</div>
                                <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.8rem', textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>
                                    {callState === 'connected' ? 'En ligne' : 'Synkra Appels'}
                                </div>
                            </div>
                        </div>
                        {callState === 'connected' && (
                            <button onClick={() => setIsFullScreen(!isFullScreen)} style={{ padding: '0.6rem', borderRadius: '50%', background: 'rgba(0,0,0,0.4)', color: 'white', border: 'none', cursor: 'pointer', backdropFilter: 'blur(4px)' }}>
                                {isFullScreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
                            </button>
                        )}
                    </div>

                    {/* Resize grip — bottom-right corner, mini mode only */}
                    {!isFullScreen && (
                        <div
                            onMouseDown={handleResizeStart}
                            title="Redimensionner"
                            style={{
                                position: 'absolute', bottom: 0, right: 0,
                                width: '22px', height: '22px',
                                zIndex: 40, cursor: 'nwse-resize',
                                display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end',
                                padding: '4px',
                            }}
                        >
                            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                                <path d="M9 1L9 9L1 9" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" strokeLinecap="round"/>
                                <path d="M9 5L5 9" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" strokeLinecap="round"/>
                            </svg>
                        </div>
                    )}

                    {/* Bottom Controls (WhatsApp Style) */}
                    <div style={{ position: 'absolute', bottom: '2rem', left: 0, right: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1.5rem', zIndex: 30 }}>
                        {callState === 'connected' && (
                            <>
                                <button
                                    onClick={toggleMic}
                                    style={{
                                        padding: '1rem',
                                        borderRadius: '50%',
                                        backdropFilter: 'blur(8px)',
                                        border: 'none',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                        backgroundColor: micMuted ? 'white' : 'rgba(255,255,255,0.15)',
                                        color: micMuted ? 'black' : 'white',
                                    }}
                                >
                                    {micMuted ? <MicOff size={24} /> : <Mic size={24} />}
                                </button>

                                {!isAudioOnly && (
                                    <button
                                        onClick={toggleVideo}
                                        style={{
                                            padding: '1rem',
                                            borderRadius: '50%',
                                            backdropFilter: 'blur(8px)',
                                            border: 'none',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s',
                                            backgroundColor: videoMuted ? 'white' : 'rgba(255,255,255,0.15)',
                                            color: videoMuted ? 'black' : 'white',
                                        }}
                                    >
                                        {videoMuted ? <CameraOff size={24} /> : <Camera size={24} />}
                                    </button>
                                )}
                            </>
                        )}

                        {callState === 'ringing' ? (
                            <>
                                <button onClick={endCall} style={{ padding: '1rem', borderRadius: '50%', backgroundColor: '#ef4444', color: 'white', border: 'none', cursor: 'pointer', boxShadow: '0 10px 15px -3px rgba(239, 68, 68, 0.4)' }}>
                                    <PhoneOff size={28} />
                                </button>
                                <button onClick={answerCall} style={{ padding: '1rem', borderRadius: '50%', backgroundColor: '#22c55e', color: 'white', border: 'none', cursor: 'pointer', boxShadow: '0 10px 15px -3px rgba(34, 197, 94, 0.4)' }}>
                                    <Phone size={28} />
                                </button>
                            </>
                        ) : (
                            <button onClick={endCall} style={{ padding: '1rem', borderRadius: '50%', backgroundColor: '#ef4444', color: 'white', border: 'none', cursor: 'pointer', boxShadow: '0 10px 15px -3px rgba(239, 68, 68, 0.4)' }}>
                                <PhoneOff size={28} />
                            </button>
                        )}
                    </div>
                </div>
            )}
        </CallContext.Provider>
    );
};

export const useCall = () => {
    const context = useContext(CallContext);
    if (context === undefined) {
        throw new Error('useCall must be used within a CallProvider');
    }
    return context;
};
