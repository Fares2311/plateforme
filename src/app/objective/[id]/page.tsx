'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { db, storage } from '@/lib/firebase';
import { ref as storageRef, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { doc, getDoc, collection, query, where, getDocs, onSnapshot, orderBy, addDoc, serverTimestamp, updateDoc, arrayUnion, arrayRemove, setDoc, deleteDoc } from 'firebase/firestore';
import { Link as LinkIcon, Users, Edit3, Save, TrendingUp, Calendar, CheckSquare, MessageSquare, Send, Bot, FileText, BarChart2, Video, Rocket, LayoutDashboard, UserPlus, FileUp, Hash, Pin, SmilePlus, X, Target, Code, BookOpen, Clock, Globe, Lock, Palette, Music, Dumbbell, FlaskConical, Briefcase, Pen, ChevronRight, Star, Zap, Trash2, Upload, Download, ExternalLink, StickyNote, Scale, Megaphone, HelpCircle, Crosshair, Plus, CheckCircle, AlertCircle, Map, Flag } from 'lucide-react';
import Link from 'next/link';
import { useLocale } from '@/context/LocaleContext';
import { useUI } from '@/context/UIContext';
import CalendarPicker from '@/components/CalendarPicker';
import Avatar from '@/components/Avatar';
import { FloatingAiAssistant } from '@/components/ui/glowing-ai-chat-assistant';

// Format hours: < 1h → "Xmin", ≥ 1h → up to 2 decimal places
const fmtHours = (h: number) => h < 1 ? `${Math.round(h * 60)}min` : `${parseFloat(h.toFixed(2))}h`;
const fmtDate = (ts: any): string => {
    if (!ts) return '';
    const d = ts?.toDate?.() ?? new Date(ts);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60000) return 'À l\'instant';
    if (diff < 3600000) return `Il y a ${Math.floor(diff / 60000)}min`;
    if (diff < 86400000) return `Il y a ${Math.floor(diff / 3600000)}h`;
    if (diff < 172800000) return 'Hier';
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) });
};

export default function ObjectiveDetail() {
    const { id } = useParams();
    const { user } = useAuth();
    const router = useRouter();
    const { t } = useLocale();
    const { setNavbarVisible, setIsWorking: setIsWorkingGlobal } = useUI();

    const [objective, setObjective] = useState<any>(null);
    const [memberships, setMemberships] = useState<any[]>([]);
    const [messages, setMessages] = useState<any[]>([]);
    const [aiMessages, setAiMessages] = useState<any[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [newAiMessage, setNewAiMessage] = useState('');

    const [activeTab, setActiveTab] = useState('overview');
    const [loading, setLoading] = useState(true);

    const [showEditObjModal, setShowEditObjModal] = useState(false);
    const [editObjTitle, setEditObjTitle] = useState('');
    const [editObjDesc, setEditObjDesc] = useState('');
    const [editObjHours, setEditObjHours] = useState('');
    const [editObjFreq, setEditObjFreq] = useState('total');
    const [editObjCats, setEditObjCats] = useState<string[]>([]);
    const [editObjLearningLink, setEditObjLearningLink] = useState('');
    const [editObjPublic, setEditObjPublic] = useState(false);
    const [updatingObj, setUpdatingObj] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    const CATEGORIES = [
        { id: 'Code', label: 'Code', icon: Code, color: '#6366f1' },
        { id: 'Design', label: 'Design', icon: Palette, color: '#ec4899' },
        { id: 'Lecture', label: 'Lecture', icon: BookOpen, color: '#f59e0b' },
        { id: 'Musique', label: 'Musique', icon: Music, color: '#10b981' },
        { id: 'Sport', label: 'Sport', icon: Dumbbell, color: '#ef4444' },
        { id: 'Science', label: 'Science', icon: FlaskConical, color: '#3b82f6' },
        { id: 'Business', label: 'Business', icon: Briefcase, color: '#8b5cf6' },
        { id: 'Écriture', label: 'Écriture', icon: Pen, color: '#f97316' },
        { id: 'Autre', label: 'Autre', icon: Star, color: '#64748b' },
    ];
    const HOUR_PRESETS = [10, 20, 50, 100, 200];

    const [milestones, setMilestones] = useState<{ id: string, text: string, description?: string, estimated_hours?: number, completed: boolean, phase_id?: string }[]>([]);
    const [generatingAI, setGeneratingAI] = useState(false);

    const [resources, setResources] = useState<{ id: string, text: string }[]>([]);
    const [generatingAIResources, setGeneratingAIResources] = useState(false);
    const [aiResourcePrompt, setAiResourcePrompt] = useState('');

    type SharedFile = { id: string; title: string; url: string; type: 'link' | 'file'; file_name?: string; file_size?: number; storage_path?: string; added_by: string; added_by_name: string };
    const [sharedFiles, setSharedFiles] = useState<SharedFile[]>([]);

    const [callingCoach, setCallingCoach] = useState(false);

    type Session = { id: string; title: string; type: 'travail' | 'discussion' | 'recherche'; scheduled_at: any; description: string; creator_id: string; creator_name: string; attendees: string[]; recurring?: string };
    const [sessions, setSessions] = useState<Session[]>([]);
    const [showSessionForm, setShowSessionForm] = useState(false);
    const [newSession, setNewSession] = useState({ title: '', type: 'travail' as 'travail' | 'discussion' | 'recherche', scheduled_at: '', description: '', recurring: 'none' as 'none' | 'weekly' | 'biweekly' });
    const [creatingSession, setCreatingSession] = useState(false);
    const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
    const [editDate, setEditDate] = useState('');

    type PollOption = { text: string; votes: string[] };
    type Poll = { id: string; question: string; options: PollOption[]; creator_id: string; creator_name: string; closed: boolean; created_at: any };
    const [polls, setPolls] = useState<Poll[]>([]);
    const [showPollForm, setShowPollForm] = useState(false);
    const [newPoll, setNewPoll] = useState({ question: '', options: ['', ''] });
    const [creatingPoll, setCreatingPoll] = useState(false);

    type PersonalMilestone = { id: string; text: string; completed: boolean; user_id: string; created_at: any };
    const [personalMilestones, setPersonalMilestones] = useState<PersonalMilestone[]>([]);
    const [newPersonalStep, setNewPersonalStep] = useState('');
    const [milestoneSubTab, setMilestoneSubTab] = useState<'group' | 'personal'>('group');
    const [showGroupStepForm, setShowGroupStepForm] = useState(false);
    const [newGroupStep, setNewGroupStep] = useState({ text: '', description: '', phase_id: '' });
    const [milestonePhaseFilter, setMilestonePhaseFilter] = useState<string>('all');
    const [suggestingAI, setSuggestingAI] = useState(false);

    // Agenda AI state
    const [agendaRhythm, setAgendaRhythm] = useState<'leger' | 'regulier' | 'intensif'>('regulier');
    const [agendaTimePref, setAgendaTimePref] = useState('');
    const [showAgendaAI, setShowAgendaAI] = useState(false);

    // Delete Confirmation State
    const [deleteConfirm, setDeleteConfirm] = useState<{ show: boolean; sessionId: string | 'all'; title: string; desc: string }>({
        show: false,
        sessionId: '',
        title: '',
        desc: ''
    });

    // Invite link state
    const [generatingCode, setGeneratingCode] = useState(false);
    const [copiedLink, setCopiedLink] = useState(false);
    const [togglingInvite, setTogglingInvite] = useState(false);

    // Resource Upload state
    const [showAddResource, setShowAddResource] = useState(false);
    const [resType, setResType] = useState<'link' | 'file'>('link');
    const [resTitle, setResTitle] = useState('');
    const [resUrl, setResUrl] = useState('');
    const [resFile, setResFile] = useState<File | null>(null);
    const [resUploading, setResUploading] = useState(false);
    const [resUploadProgress, setResUploadProgress] = useState(0);

    // Chat Reactions & Pinned Messages state
    const [hoverMsgId, setHoverMsgId] = useState<string | null>(null);
    const QUICK_REACTIONS = ['❤️', '🔥', '👏', '💡'];

    // Friends state
    const [friendships, setFriendships] = useState<Record<string, any>>({});

    // Live presence state
    const [presenceMap, setPresenceMap] = useState<Record<string, { is_working: boolean; started_at: any; last_seen: any }>>({});
    const [isWorking, setIsWorking] = useState(false);
    const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
    // Ticker so stale presences disappear without a Firestore event
    const [, setTick] = useState(0);

    // Live coworking room members
    const [liveRoomCount, setLiveRoomCount] = useState(0);
    const [liveRoomMembers, setLiveRoomMembers] = useState<{ uid: string; full_name: string; avatar_url?: string; avatar_style?: string }[]>([]);

    useEffect(() => {
        if (!user || !id) return;

        const fetchData = async () => {
            try {
                // Fetch Objective
                const objDoc = await getDoc(doc(db, 'objectives', id as string));
                if (!objDoc.exists()) {
                    router.push('/dashboard');
                    return;
                }
                setObjective({ id: objDoc.id, ...objDoc.data() });

                // Fetch Memberships (Group Progress)
                const membershipsRef = collection(db, 'memberships');
                const q = query(membershipsRef, where('objective_id', '==', id));
                const membershipDocs = await getDocs(q);

                const members = await Promise.all(membershipDocs.docs.map(async (m) => {
                    const mData = m.data();
                    const pDoc = await getDoc(doc(db, 'users', mData.user_id));
                    return { ...mData, user_id: mData.user_id, user: pDoc.exists() ? pDoc.data() : { full_name: 'Anonyme', email: '' } };
                }));
                setMemberships(members);

                // Fetch friendships with these members
                const memberIds = members.map((m: any) => m.user_id).filter(uid => uid !== user.uid);
                if (memberIds.length > 0) {
                    const fQuery = query(collection(db, 'friendships'),
                        where('user1_id', 'in', [user.uid, ...memberIds]) // Simplified fetch, we'll filter client-side
                    );

                    const unsubscribeFriends = onSnapshot(fQuery, (snapshot) => {
                        const newFriendships: Record<string, any> = {};
                        snapshot.docs.forEach(d => {
                            const data = d.data();
                            if ((data.user1_id === user.uid && memberIds.includes(data.user2_id)) ||
                                (data.user2_id === user.uid && memberIds.includes(data.user1_id))) {
                                const otherId = data.user1_id === user.uid ? data.user2_id : data.user1_id;
                                newFriendships[otherId] = { id: d.id, ...data };
                            }
                        });
                        setFriendships(newFriendships);
                    });

                    // Cleanup friends listener is handled by storing it if we wanted to be perfectly clean, 
                    // but for this scope we'll just let the component unmount handle the general teardown
                }

            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };

        fetchData();

        // Realtime Chat Subscription
        const messagesRef = collection(db, 'objectives', id as string, 'messages');
        const qMessages = query(messagesRef, orderBy('created_at', 'asc'));

        const unsubscribe = onSnapshot(qMessages, (snapshot) => {
            const msgs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            setMessages(msgs);

            // Auto-scroll chat
            setTimeout(() => {
                const chatDiv = document.getElementById('chat-messages');
                if (chatDiv) chatDiv.scrollTop = chatDiv.scrollHeight;
            }, 100);
        });

        // Realtime AI Chat Subscription
        const aiMessagesRef = collection(db, 'objectives', id as string, 'ai_messages');
        const qAiMessages = query(aiMessagesRef, orderBy('created_at', 'asc'));

        const unsubscribeAi = onSnapshot(qAiMessages, (snapshot) => {
            const msgs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            setAiMessages(msgs);

            setTimeout(() => {
                const chatDiv = document.getElementById('ai-chat-messages');
                if (chatDiv) chatDiv.scrollTop = chatDiv.scrollHeight;
            }, 100);
        });

        // Realtime Milestones Subscription
        const milestonesRef = collection(db, 'objectives', id as string, 'milestones');
        const qMilestones = query(milestonesRef, orderBy('created_at', 'asc'));
        const unsubscribeMilestones = onSnapshot(qMilestones, (snapshot) => {
            const mlist = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as any;
            setMilestones(mlist);
        });

        // Realtime Resources Subscription (AI-generated)
        const resourcesRef = collection(db, 'objectives', id as string, 'resources');
        const qResources = query(resourcesRef, orderBy('created_at', 'asc'));
        const unsubscribeResources = onSnapshot(qResources, (snapshot) => {
            const rlist = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as any;
            setResources(rlist);
        });

        // Realtime Shared Files Subscription (manual uploads by members)
        const sharedFilesRef = collection(db, 'objectives', id as string, 'shared_files');
        const qSharedFiles = query(sharedFilesRef, orderBy('added_at', 'asc'));
        const unsubscribeSharedFiles = onSnapshot(qSharedFiles, (snapshot) => {
            setSharedFiles(snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as any);
        });

        // Realtime Sessions Subscription
        const sessionsRef = collection(db, 'objectives', id as string, 'sessions');
        const qSessions = query(sessionsRef, orderBy('scheduled_at', 'asc'));
        const unsubscribeSessions = onSnapshot(qSessions, (snapshot) => {
            const sList = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as Session[];
            setSessions(sList);
        });

        // Realtime Polls Subscription
        const pollsRef = collection(db, 'objectives', id as string, 'polls');
        const qPolls = query(pollsRef, orderBy('created_at', 'desc'));
        const unsubscribePolls = onSnapshot(qPolls, (snapshot) => {
            setPolls(snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as Poll[]);
        });

        // Realtime Personal Milestones subscription (only current user's)
        // Note: no orderBy to avoid needing a composite Firestore index — sorted client-side
        const personalRef = collection(db, 'objectives', id as string, 'personal_milestones');
        const qPersonal = query(personalRef, where('user_id', '==', user.uid));
        const unsubscribePersonal = onSnapshot(qPersonal, (snapshot) => {
            const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as PersonalMilestone[];
            // Sort by created_at client-side
            list.sort((a, b) => {
                const ta = a.created_at?.seconds ?? 0;
                const tb = b.created_at?.seconds ?? 0;
                return ta - tb;
            });
            setPersonalMilestones(list);
        });

        // Realtime live_session (who is in the video room right now)
        const liveSessionRef = collection(db, 'objectives', id as string, 'live_session');
        const unsubLiveSession = onSnapshot(liveSessionRef, (snap) => {
            setLiveRoomCount(snap.size);
            setLiveRoomMembers(snap.docs.map(d => ({
                uid: d.id,
                full_name: d.data().full_name || 'Membre',
                avatar_url: d.data().avatar_url,
                avatar_style: d.data().avatar_style,
            })));
        });

        // Realtime Presence Subscription
        const presenceRef = collection(db, 'objectives', id as string, 'presence');
        const unsubscribePresence = onSnapshot(presenceRef, (snapshot) => {
            const map: Record<string, { is_working: boolean; started_at: any; last_seen: any }> = {};
            snapshot.docs.forEach(d => {
                const data = d.data();
                map[d.id] = { is_working: data.is_working ?? false, started_at: data.started_at, last_seen: data.last_seen ?? null };
            });
            setPresenceMap(map);

            if (user) {
                const p = map[user.uid];
                // Consider stale (> 2min without heartbeat) as not working
                const userIsWorking = p?.is_working === true &&
                    p?.last_seen?.toDate &&
                    Date.now() - p.last_seen.toDate().getTime() < 2 * 60 * 1000;
                setIsWorking(userIsWorking);
                setIsWorkingGlobal(userIsWorking);

                // Restart heartbeat if still working after navigating back to this page
                if (userIsWorking && !heartbeatRef.current) {
                    const presDoc = doc(db, 'objectives', id as string, 'presence', user.uid);
                    heartbeatRef.current = setInterval(async () => {
                        await setDoc(presDoc, { last_seen: serverTimestamp() }, { merge: true });
                    }, 30000);
                } else if (!userIsWorking && heartbeatRef.current) {
                    clearInterval(heartbeatRef.current);
                    heartbeatRef.current = null;
                }
            }
        });

        return () => {
            unsubscribe();
            unsubscribeAi();
            unsubscribeMilestones();
            unsubscribeResources();
            unsubscribeSharedFiles();
            unsubscribeSessions();
            unsubscribePolls();
            unsubscribePersonal();
            unsubscribePresence();
            unsubLiveSession();
        };
    }, [id, user, router]);

    // Sync heartbeat cleanup (navbar indicator persistence is handled via global state)
    useEffect(() => {
        return () => {
            if (heartbeatRef.current) {
                clearInterval(heartbeatRef.current);
                heartbeatRef.current = null;
            }
        };
    }, []);

    // Tick every 60s so stale presences disappear even without a Firestore event
    useEffect(() => {
        const t = setInterval(() => setTick(n => n + 1), 60_000);
        return () => clearInterval(t);
    }, []);

    // Heartbeat older than 2 min = user is offline (considers 4+ missed 30s heartbeats)
    const isAlive = (p?: { is_working: boolean; last_seen: any }) =>
        !!p?.is_working && !!p?.last_seen?.toDate &&
        Date.now() - p.last_seen.toDate().getTime() < 2 * 60 * 1000;

    const handleUpdateObjective = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || user.uid !== objective.creator_id) return;
        setUpdatingObj(true);
        try {
            const targetHours = parseInt(editObjHours) || 20;
            await updateDoc(doc(db, 'objectives', id as string), {
                title: editObjTitle,
                description: editObjDesc,
                target_hours: targetHours,
                goal_frequency: editObjFreq,
                category: editObjCats,
                learning_link: editObjLearningLink.trim(),
                is_public: editObjPublic,
            });
            setShowEditObjModal(false);
            setNavbarVisible(true);
            setObjective({
                ...objective,
                title: editObjTitle,
                description: editObjDesc,
                target_hours: targetHours,
                goal_frequency: editObjFreq,
                category: editObjCats,
                learning_link: editObjLearningLink.trim(),
                is_public: editObjPublic
            });
        } catch (err) {
            console.error('Error updating objective', err);
        } finally {
            setUpdatingObj(false);
        }
    };

    const generateInviteCode = async () => {
        if (!user || user.uid !== objective?.creator_id) return;
        setGeneratingCode(true);
        try {
            const code = Math.random().toString(36).substring(2, 10).toUpperCase();
            await updateDoc(doc(db, 'objectives', id as string), { invite_code: code, invite_link_enabled: true });
            setObjective({ ...objective, invite_code: code, invite_link_enabled: true });
        } catch (err) {
            console.error(err);
        } finally {
            setGeneratingCode(false);
        }
    };

    const toggleInviteLink = async () => {
        if (!user || user.uid !== objective?.creator_id) return;
        setTogglingInvite(true);
        try {
            const newVal = !objective.invite_link_enabled;
            await updateDoc(doc(db, 'objectives', id as string), { invite_link_enabled: newVal });
            setObjective({ ...objective, invite_link_enabled: newVal });
        } catch (err) {
            console.error(err);
        } finally {
            setTogglingInvite(false);
        }
    };

    const copyInviteLink = () => {
        if (!objective?.invite_code) return;
        const link = `${window.location.origin}/join/${objective.invite_code}`;
        navigator.clipboard.writeText(link);
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 2000);
    };

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim() || !user) return;

        try {
            await addDoc(collection(db, 'objectives', id as string, 'messages'), {
                user_id: user.uid,
                user_name: user.displayName || user.email?.split('@')[0] || 'Utilisateur',
                content: newMessage.trim(),
                created_at: serverTimestamp(),
                reactions: {},
                pinned: false,
            });
            setNewMessage('');
        } catch (err) {
            console.error('Error sending message', err);
        }
    };

    const handleToggleReaction = async (msgId: string, emoji: string) => {
        if (!user) return;
        const msgRef = doc(db, 'objectives', id as string, 'messages', msgId);
        const msg = messages.find(m => m.id === msgId);
        if (!msg) return;
        const currentReactions: Record<string, string[]> = msg.reactions || {};
        const usersWhoReacted: string[] = currentReactions[emoji] || [];
        const hasReacted = usersWhoReacted.includes(user.uid);
        const updated: Record<string, string[]> = {};

        // Copy all existing reactions, removing this user from every emoji (one reaction per user)
        for (const [e, uids] of Object.entries(currentReactions)) {
            const filtered = (uids as string[]).filter(uid => uid !== user.uid);
            if (filtered.length > 0) updated[e] = filtered;
        }

        // If user hadn't reacted with this emoji yet → add it
        if (!hasReacted) {
            updated[emoji] = [...(updated[emoji] || []), user.uid];
        }
        // If they had → it's already removed above (toggle off)

        await updateDoc(msgRef, { reactions: updated });
    };

    const handleDeleteObjective = async () => {
        if (!objective || !user || user.uid !== objective.creator_id) return;
        setShowDeleteConfirm(true);
    };

    const confirmDeleteObjective = async () => {
        if (!objective || !user || user.uid !== objective.creator_id) return;

        try {
            const oid = id as string;

            // 1. Delete subcollections
            const subcollections = ['milestones', 'resources', 'sessions', 'messages', 'ai_messages', 'shared_files'];
            for (const sub of subcollections) {
                const q = query(collection(db, 'objectives', oid, sub));
                const snap = await getDocs(q);
                for (const d of snap.docs) {
                    await deleteDoc(d.ref);
                }
            }

            // 2. Delete memberships
            const mq = query(collection(db, 'memberships'), where('objective_id', '==', oid));
            const mSnap = await getDocs(mq);
            for (const d of mSnap.docs) {
                await deleteDoc(d.ref);
            }

            // 3. Delete the objective document itself
            await deleteDoc(doc(db, 'objectives', oid));

            router.push('/dashboard');
        } catch (err) {
            console.error("Error deleting objective:", err);
            alert("Une erreur est survenue lors de la suppression.");
        } finally {
            setShowDeleteConfirm(false);
        }
    };

    const handlePinMessage = async (msgId: string) => {
        if (!objective) return;
        const pinnedNow: string[] = objective.pinned_messages || [];
        // max 3 pinned
        if (pinnedNow.length >= 3 && !pinnedNow.includes(msgId)) return;
        const next = pinnedNow.includes(msgId)
            ? pinnedNow.filter((p: string) => p !== msgId)
            : [...pinnedNow, msgId];
        await updateDoc(doc(db, 'objectives', id as string), { pinned_messages: next });
        setObjective((prev: any) => ({ ...prev, pinned_messages: next }));
    };

    const handleGenerateSmartAgenda = async () => {
        if (!objective) return;
        setGeneratingAI(true);
        try {
            const res = await fetch('/api/generate-smart-agenda', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: objective.title,
                    category: Array.isArray(objective.category) ? objective.category.join(', ') : objective.category,
                    targetHours: objective.target_hours,
                    rhythm: agendaRhythm,
                    timePref: agendaTimePref
                })
            });
            const data = await res.json();

            if (data.error) throw new Error(data.error);

            // 1. Save Milestones
            if (data.milestones) {
                // Remove old milestones first
                for (const oldM of milestones) {
                    try {
                        const { deleteDoc } = await import('firebase/firestore');
                        await deleteDoc(doc(db, 'objectives', id as string, 'milestones', oldM.id));
                    } catch (e) {
                        console.error("Could not delete old milestone", e);
                    }
                }
                for (const m of data.milestones) {
                    await addDoc(collection(db, 'objectives', id as string, 'milestones'), {
                        text: m.title,
                        description: m.description || '',
                        estimated_hours: m.estimated_hours || 0,
                        completed: false,
                        created_at: serverTimestamp()
                    });
                }
            }

            // 2. Save Sessions
            if (data.sessions) {
                // Remove old AI sessions (that haven't happened yet to be safe, or just clear all)
                const futureSessions = sessions.filter(s => new Date(s.scheduled_at).getTime() > Date.now());
                for (const fs of futureSessions) {
                    try {
                        const { deleteDoc } = await import('firebase/firestore');
                        await deleteDoc(doc(db, 'objectives', id as string, 'sessions', fs.id));
                    } catch (e) { console.error("Could not delete old session", e); }
                }

                for (const s of data.sessions) {
                    await addDoc(collection(db, 'objectives', id as string, 'sessions'), {
                        title: s.title,
                        description: s.description || '',
                        type: s.type || 'travail',
                        scheduled_at: new Date(s.scheduled_at),
                        creator_id: 'ai-coach',
                        creator_name: 'Coach IA',
                        attendees: [],
                        created_at: serverTimestamp()
                    });
                }
            }

            setShowAgendaAI(false);
            setAgendaTimePref('');
        } catch (error) {
            console.error("Erreur de génération Smart Agenda", error);
            alert("Impossible de générer le plan pour le moment.");
        } finally {
            setGeneratingAI(false);
        }
    };

    const handleAddGroupMilestone = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newGroupStep.text.trim() || !user) return;
        await addDoc(collection(db, 'objectives', id as string, 'milestones'), {
            text: newGroupStep.text.trim(),
            description: newGroupStep.description.trim(),
            completed: false,
            phase_id: newGroupStep.phase_id || '',
            created_at: serverTimestamp()
        });

        // Notify others in the room
        const othersToNotify = memberships.map((m: any) => m.user_id).filter((uid: string) => uid !== user.uid);
        for (const uid of othersToNotify) {
            await addDoc(collection(db, 'users', uid, 'notifications'), {
                message: `${user.displayName || user.email?.split('@')[0] || 'Un membre'} a ajouté une nouvelle étape "${newGroupStep.text.trim()}" dans le salon "${objective?.title}".`,
                type: 'milestone_add',
                read: false,
                created_at: serverTimestamp()
            });
        }

        setNewGroupStep({ text: '', description: '', phase_id: '' });
        setShowGroupStepForm(false);
    };

    const handleAISuggestMilestones = async () => {
        if (!objective) return;
        setSuggestingAI(true);
        try {
            const res = await fetch('/api/generate-roadmap', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: objective.title,
                    category: Array.isArray(objective.category) ? objective.category.join(', ') : objective.category,
                    targetHours: objective.target_hours,
                    existing: milestones.map(m => m.text), // pass existing so AI adds new ones
                    mode: 'suggest' // hint to suggest without duplicating
                })
            });
            const data = await res.json();
            if (data.milestones) {
                for (const m of data.milestones) {
                    await addDoc(collection(db, 'objectives', id as string, 'milestones'), {
                        text: m.title,
                        description: m.description || '',
                        completed: false,
                        created_at: serverTimestamp()
                    });
                }
            }
        } catch {
            alert('Impossible de contacter l\'IA pour le moment.');
        } finally {
            setSuggestingAI(false);
        }
    };

    const handleGenerateResources = async () => {
        if (!objective) return;
        setGeneratingAIResources(true);
        try {
            const res = await fetch('/api/generate-resources', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: objective.title,
                    category: Array.isArray(objective.category) ? objective.category.join(', ') : objective.category,
                    userPrompt: aiResourcePrompt,
                })
            });
            const data = await res.json();

            if (data.resources) {
                // Delete old resources first
                for (const oldR of resources) {
                    try {
                        const { deleteDoc } = await import('firebase/firestore');
                        await deleteDoc(doc(db, 'objectives', id as string, 'resources', oldR.id));
                    } catch (e) {
                        console.error("Could not delete old resource", e);
                    }
                }

                for (const text of data.resources) {
                    await addDoc(collection(db, 'objectives', id as string, 'resources'), {
                        text,
                        created_at: serverTimestamp()
                    });
                }
            }
        } catch (error) {
            console.error("Erreur de génération Resources IA", error);
            alert("Impossible de générer des ressources pour le moment.");
        } finally {
            setGeneratingAIResources(false);
        }
    };

    const handleAddResource = async () => {
        if (!id || !user) return;
        const oid = (Array.isArray(id) ? id[0] : id) as string;
        const addedByName = user.displayName || user.email?.split('@')[0] || 'Membre';

        if (resType === 'file') {
            if (!resFile) return;
            setResUploading(true);
            setResUploadProgress(0);
            try {
                const safeName = resFile.name.replace(/[^a-z0-9.]/gi, '_').toLowerCase();
                const sRef = storageRef(storage, `objectives/${oid}/shared_files/${user.uid}_${Date.now()}_${safeName}`);
                const task = uploadBytesResumable(sRef, resFile);
                await new Promise<void>((resolve, reject) => {
                    task.on('state_changed',
                        snap => setResUploadProgress(Math.round(snap.bytesTransferred / snap.totalBytes * 100)),
                        reject,
                        async () => {
                            const url = await getDownloadURL(task.snapshot.ref);
                            await addDoc(collection(db, 'objectives', oid, 'shared_files'), {
                                title: resTitle.trim() || resFile.name,
                                url, type: 'file',
                                file_name: resFile.name, file_size: resFile.size,
                                storage_path: task.snapshot.ref.fullPath,
                                added_by: user.uid, added_by_name: addedByName,
                                added_at: serverTimestamp(),
                            });
                            resolve();
                        }
                    );
                });
            } finally {
                setResUploading(false); setResUploadProgress(0);
            }
        } else {
            if (!resTitle.trim()) return;
            const url = resUrl.trim();
            const normalized = url && !/^https?:\/\//i.test(url) ? `https://${url}` : url;
            await addDoc(collection(db, 'objectives', oid, 'shared_files'), {
                title: resTitle.trim(), url: normalized, type: 'link',
                added_by: user.uid, added_by_name: addedByName,
                added_at: serverTimestamp(),
            });
        }
        setResTitle(''); setResUrl(''); setResFile(null); setShowAddResource(false);
    };

    const handleDeleteResource = async (fileId: string, storagePath?: string) => {
        if (!id) return;
        if (storagePath) {
            try { await deleteObject(storageRef(storage, storagePath)); } catch { /* already gone */ }
        }
        await deleteDoc(doc(db, 'objectives', id as string, 'shared_files', fileId));
    };

    const handleCallCoach = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!objective || !newAiMessage.trim() || !user) return;

        const userQuery = newAiMessage.trim();
        setNewAiMessage('');
        setCallingCoach(true);

        try {
            // Add user's question to the AI chat thread
            await addDoc(collection(db, 'objectives', id as string, 'ai_messages'), {
                user_id: user.uid,
                user_name: user.displayName || user.email?.split('@')[0] || 'Vous',
                content: userQuery,
                created_at: serverTimestamp()
            });

            // Combine recent human chat and AI chat for context
            const recentMessages = [...messages.slice(-5), ...aiMessages.slice(-5)];

            const res = await fetch('/api/chat-coach', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: objective.title,
                    chatHistory: recentMessages,
                    userQuery: userQuery
                })
            });
            const data = await res.json();

            if (data.message) {
                await addDoc(collection(db, 'objectives', id as string, 'ai_messages'), {
                    user_id: 'ai-coach',
                    user_name: 'Coach IA 🤖',
                    content: data.message,
                    created_at: serverTimestamp()
                });
            }
        } catch (error) {
            console.error("Erreur Coach IA", error);
        } finally {
            setCallingCoach(false);
        }
    };

    const toggleMilestone = async (milestoneId: string, currentStatus: boolean) => {
        try {
            const mRef = doc(db, 'objectives', id as string, 'milestones', milestoneId);
            await updateDoc(mRef, { completed: !currentStatus });
        } catch (e) {
            console.error(e);
        }
    };

    const handleCreateSession = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !newSession.title || !newSession.scheduled_at) return;
        setCreatingSession(true);
        try {
            const baseDate = new Date(newSession.scheduled_at);
            const dates: Date[] = [baseDate];
            if (newSession.recurring !== 'none') {
                const intervalDays = newSession.recurring === 'weekly' ? 7 : 14;
                for (let i = 1; i < 4; i++) {
                    const d = new Date(baseDate);
                    d.setDate(d.getDate() + i * intervalDays);
                    dates.push(d);
                }
            }

            for (const date of dates) {
                await addDoc(collection(db, 'objectives', id as string, 'sessions'), {
                    title: newSession.title,
                    type: newSession.type,
                    scheduled_at: date,
                    description: newSession.description,
                    creator_id: user.uid,
                    creator_name: user.displayName || user.email?.split('@')[0] || 'Anonyme',
                    attendees: [user.uid],
                    recurring: newSession.recurring,
                    created_at: serverTimestamp()
                });
            }

            // Format the first date for the notification
            const formattedDate = baseDate.toLocaleDateString('fr-FR', {
                weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit'
            });
            const recurringLabel = newSession.recurring === 'weekly' ? ' (récurrente chaque semaine)' : newSession.recurring === 'biweekly' ? ' (récurrente toutes les 2 semaines)' : '';

            // Notify others in the room
            const othersToNotify = memberships.map((m: any) => m.user_id).filter((uid: string) => uid !== user.uid);
            for (const uid of othersToNotify) {
                await addDoc(collection(db, 'users', uid, 'notifications'), {
                    message: `${user.displayName || user.email?.split('@')[0] || 'Un membre'} a planifié une session "${newSession.title}"${recurringLabel} le ${formattedDate} dans le salon "${objective?.title}".`,
                    type: 'session_add',
                    link: `/objective/${id}`,
                    read: false,
                    created_at: serverTimestamp()
                });
            }

            setNewSession({ title: '', type: 'travail', scheduled_at: '', description: '', recurring: 'none' });
            setShowSessionForm(false);
        } catch (err) {
            console.error("Erreur création session", err);
        } finally {
            setCreatingSession(false);
        }
    };

    const handleToggleAttendee = async (session: Session) => {
        if (!user) return;
        const sRef = doc(db, 'objectives', id as string, 'sessions', session.id);
        const isAttending = session.attendees.includes(user.uid);
        await updateDoc(sRef, {
            attendees: isAttending ? arrayRemove(user.uid) : arrayUnion(user.uid)
        });
    };

    const handleUpdateSessionDate = async (session: Session) => {
        if (!editDate || !user) return;
        const newDate = new Date(editDate);
        const sRef = doc(db, 'objectives', id as string, 'sessions', session.id);
        await updateDoc(sRef, { scheduled_at: newDate });

        // Format the new date nicely for the notification
        const formatted = newDate.toLocaleDateString('fr-FR', {
            weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit'
        });

        // Notify all attendees except the creator
        const othersToNotify = session.attendees.filter(uid => uid !== user.uid);
        for (const uid of othersToNotify) {
            await addDoc(collection(db, 'users', uid, 'notifications'), {
                message: `La session "${session.title}" dans le salon "${objective?.title}" a été reprogrammée au ${formatted}.`,
                type: 'session_update',
                link: `/objective/${id}`,
                read: false,
                created_at: serverTimestamp()
            });
        }

        setEditingSessionId(null);
        setEditDate('');
    };

    const handleDeleteSession = (sessionId: string) => {
        const session = sessions.find(s => s.id === sessionId);
        if (!session) return;
        setDeleteConfirm({
            show: true,
            sessionId,
            title: "Supprimer cette session ?",
            desc: `Tu es sur le point de supprimer la session "${session.title}". Cette action est irréversible.`
        });
    };

    const handleDeleteAllSessions = () => {
        if (sessions.length === 0) return;
        setDeleteConfirm({
            show: true,
            sessionId: 'all',
            title: `Supprimer TOUTES les sessions ?`,
            desc: `Tu vas supprimer les ${sessions.length} sessions de cet objectif. Cette action est irréversible.`
        });
    };

    const confirmDeleteAction = async () => {
        if (!id || !user) return;
        const { sessionId } = deleteConfirm;
        try {
            if (sessionId === 'all') {
                for (const s of sessions) {
                    await deleteDoc(doc(db, 'objectives', id as string, 'sessions', s.id));
                }
            } else {
                await deleteDoc(doc(db, 'objectives', id as string, 'sessions', sessionId));
            }
        } catch (err) {
            console.error("Erreur lors de la suppression", err);
        } finally {
            setDeleteConfirm(prev => ({ ...prev, show: false }));
        }
    };

    const handleCreatePoll = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !newPoll.question.trim()) return;
        const validOptions = newPoll.options.filter(o => o.trim());
        if (validOptions.length < 2) return;
        setCreatingPoll(true);
        try {
            await addDoc(collection(db, 'objectives', id as string, 'polls'), {
                question: newPoll.question.trim(),
                options: validOptions.map(text => ({ text, votes: [] })),
                creator_id: user.uid,
                creator_name: user.displayName || user.email?.split('@')[0] || 'Anonyme',
                closed: false,
                created_at: serverTimestamp()
            });
            setNewPoll({ question: '', options: ['', ''] });
            setShowPollForm(false);
        } catch (err) {
            console.error('Erreur création sondage', err);
        } finally {
            setCreatingPoll(false);
        }
    };

    const handleVote = async (poll: Poll, optionIndex: number) => {
        if (!user) return;
        const pRef = doc(db, 'objectives', id as string, 'polls', poll.id);
        // Remove user from all options first, then add to chosen
        const updatedOptions = poll.options.map((opt, i) => ({
            ...opt,
            votes: i === optionIndex
                ? opt.votes.includes(user.uid) ? opt.votes.filter(uid => uid !== user.uid) : [...opt.votes, user.uid]
                : opt.votes.filter(uid => uid !== user.uid)
        }));
        await updateDoc(pRef, { options: updatedOptions });
    };

    const handleClosePoll = async (poll: Poll) => {
        const pRef = doc(db, 'objectives', id as string, 'polls', poll.id);
        await updateDoc(pRef, { closed: !poll.closed });
    };

    const handleAddPersonalMilestone = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !newPersonalStep.trim()) return;
        await addDoc(collection(db, 'objectives', id as string, 'personal_milestones'), {
            text: newPersonalStep.trim(),
            completed: false,
            user_id: user.uid,
            created_at: serverTimestamp()
        });
        setNewPersonalStep('');
    };

    const handleTogglePersonalMilestone = async (milestoneId: string, current: boolean) => {
        const mRef = doc(db, 'objectives', id as string, 'personal_milestones', milestoneId);
        await updateDoc(mRef, { completed: !current });
    };

    const handleDeletePersonalMilestone = async (milestoneId: string) => {
        const { deleteDoc } = await import('firebase/firestore');
        const mRef = doc(db, 'objectives', id as string, 'personal_milestones', milestoneId);
        await deleteDoc(mRef);
    };

    const toggleFocus = async () => {
        if (!user || !id) return;
        const presRef = doc(db, 'objectives', id as string, 'presence', user.uid);
        const next = !isWorking;
        setIsWorking(next);
        setIsWorkingGlobal(next);

        await setDoc(presRef, {
            user_id: user.uid,
            is_working: next,
            started_at: next ? serverTimestamp() : null,
            last_seen: serverTimestamp(),
        }, { merge: true });

        if (next) {
            heartbeatRef.current = setInterval(async () => {
                await setDoc(presRef, { last_seen: serverTimestamp() }, { merge: true });
            }, 30000);
        } else {
            if (heartbeatRef.current) clearInterval(heartbeatRef.current);
        }

    };

    const handleAddFriend = async (targetUserId: string) => {
        if (!user) return;
        try {
            const uid1 = user.uid < targetUserId ? user.uid : targetUserId;
            const uid2 = user.uid < targetUserId ? targetUserId : user.uid;

            await addDoc(collection(db, 'friendships'), {
                user1_id: uid1,
                user2_id: uid2,
                sender_id: user.uid,
                status: 'pending',
                created_at: serverTimestamp()
            });

            await addDoc(collection(db, 'users', targetUserId, 'notifications'), {
                message: `${user.displayName || user.email?.split('@')[0]} vous a envoyé une demande d'ami depuis le salon ${objective?.title}.`,
                type: 'friend_request',
                link: '/friends',
                read: false,
                created_at: serverTimestamp()
            });
        } catch (error) {
            console.error(error);
            alert("Erreur lors de l'envoi de la demande");
        }
    };


    // ─── NOTES COLLABORATIVES ──────────────────────────────────────────────
    const [collabNote, setCollabNote] = useState('');
    const [savingNote, setSavingNote] = useState(false);
    const noteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (!id) return;
        const noteRef = doc(db, 'objectives', id as string, 'collab', 'note');
        const unsub = onSnapshot(noteRef, (snap) => {
            if (snap.exists()) setCollabNote(snap.data().content ?? '');
        });
        return () => unsub();
    }, [id]);

    const handleNoteChange = (val: string) => {
        setCollabNote(val);
        if (noteTimerRef.current) clearTimeout(noteTimerRef.current);
        noteTimerRef.current = setTimeout(async () => {
            setSavingNote(true);
            await setDoc(doc(db, 'objectives', id as string, 'collab', 'note'), {
                content: val, updated_by: user?.uid, updated_at: serverTimestamp()
            }, { merge: true });
            setSavingNote(false);
        }, 800);
    };

    // ─── DÉCISIONS ─────────────────────────────────────────────────────────
    type Decision = { id: string; title: string; description: string; outcome: 'approved' | 'rejected' | 'pending'; creator_id: string; creator_name: string; created_at: any };
    const [decisions, setDecisions] = useState<Decision[]>([]);
    const [showDecisionForm, setShowDecisionForm] = useState(false);
    const [newDecision, setNewDecision] = useState({ title: '', description: '', outcome: 'pending' as 'approved' | 'rejected' | 'pending' });
    const [addingDecision, setAddingDecision] = useState(false);

    useEffect(() => {
        if (!id) return;
        const q = query(collection(db, 'objectives', id as string, 'decisions'), orderBy('created_at', 'desc'));
        const unsub = onSnapshot(q, (snap) => {
            setDecisions(snap.docs.map(d => ({ id: d.id, ...d.data() } as Decision)));
        });
        return () => unsub();
    }, [id]);

    const handleAddDecision = async () => {
        if (!newDecision.title.trim() || !user?.uid) return;
        setAddingDecision(true);
        try {
            await addDoc(collection(db, 'objectives', id as string, 'decisions'), {
                title: newDecision.title,
                description: newDecision.description,
                outcome: 'pending',
                creator_id: user.uid,
                creator_name: user.displayName || user.email?.split('@')[0] || 'Anonyme',
                created_at: serverTimestamp()
            });
            // Notify admins/creators if poster is a regular member
            const posterIsAdmin = objective?.creator_id === user.uid || memberships.find((m: any) => m.user_id === user.uid)?.role === 'admin';
            if (!posterIsAdmin) {
                const targets = [objective?.creator_id, ...memberships.filter((m: any) => m.role === 'admin').map((m: any) => m.user_id)]
                    .filter((uid): uid is string => !!uid && uid !== user.uid);
                await Promise.all([...new Set(targets)].map(uid =>
                    addDoc(collection(db, 'users', uid, 'notifications'), {
                        message: `${user.displayName || user.email?.split('@')[0]} a proposé une décision dans "${objective?.title}" — en attente de validation.`,
                        type: 'decision',
                        link: `/objective/${id}`,
                        read: false,
                        created_at: serverTimestamp()
                    })
                ));
            }
        } catch (err) { console.error(err); }
        setNewDecision({ title: '', description: '', outcome: 'pending' });
        setShowDecisionForm(false);
        setAddingDecision(false);
    };

    const handleDeleteDecision = async (decId: string) => {
        await deleteDoc(doc(db, 'objectives', id as string, 'decisions', decId));
    };

    // ─── ANNONCES ──────────────────────────────────────────────────────────
    type Announcement = { id: string; title: string; body: string; creator_id: string; creator_name: string; created_at: any };
    const [announcements, setAnnouncements] = useState<Announcement[]>([]);
    const [showAnnouncementForm, setShowAnnouncementForm] = useState(false);
    const [newAnnouncement, setNewAnnouncement] = useState({ title: '', body: '' });
    const [addingAnnouncement, setAddingAnnouncement] = useState(false);

    useEffect(() => {
        if (!id) return;
        const q = query(collection(db, 'objectives', id as string, 'announcements'), orderBy('created_at', 'desc'));
        const unsub = onSnapshot(q, (snap) => {
            setAnnouncements(snap.docs.map(d => ({ id: d.id, ...d.data() } as Announcement)));
        });
        return () => unsub();
    }, [id]);

    const handleAddAnnouncement = async () => {
        if (!newAnnouncement.title.trim()) return;
        setAddingAnnouncement(true);
        await addDoc(collection(db, 'objectives', id as string, 'announcements'), {
            ...newAnnouncement,
            creator_id: user?.uid,
            creator_name: user?.displayName || user?.email?.split('@')[0],
            created_at: serverTimestamp()
        });
        setNewAnnouncement({ title: '', body: '' });
        setShowAnnouncementForm(false);
        setAddingAnnouncement(false);
    };

    const handleDeleteAnnouncement = async (annId: string) => {
        await deleteDoc(doc(db, 'objectives', id as string, 'announcements', annId));
    };

    // ─── Q&A ───────────────────────────────────────────────────────────────
    type Question = { id: string; question: string; answer?: string; creator_id: string; creator_name: string; answered_by?: string; answered_at?: any; created_at: any };
    const [questions, setQuestions] = useState<Question[]>([]);
    const [showQuestionForm, setShowQuestionForm] = useState(false);
    const [newQuestionText, setNewQuestionText] = useState('');
    const [addingQuestion, setAddingQuestion] = useState(false);
    const [answerInputs, setAnswerInputs] = useState<Record<string, string>>({});
    const [answeringId, setAnsweringId] = useState<string | null>(null);

    useEffect(() => {
        if (!id) return;
        const q = query(collection(db, 'objectives', id as string, 'questions'), orderBy('created_at', 'desc'));
        const unsub = onSnapshot(q, (snap) => {
            setQuestions(snap.docs.map(d => ({ id: d.id, ...d.data() } as Question)));
        });
        return () => unsub();
    }, [id]);

    const handleAddQuestion = async () => {
        if (!newQuestionText.trim()) return;
        setAddingQuestion(true);
        await addDoc(collection(db, 'objectives', id as string, 'questions'), {
            question: newQuestionText,
            creator_id: user?.uid,
            creator_name: user?.displayName || user?.email?.split('@')[0],
            created_at: serverTimestamp()
        });
        setNewQuestionText('');
        setShowQuestionForm(false);
        setAddingQuestion(false);
    };

    const handleAnswerQuestion = async (qId: string) => {
        const answer = answerInputs[qId]?.trim();
        if (!answer) return;
        setAnsweringId(qId);
        await updateDoc(doc(db, 'objectives', id as string, 'questions', qId), {
            answer,
            answered_by: user?.displayName || user?.email?.split('@')[0],
            answered_at: serverTimestamp()
        });
        setAnswerInputs(prev => ({ ...prev, [qId]: '' }));
        setAnsweringId(null);
    };

    const handleDeleteQuestion = async (qId: string) => {
        await deleteDoc(doc(db, 'objectives', id as string, 'questions', qId));
    };

    // ─── FOCUS DU JOUR ─────────────────────────────────────────────────────
    type FocusItem = { id: string; user_id: string; user_name: string; focus: string; date: string; created_at: any };
    const [dailyFocusItems, setDailyFocusItems] = useState<FocusItem[]>([]);
    const [myFocusText, setMyFocusText] = useState('');
    const [savingFocus, setSavingFocus] = useState(false);
    const focusInitialized = useRef(false);

    useEffect(() => {
        if (!id || !user?.uid) return;
        focusInitialized.current = false;
        const today = new Date().toISOString().split('T')[0];
        const q = query(collection(db, 'objectives', id as string, 'daily_focus'), where('date', '==', today));
        const unsub = onSnapshot(q, (snap) => {
            const items = snap.docs.map(d => ({ id: d.id, ...d.data() } as FocusItem)).sort((a, b) => (a.created_at?.seconds ?? 0) - (b.created_at?.seconds ?? 0));
            setDailyFocusItems(items);
            if (!focusInitialized.current) {
                const mine = items.find(f => f.user_id === user?.uid);
                if (mine) setMyFocusText(mine.focus);
                focusInitialized.current = true;
            }
        });
        return () => { unsub(); focusInitialized.current = false; };
    }, [id, user?.uid]);

    const [focusSaved, setFocusSaved] = useState(false);
    const [focusError, setFocusError] = useState('');

    const handleSaveFocus = async () => {
        console.log('[Focus] click — myFocusText:', JSON.stringify(myFocusText), '| uid:', user?.uid, '| id:', id);
        if (!myFocusText.trim()) { setFocusError('Écrivez votre focus avant de sauvegarder.'); return; }
        if (!user?.uid || !id) { setFocusError('Erreur: utilisateur ou salon introuvable.'); return; }
        setSavingFocus(true);
        setFocusError('');
        setFocusSaved(false);
        try {
            const today = new Date().toISOString().split('T')[0];
            const docId = `${today}_${user.uid}`;
            console.log('[Focus] writing to daily_focus/', docId);
            await setDoc(doc(db, 'objectives', id as string, 'daily_focus', docId), {
                user_id: user.uid,
                user_name: user.displayName || user.email?.split('@')[0] || 'Anonyme',
                focus: myFocusText,
                date: today,
                created_at: serverTimestamp()
            });
            console.log('[Focus] saved OK');
            setFocusSaved(true);
            setMyFocusText('');
            setTimeout(() => setFocusSaved(false), 3000);
        } catch (err: any) {
            console.error('[Focus] error:', err);
            setFocusError(err?.message || 'Erreur lors de la sauvegarde.');
        } finally {
            setSavingFocus(false);
        }
    };

    // ─── FOCUS DELETE / EDIT ───────────────────────────────────────────────
    const handleDeleteFocus = async () => {
        if (!user?.uid || !id) return;
        const today = new Date().toISOString().split('T')[0];
        await deleteDoc(doc(db, 'objectives', id as string, 'daily_focus', `${today}_${user.uid}`));
    };

    // ─── ROADMAP ─────────────────────────────────────────────────────────────
    type RoadmapPhase = { id: string; title: string; color: string; start_date: string; end_date: string; description: string; creator_id: string; creator_name: string; created_at: any };
    type RoadmapMilestone = { id: string; title: string; date: string; type: 'milestone' | 'deadline' | 'launch' | 'review'; phase_id?: string; creator_id: string; creator_name: string; created_at: any };
    const [roadmapPhases, setRoadmapPhases] = useState<RoadmapPhase[]>([]);
    const [roadmapMilestones, setRoadmapMilestones] = useState<RoadmapMilestone[]>([]);
    const [showPhaseForm, setShowPhaseForm] = useState(false);
    const [showMilestoneForm, setShowMilestoneForm] = useState(false);
    const [newPhase, setNewPhase] = useState({ title: '', color: '#6366f1', start_date: '', end_date: '', description: '' });
    const [newMilestone, setNewMilestone] = useState({ title: '', date: '', type: 'milestone' as 'milestone' | 'deadline' | 'launch' | 'review', phase_id: '' });
    const [addingPhase, setAddingPhase] = useState(false);
    const [addingMilestone, setAddingMilestone] = useState(false);
    const [rmOffset, setRmOffset] = useState(0);
    const [rmZoom, setRmZoom] = useState(130);
    const [rmSelected, setRmSelected] = useState<{type:'phase'|'milestone';data:any}|null>(null);
    const [rmPickerOpen, setRmPickerOpen] = useState<string|null>(null);
    const [rmPickerCal, setRmPickerCal] = useState({y:new Date().getFullYear(),m:new Date().getMonth()});
    const [rmView, setRmView] = useState<'week'|'month'|'quarter'>('month');
    const [rmEditing, setRmEditing] = useState<{type:'phase'|'milestone';data:any}|null>(null);
    const [editData, setEditData] = useState<any>({});
    const [savingEdit, setSavingEdit] = useState(false);
    const [rmAiOpen, setRmAiOpen] = useState(false);
    const [rmAiPrompt, setRmAiPrompt] = useState('');
    const [rmAiGenerating, setRmAiGenerating] = useState(false);
    const [rmAiPreview, setRmAiPreview] = useState<{phases:any[];milestones:any[]}|null>(null);
    const [rmAiApplying, setRmAiApplying] = useState(false);
    const [rmMsGenOpen, setRmMsGenOpen] = useState(false);
    const [rmMsGenPrompt, setRmMsGenPrompt] = useState('');
    const [rmMsGenerating, setRmMsGenerating] = useState(false);
    const [rmMsPreview, setRmMsPreview] = useState<{title:string;date:string;type:string;phase_id:string;rationale:string}[]|null>(null);
    const [rmMsApplying, setRmMsApplying] = useState(false);

    useEffect(() => {
        if (!id) return;
        const unsubP = onSnapshot(query(collection(db, 'objectives', id as string, 'roadmap_phases'), orderBy('start_date', 'asc')), snap => {
            setRoadmapPhases(snap.docs.map(d => ({ id: d.id, ...d.data() } as RoadmapPhase)));
        });
        const unsubM = onSnapshot(query(collection(db, 'objectives', id as string, 'roadmap_milestones'), orderBy('date', 'asc')), snap => {
            setRoadmapMilestones(snap.docs.map(d => ({ id: d.id, ...d.data() } as RoadmapMilestone)));
        });
        return () => { unsubP(); unsubM(); };
    }, [id]);

    const handleAddPhase = async () => {
        if (!newPhase.title.trim() || !newPhase.start_date || !newPhase.end_date || !user?.uid) return;
        setAddingPhase(true);
        try {
            await addDoc(collection(db, 'objectives', id as string, 'roadmap_phases'), { ...newPhase, creator_id: user.uid, creator_name: user.displayName || user.email?.split('@')[0] || 'Anonyme', created_at: serverTimestamp() });
            setNewPhase({ title: '', color: '#6366f1', start_date: '', end_date: '', description: '' });
            setShowPhaseForm(false);
        } catch (err) { console.error(err); }
        setAddingPhase(false);
    };
    const handleDeletePhase = async (phaseId: string) => { await deleteDoc(doc(db, 'objectives', id as string, 'roadmap_phases', phaseId)); };
    const handleAddMilestone = async () => {
        if (!newMilestone.title.trim() || !newMilestone.date || !user?.uid) return;
        setAddingMilestone(true);
        try {
            await addDoc(collection(db, 'objectives', id as string, 'roadmap_milestones'), { ...newMilestone, creator_id: user.uid, creator_name: user.displayName || user.email?.split('@')[0] || 'Anonyme', created_at: serverTimestamp() });
            setNewMilestone({ title: '', date: '', type: 'milestone', phase_id: '' });
            setShowMilestoneForm(false);
        } catch (err) { console.error(err); }
        setAddingMilestone(false);
    };
    const handleDeleteMilestone = async (msId: string) => { await deleteDoc(doc(db, 'objectives', id as string, 'roadmap_milestones', msId)); };
    const handleSaveEdit = async () => {
        if (!id || !rmEditing) return;
        setSavingEdit(true);
        try {
            if (rmEditing.type === 'phase') {
                await updateDoc(doc(db, 'objectives', id as string, 'roadmap_phases', rmEditing.data.id), { title: editData.title, color: editData.color, start_date: editData.start_date, end_date: editData.end_date, description: editData.description || '' });
            } else {
                await updateDoc(doc(db, 'objectives', id as string, 'roadmap_milestones', rmEditing.data.id), { title: editData.title, date: editData.date, type: editData.type, phase_id: editData.phase_id || '' });
            }
            setRmEditing(null);
        } catch (err) { console.error(err); }
        setSavingEdit(false);
    };
    const handleGenerateRoadmap = async () => {
        if (!id) return;
        setRmAiGenerating(true);
        setRmAiPreview(null);
        try {
            const res = await fetch('/api/generate-roadmap', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'objective',
                    title: objective?.title,
                    description: objective?.description,
                    category: objective?.category,
                    members: memberships.map((m: any) => m.user_name || m.display_name || 'Membre'),
                    milestones: milestones.map(m => ({ text: m.text, completed: m.completed })),
                    resources: resources.map((r: any) => r.text),
                    decisions: decisions.map((d: any) => ({ title: d.title, description: d.description, outcome: d.outcome })),
                    announcements: announcements.map((a: any) => ({ title: a.title, content: a.content })),
                    questions: questions.filter((q: any) => q.answer).map((q: any) => ({ question: q.question, answer: q.answer })),
                    focuses: dailyFocusItems.map((f: any) => f.focus),
                    userPrompt: rmAiPrompt,
                    today: new Date().toISOString(),
                }),
            });
            const data = await res.json();
            setRmAiPreview(data);
        } catch (err) { console.error(err); }
        setRmAiGenerating(false);
    };
    const handleApplyRoadmap = async () => {
        if (!rmAiPreview || !id || !user?.uid) return;
        setRmAiApplying(true);
        try {
            const phaseIds: string[] = [];
            for (const phase of rmAiPreview.phases) {
                const ref = await addDoc(collection(db, 'objectives', id as string, 'roadmap_phases'), { ...phase, creator_id: user.uid, creator_name: user.displayName || user.email?.split('@')[0] || 'IA', created_at: serverTimestamp() });
                phaseIds.push(ref.id);
            }
            for (const ms of rmAiPreview.milestones) {
                const phaseId = ms.phase_index >= 0 && ms.phase_index < phaseIds.length ? phaseIds[ms.phase_index] : '';
                await addDoc(collection(db, 'objectives', id as string, 'roadmap_milestones'), { title: ms.title, date: ms.date, type: ms.type || 'milestone', phase_id: phaseId, creator_id: user.uid, creator_name: user.displayName || user.email?.split('@')[0] || 'IA', created_at: serverTimestamp() });
            }
            setRmAiOpen(false); setRmAiPreview(null); setRmAiPrompt('');
        } catch (err) { console.error(err); }
        setRmAiApplying(false);
    };

    const handleGenerateMilestones = async () => {
        if (!roadmapPhases.length || !objective) return;
        setRmMsGenerating(true); setRmMsPreview(null);
        try {
            const res = await fetch('/api/generate-milestones', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
                type: 'objective', title: objective.title, description: objective.description || '',
                category: objective.category,
                phases: roadmapPhases.map(p => ({ id: p.id, title: p.title, start_date: p.start_date, end_date: p.end_date, description: p.description || '' })),
                existingMilestones: roadmapMilestones.map(m => ({ title: m.title, date: m.date })),
                steps: milestones.map(m => ({ text: m.text, completed: m.completed })),
                decisions: [],
                userPrompt: rmMsGenPrompt,
                today: new Date().toISOString().split('T')[0],
            }) });
            if (!res.ok) throw new Error('API error');
            const data = await res.json();
            setRmMsPreview(data.milestones || []);
        } catch (err) { console.error(err); }
        setRmMsGenerating(false);
    };

    const handleApplyMilestones = async () => {
        if (!rmMsPreview?.length || !user) return;
        setRmMsApplying(true);
        try {
            for (const ms of rmMsPreview) {
                await addDoc(collection(db, 'objectives', id as string, 'roadmap_milestones'), {
                    title: ms.title, date: ms.date, type: ms.type || 'milestone',
                    phase_id: ms.phase_id || '',
                    creator_id: user.uid, creator_name: user.displayName || user.email?.split('@')[0] || 'IA',
                    created_at: serverTimestamp(),
                });
            }
            setRmMsGenOpen(false); setRmMsPreview(null); setRmMsGenPrompt('');
        } catch (err) { console.error(err); }
        setRmMsApplying(false);
    };

    // ─── ANNOUNCEMENT COMMENTS ─────────────────────────────────────────────
    const [annComments, setAnnComments] = useState<Record<string, any[]>>({});
    const [openAnnComments, setOpenAnnComments] = useState<Set<string>>(new Set());
    const [annCommentInputs, setAnnCommentInputs] = useState<Record<string, string>>({});
    const annCommentUnsubs = useRef<Record<string, () => void>>({});

    const toggleAnnComments = (annId: string) => {
        setOpenAnnComments(prev => {
            const next = new Set(prev);
            if (next.has(annId)) { next.delete(annId); } else {
                next.add(annId);
                if (!annCommentUnsubs.current[annId]) {
                    const unsub = onSnapshot(
                        query(collection(db, 'objectives', id as string, 'announcements', annId, 'comments'), orderBy('created_at', 'asc')),
                        snap => setAnnComments(p => ({ ...p, [annId]: snap.docs.map(d => ({ id: d.id, ...d.data() })) }))
                    );
                    annCommentUnsubs.current[annId] = unsub;
                }
            }
            return next;
        });
    };

    const handleAddAnnComment = async (annId: string) => {
        const text = annCommentInputs[annId]?.trim();
        if (!text || !user?.uid) return;
        await addDoc(collection(db, 'objectives', id as string, 'announcements', annId, 'comments'), {
            text, creator_id: user.uid,
            creator_name: user.displayName || user.email?.split('@')[0] || 'Anonyme',
            created_at: serverTimestamp()
        });
        setAnnCommentInputs(p => ({ ...p, [annId]: '' }));
    };

    // ─── DECISION COMMENTS + OUTCOME ──────────────────────────────────────
    const [decComments, setDecComments] = useState<Record<string, any[]>>({});
    const [openDecComments, setOpenDecComments] = useState<Set<string>>(new Set());
    const [decCommentInputs, setDecCommentInputs] = useState<Record<string, string>>({});
    const decCommentUnsubs = useRef<Record<string, () => void>>({});

    const toggleDecComments = (decId: string) => {
        setOpenDecComments(prev => {
            const next = new Set(prev);
            if (next.has(decId)) { next.delete(decId); } else {
                next.add(decId);
                if (!decCommentUnsubs.current[decId]) {
                    const unsub = onSnapshot(
                        query(collection(db, 'objectives', id as string, 'decisions', decId, 'comments'), orderBy('created_at', 'asc')),
                        snap => setDecComments(p => ({ ...p, [decId]: snap.docs.map(d => ({ id: d.id, ...d.data() })) }))
                    );
                    decCommentUnsubs.current[decId] = unsub;
                }
            }
            return next;
        });
    };

    const handleAddDecComment = async (decId: string) => {
        const text = decCommentInputs[decId]?.trim();
        if (!text || !user?.uid) return;
        await addDoc(collection(db, 'objectives', id as string, 'decisions', decId, 'comments'), {
            text, creator_id: user.uid,
            creator_name: user.displayName || user.email?.split('@')[0] || 'Anonyme',
            created_at: serverTimestamp()
        });
        setDecCommentInputs(p => ({ ...p, [decId]: '' }));
    };

    const handleSetDecisionOutcome = async (decId: string, outcome: 'approved' | 'rejected' | 'pending') => {
        await updateDoc(doc(db, 'objectives', id as string, 'decisions', decId), { outcome });
    };

    if (loading) return <div className="container py-16 text-center">{t('room_loading')}</div>;
    if (!objective) return null;

    // ─── COMPOSITE GROUP PROGRESSION ──────────────────────────────────
    // 1. Hours dimension: avg. member completion vs target (40% weight)
    const totalCompleted = memberships.reduce((acc, m) => acc + (m.completed_hours ?? 0), 0);
    const totalTarget = objective.target_hours * (memberships.length || 1);
    const hoursPerc = Math.min(100, totalTarget > 0 ? Math.round((totalCompleted / totalTarget) * 100) : 0);

    // 2. Milestones dimension: % of group milestones checked (40% weight)
    const milestonesTotal = milestones.length;
    const milestonesDone = milestones.filter(m => m.completed).length;
    const milestonesPerc = milestonesTotal > 0 ? Math.round((milestonesDone / milestonesTotal) * 100) : 0;

    // 3. Sessions dimension: sessions that already happened / total sessions (20% weight)
    const sessionsTotal = sessions.length;
    const sessionsPast = sessions.filter(s => {
        const d = s.scheduled_at?.toDate ? s.scheduled_at.toDate() : new Date(s.scheduled_at);
        return d < new Date();
    }).length;
    const sessionsPerc = sessionsTotal > 0 ? Math.round((sessionsPast / sessionsTotal) * 100) : 0;

    // Composite weighted score
    const globalPerc = Math.min(100, Math.round(
        (milestonesTotal > 0 ? hoursPerc * 0.4 + milestonesPerc * 0.4 + sessionsPerc * 0.2 : hoursPerc * 0.7 + sessionsPerc * 0.3)
    ));

    return (
        <div style={{ paddingLeft: '228px', paddingRight: '3rem', paddingTop: '2rem', paddingBottom: '3rem', minHeight: '100vh' }}>
            <style>{`
                @keyframes fadeOverlay {
                    from { opacity: 0; }
                    to   { opacity: 1; }
                }
                @keyframes scaleUp {
                    from { transform: translate(-50%, -48%) scale(0.96); opacity: 0; }
                    to   { transform: translate(-50%, -50%) scale(1);    opacity: 1; }
                }
                @keyframes pulse {
                    0% { transform: scale(1); opacity: 1; }
                    50% { transform: scale(1.05); opacity: 0.8; }
                    100% { transform: scale(1); opacity: 1; }
                }
            `}</style>

            {/* Hero Section */}
            <div className="card-glass fade-enter" style={{
                position: 'relative', overflow: 'hidden',
                padding: '3rem 3.5rem', marginBottom: '2.5rem', borderRadius: '24px',
                border: '1px solid rgba(99,102,241,0.18)',
                background: 'linear-gradient(135deg, #13131c 0%, #181825 100%)',
                boxShadow: '0 4px 64px rgba(0,0,0,0.5), 0 1px 0 rgba(255,255,255,0.05) inset',
            }}>
                <div style={{ position: 'absolute', top: '-120px', right: '-80px', width: '500px', height: '400px', background: 'radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 65%)', pointerEvents: 'none', zIndex: 0 }} />
                <div style={{ position: 'absolute', bottom: '-80px', left: '30%', width: '350px', height: '250px', background: 'radial-gradient(circle, rgba(236,72,153,0.07) 0%, transparent 65%)', pointerEvents: 'none', zIndex: 0 }} />

                {/* 2-column layout */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '4rem', alignItems: 'center', position: 'relative', zIndex: 1 }}>
                    {/* LEFT: identity + actions */}
                    <div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px', marginBottom: '1.25rem' }}>
                            {Array.isArray(objective.category) ? (
                                objective.category.map((cat: string) => (
                                    <div key={cat} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: '999px', padding: '3px 12px', fontSize: '0.78rem', fontWeight: 600, color: '#a5b4fc' }}>
                                        <Hash size={11} /> {cat}
                                    </div>
                                ))
                            ) : (
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: '999px', padding: '3px 12px', fontSize: '0.78rem', fontWeight: 600, color: '#a5b4fc' }}>
                                    <Hash size={11} /> {objective.category}
                                </div>
                            )}
                        </div>
                        <h1 className="text-gradient" style={{ fontSize: '2.6rem', margin: '0 0 0.9rem', lineHeight: 1.15, letterSpacing: '-0.03em' }}>{objective.title}</h1>
                        {objective.description && (
                            <p style={{ margin: '0 0 1.75rem', opacity: 0.62, lineHeight: 1.75, maxWidth: '580px', fontSize: '0.98rem', color: 'var(--color-text-secondary)' }}>
                                {objective.description.slice(0, 180)}{objective.description.length > 180 ? '…' : ''}
                            </p>
                        )}

                        {/* Live working status */}
                        {(() => {
                            const working = memberships.filter(m => isAlive(presenceMap[m.user_id]));
                            return working.length > 0 ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1.5rem' }}>
                                    <div style={{ display: 'flex' }}>
                                        {working.slice(0, 5).map((m, i) => (
                                            <div key={m.user_id} style={{ marginLeft: i > 0 ? '-8px' : 0, position: 'relative', zIndex: 5 - i }}>
                                                <Avatar uid={m.user_id} avatarUrl={m.user.avatar_url} avatarStyle={m.user.avatar_style} size={26} style={{ border: '2px solid #10b981', borderRadius: '50%' }} />
                                            </div>
                                        ))}
                                    </div>
                                    <span style={{ fontSize: '0.85rem', color: '#10b981', fontWeight: 600 }}>
                                        {working.length === 1 ? `${working[0].user.full_name?.split(' ')[0] || 'Un membre'} travaille maintenant` : `${working.length} membres travaillent maintenant`}
                                    </span>
                                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', boxShadow: '0 0 0 2px rgba(16,185,129,0.3)', animation: 'pulse 2s infinite', display: 'inline-block' }} />
                                </div>
                            ) : (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1.5rem' }}>
                                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#3f3f46', display: 'inline-block' }} />
                                    <span style={{ fontSize: '0.82rem', color: '#71717a' }}>Personne ne travaille pour l'instant</span>
                                </div>
                            );
                        })()}

                        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                            <button
                                onClick={toggleFocus}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '10px',
                                    padding: '13px 24px', borderRadius: '14px', fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer',
                                    transition: 'all 0.25s cubic-bezier(0.4,0,0.2,1)',
                                    background: isWorking ? 'rgba(16,185,129,0.15)' : 'linear-gradient(135deg,#6366f1,#4f46e5)',
                                    color: isWorking ? '#10b981' : '#fff',
                                    border: isWorking ? '1px solid rgba(16,185,129,0.4)' : 'none',
                                    boxShadow: isWorking ? '0 0 20px rgba(16,185,129,0.2)' : '0 8px 24px rgba(99,102,241,0.35)',
                                }}
                            >
                                <Zap size={17} strokeWidth={2.5} style={{ fill: isWorking ? 'currentColor' : 'none' }} />
                                {isWorking ? "Je m'arrête" : 'Je commence à travailler'}
                            </button>
                            <Link
                                href={`/session?id=${objective.id}`}
                                className="btn btn-outline"
                                style={{ padding: '13px 20px', borderRadius: '14px', display: 'flex', alignItems: 'center', gap: '10px', background: liveRoomCount > 0 ? 'rgba(16,185,129,0.08)' : undefined, borderColor: liveRoomCount > 0 ? 'rgba(16,185,129,0.35)' : undefined, color: liveRoomCount > 0 ? '#10b981' : undefined }}
                            >
                                <Video size={17} /> Coworking live
                                {liveRoomCount > 0 && (
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: 6, padding: '2px 7px', fontSize: '0.7rem', fontWeight: 700, color: '#10b981' }}>
                                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#10b981', animation: 'pulse 1.5s infinite', display: 'inline-block' }} />
                                        {liveRoomCount} en direct
                                    </span>
                                )}
                            </Link>
                        </div>
                        {isWorking && (() => {
                            const startedAt = presenceMap[user?.uid ?? '']?.started_at;
                            return startedAt ? <div style={{ marginTop: '0.75rem', fontSize: '0.78rem', color: '#10b981', opacity: 0.7 }}>Session en cours ⚡</div> : null;
                        })()}
                    </div>

                    {/* RIGHT: stats + progress */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                        {user?.uid === objective.creator_id && (
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                                <button
                                    onClick={() => {
                                        setEditObjTitle(objective.title);
                                        setEditObjDesc(objective.description || '');
                                        setEditObjHours(objective.target_hours.toString());
                                        setEditObjFreq(objective.goal_frequency || 'total');
                                        setEditObjCats(Array.isArray(objective.category) ? [...objective.category] : [objective.category]);
                                        setEditObjLearningLink(objective.learning_link || '');
                                        setEditObjPublic(objective.is_public || false);
                                        setShowEditObjModal(true);
                                        setNavbarVisible(false);
                                    }}
                                    style={{ padding: '7px 14px', background: 'rgba(255,255,255,0.05)', borderRadius: '10px', color: '#a1a1aa', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', fontWeight: 600, transition: 'all 0.15s' }}
                                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.09)'; e.currentTarget.style.color = '#fff'; }}
                                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = '#a1a1aa'; }}
                                >
                                    <Edit3 size={14} /> Modifier
                                </button>
                                <button
                                    onClick={handleDeleteObjective}
                                    style={{ padding: '7px 12px', background: 'rgba(239,68,68,0.07)', borderRadius: '10px', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', fontWeight: 600, transition: 'all 0.15s' }}
                                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.15)'; }}
                                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.07)'; }}
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        )}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.875rem' }}>
                            <div style={{ background: 'rgba(99,102,241,0.09)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: '16px', padding: '1.25rem 1rem', textAlign: 'center' }}>
                                <div style={{ fontSize: '1.85rem', fontWeight: 800, color: '#818cf8', lineHeight: 1 }}>{fmtHours(totalCompleted)}</div>
                                <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.07em', marginTop: '6px', fontWeight: 600 }}>{t('room_completed')}</div>
                            </div>
                            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', padding: '1.25rem 1rem', textAlign: 'center' }}>
                                <div style={{ fontSize: '1.85rem', fontWeight: 800, lineHeight: 1 }}>{objective.target_hours}h</div>
                                <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.07em', marginTop: '6px', fontWeight: 600 }}>{objective.goal_frequency === 'daily' ? 'Obj./jour' : objective.goal_frequency === 'weekly' ? 'Obj./sem.' : objective.goal_frequency === 'monthly' ? 'Obj./mois' : 'Objectif'}</div>
                            </div>
                            <div style={{ background: 'rgba(236,72,153,0.08)', border: '1px solid rgba(236,72,153,0.2)', borderRadius: '16px', padding: '1.25rem 1rem', textAlign: 'center' }}>
                                <div style={{ fontSize: '1.85rem', fontWeight: 800, color: '#f472b6', lineHeight: 1 }}>{memberships.length}</div>
                                <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.07em', marginTop: '6px', fontWeight: 600 }}>Membres</div>
                            </div>
                            {milestonesTotal > 0 ? (
                                <div style={{ background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.2)', borderRadius: '16px', padding: '1.25rem 1rem', textAlign: 'center' }}>
                                    <div style={{ fontSize: '1.85rem', fontWeight: 800, color: '#c084fc', lineHeight: 1 }}>{milestonesDone}/{milestonesTotal}</div>
                                    <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.07em', marginTop: '6px', fontWeight: 600 }}>Étapes</div>
                                </div>
                            ) : (
                                <div style={{ background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.18)', borderRadius: '16px', padding: '1.25rem 1rem', textAlign: 'center' }}>
                                    <div style={{ fontSize: '1.85rem', fontWeight: 800, color: '#34d399', lineHeight: 1 }}>
                                        {sessions.filter(s => { const d = s.scheduled_at?.toDate ? s.scheduled_at.toDate() : new Date(s.scheduled_at); return d > new Date(); }).length}
                                    </div>
                                    <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.07em', marginTop: '6px', fontWeight: 600 }}>Sessions</div>
                                </div>
                            )}
                        </div>
                        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '1.25rem 1.5rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.45, fontWeight: 700 }}>Progression globale</span>
                                <span style={{ color: '#818cf8', fontWeight: 900, fontSize: '1.5rem', lineHeight: 1 }}>{globalPerc}%</span>
                            </div>
                            <div style={{ height: '10px', borderRadius: '8px', background: 'rgba(0,0,0,0.4)', overflow: 'hidden', display: 'flex', boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.4)', marginBottom: '12px' }}>
                                <div style={{ width: `${hoursPerc * 0.4}%`, background: 'var(--color-primary)', transition: 'width 0.8s ease', minWidth: hoursPerc > 0 ? '2px' : 0 }} />
                                {milestonesTotal > 0 && <div style={{ width: `${milestonesPerc * 0.4}%`, background: 'var(--color-secondary)', transition: 'width 0.8s ease', minWidth: milestonesPerc > 0 ? '2px' : 0 }} />}
                                {sessionsTotal > 0 && <div style={{ width: `${sessionsPerc * 0.2}%`, background: '#a855f7', transition: 'width 0.8s ease', minWidth: sessionsPerc > 0 ? '2px' : 0 }} />}
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', fontSize: '0.72rem', opacity: 0.55 }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><span style={{ display: 'inline-block', width: '9px', height: '9px', borderRadius: '3px', background: 'var(--color-primary)' }} />Heures {hoursPerc}%</span>
                                {milestonesTotal > 0 && <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><span style={{ display: 'inline-block', width: '9px', height: '9px', borderRadius: '3px', background: 'var(--color-secondary)' }} />Étapes {milestonesPerc}%</span>}
                                {sessionsTotal > 0 && <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><span style={{ display: 'inline-block', width: '9px', height: '9px', borderRadius: '3px', background: '#a855f7' }} />Sessions {sessionsPerc}%</span>}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Lateral Nav — fixed in left gutter */}
            <nav style={{
                position: 'fixed', top: '90px', left: '16px', width: '188px',
                display: 'flex', flexDirection: 'column', gap: '2px', zIndex: 50,
                background: 'rgba(10,10,20,0.95)', backdropFilter: 'blur(24px)',
                border: '1px solid rgba(255,255,255,0.09)', borderRadius: '18px',
                padding: '10px', boxShadow: '0 8px 36px rgba(0,0,0,0.5)',
            }}>
                <div style={{ padding: '4px 6px 10px', borderBottom: '1px solid rgba(255,255,255,0.06)', marginBottom: '6px' }}>
                    <div style={{ fontSize: '0.63rem', opacity: 0.35, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '4px', fontWeight: 700 }}>Objectif</div>
                    <div style={{ fontSize: '0.84rem', fontWeight: 600, color: 'rgba(255,255,255,0.85)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.3 }}>
                        {objective.title}
                    </div>
                </div>
                {([
                    { id: 'overview',   Icon: LayoutDashboard, label: t('room_tab_overview') },
                    { id: 'chat',       Icon: MessageSquare,   label: t('room_tab_chat') },
                    { id: 'ai-chat',    Icon: Bot,             label: t('room_tab_ai') },
                    { id: 'agenda',     Icon: Calendar,        label: t('room_tab_agenda') },
                    { id: 'milestones', Icon: CheckSquare,     label: t('room_tab_milestones') },
                    { id: 'polls',      Icon: BarChart2,       label: t('room_tab_polls') },
                    { id: 'resources',  Icon: LinkIcon,        label: t('room_tab_resources') },
                    { id: 'notes',      Icon: StickyNote,      label: 'Notes' },
                    { id: 'decisions',  Icon: Scale,           label: 'Décisions' },
                    { id: 'annonces',   Icon: Megaphone,       label: 'Annonces' },
                    { id: 'qa',         Icon: HelpCircle,      label: 'Q&A' },
                    { id: 'focus',      Icon: Crosshair,       label: 'Focus' },
                    { id: 'roadmap',    Icon: Map,             label: 'Roadmap' },
                ] as const).map(({ id, Icon, label }) => {
                    const active = activeTab === id;
                    return (
                        <button key={id} onClick={() => setActiveTab(id)} style={{
                            display: 'flex', alignItems: 'center', gap: '9px',
                            padding: '9px 12px', borderRadius: '10px', border: 'none',
                            background: active ? 'linear-gradient(135deg, rgba(99,102,241,0.25), rgba(139,92,246,0.15))' : 'transparent',
                            color: active ? '#c4b5fd' : 'rgba(255,255,255,0.45)',
                            cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.82rem', fontWeight: active ? 600 : 400,
                            textAlign: 'left', width: '100%', transition: 'all 0.15s',
                            boxShadow: active ? '0 0 0 1px rgba(99,102,241,0.3)' : 'none',
                        }}
                        onMouseEnter={e => { if (!active) { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)'; (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.75)'; }}}
                        onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.45)'; }}}
                        >
                            <Icon size={15} style={{ flexShrink: 0, opacity: active ? 1 : 0.6 }} />
                            <span>{label}</span>
                        </button>
                    );
                })}
            </nav>

            <div className="tabs-content relative" style={{ width: '100%' }}>
                {/* TAB: OVERVIEW */}
                {activeTab === 'overview' && (
                    <div className="tab-pane active fade-enter">
                        {/* Overview content */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginBottom: '2.5rem' }}>

                        {/* Description card */}
                        {objective.description && (
                            <div className="card card-glass fade-enter" style={{ borderLeft: '4px solid var(--color-primary)', padding: '1.5rem 1.75rem' }}>
                                <h4 className="flex items-center gap-2 m-0 mb-4" style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.1em', opacity: 0.5, fontWeight: 700 }}>
                                    📋 Description
                                </h4>
                                <p style={{ margin: 0, lineHeight: 1.8, opacity: 0.88, fontSize: '1rem' }}>{objective.description}</p>
                            </div>
                        )}

                        {/* E-Learning Link card */}
                        {objective.learning_link && (
                            <a 
                                href={objective.learning_link.startsWith('http') ? objective.learning_link : `https://${objective.learning_link}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="card card-glass fade-enter group" 
                                style={{ 
                                    borderLeft: '3px solid #10b981', 
                                    textDecoration: 'none',
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    gap: '1rem',
                                    padding: '1.25rem 1.5rem',
                                    transition: 'all 0.2s ease',
                                    background: 'linear-gradient(90deg, rgba(16,185,129,0.05) 0%, rgba(16,185,129,0) 100%)',
                                }}
                            >
                                <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: 'rgba(16,185,129,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    <BookOpen size={20} style={{ color: '#10b981' }} />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <h4 className="m-0 group-hover:text-white transition-colors" style={{ fontSize: '1.05rem', color: '#f4f4f5', marginBottom: '2px' }}>
                                        Accéder à la formation
                                    </h4>
                                    <p className="m-0" style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '280px' }}>
                                        {(() => { try { const u = new URL(objective.learning_link.startsWith('http') ? objective.learning_link : `https://${objective.learning_link}`); return u.hostname.replace(/^www\./, ''); } catch { return objective.learning_link; } })()}
                                    </p>
                                </div>
                                <div style={{ 
                                    width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(255,255,255,0.05)', 
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    transition: 'all 0.2s ease'
                                }} className="group-hover:bg-white/10 group-hover:translate-x-1">
                                    <ExternalLink size={14} style={{ color: 'rgba(255,255,255,0.6)' }} className="group-hover:text-white" />
                                </div>
                            </a>
                        )}


                        {/* Next session preview */}
                        {(() => {
                            const next = sessions
                                .map(s => ({ ...s, _date: s.scheduled_at?.toDate ? s.scheduled_at.toDate() : new Date(s.scheduled_at) }))
                                .filter(s => s._date > new Date())
                                .sort((a, b) => a._date.getTime() - b._date.getTime())[0];
                            if (!next) return null;
                            const colors: Record<string, string> = { travail: '#6366f1', discussion: '#ec4899', recherche: '#8b5cf6' };
                            const col = colors[next.type] ?? '#6366f1';
                            return (
                                <div className="card card-glass fade-enter" style={{ borderLeft: `3px solid ${col}`, padding: '1.5rem 1.5rem' }}>
                                    <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.5, marginBottom: '0.75rem', fontWeight: 600 }}>
                                        Prochaine session
                                    </div>
                                    <div className="flex items-center gap-4 flex-wrap">
                                        <div style={{ background: `${col}22`, borderRadius: '10px', padding: '0.5rem 0.8rem', textAlign: 'center', minWidth: '52px' }}>
                                            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: col, lineHeight: 1 }}>{next._date.getDate()}</div>
                                            <div style={{ fontSize: '0.6rem', textTransform: 'uppercase', opacity: 0.6, fontWeight: 600 }}>
                                                {['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'][next._date.getMonth()]}
                                            </div>
                                        </div>
                                        <div className="flex-1">
                                            <div style={{ fontWeight: 700, fontSize: '1rem' }}>{next.title}</div>
                                            <div style={{ fontSize: '0.82rem', opacity: 0.6, marginTop: '2px' }}>
                                                {`${String(next._date.getHours()).padStart(2, '0')}:${String(next._date.getMinutes()).padStart(2, '0')}`} · {next.attendees.length} participant{next.attendees.length !== 1 ? 's' : ''}
                                            </div>
                                        </div>
                                        <button
                                            className="btn btn-sm"
                                            style={{ background: `${col}22`, color: col, border: `1px solid ${col}55`, fontSize: '0.82rem', whiteSpace: 'nowrap' }}
                                            onClick={() => setActiveTab('agenda')}
                                        >
                                            Voir l'agenda →
                                        </button>
                                    </div>
                                </div>
                            );
                        })()}

                        {/* Group milestone progress */}
                        {milestones.length > 0 && (() => {
                            const done = milestones.filter(m => m.completed).length;
                            const pct = Math.round((done / milestones.length) * 100);
                            return (
                                <div className="card card-glass fade-enter" style={{ padding: '1.25rem' }}>
                                    <div className="flex justify-between items-center mb-3">
                                        <h4 className="m-0 flex items-center gap-2" style={{ fontSize: '0.9rem' }}>
                                            <span>✅</span> Progression des étapes groupe
                                        </h4>
                                        <span className="text-primary" style={{ fontWeight: 700 }}>{pct}%</span>
                                    </div>
                                    <div style={{ height: '6px', borderRadius: '4px', background: 'rgba(255,255,255,0.07)', marginBottom: '0.75rem' }}>
                                        <div style={{ height: '100%', width: `${pct}%`, borderRadius: '4px', background: 'linear-gradient(90deg, var(--color-primary), var(--color-secondary))', transition: 'width 0.6s ease', boxShadow: '0 0 8px rgba(99,102,241,0.4)' }} />
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        {milestones.slice(0, 4).map((m, i) => (
                                            <div key={m.id} className="flex items-center gap-2" style={{ fontSize: '0.85rem', opacity: m.completed ? 0.5 : 1 }}>
                                                <span style={{ color: m.completed ? 'var(--color-primary)' : 'var(--color-border)', fontSize: '1rem' }}>{m.completed ? '✓' : '○'}</span>
                                                <span style={{ textDecoration: m.completed ? 'line-through' : 'none' }}>{m.text}</span>
                                            </div>
                                        ))}
                                        {milestones.length > 4 && (
                                            <button className="btn btn-sm btn-ghost text-secondary" style={{ alignSelf: 'flex-start', fontSize: '0.8rem' }} onClick={() => setActiveTab('milestones')}>
                                                + {milestones.length - 4} étapes → Voir tout
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })()}

                        {/* Invite code card */}
                        {(() => {
                            const isCreator = user?.uid === objective.creator_id;
                            const isPublic = objective.is_public;
                            const hasCode = !!objective.invite_code;
                            const linkEnabled = isPublic || objective.invite_link_enabled;
                            if (!isPublic && !isCreator && !objective.invite_link_enabled) return null;
                            return (
                                <div className="card card-glass fade-enter" style={{ borderLeft: '3px solid #6366f1', padding: '1.25rem 1.5rem' }}>
                                    <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                                        <h4 className="m-0 flex items-center gap-2" style={{ fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.06em', opacity: 0.6 }}>
                                            🔗 Code d'invitation
                                        </h4>
                                        <div className="flex items-center gap-2">
                                            {!isPublic && isCreator && hasCode && (
                                                <button
                                                    onClick={toggleInviteLink}
                                                    disabled={togglingInvite}
                                                    style={{
                                                        display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 12px', borderRadius: '20px', fontSize: '0.78rem', fontWeight: 600, border: 'none', cursor: 'pointer', transition: 'all 0.2s',
                                                        background: objective.invite_link_enabled ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.06)',
                                                        color: objective.invite_link_enabled ? '#4ade80' : 'rgba(255,255,255,0.45)',
                                                    }}
                                                >
                                                    <div style={{ width: '28px', height: '15px', borderRadius: '8px', background: objective.invite_link_enabled ? 'rgba(34,197,94,0.4)' : 'rgba(255,255,255,0.1)', border: objective.invite_link_enabled ? '1px solid rgba(34,197,94,0.5)' : '1px solid rgba(255,255,255,0.15)', position: 'relative', flexShrink: 0 }}>
                                                        <div style={{ position: 'absolute', top: '2px', left: objective.invite_link_enabled ? '14px' : '2px', width: '9px', height: '9px', borderRadius: '50%', background: objective.invite_link_enabled ? '#4ade80' : 'rgba(255,255,255,0.5)', transition: 'left 0.2s' }} />
                                                    </div>
                                                    {objective.invite_link_enabled ? 'Activé' : 'Désactivé'}
                                                </button>
                                            )}
                                            {isPublic && (
                                                <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '20px', background: 'rgba(34,197,94,0.12)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.3)', fontWeight: 600 }}>
                                                    Public · Toujours actif
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {hasCode ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', opacity: linkEnabled ? 1 : 0.45 }}>
                                            {/* Big code display */}
                                            <div className="flex items-center gap-3" style={{ background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: '12px', padding: '0.9rem 1.1rem' }}>
                                                <span style={{ flex: 1, fontSize: '1.6rem', fontFamily: 'monospace', fontWeight: 800, letterSpacing: '0.18em', color: '#a5b4fc' }}>
                                                    {objective.invite_code}
                                                </span>
                                                <button
                                                    onClick={() => { navigator.clipboard.writeText(objective.invite_code); setCopiedLink(true); setTimeout(() => setCopiedLink(false), 2000); }}
                                                    disabled={!linkEnabled}
                                                    style={{ padding: '5px 14px', borderRadius: '8px', fontSize: '0.78rem', fontWeight: 600, border: 'none', cursor: linkEnabled ? 'pointer' : 'default', background: copiedLink ? 'rgba(34,197,94,0.2)' : 'rgba(99,102,241,0.2)', color: copiedLink ? '#4ade80' : '#818cf8', flexShrink: 0, transition: 'all 0.2s' }}
                                                >
                                                    {copiedLink ? '✓ Copié' : 'Copier le code'}
                                                </button>
                                            </div>
                                            {/* Full link row */}
                                            <div className="flex items-center gap-2" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '10px', padding: '0.5rem 0.9rem' }}>
                                                <span style={{ flex: 1, fontSize: '0.78rem', fontFamily: 'monospace', opacity: 0.5, wordBreak: 'break-all' }}>
                                                    {typeof window !== 'undefined' ? window.location.origin : ''}/join/{objective.invite_code}
                                                </span>
                                                {linkEnabled && (
                                                    <button
                                                        onClick={copyInviteLink}
                                                        style={{ padding: '3px 10px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 600, border: 'none', cursor: 'pointer', background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.5)', flexShrink: 0 }}
                                                    >
                                                        Copier le lien
                                                    </button>
                                                )}
                                            </div>
                                            {!linkEnabled && !isPublic && (
                                                <p style={{ fontSize: '0.8rem', opacity: 0.45, margin: 0 }}>Le lien est désactivé. Activez-le pour permettre l'accès.</p>
                                            )}
                                            {isCreator && (
                                                <button onClick={generateInviteCode} disabled={generatingCode} style={{ alignSelf: 'flex-start', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem', opacity: 0.35, padding: 0, color: 'inherit' }}>
                                                    {generatingCode ? 'Génération...' : '↺ Regénérer le code'}
                                                </button>
                                            )}
                                        </div>
                                    ) : isCreator ? (
                                        <div>
                                            <p style={{ fontSize: '0.85rem', opacity: 0.5, margin: '0 0 0.75rem' }}>Aucun code d'invitation généré. Créez-en un pour inviter des membres.</p>
                                            <button
                                                onClick={generateInviteCode}
                                                disabled={generatingCode}
                                                style={{ padding: '6px 16px', borderRadius: '10px', fontSize: '0.85rem', fontWeight: 600, background: 'rgba(99,102,241,0.2)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.35)', cursor: 'pointer' }}
                                            >
                                                {generatingCode ? 'Génération...' : '+ Générer un code d\'invitation'}
                                            </button>
                                        </div>
                                    ) : null}
                                </div>
                            );
                        })()}

                        </div>{/* END Overview content */}

                        {/* Members section */}
                        <div style={{ marginTop: '1rem' }}>
                            <div className="flex items-center justify-between mb-5" style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: '1rem' }}>
                                <h3 className="flex items-center gap-2 m-0" style={{ fontSize: '1.1rem', fontWeight: 700 }}>
                                    <Users size={18} style={{ color: 'var(--color-primary)' }} /> Membres
                                </h3>
                                <span style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.35)', fontWeight: 600, background: 'rgba(255,255,255,0.06)', padding: '4px 12px', borderRadius: '20px' }}>{memberships.length} membre{memberships.length !== 1 ? 's' : ''}</span>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.25rem' }}>
                                {memberships.map((m, i) => {
                                    const memberPerc = Math.min(100, Math.round(((m.completed_hours ?? 0) / (objective.target_hours || 1)) * 100));
                                    const isMe = m.user_id === user?.uid;
                                    return (
                                        <div
                                            key={i}
                                            className="card card-glass fade-enter"
                                            style={{
                                                padding: '1.4rem 1.5rem',
                                                animationDelay: `${i * 0.05}s`,
                                                border: isMe ? '1px solid rgba(99,102,241,0.35)' : '1px solid var(--color-border)',
                                                background: isMe ? 'rgba(99,102,241,0.05)' : undefined
                                            }}
                                        >
                                            <div className="flex items-center gap-4" style={{ marginBottom: '1rem' }}>
                                                <div style={{ position: 'relative', flexShrink: 0 }}>
                                                    <Avatar
                                                        uid={m.user_id}
                                                        avatarUrl={m.user.avatar_url}
                                                        avatarStyle={m.user.avatar_style}
                                                        size={48}
                                                        style={{ border: isMe ? '2px solid var(--color-primary)' : '2px solid var(--color-border)', cursor: 'pointer' }}
                                                        onClick={() => router.push(`/user/${m.user_id}`)}
                                                    />
                                                    {isMe && (
                                                        <div style={{ position: 'absolute', bottom: '-2px', right: '-2px', width: '14px', height: '14px', borderRadius: '50%', background: 'var(--color-primary)', border: '2px solid var(--color-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                            <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#fff' }} />
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex-1 min-w-0" style={{ marginRight: '0.5rem', cursor: 'pointer' }} onClick={() => router.push(`/user/${m.user_id}`)}>
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span style={{ fontWeight: 700, fontSize: '1rem' }} className="truncate">{m.user.full_name}</span>
                                                        {isMe && <span style={{ fontSize: '0.65rem', background: 'var(--color-primary)', color: '#fff', borderRadius: '6px', padding: '2px 8px', fontWeight: 700 }}>Vous</span>}
                                                    </div>
                                                    {m.user.email && <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', marginTop: '3px' }} className="truncate">{m.user.email}</div>}
                                                    {m.created_at && (
                                                        <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.35)', marginTop: '2px' }}>
                                                            Membre depuis {(m.created_at?.toDate ? m.created_at.toDate() : new Date(m.created_at)).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                        </div>
                                                    )}
                                                </div>

                                                {!isMe && (
                                                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                                                        <div style={{ fontWeight: 800, fontSize: '1.2rem', color: isMe ? 'var(--color-primary)' : 'inherit' }}>
                                                            {memberPerc}%
                                                        </div>
                                                        {(!friendships[m.user_id]) && (
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); handleAddFriend(m.user_id); }}
                                                                className="btn btn-sm text-primary hover:bg-primary-light"
                                                                style={{ padding: '0.2rem 0.5rem', fontSize: '0.7rem', border: '1px solid var(--color-primary)' }}
                                                                title="Ajouter en ami"
                                                            >
                                                                <UserPlus size={12} style={{ marginRight: '4px' }} /> Ajouter
                                                            </button>
                                                        )}
                                                        {friendships[m.user_id]?.status === 'pending' && (
                                                            <span style={{ fontSize: '0.7rem', opacity: 0.6, border: '1px solid currentColor', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
                                                                En attente
                                                            </span>
                                                        )}
                                                        {friendships[m.user_id]?.status === 'accepted' && (
                                                            <span style={{ fontSize: '0.7rem', color: 'var(--color-success)', border: '1px solid var(--color-success)', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
                                                                Amis ✓
                                                            </span>
                                                        )}
                                                    </div>
                                                )}
                                                {isMe && (
                                                    <div style={{ fontWeight: 800, fontSize: '1.2rem', color: 'var(--color-primary)', flexShrink: 0 }}>
                                                        {memberPerc}%
                                                    </div>
                                                )}
                                            </div>
                                            <div style={{ height: '5px', borderRadius: '4px', background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                                                <div style={{
                                                    height: '100%', width: `${memberPerc}%`, borderRadius: '4px',
                                                    background: isMe ? 'linear-gradient(90deg, var(--color-primary), var(--color-secondary))' : 'rgba(255,255,255,0.25)',
                                                    transition: 'width 0.6s ease',
                                                    boxShadow: isMe ? '0 0 6px rgba(99,102,241,0.4)' : 'none'
                                                }} />
                                            </div>
                                            <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.45)', marginTop: '0.6rem' }}>
                                                {fmtHours(m.completed_hours ?? 0)} / {objective.target_hours}h {objective.goal_frequency === 'daily' ? '/ jour' : objective.goal_frequency === 'weekly' ? '/ semaine' : objective.goal_frequency === 'monthly' ? '/ mois' : ''}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}

                {/* TAB: CHAT */}
                {activeTab === 'chat' && (
                    <div className="tab-pane active fade-enter">
                        <div style={{ height: 'calc(100vh - 180px)', minHeight: 640, display: 'flex', flexDirection: 'column', background: 'rgba(8,8,16,0.85)', borderRadius: 18, border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden' }}>

                            {/* ── Header ── */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 22px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)', flexShrink: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                        <MessageSquare size={15} style={{ color: '#818cf8' }} />
                                    </div>
                                    <div>
                                        <p style={{ margin: 0, fontSize: '0.88rem', fontWeight: 700, color: '#f0f0f8', letterSpacing: '-0.01em' }}>{t('room_chat_title')}</p>
                                        <p style={{ margin: 0, fontSize: '0.67rem', color: 'rgba(255,255,255,0.25)' }}>{messages.length} message{messages.length !== 1 ? 's' : ''}</p>
                                    </div>
                                </div>
                                {(objective?.pinned_messages || []).length > 0 && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.72rem', color: 'rgba(165,180,252,0.7)', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.18)', borderRadius: 8, padding: '4px 10px' }}>
                                        <Pin size={11} /> {(objective.pinned_messages as string[]).length} épinglé{(objective.pinned_messages as string[]).length > 1 ? 's' : ''}
                                    </div>
                                )}
                            </div>

                            {/* ── Pinned banner ── */}
                            {(objective?.pinned_messages || []).length > 0 && (() => {
                                const pinned = (objective.pinned_messages as string[]).map((pid: string) => messages.find(m => m.id === pid)).filter(Boolean);
                                if (!pinned.length) return null;
                                return (
                                    <div style={{ borderBottom: '1px solid rgba(99,102,241,0.15)', background: 'rgba(99,102,241,0.05)', padding: '8px 22px', flexShrink: 0 }}>
                                        {pinned.map((m: any) => (
                                            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <Pin size={10} style={{ color: '#818cf8', flexShrink: 0 }} />
                                                <span style={{ fontSize: '0.76rem', color: 'rgba(255,255,255,0.55)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                                                    <span style={{ fontWeight: 700, color: '#a5b4fc', marginRight: 5 }}>{m.user_name}</span>{m.content}
                                                </span>
                                                {objective?.creator_id === user?.uid && (
                                                    <button onClick={() => handlePinMessage(m.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.25)', padding: 2, flexShrink: 0, display: 'flex' }} title="Désépingler"><X size={12} /></button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                );
                            })()}

                            {/* ── Messages ── */}
                            <div id="chat-messages" className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '16px 22px' }}>
                                {messages.length === 0 ? (
                                    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, opacity: 0.3 }}>
                                        <MessageSquare size={32} />
                                        <p style={{ margin: 0, fontSize: '0.875rem' }}>Aucun message pour le moment. Dites bonjour !</p>
                                    </div>
                                ) : messages.map((msg, idx) => {
                                    const isMe = msg.user_id === user?.uid;
                                    const isSystem = msg.user_id === 'system' || msg.type === 'system';
                                    const reactions: Record<string, string[]> = msg.reactions || {};
                                    const hasReactions = Object.entries(reactions).some(([, u]) => (u as string[]).length > 0);
                                    const isCreator = objective?.creator_id === user?.uid;
                                    const isPinned = (objective?.pinned_messages || []).includes(msg.id);
                                    const canPin = isCreator && ((objective?.pinned_messages || []).length < 3 || isPinned);
                                    const time = msg.created_at ? new Date(msg.created_at.toMillis()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '…';
                                    const prevMsg = messages[idx - 1];
                                    const sameAsPrev = prevMsg?.user_id === msg.user_id && prevMsg?.type !== 'system' && msg.user_id !== 'system';

                                    if (isSystem) return (
                                        <div key={msg.id} style={{ display: 'flex', justifyContent: 'center', padding: '10px 0' }}>
                                            <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.35)', background: 'rgba(255,255,255,0.05)', padding: '4px 14px', borderRadius: 20, border: '1px solid rgba(255,255,255,0.08)' }}>{msg.content}</span>
                                        </div>
                                    );

                                    return (
                                        <div key={msg.id} style={{ marginTop: sameAsPrev ? 2 : 14, position: 'relative' }}
                                            onMouseEnter={() => setHoverMsgId(msg.id)} onMouseLeave={() => setHoverMsgId(null)}>

                                            {isMe ? (
                                                /* ── MY message: right-aligned bubble ── */
                                                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                                    <div style={{ maxWidth: '68%' }}>
                                                        {!sameAsPrev && (
                                                            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
                                                                <span style={{ fontSize: '0.63rem', color: 'rgba(255,255,255,0.22)' }}>{time}</span>
                                                                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#818cf8' }}>Vous</span>
                                                                {isPinned && <Pin size={10} style={{ color: '#818cf8' }} />}
                                                            </div>
                                                        )}
                                                        <div style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', borderRadius: `${sameAsPrev ? 6 : 18}px 18px ${sameAsPrev ? 6 : 4}px 18px`, padding: '9px 14px', color: '#fff', fontSize: '0.875rem', lineHeight: 1.6, wordBreak: 'break-word', boxShadow: '0 2px 14px rgba(79,70,229,0.28)' }}>
                                                            {msg.content}
                                                        </div>
                                                        {hasReactions && (
                                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 4, justifyContent: 'flex-end' }}>
                                                                {Object.entries(reactions).filter(([, u]) => (u as string[]).length > 0).map(([emoji, uids]) => {
                                                                    const mine = (uids as string[]).includes(user?.uid || '');
                                                                    return <button key={emoji} onClick={() => handleToggleReaction(msg.id, emoji)} style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '2px 7px', borderRadius: 20, fontSize: 12, border: mine ? '1px solid rgba(99,102,241,0.6)' : '1px solid rgba(255,255,255,0.1)', background: mine ? 'rgba(99,102,241,0.14)' : 'rgba(255,255,255,0.04)', cursor: 'pointer' }}>{emoji} <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.5)' }}>{(uids as string[]).length}</span></button>;
                                                                })}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            ) : (
                                                /* ── THEIR message: Discord style ── */
                                                <div style={{ display: 'flex', gap: 10 }}>
                                                    <div style={{ width: 34, flexShrink: 0 }}>
                                                        {!sameAsPrev
                                                            ? <Avatar uid={msg.user_id} avatarUrl={memberships.find(m => m.user_id === msg.user_id)?.user?.avatar_url} avatarStyle={memberships.find(m => m.user_id === msg.user_id)?.user?.avatar_style} size={34} />
                                                            : <span style={{ display: 'block', textAlign: 'right', fontSize: '0.56rem', color: 'rgba(255,255,255,0.16)', paddingTop: 5 }}>{time}</span>
                                                        }
                                                    </div>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        {!sameAsPrev && (
                                                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginBottom: 3 }}>
                                                                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#a5b4fc' }}>{msg.user_name}</span>
                                                                <span style={{ fontSize: '0.63rem', color: 'rgba(255,255,255,0.22)' }}>{time}</span>
                                                                {isPinned && <Pin size={10} style={{ color: '#818cf8' }} />}
                                                            </div>
                                                        )}
                                                        <p style={{ margin: 0, fontSize: '0.875rem', color: 'rgba(255,255,255,0.85)', lineHeight: 1.6, wordBreak: 'break-word' }}>{msg.content}</p>
                                                        {hasReactions && (
                                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 4 }}>
                                                                {Object.entries(reactions).filter(([, u]) => (u as string[]).length > 0).map(([emoji, uids]) => {
                                                                    const mine = (uids as string[]).includes(user?.uid || '');
                                                                    return <button key={emoji} onClick={() => handleToggleReaction(msg.id, emoji)} style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '2px 7px', borderRadius: 20, fontSize: 12, border: mine ? '1px solid rgba(99,102,241,0.6)' : '1px solid rgba(255,255,255,0.1)', background: mine ? 'rgba(99,102,241,0.14)' : 'rgba(255,255,255,0.04)', cursor: 'pointer' }}>{emoji} <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.5)' }}>{(uids as string[]).length}</span></button>;
                                                                })}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Hover toolbar */}
                                            {hoverMsgId === msg.id && (
                                                <div style={{ position: 'absolute', top: 0, [isMe ? 'left' : 'right']: 0, transform: 'translateY(-100%) translateY(-4px)', display: 'flex', alignItems: 'center', gap: 1, background: 'rgba(14,14,26,0.97)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '3px 5px', boxShadow: '0 6px 24px rgba(0,0,0,0.5)', zIndex: 10 }}>
                                                    {QUICK_REACTIONS.map(emoji => (
                                                        <button key={emoji} onClick={() => handleToggleReaction(msg.id, emoji)}
                                                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, padding: '3px 4px', borderRadius: 6, transition: 'transform 0.1s, background 0.1s', lineHeight: 1 }}
                                                            onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.3)'; e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
                                                            onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.background = 'none'; }}
                                                        >{emoji}</button>
                                                    ))}
                                                    {(canPin || isPinned) && (
                                                        <button onClick={() => handlePinMessage(msg.id)}
                                                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '3px 5px', borderRadius: 6, borderLeft: '1px solid rgba(255,255,255,0.08)', marginLeft: 2, color: isPinned ? '#a5b4fc' : 'rgba(255,255,255,0.35)', display: 'flex', alignItems: 'center' }}
                                                            title={isPinned ? 'Désépingler' : 'Épingler'}>
                                                            <Pin size={12} />
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            {/* ── Input ── */}
                            <div style={{ padding: '12px 16px 16px', flexShrink: 0, background: 'rgba(0,0,0,0.2)', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                                <form onSubmit={handleSendMessage} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 14, padding: '6px 6px 6px 16px', transition: 'border-color 0.15s' }}
                                    onFocusCapture={e => (e.currentTarget.style.borderColor = 'rgba(99,102,241,0.4)')}
                                    onBlurCapture={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.09)')}>
                                    <input type="text" value={newMessage} onChange={(e) => setNewMessage(e.target.value)} placeholder={t('room_chat_placeholder')} required autoComplete="off"
                                        style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: '0.9rem', color: '#f0f0f8', padding: 0 }} />
                                    <button type="submit" style={{ width: 38, height: 38, flexShrink: 0, borderRadius: 10, background: newMessage.trim() ? 'linear-gradient(135deg,#4f46e5,#7c3aed)' : 'rgba(255,255,255,0.05)', border: 'none', cursor: newMessage.trim() ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s', boxShadow: newMessage.trim() ? '0 2px 10px rgba(79,70,229,0.35)' : 'none' }}>
                                        <Send size={15} style={{ color: newMessage.trim() ? '#fff' : 'rgba(255,255,255,0.25)', marginLeft: 1 }} />
                                    </button>
                                </form>
                            </div>
                        </div>
                    </div>
                )}

                {/* TAB: AI CHAT */}
                {activeTab === 'ai-chat' && (
                    <div className="tab-pane active fade-enter">
                        <div style={{ height: 'calc(100vh - 180px)', minHeight: 640, display: 'flex', flexDirection: 'column', background: 'rgba(8,6,16,0.9)', borderRadius: 18, border: '1px solid rgba(236,72,153,0.18)', overflow: 'hidden' }}>

                            {/* Header */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 22px', borderBottom: '1px solid rgba(236,72,153,0.12)', background: 'rgba(236,72,153,0.03)', flexShrink: 0 }}>
                                <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(236,72,153,0.12)', border: '1px solid rgba(236,72,153,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    <Bot size={15} style={{ color: '#f472b6' }} />
                                </div>
                                <div>
                                    <p style={{ margin: 0, fontSize: '0.88rem', fontWeight: 700, color: '#f0f0f8' }}>{t('room_ai_coach_title')}</p>
                                    <p style={{ margin: 0, fontSize: '0.67rem', color: 'rgba(255,255,255,0.25)' }}>Propulsé par Claude · Contexte de l'objectif chargé</p>
                                </div>
                            </div>

                            {/* Messages */}
                            <div id="ai-chat-messages" className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '16px 22px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {aiMessages.length === 0 ? (
                                    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, opacity: 0.4 }}>
                                        <div style={{ width: 52, height: 52, borderRadius: 16, background: 'rgba(236,72,153,0.1)', border: '1px solid rgba(236,72,153,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <Bot size={24} style={{ color: '#f472b6' }} />
                                        </div>
                                        <p style={{ margin: 0, fontSize: '0.85rem', textAlign: 'center', maxWidth: 260, lineHeight: 1.5 }}>{t('room_ai_coach_empty').replace('{}', objective.title)}</p>
                                    </div>
                                ) : aiMessages.map((msg, i) => {
                                    const isMe = msg.user_id === user?.uid;
                                    const isAI = msg.user_id === 'ai-coach';
                                    const time = msg.created_at ? new Date(msg.created_at.toMillis()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '…';
                                    const prevMsg = aiMessages[i - 1];
                                    const sameAsPrev = prevMsg?.user_id === msg.user_id;

                                    if (isMe) return (
                                        <div key={i} style={{ marginTop: sameAsPrev ? 2 : 12, display: 'flex', justifyContent: 'flex-end' }}>
                                            <div style={{ maxWidth: '68%' }}>
                                                {!sameAsPrev && <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'baseline', gap: 6, marginBottom: 4 }}><span style={{ fontSize: '0.63rem', color: 'rgba(255,255,255,0.22)' }}>{time}</span><span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#c084fc' }}>Vous</span></div>}
                                                <div style={{ background: 'linear-gradient(135deg,#7c3aed,#a855f7)', borderRadius: `${sameAsPrev ? 6 : 18}px 18px ${sameAsPrev ? 6 : 4}px 18px`, padding: '9px 14px', color: '#fff', fontSize: '0.875rem', lineHeight: 1.6, wordBreak: 'break-word', boxShadow: '0 2px 14px rgba(168,85,247,0.25)' }}>
                                                    {msg.content}
                                                </div>
                                            </div>
                                        </div>
                                    );

                                    return (
                                        <div key={i} style={{ marginTop: sameAsPrev ? 2 : 12, display: 'flex', gap: 10 }}>
                                            <div style={{ width: 34, flexShrink: 0 }}>
                                                {!sameAsPrev && (
                                                    <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(236,72,153,0.12)', border: '1px solid rgba(236,72,153,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                        {isAI ? <Bot size={15} style={{ color: '#f472b6' }} /> : <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#f472b6' }}>{msg.user_name?.[0]}</span>}
                                                    </div>
                                                )}
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                {!sameAsPrev && <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginBottom: 3 }}><span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#f9a8d4' }}>{isAI ? 'Coach IA' : msg.user_name}</span><span style={{ fontSize: '0.63rem', color: 'rgba(255,255,255,0.22)' }}>{time}</span></div>}
                                                <div style={{ background: 'rgba(236,72,153,0.07)', border: '1px solid rgba(236,72,153,0.15)', borderRadius: `${sameAsPrev ? 6 : 4}px 18px 18px 18px`, padding: '10px 14px', color: 'rgba(255,255,255,0.88)', fontSize: '0.875rem', lineHeight: 1.65, wordBreak: 'break-word' }}>
                                                    {msg.content}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                                {callingCoach && (
                                    <div style={{ marginTop: 8, display: 'flex', gap: 10 }}>
                                        <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(236,72,153,0.12)', border: '1px solid rgba(236,72,153,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                            <Bot size={15} style={{ color: '#f472b6' }} />
                                        </div>
                                        <div style={{ background: 'rgba(236,72,153,0.07)', border: '1px solid rgba(236,72,153,0.15)', borderRadius: '4px 18px 18px 18px', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <div style={{ display: 'flex', gap: 3 }}>
                                                {[0,1,2].map(n => <span key={n} style={{ width: 5, height: 5, borderRadius: '50%', background: '#f472b6', animation: `typing-dot 1.2s ease-in-out ${n * 0.2}s infinite` }} />)}
                                            </div>
                                            <span style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.45)' }}>{t('room_ai_thinking')}</span>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Input */}
                            <div style={{ padding: '12px 16px 16px', flexShrink: 0, background: 'rgba(0,0,0,0.2)', borderTop: '1px solid rgba(236,72,153,0.1)' }}>
                                <form onSubmit={handleCallCoach} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(236,72,153,0.18)', borderRadius: 14, padding: '6px 6px 6px 16px', transition: 'border-color 0.15s' }}
                                    onFocusCapture={e => (e.currentTarget.style.borderColor = 'rgba(236,72,153,0.4)')}
                                    onBlurCapture={e => (e.currentTarget.style.borderColor = 'rgba(236,72,153,0.18)')}>
                                    <input type="text" value={newAiMessage} onChange={(e) => setNewAiMessage(e.target.value)} placeholder={t('room_ai_coach_placeholder')} required autoComplete="off"
                                        style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: '0.9rem', color: '#f0f0f8', padding: 0 }} />
                                    <button type="submit" disabled={callingCoach} style={{ width: 38, height: 38, flexShrink: 0, borderRadius: 10, background: newAiMessage.trim() && !callingCoach ? 'linear-gradient(135deg,#be185d,#ec4899)' : 'rgba(255,255,255,0.05)', border: 'none', cursor: newAiMessage.trim() && !callingCoach ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}>
                                        <Send size={15} style={{ color: newAiMessage.trim() && !callingCoach ? '#fff' : 'rgba(255,255,255,0.25)', marginLeft: 1 }} />
                                    </button>
                                </form>
                            </div>
                        </div>
                    </div>
                )}

                {/* TAB: MILESTONES */}
                {activeTab === 'milestones' && (
                    <div className="tab-pane active fade-enter">
                        {/* Sub-tab switcher */}
                        <div className="flex items-center gap-3 mb-6" style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: '1rem' }}>
                            <button
                                className={`btn btn-sm ${milestoneSubTab === 'group' ? 'btn-primary shadow-glow' : 'btn-ghost text-secondary'}`}
                                onClick={() => setMilestoneSubTab('group')}
                            >
                                🌐 Groupe
                            </button>
                            <button
                                className={`btn btn-sm ${milestoneSubTab === 'personal' ? 'btn-primary shadow-glow' : 'btn-ghost text-secondary'}`}
                                onClick={() => setMilestoneSubTab('personal')}
                            >
                                👤 Personnelles
                                {personalMilestones.filter(m => !m.completed).length > 0 && (
                                    <span style={{ marginLeft: '6px', background: 'var(--color-secondary)', color: '#fff', borderRadius: '10px', fontSize: '0.7rem', padding: '1px 6px', fontWeight: 700 }}>
                                        {personalMilestones.filter(m => !m.completed).length}
                                    </span>
                                )}
                            </button>
                        </div>

                        {/* GROUP sub-tab */}
                        {milestoneSubTab === 'group' && (
                            <div className="fade-enter">
                                {/* Header with 3 action buttons */}
                                <div className="flex justify-between items-start mb-5 flex-wrap gap-3">
                                    <div>
                                        <h4 className="flex items-center gap-2 m-0"><CheckSquare className="text-primary" size={18} /> Étapes du groupe</h4>
                                        <p className="text-sm text-secondary m-0 mt-1">Partagées avec tous les membres du salon</p>
                                    </div>
                                    <div className="flex gap-2 flex-wrap">
                                        <button
                                            className="btn btn-sm btn-ghost"
                                            style={{ border: '1px solid var(--color-border)', fontSize: '0.82rem' }}
                                            onClick={() => setShowGroupStepForm(v => !v)}
                                        >
                                            {showGroupStepForm ? '✕ Annuler' : '+ Ajouter manuellement'}
                                        </button>
                                        <button
                                            className="btn btn-sm btn-outline"
                                            style={{ fontSize: '0.82rem' }}
                                            onClick={handleAISuggestMilestones}
                                            disabled={suggestingAI}
                                        >
                                            {suggestingAI ? '🤖 Suggestion...' : '🤖 Suggérer des étapes'}
                                        </button>
                                        <button
                                            className="btn btn-sm"
                                            style={{ fontSize: '0.82rem', background: 'rgba(99,102,241,0.12)', color: 'var(--color-primary)', border: '1px solid rgba(99,102,241,0.3)' }}
                                            onClick={() => { setShowAgendaAI(true); setActiveTab('agenda'); }}
                                            disabled={generatingAI}
                                        >
                                            {generatingAI ? '⏳ Génération...' : milestones.length > 0 ? '🔄 Refaire le Smart Agenda' : '✨ Smart Agenda IA'}
                                        </button>
                                    </div>
                                </div>

                                {/* Manual add form */}
                                {showGroupStepForm && (
                                    <form
                                        onSubmit={handleAddGroupMilestone}
                                        className="card card-glass mb-4 flex flex-col gap-3 fade-enter"
                                        style={{ border: '1px solid var(--color-primary)', background: 'rgba(99,102,241,0.04)', padding: '1rem' }}
                                    >
                                        <h5 className="m-0 text-primary" style={{ fontSize: '0.9rem' }}>Nouvelle étape groupe</h5>
                                        <input
                                            className="input"
                                            placeholder="Titre de l'étape*"
                                            value={newGroupStep.text}
                                            onChange={e => setNewGroupStep(s => ({ ...s, text: e.target.value }))}
                                            required
                                        />
                                        <textarea
                                            className="input"
                                            rows={2}
                                            placeholder="Description / conseils (optionnel)"
                                            value={newGroupStep.description}
                                            onChange={e => setNewGroupStep(s => ({ ...s, description: e.target.value }))}
                                        />
                                        {roadmapPhases.length > 0 && (
                                            <div>
                                                <label className="text-xs text-secondary" style={{ marginBottom: 4, display: 'block' }}>Phase liée <span className="opacity-40">(optionnel)</span></label>
                                                <select className="input" style={{ fontSize: '0.85rem', padding: '6px 10px' }} value={newGroupStep.phase_id} onChange={e => setNewGroupStep(s => ({ ...s, phase_id: e.target.value }))}>
                                                    <option value="">— Aucune phase —</option>
                                                    {roadmapPhases.map(ph => <option key={ph.id} value={ph.id} style={{ background: '#1a1a2e' }}>{ph.title}</option>)}
                                                </select>
                                            </div>
                                        )}
                                        <div className="flex gap-2">
                                            <button type="submit" className="btn btn-sm btn-primary flex-1">✓ Ajouter l'étape</button>
                                            <button type="button" className="btn btn-sm btn-ghost text-secondary" onClick={() => setShowGroupStepForm(false)}>Annuler</button>
                                        </div>
                                    </form>
                                )}

                                {/* Loading indicators */}
                                {(generatingAI || suggestingAI) && (
                                    <div className="card card-glass flex items-center gap-3 mb-4 fade-enter" style={{ padding: '0.75rem 1rem', background: 'rgba(99,102,241,0.06)' }}>
                                        <div style={{ width: '16px', height: '16px', borderRadius: '50%', border: '2px solid var(--color-border)', borderTopColor: 'var(--color-primary)', animation: 'spin 1s linear infinite', flexShrink: 0 }} />
                                        <span className="text-sm text-secondary">
                                            {generatingAI ? 'Génération du plan complet...' : 'L\'IA suggère de nouvelles étapes...'}
                                        </span>
                                    </div>
                                )}

                                {milestones.length === 0 && !generatingAI && !suggestingAI ? (
                                    <div className="card card-glass text-center py-16">
                                        <CheckSquare size={48} className="text-primary mx-auto mb-4 opacity-30" />
                                        <h3 className="text-secondary mb-3">{t('milestones_empty_title')}</h3>
                                        <p className="mb-6 opacity-60">{t('milestones_empty_desc')}</p>
                                        <div className="flex gap-3 justify-center flex-wrap">
                                            <button className="btn btn-sm btn-ghost" style={{ border: '1px solid var(--color-border)' }} onClick={() => setShowGroupStepForm(true)}>+ Ajouter manuellement</button>
                                            <button className="btn btn-sm btn-primary shadow-glow" onClick={() => { setShowAgendaAI(true); setActiveTab('agenda'); }}>✨ Créer un Smart Agenda</button>
                                        </div>
                                    </div>
                                ) : milestones.length > 0 ? (
                                    <>
                                        {/* Phase filter chips */}
                                        {roadmapPhases.length > 0 && (
                                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                                                {[{ id: 'all', label: 'Toutes', color: 'rgba(255,255,255,0.2)' }, { id: 'none', label: 'Sans phase', color: 'rgba(255,255,255,0.12)' }, ...roadmapPhases.map(ph => ({ id: ph.id, label: ph.title, color: ph.color }))].map(chip => (
                                                    <button key={chip.id} onClick={() => setMilestonePhaseFilter(chip.id)} style={{ padding: '3px 10px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 600, border: `1px solid ${chip.color}55`, background: milestonePhaseFilter === chip.id ? `${chip.color}33` : 'rgba(255,255,255,0.03)', color: milestonePhaseFilter === chip.id ? '#fff' : 'rgba(255,255,255,0.5)', cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap' }}>{chip.label}</button>
                                                ))}
                                            </div>
                                        )}
                                        {/* Progress bar */}
                                        {(() => {
                                            const done = milestones.filter(m => m.completed).length;
                                            const total = milestones.length;
                                            const pct = total > 0 ? Math.round((done / total) * 100) : 0;
                                            return (
                                                <div className="card card-glass mb-4" style={{ padding: '0.75rem 1rem', background: 'rgba(99,102,241,0.05)' }}>
                                                    <div className="flex justify-between text-sm font-bold mb-2">
                                                        <span>Progression du groupe</span>
                                                        <span className="text-primary">{done}/{total} étapes ({pct}%)</span>
                                                    </div>
                                                    <div style={{ height: '6px', borderRadius: '4px', background: 'rgba(255,255,255,0.07)' }}>
                                                        <div style={{ height: '100%', width: `${pct}%`, borderRadius: '4px', background: 'linear-gradient(90deg, var(--color-primary), var(--color-secondary))', transition: 'width 0.5s ease', boxShadow: '0 0 8px rgba(99,102,241,0.4)' }} />
                                                    </div>
                                                </div>
                                            );
                                        })()}
                                        <div className="milestones-list">
                                            {milestones.filter(m => milestonePhaseFilter === 'all' ? true : milestonePhaseFilter === 'none' ? !m.phase_id : m.phase_id === milestonePhaseFilter).map((m, idx) => (
                                                <div key={m.id} className={`checklist-item ${m.completed ? 'checked' : ''} fade-enter`} style={{ alignItems: 'flex-start', padding: '1rem', animationDelay: `${idx * 0.04}s` }}>
                                                    <div className="custom-checkbox flex-shrink-0 mt-1" onClick={() => toggleMilestone(m.id, m.completed)}>
                                                        {m.completed && <CheckSquare size={14} color="#fff" />}
                                                    </div>
                                                    <div className="flex-grow flex flex-col">
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <span style={{ fontSize: '1.05rem', fontWeight: 500 }}>{m.text}</span>
                                                            {m.estimated_hours && m.estimated_hours > 0 && (
                                                                <span style={{ fontSize: '0.75rem', background: 'rgba(99,102,241,0.15)', color: 'var(--color-primary)', padding: '2px 8px', borderRadius: '12px', fontWeight: 600 }}>
                                                                    ⏱ {fmtHours(m.estimated_hours)}
                                                                </span>
                                                            )}
                                                            {m.phase_id && (() => { const ph = roadmapPhases.find(p => p.id === m.phase_id); return ph ? <span style={{ fontSize: '0.65rem', padding: '1px 8px', borderRadius: 10, background: `${ph.color}22`, color: ph.color, border: `1px solid ${ph.color}44`, fontWeight: 600, whiteSpace: 'nowrap' }}>{ph.title}</span> : null; })()}
                                                            {!m.phase_id && roadmapPhases.length > 0 && (
                                                                <select style={{ fontSize: '0.65rem', padding: '1px 6px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.4)', cursor: 'pointer' }} defaultValue="" onChange={async e => { if (e.target.value) await updateDoc(doc(db, 'objectives', id as string, 'milestones', m.id), { phase_id: e.target.value }); }}>
                                                                    <option value="" disabled>+ phase</option>
                                                                    {roadmapPhases.map(ph => <option key={ph.id} value={ph.id}>{ph.title}</option>)}
                                                                </select>
                                                            )}
                                                            {m.phase_id && <button onClick={async () => await updateDoc(doc(db, 'objectives', id as string, 'milestones', m.id), { phase_id: '' })} style={{ fontSize: '0.6rem', padding: '1px 5px', borderRadius: 6, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.3)', cursor: 'pointer' }} title="Délier la phase">⊗</button>}
                                                        </div>
                                                        {m.description && (
                                                            <span className={`text-sm mt-1 mb-1 ${m.completed ? 'opacity-50' : 'opacity-80'}`} style={{ lineHeight: '1.4' }}>
                                                                {m.description}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {/* Delete button */}
                                                    <button
                                                        type="button"
                                                        className="btn btn-sm btn-ghost text-secondary flex-shrink-0"
                                                        style={{ padding: '2px 6px', opacity: 0.4, fontSize: '0.8rem' }}
                                                        onClick={async () => {
                                                            const { deleteDoc } = await import('firebase/firestore');
                                                            await deleteDoc(doc(db, 'objectives', id as string, 'milestones', m.id));
                                                        }}
                                                    >
                                                        ✕
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                ) : null}
                            </div>
                        )}

                        {/* PERSONAL sub-tab */}
                        {milestoneSubTab === 'personal' && (
                            <div className="fade-enter">
                                <div className="mb-4">
                                    <h4 className="flex items-center gap-2 m-0"><CheckSquare size={18} style={{ color: 'var(--color-secondary)' }} /> Mes étapes personnelles</h4>
                                    <p className="text-sm text-secondary m-0 mt-1">Visible uniquement par vous — créez votre propre feuille de route</p>
                                </div>

                                {/* Add new personal step */}
                                <form onSubmit={handleAddPersonalMilestone} className="flex gap-2 mb-5">
                                    <input
                                        className="input flex-1"
                                        placeholder="Ex: Lire le chapitre 3, Finir le module React..."
                                        value={newPersonalStep}
                                        onChange={e => setNewPersonalStep(e.target.value)}
                                        required
                                    />
                                    <button type="submit" className="btn btn-sm" style={{ background: 'var(--color-secondary)', color: '#fff', whiteSpace: 'nowrap' }}>
                                        + Ajouter
                                    </button>
                                </form>

                                {personalMilestones.length === 0 ? (
                                    <div className="card card-glass text-center py-14">
                                        <CheckSquare size={40} className="mx-auto mb-3 opacity-30" style={{ color: 'var(--color-secondary)' }} />
                                        <h3 className="text-secondary mb-2" style={{ fontSize: '1rem' }}>Aucune étape personnelle</h3>
                                        <p className="text-sm opacity-60">Ajoutez vos propres objectifs pour suivre votre progression individuelle.</p>
                                    </div>
                                ) : (
                                    <>
                                        {/* Personal progress bar */}
                                        {(() => {
                                            const done = personalMilestones.filter(m => m.completed).length;
                                            const total = personalMilestones.length;
                                            const pct = total > 0 ? Math.round((done / total) * 100) : 0;
                                            return (
                                                <div className="card card-glass mb-4" style={{ padding: '0.75rem 1rem', background: 'rgba(236,72,153,0.05)', border: '1px solid rgba(236,72,153,0.15)' }}>
                                                    <div className="flex justify-between text-sm font-bold mb-2">
                                                        <span>Ma progression</span>
                                                        <span style={{ color: 'var(--color-secondary)' }}>{done}/{total} ({pct}%)</span>
                                                    </div>
                                                    <div style={{ height: '6px', borderRadius: '4px', background: 'rgba(255,255,255,0.07)' }}>
                                                        <div style={{ height: '100%', width: `${pct}%`, borderRadius: '4px', background: 'linear-gradient(90deg, var(--color-secondary), #a855f7)', transition: 'width 0.5s ease', boxShadow: '0 0 8px rgba(236,72,153,0.4)' }} />
                                                    </div>
                                                </div>
                                            );
                                        })()}
                                        <div className="flex flex-col gap-2">
                                            {personalMilestones.map((m) => (
                                                <div
                                                    key={m.id}
                                                    className="card card-glass fade-enter flex items-center gap-3"
                                                    style={{ padding: '0.75rem 1rem', border: m.completed ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(236,72,153,0.2)', opacity: m.completed ? 0.6 : 1, transition: 'all 0.2s ease' }}
                                                >
                                                    {/* Custom checkbox pink */}
                                                    <button
                                                        type="button"
                                                        onClick={() => handleTogglePersonalMilestone(m.id, m.completed)}
                                                        style={{
                                                            width: '20px', height: '20px', borderRadius: '6px', flexShrink: 0,
                                                            border: `2px solid ${m.completed ? 'var(--color-secondary)' : 'rgba(255,255,255,0.2)'}`,
                                                            background: m.completed ? 'var(--color-secondary)' : 'transparent',
                                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                            cursor: 'pointer', transition: 'all 0.2s ease'
                                                        }}
                                                    >
                                                        {m.completed && <CheckSquare size={12} color="#fff" />}
                                                    </button>
                                                    <span
                                                        style={{ flex: 1, fontSize: '0.95rem', fontWeight: m.completed ? 400 : 500, textDecoration: m.completed ? 'line-through' : 'none' }}
                                                    >
                                                        {m.text}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        className="btn btn-sm btn-ghost text-secondary"
                                                        style={{ padding: '2px 6px', opacity: 0.5, fontSize: '0.8rem' }}
                                                        onClick={() => handleDeletePersonalMilestone(m.id)}
                                                    >
                                                        ✕
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                )}


                {/* TAB: POLLS */}
                {activeTab === 'polls' && (
                    <div className="tab-pane active fade-enter">
                        <style>{`
                            .pl-wrap { font-family: 'DM Sans', system-ui; }
                            .pl-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; gap: 12px; flex-wrap: wrap; }
                            .pl-title { display: flex; align-items: center; gap: 10px; font-family: 'Outfit', system-ui; font-size: 1.15rem; font-weight: 700; color: #eeeef0; margin: 0; letter-spacing: -0.02em; }
                            .pl-title-icon { width: 34px; height: 34px; border-radius: 10px; background: rgba(99,102,241,0.14); border: 1px solid rgba(99,102,241,0.28); display: flex; align-items: center; justify-content: center; color: #818cf8; flex-shrink: 0; }
                            .pl-btn-primary { padding: 7px 16px; border-radius: 10px; font-size: 0.82rem; font-weight: 700; cursor: pointer; border: none; background: linear-gradient(135deg,#6366f1,#4f46e5); color: #fff; font-family: 'DM Sans', system-ui; transition: all 0.2s; display: flex; align-items: center; gap: 6px; box-shadow: 0 3px 12px rgba(99,102,241,0.35); }
                            .pl-btn-primary:hover { box-shadow: 0 5px 18px rgba(99,102,241,0.5); transform: translateY(-1px); }
                            .pl-form-panel { border-radius: 16px; padding: 22px; background: rgba(12,12,16,0.85); border: 1px solid rgba(99,102,241,0.3); margin-bottom: 22px; animation: pl-in 0.25s cubic-bezier(0.22,1,0.36,1); }
                            .pl-form-head { font-family: 'Outfit', system-ui; font-weight: 700; font-size: 1rem; color: #a5b4fc; margin: 0 0 18px; }
                            .pl-label { display: block; font-size: 0.72rem; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase; color: rgba(255,255,255,0.3); margin-bottom: 7px; }
                            .pl-input { width: 100%; padding: 11px 14px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.09); border-radius: 11px; color: #eeeeef; font-size: 0.92rem; font-family: 'DM Sans', system-ui; outline: none; transition: border-color 0.2s; box-sizing: border-box; }
                            .pl-input:focus { border-color: rgba(99,102,241,0.45); background: rgba(99,102,241,0.04); }
                            .pl-input::placeholder { color: rgba(255,255,255,0.2); }
                            .pl-opt-row { display: flex; gap: 8px; align-items: center; }
                            .pl-opt-num { width: 22px; height: 22px; border-radius: 6px; background: rgba(99,102,241,0.12); border: 1px solid rgba(99,102,241,0.25); display: flex; align-items: center; justify-content: center; font-size: 0.68rem; font-weight: 700; color: #818cf8; flex-shrink: 0; }
                            .pl-btn-ghost-sm { padding: 6px 12px; border-radius: 8px; font-size: 0.76rem; font-weight: 600; cursor: pointer; border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.03); color: rgba(255,255,255,0.45); font-family: 'DM Sans', system-ui; transition: all 0.2s; display: flex; align-items: center; gap: 5px; }
                            .pl-btn-ghost-sm:hover { background: rgba(255,255,255,0.07); color: rgba(255,255,255,0.7); }
                            .pl-btn-del-sm { padding: 5px 8px; border-radius: 7px; font-size: 0.76rem; cursor: pointer; border: 1px solid transparent; background: transparent; color: rgba(255,255,255,0.25); font-family: 'DM Sans', system-ui; transition: all 0.2s; }
                            .pl-btn-del-sm:hover { background: rgba(239,68,68,0.1); border-color: rgba(239,68,68,0.25); color: #f87171; }
                            .pl-btn-submit { padding: 10px 24px; border-radius: 11px; font-size: 0.9rem; font-weight: 700; cursor: pointer; border: none; background: linear-gradient(135deg,#6366f1,#4f46e5); color: #fff; font-family: 'DM Sans', system-ui; transition: all 0.2s; display: flex; align-items: center; gap: 7px; box-shadow: 0 3px 14px rgba(99,102,241,0.38); }
                            .pl-btn-submit:hover { box-shadow: 0 5px 20px rgba(99,102,241,0.55); transform: translateY(-1px); }
                            .pl-btn-submit:disabled { opacity: 0.35; cursor: not-allowed; transform: none; box-shadow: none; }
                            .pl-list { display: flex; flex-direction: column; gap: 16px; }
                            .pl-card { border-radius: 16px; overflow: hidden; border: 1px solid rgba(255,255,255,0.07); background: rgba(16,16,22,0.85); animation: pl-in 0.3s cubic-bezier(0.22,1,0.36,1); transition: border-color 0.2s; }
                            .pl-card:hover { border-color: rgba(255,255,255,0.12); }
                            .pl-card.closed { opacity: 0.62; }
                            .pl-card.active { border-color: rgba(99,102,241,0.3); }
                            .pl-card-head { padding: 18px 20px 14px; border-bottom: 1px solid rgba(255,255,255,0.06); }
                            .pl-question { font-family: 'Outfit', system-ui; font-size: 1.05rem; font-weight: 700; color: #eeeef0; margin: 0 0 5px; line-height: 1.35; }
                            .pl-meta { font-size: 0.75rem; color: rgba(255,255,255,0.32); display: flex; align-items: center; gap: 8px; }
                            .pl-badge-closed { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 20px; font-size: 0.68rem; font-weight: 700; background: rgba(100,116,139,0.12); border: 1px solid rgba(100,116,139,0.25); color: #94a3b8; }
                            .pl-badge-open { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 20px; font-size: 0.68rem; font-weight: 700; background: rgba(99,102,241,0.12); border: 1px solid rgba(99,102,241,0.28); color: #818cf8; }
                            .pl-btn-toggle { padding: 5px 12px; border-radius: 8px; font-size: 0.74rem; font-weight: 600; cursor: pointer; font-family: 'DM Sans', system-ui; transition: all 0.2s; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.04); color: rgba(255,255,255,0.45); }
                            .pl-btn-toggle:hover { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.75); }
                            .pl-options { padding: 14px 20px; display: flex; flex-direction: column; gap: 10px; }
                            .pl-option { position: relative; border-radius: 10px; overflow: hidden; cursor: pointer; transition: all 0.2s; border: 1.5px solid rgba(255,255,255,0.07); }
                            .pl-option:hover:not(.voted):not(.closed-opt) { border-color: rgba(99,102,241,0.3); }
                            .pl-option.voted { border-color: rgba(99,102,241,0.55); }
                            .pl-option.winner { border-color: rgba(251,191,36,0.5); }
                            .pl-option.closed-opt { cursor: default; }
                            .pl-opt-fill { position: absolute; left: 0; top: 0; height: 100%; border-radius: 8px; transition: width 0.6s cubic-bezier(0.22,1,0.36,1); pointer-events: none; }
                            .pl-opt-content { position: relative; z-index: 1; display: flex; align-items: center; gap: 10px; padding: 11px 14px; }
                            .pl-opt-check { width: 18px; height: 18px; border-radius: 50%; border: 2px solid; flex-shrink: 0; display: flex; align-items: center; justify-content: center; transition: all 0.2s; }
                            .pl-opt-text { flex: 1; font-size: 0.88rem; font-weight: 500; color: rgba(255,255,255,0.78); transition: color 0.2s; }
                            .pl-opt-text.voted-text { font-weight: 700; color: #eeeef0; }
                            .pl-opt-right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
                            .pl-opt-pct { font-family: 'Outfit', system-ui; font-size: 0.88rem; font-weight: 800; color: rgba(255,255,255,0.55); min-width: 36px; text-align: right; }
                            .pl-opt-pct.voted-pct { color: #818cf8; }
                            .pl-empty { border-radius: 16px; padding: 52px 24px; background: rgba(255,255,255,0.02); border: 1px dashed rgba(255,255,255,0.08); text-align: center; }
                            @keyframes pl-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
                        `}</style>

                        <div className="pl-wrap">
                            <div className="pl-header">
                                <h3 className="pl-title">
                                    <span className="pl-title-icon"><BarChart2 size={16} /></span>
                                    Sondages du Salon
                                    {polls.length > 0 && (
                                        <span style={{ fontSize: '0.72rem', padding: '2px 9px', borderRadius: 20, background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)', color: '#818cf8', fontWeight: 700, marginLeft: 4 }}>
                                            {polls.length}
                                        </span>
                                    )}
                                </h3>
                                <button className="pl-btn-primary" onClick={() => setShowPollForm(v => !v)}>
                                    {showPollForm ? <><X size={13} /> Annuler</> : <><BarChart2 size={13} /> Créer un sondage</>}
                                </button>
                            </div>

                            {showPollForm && (
                                <div className="pl-form-panel">
                                    <div className="pl-form-head">Nouveau sondage</div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                        <div>
                                            <label className="pl-label">Question <span style={{ color: '#f87171' }}>*</span></label>
                                            <input
                                                className="pl-input"
                                                placeholder="Ex : Quel jour convient le mieux pour la prochaine session ?"
                                                value={newPoll.question}
                                                onChange={e => setNewPoll(p => ({ ...p, question: e.target.value }))}
                                                autoFocus
                                            />
                                        </div>
                                        <div>
                                            <label className="pl-label">Options <span style={{ color: '#f87171' }}>*</span> <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.2)', textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}>min. 2, max. 6</span></label>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                                {newPoll.options.map((opt, i) => (
                                                    <div key={i} className="pl-opt-row">
                                                        <div className="pl-opt-num">{i + 1}</div>
                                                        <input
                                                            className="pl-input"
                                                            style={{ flex: 1 }}
                                                            placeholder={`Option ${i + 1}`}
                                                            value={opt}
                                                            onChange={e => setNewPoll(p => { const opts = [...p.options]; opts[i] = e.target.value; return { ...p, options: opts }; })}
                                                        />
                                                        {newPoll.options.length > 2 && (
                                                            <button type="button" className="pl-btn-del-sm" onClick={() => setNewPoll(p => ({ ...p, options: p.options.filter((_, j) => j !== i) }))}>
                                                                <X size={13} />
                                                            </button>
                                                        )}
                                                    </div>
                                                ))}
                                                {newPoll.options.length < 6 && (
                                                    <button type="button" className="pl-btn-ghost-sm" onClick={() => setNewPoll(p => ({ ...p, options: [...p.options, ''] }))}>
                                                        + Ajouter une option
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                            <button
                                                type="button"
                                                className="pl-btn-submit"
                                                disabled={creatingPoll || !newPoll.question.trim() || newPoll.options.filter(o => o.trim()).length < 2}
                                                onClick={(e) => handleCreatePoll(e as any)}
                                            >
                                                {creatingPoll ? 'Création...' : 'Créer le sondage'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {polls.length === 0 ? (
                                <div className="pl-empty">
                                    <div style={{ width: 52, height: 52, borderRadius: 14, background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: '#818cf8' }}>
                                        <BarChart2 size={24} />
                                    </div>
                                    <div style={{ fontFamily: 'Outfit, system-ui', fontWeight: 700, fontSize: '1rem', color: 'rgba(255,255,255,0.5)', marginBottom: 6 }}>Aucun sondage créé</div>
                                    <div style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.25)' }}>Créez un sondage pour recueillir l'avis de votre groupe.</div>
                                </div>
                            ) : (
                                <div className="pl-list">
                                    {polls.map((poll, idx) => {
                                        const totalVotes = poll.options.reduce((sum: number, o: any) => sum + o.votes.length, 0);
                                        const winnerVotes = Math.max(...poll.options.map((o: any) => o.votes.length));
                                        return (
                                            <div
                                                key={poll.id}
                                                className={`pl-card${poll.closed ? ' closed' : ' active'}`}
                                                style={{ animationDelay: `${idx * 0.07}s` }}
                                            >
                                                <div className="pl-card-head">
                                                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 7 }}>
                                                                {poll.closed
                                                                    ? <span className="pl-badge-closed">🔒 Terminé</span>
                                                                    : <span className="pl-badge-open">● Ouvert</span>
                                                                }
                                                                <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.25)' }}>{totalVotes} vote{totalVotes !== 1 ? 's' : ''}</span>
                                                            </div>
                                                            <div className="pl-question">{poll.question}</div>
                                                            <div className="pl-meta">
                                                                <span>Par {poll.creator_name}</span>
                                                            </div>
                                                        </div>
                                                        {user && poll.creator_id === user.uid && (
                                                            <button className="pl-btn-toggle" onClick={() => handleClosePoll(poll)}>
                                                                {poll.closed ? '🔓 Rouvrir' : '🔒 Clôturer'}
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="pl-options">
                                                    {poll.options.map((opt: any, oi: number) => {
                                                        const pct = totalVotes > 0 ? Math.round((opt.votes.length / totalVotes) * 100) : 0;
                                                        const isMyVote = user && opt.votes.includes(user.uid);
                                                        const isWinner = opt.votes.length === winnerVotes && winnerVotes > 0 && poll.closed;
                                                        return (
                                                            <div
                                                                key={oi}
                                                                className={`pl-option${isMyVote ? ' voted' : ''}${isWinner ? ' winner' : ''}${poll.closed ? ' closed-opt' : ''}`}
                                                                onClick={() => !poll.closed && handleVote(poll, oi)}
                                                            >
                                                                <div
                                                                    className="pl-opt-fill"
                                                                    style={{
                                                                        width: `${pct}%`,
                                                                        background: isWinner
                                                                            ? 'rgba(251,191,36,0.1)'
                                                                            : isMyVote
                                                                                ? 'rgba(99,102,241,0.14)'
                                                                                : 'rgba(255,255,255,0.04)',
                                                                    }}
                                                                />
                                                                <div className="pl-opt-content">
                                                                    <div
                                                                        className="pl-opt-check"
                                                                        style={{
                                                                            borderColor: isMyVote ? '#6366f1' : isWinner ? '#fbbf24' : 'rgba(255,255,255,0.18)',
                                                                            background: isMyVote ? '#6366f1' : 'transparent',
                                                                        }}
                                                                    >
                                                                        {isMyVote && <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#fff' }} />}
                                                                        {isWinner && !isMyVote && <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#fbbf24' }} />}
                                                                    </div>
                                                                    <span className={`pl-opt-text${isMyVote ? ' voted-text' : ''}`}>{opt.text}</span>
                                                                    <div className="pl-opt-right">
                                                                        {isWinner && <span style={{ fontSize: '0.82rem' }}>🏆</span>}
                                                                        <span className={`pl-opt-pct${isMyVote ? ' voted-pct' : ''}`}>{pct}%</span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                )}
                {/* TAB: AGENDA */}
                {activeTab === 'agenda' && (
                    <div className="tab-pane active fade-enter">
                        <style>{`
                            @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap');
                            .ag-wrap { font-family: 'DM Sans', system-ui, sans-serif; }
                            .ag-header {
                                display: flex; align-items: center; justify-content: space-between;
                                margin-bottom: 24px; gap: 12px; flex-wrap: wrap;
                            }
                            .ag-title {
                                display: flex; align-items: center; gap: 10px;
                                font-family: 'Outfit', system-ui; font-size: 1.15rem;
                                font-weight: 700; color: #eeeef0; margin: 0;
                                letter-spacing: -0.02em;
                            }
                            .ag-title-icon {
                                width: 34px; height: 34px; border-radius: 10px;
                                background: rgba(99,102,241,0.14); border: 1px solid rgba(99,102,241,0.28);
                                display: flex; align-items: center; justify-content: center;
                                color: #818cf8; flex-shrink: 0;
                            }
                            .ag-actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
                            .ag-btn-ghost {
                                padding: 7px 14px; border-radius: 10px; font-size: 0.8rem; font-weight: 600;
                                cursor: pointer; border: 1px solid rgba(255,255,255,0.09);
                                background: rgba(255,255,255,0.04); color: rgba(255,255,255,0.5);
                                font-family: 'DM Sans', system-ui; transition: all 0.2s;
                                display: flex; align-items: center; gap: 6px;
                            }
                            .ag-btn-ghost:hover { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.75); }
                            .ag-btn-danger {
                                padding: 7px 14px; border-radius: 10px; font-size: 0.8rem; font-weight: 600;
                                cursor: pointer; border: 1px solid rgba(239,68,68,0.22);
                                background: rgba(239,68,68,0.06); color: rgba(239,68,68,0.75);
                                font-family: 'DM Sans', system-ui; transition: all 0.2s;
                                display: flex; align-items: center; gap: 6px;
                            }
                            .ag-btn-danger:hover { background: rgba(239,68,68,0.12); color: #f87171; border-color: rgba(239,68,68,0.4); }
                            .ag-btn-ai {
                                padding: 7px 14px; border-radius: 10px; font-size: 0.8rem; font-weight: 600;
                                cursor: pointer; border: 1px solid rgba(99,102,241,0.3);
                                background: rgba(99,102,241,0.1); color: #a5b4fc;
                                font-family: 'DM Sans', system-ui; transition: all 0.2s;
                                display: flex; align-items: center; gap: 6px;
                            }
                            .ag-btn-ai:hover { background: rgba(99,102,241,0.18); border-color: rgba(99,102,241,0.5); }
                            .ag-btn-primary {
                                padding: 7px 16px; border-radius: 10px; font-size: 0.82rem; font-weight: 700;
                                cursor: pointer; border: none;
                                background: linear-gradient(135deg,#6366f1,#4f46e5); color: #fff;
                                font-family: 'DM Sans', system-ui; transition: all 0.2s;
                                display: flex; align-items: center; gap: 6px;
                                box-shadow: 0 3px 12px rgba(99,102,241,0.35);
                            }
                            .ag-btn-primary:hover { box-shadow: 0 5px 18px rgba(99,102,241,0.5); transform: translateY(-1px); }
                            .ag-btn-primary:disabled { opacity: 0.38; cursor: not-allowed; transform: none; box-shadow: none; }

                            /* AI panel */
                            .ag-ai-panel {
                                border-radius: 16px; padding: 20px;
                                background: rgba(99,102,241,0.05);
                                border: 1px solid rgba(99,102,241,0.25);
                                margin-bottom: 20px;
                                animation: ag-in 0.25s cubic-bezier(0.22,1,0.36,1);
                            }
                            .ag-ai-head {
                                display: flex; align-items: center; gap: 8px;
                                font-family: 'Outfit', system-ui; font-weight: 700;
                                font-size: 0.98rem; color: #a5b4fc; margin-bottom: 6px;
                            }
                            .ag-rhythm-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 10px; margin: 14px 0; }
                            .ag-rhythm-card {
                                cursor: pointer; border-radius: 12px; padding: 13px 10px;
                                border: 1.5px solid rgba(255,255,255,0.07);
                                background: rgba(255,255,255,0.02);
                                text-align: center; transition: all 0.2s;
                            }
                            .ag-rhythm-card:hover { border-color: rgba(99,102,241,0.4); background: rgba(99,102,241,0.07); }
                            .ag-rhythm-card.active {
                                border-color: rgba(99,102,241,0.65); background: rgba(99,102,241,0.12);
                                box-shadow: 0 0 0 1px rgba(99,102,241,0.15) inset;
                                transform: translateY(-2px);
                            }
                            .ag-input {
                                width: 100%; padding: 10px 13px;
                                background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.09);
                                border-radius: 10px; color: #eeeeef; font-size: 0.88rem;
                                font-family: 'DM Sans', system-ui; outline: none;
                                transition: border-color 0.2s; box-sizing: border-box;
                            }
                            .ag-input:focus { border-color: rgba(99,102,241,0.45); background: rgba(99,102,241,0.04); }
                            .ag-input::placeholder { color: rgba(255,255,255,0.2); }

                            /* Form panel */
                            .ag-form-panel {
                                border-radius: 16px; padding: 20px;
                                background: rgba(12,12,16,0.8);
                                border: 1px solid rgba(99,102,241,0.3);
                                margin-bottom: 20px;
                                animation: ag-in 0.25s cubic-bezier(0.22,1,0.36,1);
                            }
                            .ag-form-head {
                                font-family: 'Outfit', system-ui; font-weight: 700;
                                font-size: 0.98rem; color: #a5b4fc; margin: 0 0 16px;
                            }
                            .ag-label {
                                display: block; font-size: 0.73rem; font-weight: 700;
                                letter-spacing: 0.07em; text-transform: uppercase;
                                color: rgba(255,255,255,0.3); margin-bottom: 7px;
                            }
                            .ag-form-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }
                            @media (max-width: 680px) { .ag-form-grid { grid-template-columns: 1fr; } }

                            /* Session cards — timeline style */
                            .ag-list { display: flex; flex-direction: column; gap: 0; position: relative; }
                            .ag-list::before {
                                content: ''; position: absolute; left: 55px; top: 12px; bottom: 12px;
                                width: 1px; background: linear-gradient(to bottom, transparent, rgba(255,255,255,0.07) 10%, rgba(255,255,255,0.07) 90%, transparent);
                                pointer-events: none;
                            }
                            .ag-card {
                                display: flex; gap: 0; align-items: stretch;
                                animation: ag-in 0.3s cubic-bezier(0.22,1,0.36,1);
                                padding: 6px 0;
                            }
                            .ag-date-col {
                                width: 56px; flex-shrink: 0; display: flex;
                                flex-direction: column; align-items: center;
                                padding-top: 14px; position: relative; z-index: 1;
                            }
                            .ag-dot {
                                width: 9px; height: 9px; border-radius: 50%;
                                border: 2px solid; flex-shrink: 0;
                                background: #0c0c10; margin-bottom: 6px;
                            }
                            .ag-day-num {
                                font-family: 'Outfit', system-ui; font-size: 1.45rem; font-weight: 800;
                                line-height: 1; text-align: center;
                            }
                            .ag-day-name {
                                font-size: 0.65rem; font-weight: 600; text-transform: uppercase;
                                letter-spacing: 0.05em; opacity: 0.5; text-align: center;
                                margin-top: 2px;
                            }
                            .ag-month {
                                font-size: 0.65rem; font-weight: 500; opacity: 0.4;
                                text-align: center; margin-top: 1px;
                            }
                            .ag-time {
                                font-family: 'Outfit', system-ui; font-size: 0.72rem; font-weight: 700;
                                margin-top: 5px; text-align: center; opacity: 0.65;
                            }
                            .ag-body {
                                flex: 1; min-width: 0; margin-left: 14px;
                                background: rgba(18,18,24,0.7);
                                border-radius: 14px;
                                border: 1px solid rgba(255,255,255,0.06);
                                padding: 14px 16px;
                                transition: border-color 0.2s, box-shadow 0.2s;
                                display: flex; gap: 12px; align-items: flex-start;
                            }
                            .ag-body:hover {
                                border-color: rgba(255,255,255,0.11);
                                box-shadow: 0 4px 20px rgba(0,0,0,0.3);
                            }
                            .ag-body.past { opacity: 0.52; }
                            .ag-body-inner { flex: 1; min-width: 0; }
                            .ag-pill-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 7px; }
                            .ag-pill {
                                display: inline-flex; align-items: center; gap: 4px;
                                padding: 3px 9px; border-radius: 20px;
                                font-size: 0.7rem; font-weight: 700;
                                font-family: 'DM Sans', system-ui;
                            }
                            .ag-session-title {
                                font-family: 'Outfit', system-ui; font-weight: 700;
                                font-size: 0.97rem; color: #eeeef0; margin: 0 0 4px;
                                white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
                            }
                            .ag-meta {
                                font-size: 0.77rem; color: rgba(255,255,255,0.35);
                                display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
                            }
                            .ag-meta-sep { opacity: 0.25; }
                            .ag-desc { font-size: 0.8rem; color: rgba(255,255,255,0.48); margin-top: 8px; line-height: 1.5; word-break: break-word; }
                            .ag-participants {
                                display: flex; align-items: center; gap: 6px;
                                margin-top: 10px;
                            }
                            .ag-p-count { font-size: 0.75rem; color: rgba(255,255,255,0.35); font-weight: 600; }
                            .ag-side { display: flex; flex-direction: column; gap: 6px; flex-shrink: 0; align-items: flex-end; }
                            .ag-join-btn {
                                padding: 7px 14px; border-radius: 9px; font-size: 0.78rem; font-weight: 700;
                                cursor: pointer; font-family: 'DM Sans', system-ui;
                                display: flex; align-items: center; gap: 5px; transition: all 0.2s;
                                white-space: nowrap;
                            }
                            .ag-join-btn.join {
                                background: linear-gradient(135deg,#6366f1,#4f46e5); border: none; color: #fff;
                                box-shadow: 0 3px 10px rgba(99,102,241,0.35);
                            }
                            .ag-join-btn.join:hover { box-shadow: 0 4px 16px rgba(99,102,241,0.52); transform: translateY(-1px); }
                            .ag-join-btn.leave {
                                background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.12); color: rgba(255,255,255,0.5);
                            }
                            .ag-join-btn.leave:hover { background: rgba(255,255,255,0.09); }
                            .ag-icon-btn {
                                width: 30px; height: 30px; border-radius: 8px; cursor: pointer;
                                display: flex; align-items: center; justify-content: center;
                                transition: all 0.2s; border: 1px solid transparent; background: transparent;
                            }
                            .ag-icon-btn.del { color: rgba(239,68,68,0.55); }
                            .ag-icon-btn.del:hover { background: rgba(239,68,68,0.1); border-color: rgba(239,68,68,0.25); color: #f87171; }
                            .ag-icon-btn.edit { color: rgba(255,255,255,0.35); }
                            .ag-icon-btn.edit:hover { background: rgba(255,255,255,0.08); border-color: rgba(255,255,255,0.15); color: rgba(255,255,255,0.65); }
                            .ag-edit-row { display: flex; flex-direction: column; gap: 6px; min-width: 200px; }
                            .ag-edit-btns { display: flex; gap: 6px; }
                            .ag-edit-ok {
                                flex: 1; padding: 7px; border-radius: 8px; font-size: 0.8rem; font-weight: 700;
                                background: rgba(99,102,241,0.2); border: 1px solid rgba(99,102,241,0.4); color: #a5b4fc;
                                cursor: pointer; font-family: 'DM Sans', system-ui; transition: all 0.2s;
                            }
                            .ag-edit-ok:hover { background: rgba(99,102,241,0.32); }
                            .ag-edit-ok:disabled { opacity: 0.35; cursor: not-allowed; }
                            .ag-edit-cancel {
                                padding: 7px 10px; border-radius: 8px; font-size: 0.8rem;
                                background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.09); color: rgba(255,255,255,0.4);
                                cursor: pointer; font-family: 'DM Sans', system-ui; transition: all 0.2s;
                            }
                            .ag-edit-cancel:hover { background: rgba(255,255,255,0.08); }
                            .ag-empty {
                                border-radius: 16px; padding: 56px 24px;
                                background: rgba(255,255,255,0.02); border: 1px dashed rgba(255,255,255,0.08);
                                text-align: center;
                            }
                            @keyframes ag-in {
                                from { opacity: 0; transform: translateY(10px); }
                                to   { opacity: 1; transform: none; }
                            }
                            @keyframes ag-spin { to { transform: rotate(360deg); } }
                            .ag-spin { animation: ag-spin 0.9s linear infinite; }
                        `}</style>

                        <div className="ag-wrap">
                            {/* Header */}
                            <div className="ag-header">
                                <h3 className="ag-title">
                                    <span className="ag-title-icon"><Calendar size={16} /></span>
                                    {t('agenda_title')}
                                    {sessions.length > 0 && (
                                        <span style={{ fontSize: '0.72rem', padding: '2px 9px', borderRadius: 20, background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)', color: '#818cf8', fontWeight: 700, marginLeft: 4 }}>
                                            {sessions.length}
                                        </span>
                                    )}
                                </h3>
                                <div className="ag-actions">
                                    {sessions.length > 0 && (
                                        <button className="ag-btn-danger" onClick={handleDeleteAllSessions}>
                                            <Trash2 size={13} /> Tout supprimer
                                        </button>
                                    )}
                                    <button className="ag-btn-ai" onClick={() => { setShowAgendaAI(v => !v); setShowSessionForm(false); }}>
                                        <Bot size={14} /> {showAgendaAI ? 'Fermer IA' : "Générer avec l'IA"}
                                    </button>
                                    <button className="ag-btn-primary" onClick={() => { setShowSessionForm(v => !v); setShowAgendaAI(false); }}>
                                        {showSessionForm ? <><X size={13} /> {t('agenda_btn_cancel')}</> : <><Calendar size={13} /> {t('agenda_btn_add')}</>}
                                    </button>
                                </div>
                            </div>

                            {/* AI Generation panel */}
                            {showAgendaAI && (
                                <div className="ag-ai-panel">
                                    <div className="ag-ai-head"><Bot size={16} /> Générer un planning</div>
                                    <p style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.42)', margin: '0 0 14px', lineHeight: 1.55 }}>
                                        L'IA créera des sessions pour les 2 prochaines semaines selon le rythme choisi.
                                    </p>
                                    <div className="ag-rhythm-grid">
                                        {[
                                            { id: 'leger',    label: 'Léger',    desc: '2–3 sessions', emoji: '🌿' },
                                            { id: 'regulier', label: 'Régulier', desc: '4–6 sessions', emoji: '⚡' },
                                            { id: 'intensif', label: 'Intensif', desc: '8–10 sessions', emoji: '🔥' }
                                        ].map(r => (
                                            <div
                                                key={r.id}
                                                className={`ag-rhythm-card${agendaRhythm === r.id ? ' active' : ''}`}
                                                onClick={() => setAgendaRhythm(r.id as any)}
                                            >
                                                <div style={{ fontSize: '1.2rem', marginBottom: 5 }}>{r.emoji}</div>
                                                <div style={{ fontWeight: 700, fontSize: '0.88rem', color: agendaRhythm === r.id ? '#a5b4fc' : 'rgba(255,255,255,0.7)' }}>{r.label}</div>
                                                <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.32)', marginTop: 2 }}>{r.desc}</div>
                                            </div>
                                        ))}
                                    </div>
                                    <div style={{ marginBottom: 14 }}>
                                        <label className="ag-label">Préférences horaires</label>
                                        <input
                                            className="ag-input"
                                            type="text"
                                            placeholder="Ex : soir après 18h, week-end, matin uniquement..."
                                            value={agendaTimePref}
                                            onChange={e => setAgendaTimePref(e.target.value)}
                                        />
                                    </div>
                                    <button
                                        className="ag-btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '10px' }}
                                        onClick={handleGenerateSmartAgenda}
                                        disabled={generatingAI}
                                    >
                                        {generatingAI ? (
                                            <><div className="ag-spin" style={{ width: 15, height: 15, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.35)', borderTopColor: '#fff' }} /> Génération en cours...</>
                                        ) : '✨ Générer Smart Agenda'}
                                    </button>
                                </div>
                            )}

                            {/* Session creation form */}
                            {showSessionForm && (
                                <div className="ag-form-panel">
                                    <div className="ag-form-head">{t('agenda_form_title')}</div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                                        <div>
                                            <label className="ag-label">{t('agenda_label_title')}</label>
                                            <input className="ag-input" placeholder={t('agenda_placeholder_title')} value={newSession.title} onChange={e => setNewSession(s => ({ ...s, title: e.target.value }))} required />
                                        </div>
                                        <div className="ag-form-grid">
                                            <div>
                                                <label className="ag-label">{t('agenda_label_type')}</label>
                                                <select className="ag-input" style={{ cursor: 'pointer' }} value={newSession.type} onChange={e => setNewSession(s => ({ ...s, type: e.target.value as 'travail' | 'discussion' | 'recherche' }))}>
                                                    <option value="travail">{t('agenda_type_work')}</option>
                                                    <option value="discussion">{t('agenda_type_discussion')}</option>
                                                    <option value="recherche">{t('agenda_type_research')}</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="ag-label">{t('agenda_label_date')}</label>
                                                <CalendarPicker
                                                    value={newSession.scheduled_at}
                                                    onChange={v => setNewSession(s => ({ ...s, scheduled_at: v }))}
                                                    placeholder={t('agenda_label_date')}
                                                    required
                                                />
                                            </div>
                                            <div>
                                                <label className="ag-label">Récurrence</label>
                                                <select className="ag-input" style={{ cursor: 'pointer' }} value={newSession.recurring} onChange={e => setNewSession(s => ({ ...s, recurring: e.target.value as any }))}>
                                                    <option value="none">Aucune (une seule)</option>
                                                    <option value="weekly">Chaque semaine (×4)</option>
                                                    <option value="biweekly">Toutes les 2 sem. (×4)</option>
                                                </select>
                                            </div>
                                        </div>
                                        <div>
                                            <label className="ag-label">{t('agenda_label_desc')}</label>
                                            <textarea className="ag-input" rows={2} style={{ resize: 'vertical' }} placeholder={t('agenda_desc_placeholder')} value={newSession.description} onChange={e => setNewSession(s => ({ ...s, description: e.target.value }))} />
                                        </div>
                                        <button
                                            type="button"
                                            className="ag-btn-primary"
                                            style={{ alignSelf: 'flex-end', padding: '9px 22px' }}
                                            onClick={(e) => handleCreateSession(e as any)}
                                            disabled={creatingSession}
                                        >
                                            {creatingSession ? t('agenda_creating') : t('agenda_btn_create')}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Sessions list */}
                            {sessions.length === 0 ? (
                                <div className="ag-empty">
                                    <div style={{ width: 52, height: 52, borderRadius: 14, background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: '#818cf8' }}>
                                        <Calendar size={24} />
                                    </div>
                                    <div style={{ fontFamily: 'Outfit, system-ui', fontWeight: 700, fontSize: '1rem', color: 'rgba(255,255,255,0.55)', marginBottom: 6 }}>{t('agenda_empty_title')}</div>
                                    <div style={{ fontSize: '0.83rem', color: 'rgba(255,255,255,0.25)' }}>{t('agenda_empty_desc')}</div>
                                </div>
                            ) : (
                                <div className="ag-list">
                                    {sessions.map((s, idx) => {
                                        const isAttending = user && s.attendees.includes(user.uid);
                                        const dateObj = s.scheduled_at?.toDate ? s.scheduled_at.toDate() : new Date(s.scheduled_at);
                                        const isPast = dateObj < new Date();
                                        const typeColor = s.type === 'discussion' ? '#ec4899' : s.type === 'recherche' ? '#8b5cf6' : '#6366f1';
                                        const dayNum = dateObj.getDate();
                                        const dayName = dateObj.toLocaleDateString('fr-FR', { weekday: 'short' });
                                        const monthName = dateObj.toLocaleDateString('fr-FR', { month: 'short' });
                                        const timeStr = dateObj.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

                                        return (
                                            <div key={s.id} className="ag-card" style={{ animationDelay: `${idx * 0.06}s` }}>
                                                {/* Date column */}
                                                <div className="ag-date-col">
                                                    <div className="ag-dot" style={{ borderColor: isPast ? 'rgba(255,255,255,0.15)' : typeColor, boxShadow: isPast ? 'none' : `0 0 6px ${typeColor}60` }} />
                                                    <div className="ag-day-num" style={{ color: isPast ? 'rgba(255,255,255,0.3)' : typeColor }}>{dayNum}</div>
                                                    <div className="ag-day-name" style={{ color: isPast ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.5)' }}>{dayName}</div>
                                                    <div className="ag-month">{monthName}</div>
                                                    <div className="ag-time" style={{ color: isPast ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.5)' }}>{timeStr}</div>
                                                </div>

                                                {/* Card body */}
                                                <div className={`ag-body${isPast ? ' past' : ''}`} style={{ borderLeftColor: isPast ? 'rgba(255,255,255,0.06)' : `${typeColor}35` }}>
                                                    <div className="ag-body-inner">
                                                        <div className="ag-pill-row">
                                                            <span className="ag-pill" style={{
                                                                background: `${typeColor}18`,
                                                                border: `1px solid ${typeColor}45`,
                                                                color: typeColor,
                                                            }}>
                                                                {s.type === 'discussion' ? t('agenda_badge_discussion') : s.type === 'recherche' ? t('agenda_badge_research') : t('agenda_badge_work')}
                                                            </span>
                                                            {s.recurring && s.recurring !== 'none' && (
                                                                <span className="ag-pill" style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.28)', color: '#34d399' }}>
                                                                    ↻ {s.recurring === 'weekly' ? 'Hebdo' : '2 sem.'}
                                                                </span>
                                                            )}
                                                            {isPast && (
                                                                <span className="ag-pill" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.32)' }}>
                                                                    {t('agenda_badge_past')}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="ag-session-title">{s.title}</div>
                                                        <div className="ag-meta">
                                                            <span>{t('agenda_by')} {s.creator_name}</span>
                                                        </div>
                                                        {s.description && <div className="ag-desc">{s.description}</div>}
                                                        <div className="ag-participants">
                                                            <span className="ag-p-count"><Users size={12} style={{ display:'inline', verticalAlign:'middle', marginRight:4 }} />{s.attendees.length} participant{s.attendees.length > 1 ? 's' : ''}</span>
                                                            <div style={{ display: 'flex' }}>
                                                                {s.attendees.slice(0, 4).map((attendeeUid: string) => {
                                                                    const member = memberships.find((m: any) => m.user_id === attendeeUid);
                                                                    return (
                                                                        <Avatar
                                                                            key={attendeeUid}
                                                                            uid={attendeeUid}
                                                                            avatarUrl={member?.user?.avatar_url}
                                                                            avatarStyle={member?.user?.avatar_style}
                                                                            size={22}
                                                                            style={{ border: '2px solid rgba(12,12,16,0.9)', marginLeft: idx === 0 ? 0 : -6 }}
                                                                        />
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Side actions */}
                                                    {!isPast && (
                                                        <div className="ag-side">
                                                            <button
                                                                className={`ag-join-btn ${isAttending ? 'leave' : 'join'}`}
                                                                onClick={() => handleToggleAttendee(s)}
                                                            >
                                                                <UserPlus size={13} />
                                                                {isAttending ? t('agenda_btn_leave') : t('agenda_btn_join')}
                                                            </button>
                                                            {user && (s.creator_id === user.uid || objective?.creator_id === user.uid) && (
                                                                <button
                                                                    className="ag-icon-btn del"
                                                                    onClick={() => handleDeleteSession(s.id)}
                                                                    title="Supprimer"
                                                                >
                                                                    <Trash2 size={14} />
                                                                </button>
                                                            )}
                                                            {user && s.creator_id === user.uid && (
                                                                editingSessionId === s.id ? (
                                                                    <div className="ag-edit-row">
                                                                        <CalendarPicker value={editDate} onChange={v => setEditDate(v)} />
                                                                        <div className="ag-edit-btns">
                                                                            <button className="ag-edit-ok" onClick={() => handleUpdateSessionDate(s)} disabled={!editDate}>✓ OK</button>
                                                                            <button className="ag-edit-cancel" onClick={() => { setEditingSessionId(null); setEditDate(''); }}>✕</button>
                                                                        </div>
                                                                    </div>
                                                                ) : (
                                                                    <button
                                                                        className="ag-icon-btn edit"
                                                                        title={t('agenda_btn_edit_date')}
                                                                        onClick={() => {
                                                                            setEditingSessionId(s.id);
                                                                            const d = s.scheduled_at?.toDate ? s.scheduled_at.toDate() : new Date(s.scheduled_at);
                                                                            setEditDate(d.toISOString().slice(0, 16));
                                                                        }}
                                                                    >
                                                                        <Edit3 size={13} />
                                                                    </button>
                                                                )
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* TAB: RESOURCES */}
                {activeTab === 'resources' && (
                    <div className="tab-pane active fade-enter">
                        <style>{`
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
                            .rc-upload-zone { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding: 28px; border-radius: 12px; border: 1.5px dashed rgba(255,255,255,0.12); background: rgba(255,255,255,0.02); cursor: pointer; transition: all 0.2s; text-align: center; }
                            .rc-upload-zone:hover, .rc-upload-zone.has-file { border-color: rgba(99,102,241,0.45); background: rgba(99,102,241,0.05); }
                            .rc-upload-icon { width: 40px; height: 40px; border-radius: 11px; display: flex; align-items: center; justify-content: center; background: rgba(99,102,241,0.12); border: 1px solid rgba(99,102,241,0.25); color: #818cf8; }
                            .rc-progress { height: 3px; border-radius: 2px; background: rgba(255,255,255,0.08); overflow: hidden; margin: 2px 0; }
                            .rc-progress-fill { height: 100%; border-radius: 2px; background: linear-gradient(90deg,#6366f1,#818cf8); transition: width 0.3s ease; }
                            .rc-form-footer { display: flex; gap: 8px; justify-content: flex-end; margin-top: 4px; }
                            .rc-btn-cancel { padding: 8px 16px; border-radius: 9px; font-size: 0.82rem; font-weight: 600; cursor: pointer; border: 1px solid rgba(255,255,255,0.09); background: rgba(255,255,255,0.04); color: rgba(255,255,255,0.45); font-family: 'DM Sans', system-ui; transition: all 0.2s; }
                            .rc-btn-cancel:hover { background: rgba(255,255,255,0.08); }
                            .rc-btn-add { padding: 8px 20px; border-radius: 9px; font-size: 0.82rem; font-weight: 700; cursor: pointer; border: none; background: linear-gradient(135deg,#6366f1,#4f46e5); color: #fff; font-family: 'DM Sans', system-ui; transition: all 0.2s; box-shadow: 0 2px 10px rgba(99,102,241,0.35); }
                            .rc-btn-add:hover { box-shadow: 0 4px 16px rgba(99,102,241,0.52); transform: translateY(-1px); }
                            .rc-btn-add:disabled { opacity: 0.35; cursor: not-allowed; transform: none; box-shadow: none; }
                            .rc-files-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 10px; margin-bottom: 32px; }
                            .rc-file-card { display: flex; align-items: center; gap: 12px; padding: 13px 15px; border-radius: 13px; background: rgba(18,18,24,0.7); border: 1px solid rgba(255,255,255,0.06); transition: all 0.2s; animation: rc-in 0.3s cubic-bezier(0.22,1,0.36,1); }
                            .rc-file-card:hover { border-color: rgba(255,255,255,0.11); box-shadow: 0 4px 16px rgba(0,0,0,0.28); }
                            .rc-file-icon { width: 38px; height: 38px; border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
                            .rc-file-info { flex: 1; min-width: 0; }
                            .rc-file-name { font-size: 0.88rem; font-weight: 600; color: #eeeef0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 3px; }
                            .rc-file-meta { font-size: 0.72rem; color: rgba(255,255,255,0.32); }
                            .rc-file-actions { display: flex; gap: 4px; flex-shrink: 0; }
                            .rc-icon-btn { width: 30px; height: 30px; border-radius: 7px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s; border: 1px solid transparent; background: transparent; color: rgba(255,255,255,0.38); text-decoration: none; }
                            .rc-icon-btn:hover { background: rgba(255,255,255,0.08); border-color: rgba(255,255,255,0.12); color: rgba(255,255,255,0.7); }
                            .rc-icon-btn.del:hover { background: rgba(239,68,68,0.1); border-color: rgba(239,68,68,0.25); color: #f87171; }
                            .rc-empty-files { border-radius: 14px; padding: 32px 20px; background: rgba(255,255,255,0.02); border: 1px dashed rgba(255,255,255,0.07); text-align: center; margin-bottom: 28px; }
                            .rc-divider { height: 1px; background: rgba(255,255,255,0.06); margin: 28px 0 24px; }
                            .rc-ai-section { }
                            .rc-ai-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
                            .rc-prompt-row { display: flex; gap: 9px; align-items: flex-end; margin-bottom: 16px; }
                            .rc-btn-gen { padding: 10px 18px; border-radius: 10px; font-size: 0.82rem; font-weight: 700; cursor: pointer; border: none; background: linear-gradient(135deg,#6366f1,#4f46e5); color: #fff; font-family: 'DM Sans', system-ui; transition: all 0.2s; white-space: nowrap; flex-shrink: 0; box-shadow: 0 3px 10px rgba(99,102,241,0.32); display: flex; align-items: center; gap: 7px; }
                            .rc-btn-gen:hover { box-shadow: 0 4px 16px rgba(99,102,241,0.5); transform: translateY(-1px); }
                            .rc-btn-gen:disabled { opacity: 0.38; cursor: not-allowed; transform: none; box-shadow: none; }
                            .rc-ai-list { display: flex; flex-direction: column; gap: 8px; }
                            .rc-ai-item { display: flex; align-items: flex-start; gap: 12px; padding: 13px 16px; border-radius: 12px; background: rgba(18,18,24,0.65); border: 1px solid rgba(255,255,255,0.06); animation: rc-in 0.3s cubic-bezier(0.22,1,0.36,1); transition: border-color 0.2s; }
                            .rc-ai-item:hover { border-color: rgba(236,72,153,0.2); }
                            .rc-ai-dot { width: 8px; height: 8px; border-radius: 50%; background: linear-gradient(135deg,#6366f1,#ec4899); flex-shrink: 0; margin-top: 6px; }
                            .rc-ai-skeleton { border-radius: 12px; background: rgba(255,255,255,0.04); animation: rc-pulse 1.5s ease infinite; }
                            .rc-ai-empty { border-radius: 14px; padding: 32px; background: rgba(255,255,255,0.02); border: 1px dashed rgba(255,255,255,0.07); text-align: center; }
                            @keyframes rc-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
                            @keyframes rc-pulse { 0%, 100% { opacity: 0.3; } 50% { opacity: 0.6; } }
                            @keyframes rc-spin { to { transform: rotate(360deg); } }
                            .rc-spin { animation: rc-spin 0.85s linear infinite; }
                        `}</style>

                        <div className="rc-wrap">
                            {/* ── Shared files section ── */}
                            <div className="rc-section-head">
                                <div>
                                    <h3 className="rc-section-title">
                                        <span className="rc-section-icon" style={{ background: 'rgba(99,102,241,0.13)', border: '1px solid rgba(99,102,241,0.25)', color: '#818cf8' }}>
                                            <FileUp size={15} />
                                        </span>
                                        Fichiers &amp; liens partagés
                                    </h3>
                                    <p className="rc-section-sub">Partagés avec tous les membres du salon</p>
                                </div>
                                <button className="rc-btn-ghost" onClick={() => setShowAddResource(v => !v)}>
                                    {showAddResource ? <><X size={13} /> Annuler</> : <><FileUp size={13} /> Ajouter</>}
                                </button>
                            </div>

                            {showAddResource && (
                                <div className="rc-form-panel">
                                    <div className="rc-type-tabs">
                                        {(['link', 'file'] as const).map(type => (
                                            <button
                                                key={type}
                                                className={`rc-type-tab ${resType === type ? 'active' : 'inactive'}`}
                                                onClick={() => { setResType(type); setResTitle(''); setResUrl(''); setResFile(null); }}
                                            >
                                                {type === 'link' ? <><LinkIcon size={13} /> Lien</> : <><FileUp size={13} /> Fichier</>}
                                            </button>
                                        ))}
                                    </div>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                        {resType === 'link' ? (
                                            <>
                                                <input className="rc-input" placeholder="Titre *" value={resTitle} onChange={e => setResTitle(e.target.value)} autoFocus />
                                                <input className="rc-input" placeholder="URL (optionnel)" value={resUrl} onChange={e => setResUrl(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleAddResource(); }} />
                                            </>
                                        ) : (
                                            <>
                                                <label className={`rc-upload-zone${resFile ? ' has-file' : ''}`}>
                                                    <div className="rc-upload-icon">
                                                        <Upload size={17} />
                                                    </div>
                                                    <div style={{ fontSize: '0.83rem', color: resFile ? '#818cf8' : 'rgba(255,255,255,0.38)', wordBreak: 'break-all', fontWeight: resFile ? 600 : 400 }}>
                                                        {resFile ? resFile.name : 'Cliquer pour choisir un fichier'}
                                                    </div>
                                                    {!resFile && <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.2)' }}>Tous formats acceptés</div>}
                                                    <input type="file" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) { setResFile(f); if (!resTitle) setResTitle(f.name); } }} />
                                                </label>
                                                <input className="rc-input" placeholder="Titre (optionnel)" value={resTitle} onChange={e => setResTitle(e.target.value)} />
                                            </>
                                        )}

                                        {resUploading && (
                                            <div className="rc-progress">
                                                <div className="rc-progress-fill" style={{ width: `${resUploadProgress}%` }} />
                                            </div>
                                        )}

                                        <div className="rc-form-footer">
                                            <button className="rc-btn-cancel" onClick={() => { setShowAddResource(false); setResTitle(''); setResUrl(''); setResFile(null); }}>Annuler</button>
                                            <button className="rc-btn-add" onClick={handleAddResource} disabled={resUploading || (resType === 'link' ? !resTitle.trim() : !resFile)}>
                                                {resUploading ? `${resUploadProgress}%…` : '✓ Ajouter'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {sharedFiles.length === 0 && !showAddResource ? (
                                <div className="rc-empty-files">
                                    <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', color: '#818cf8' }}>
                                        <FileUp size={20} />
                                    </div>
                                    <div style={{ fontFamily: 'Outfit, system-ui', fontWeight: 700, fontSize: '0.9rem', color: 'rgba(255,255,255,0.45)', marginBottom: 5 }}>Aucun fichier partagé</div>
                                    <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.22)' }}>Ajoutez des documents, liens ou ressources utiles pour tous.</div>
                                </div>
                            ) : (
                                <div className="rc-files-grid">
                                    {sharedFiles.map((f, idx) => (
                                        <div key={f.id} className="rc-file-card" style={{ animationDelay: `${idx * 0.05}s` }}>
                                            <div className="rc-file-icon" style={f.type === 'file' ? { background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.25)', color: '#34d399' } : { background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)', color: '#818cf8' }}>
                                                {f.type === 'file' ? <FileText size={16} /> : <LinkIcon size={16} />}
                                            </div>
                                            <div className="rc-file-info">
                                                <div className="rc-file-name">{f.title}</div>
                                                <div className="rc-file-meta">
                                                    {f.added_by_name}
                                                    {f.file_size ? ` · ${f.file_size > 1024 * 1024 ? (f.file_size / 1024 / 1024).toFixed(1) + ' MB' : Math.round(f.file_size / 1024) + ' KB'}` : ''}
                                                </div>
                                            </div>
                                            <div className="rc-file-actions">
                                                {f.url && (
                                                    <a href={f.url} target="_blank" rel="noopener noreferrer" className="rc-icon-btn" title={f.type === 'file' ? 'Télécharger' : 'Ouvrir'}>
                                                        {f.type === 'file' ? <Download size={14} /> : <ExternalLink size={14} />}
                                                    </a>
                                                )}
                                                {(user?.uid === f.added_by || user?.uid === objective.creator_id) && (
                                                    <button className="rc-icon-btn del" onClick={() => handleDeleteResource(f.id, f.storage_path)} title="Supprimer">
                                                        <Trash2 size={14} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div className="rc-divider" />

                            {/* ── AI Resources section ── */}
                            <div className="rc-ai-section">
                                <div className="rc-ai-head">
                                    <div>
                                        <h3 className="rc-section-title">
                                            <span className="rc-section-icon" style={{ background: 'rgba(236,72,153,0.1)', border: '1px solid rgba(236,72,153,0.25)', color: '#f472b6' }}>
                                                <Bot size={15} />
                                            </span>
                                            Ressources générées par l'IA
                                        </h3>
                                        <p className="rc-section-sub">Suggestions et tutoriels adaptés à votre objectif</p>
                                    </div>
                                </div>

                                <div className="rc-prompt-row">
                                    <div style={{ flex: 1 }}>
                                        <label style={{ display: 'block', fontSize: '0.71rem', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.28)', marginBottom: 7 }}>
                                            Sur quoi as-tu besoin d'aide ? <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 400, color: 'rgba(255,255,255,0.18)' }}>(optionnel)</span>
                                        </label>
                                        <input
                                            className="rc-input"
                                            type="text"
                                            placeholder="Ex : débutant en Python, surtout la POO et les fichiers..."
                                            value={aiResourcePrompt}
                                            onChange={e => setAiResourcePrompt(e.target.value)}
                                            onKeyDown={e => { if (e.key === 'Enter' && !generatingAIResources) handleGenerateResources(); }}
                                            disabled={generatingAIResources}
                                        />
                                    </div>
                                    <button className="rc-btn-gen" onClick={handleGenerateResources} disabled={generatingAIResources}>
                                        {generatingAIResources
                                            ? <><div className="rc-spin" style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff' }} /> Génération...</>
                                            : resources.length > 0 ? '↺ Regénérer' : <><Bot size={14} /> Générer</>
                                        }
                                    </button>
                                </div>

                                {generatingAIResources ? (
                                    <div className="rc-ai-list">
                                        {[...Array(5)].map((_, i) => (
                                            <div key={i} className="rc-ai-skeleton" style={{ height: 52, animationDelay: `${i * 0.1}s` }} />
                                        ))}
                                    </div>
                                ) : resources.length === 0 ? (
                                    <div className="rc-ai-empty">
                                        <div style={{ width: 42, height: 42, borderRadius: 11, background: 'rgba(236,72,153,0.1)', border: '1px solid rgba(236,72,153,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', color: '#f472b6' }}>
                                            <Bot size={19} />
                                        </div>
                                        <div style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.28)' }}>Lance une génération pour obtenir des ressources personnalisées.</div>
                                    </div>
                                ) : (
                                    <div className="rc-ai-list">
                                        {resources.map((r: any, idx: number) => (
                                            <div key={r.id} className="rc-ai-item" style={{ animationDelay: `${idx * 0.07}s` }}>
                                                <div className="rc-ai-dot" />
                                                <p style={{ margin: 0, flex: 1, fontSize: '0.87rem', color: 'rgba(255,255,255,0.75)', lineHeight: 1.6 }}>{r.text}</p>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* ── NOTES COLLABORATIVES ─────────────────────────────────── */}
                {activeTab === 'notes' && (
                    <div style={{ padding: '0 2rem 2rem' }}>
                        <style>{`
                            @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800&family=DM+Sans:wght@400;500;600&display=swap');
                            .nt-wrap { font-family: 'DM Sans', sans-serif; max-width: 860px; }
                            .nt-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.5rem; }
                            .nt-title { font-family: 'Outfit', sans-serif; font-size: 1.3rem; font-weight: 700; color: #fff; display: flex; align-items: center; gap: 10px; }
                            .nt-title-icon { width: 32px; height: 32px; background: linear-gradient(135deg, #f59e0b, #d97706); border-radius: 8px; display: flex; align-items: center; justify-content: center; }
                            .nt-save-badge { font-size: 0.72rem; color: #f59e0b; background: rgba(245,158,11,0.12); border: 1px solid rgba(245,158,11,0.25); border-radius: 20px; padding: 2px 10px; }
                            .nt-pad { background: rgba(245,158,11,0.04); border: 1.5px solid rgba(245,158,11,0.18); border-radius: 16px; overflow: hidden; position: relative; }
                            .nt-pad::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #f59e0b, #fbbf24, #f59e0b); }
                            .nt-lines { position: absolute; inset: 0; pointer-events: none; background-image: repeating-linear-gradient(transparent, transparent 31px, rgba(245,158,11,0.07) 31px, rgba(245,158,11,0.07) 32px); background-position: 0 36px; }
                            .nt-textarea { width: 100%; min-height: 420px; background: transparent; border: none; outline: none; resize: none; color: rgba(255,255,255,0.88); font-family: 'DM Sans', sans-serif; font-size: 0.97rem; line-height: 2rem; padding: 2rem 2rem; box-sizing: border-box; position: relative; z-index: 1; }
                            .nt-textarea::placeholder { color: rgba(255,255,255,0.2); }
                            .nt-footer { display: flex; align-items: center; gap: 8px; padding: 12px 20px; border-top: 1px solid rgba(245,158,11,0.1); background: rgba(245,158,11,0.03); }
                            .nt-hint { font-size: 0.75rem; color: rgba(255,255,255,0.3); }
                            .nt-members { display: flex; gap: 6px; margin-left: auto; }
                            .nt-avatar { width: 24px; height: 24px; border-radius: 50%; background: rgba(245,158,11,0.2); border: 1.5px solid rgba(245,158,11,0.4); display: flex; align-items: center; justify-content: center; font-size: 0.62rem; font-weight: 700; color: #f59e0b; }
                        `}</style>
                        <div className="nt-wrap">
                            <div className="nt-header">
                                <div className="nt-title">
                                    <div className="nt-title-icon"><StickyNote size={16} color="#fff" /></div>
                                    Notes collaboratives
                                </div>
                                {savingNote && <span className="nt-save-badge">Sauvegarde…</span>}
                            </div>
                            <div className="nt-pad">
                                <div className="nt-lines" />
                                <textarea
                                    className="nt-textarea"
                                    placeholder="Écrivez vos notes ici — tout le groupe y a accès en temps réel…"
                                    value={collabNote}
                                    onChange={e => handleNoteChange(e.target.value)}
                                />
                                <div className="nt-footer">
                                    <span className="nt-hint">Modifications sauvegardées automatiquement</span>
                                    <div className="nt-members">
                                        {memberships.slice(0, 5).map((m: any) => (
                                            <div key={m.user_id} className="nt-avatar" title={m.user?.full_name}>
                                                {(m.user?.full_name || 'A')[0].toUpperCase()}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* ── DÉCISIONS ────────────────────────────────────────────── */}
                {activeTab === 'decisions' && (
                    <div style={{ padding: '0 2rem 2rem' }}>
                        <style>{`
                            .dc-wrap { font-family: 'DM Sans', sans-serif; max-width: 860px; }
                            .dc-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.5rem; }
                            .dc-title { font-family: 'Outfit', sans-serif; font-size: 1.3rem; font-weight: 700; color: #fff; display: flex; align-items: center; gap: 10px; }
                            .dc-title-icon { width: 32px; height: 32px; background: linear-gradient(135deg, #10b981, #059669); border-radius: 8px; display: flex; align-items: center; justify-content: center; }
                            .dc-btn-add { display: flex; align-items: center; gap: 6px; background: linear-gradient(135deg, #10b981, #059669); border: none; border-radius: 10px; color: #fff; font-family: 'DM Sans', sans-serif; font-size: 0.85rem; font-weight: 600; padding: 8px 16px; cursor: pointer; transition: opacity 0.2s; }
                            .dc-btn-add:hover { opacity: 0.88; }
                            .dc-form { background: rgba(16,185,129,0.06); border: 1.5px solid rgba(16,185,129,0.2); border-radius: 14px; padding: 1.25rem; margin-bottom: 1.5rem; display: flex; flex-direction: column; gap: 10px; }
                            .dc-input { background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); border-radius: 9px; color: #fff; font-family: 'DM Sans', sans-serif; font-size: 0.9rem; padding: 10px 14px; outline: none; width: 100%; box-sizing: border-box; }
                            .dc-input:focus { border-color: rgba(16,185,129,0.5); }
                            .dc-input::placeholder { color: rgba(255,255,255,0.25); }
                            .dc-outcome-row { display: flex; gap: 8px; }
                            .dc-outcome-btn { flex: 1; padding: 8px; border-radius: 8px; border: 1.5px solid rgba(255,255,255,0.1); background: transparent; color: rgba(255,255,255,0.6); font-family: 'DM Sans', sans-serif; font-size: 0.82rem; font-weight: 600; cursor: pointer; transition: all 0.18s; }
                            .dc-outcome-btn.active-approved { background: rgba(16,185,129,0.2); border-color: #10b981; color: #10b981; }
                            .dc-outcome-btn.active-rejected { background: rgba(239,68,68,0.2); border-color: #ef4444; color: #ef4444; }
                            .dc-outcome-btn.active-pending { background: rgba(245,158,11,0.2); border-color: #f59e0b; color: #f59e0b; }
                            .dc-form-actions { display: flex; gap: 8px; justify-content: flex-end; }
                            .dc-btn-cancel { background: transparent; border: 1px solid rgba(255,255,255,0.15); border-radius: 8px; color: rgba(255,255,255,0.5); font-family: 'DM Sans', sans-serif; font-size: 0.83rem; padding: 7px 14px; cursor: pointer; }
                            .dc-btn-submit { background: #10b981; border: none; border-radius: 8px; color: #fff; font-family: 'DM Sans', sans-serif; font-size: 0.83rem; font-weight: 600; padding: 7px 16px; cursor: pointer; transition: opacity 0.2s; }
                            .dc-btn-submit:disabled { opacity: 0.5; }
                            .dc-list { display: flex; flex-direction: column; gap: 12px; }
                            .dc-card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07); border-radius: 14px; padding: 1.1rem 1.25rem 1.1rem 1.5rem; position: relative; overflow: hidden; display: flex; align-items: flex-start; gap: 14px; }
                            .dc-card-stripe { position: absolute; left: 0; top: 0; bottom: 0; width: 4px; border-radius: 14px 0 0 14px; }
                            .dc-card-stripe.approved { background: #10b981; }
                            .dc-card-stripe.rejected { background: #ef4444; }
                            .dc-card-stripe.pending { background: #f59e0b; }
                            .dc-card-body { flex: 1; }
                            .dc-card-title { font-family: 'Outfit', sans-serif; font-weight: 700; font-size: 1rem; color: #fff; margin-bottom: 4px; }
                            .dc-card-desc { font-size: 0.85rem; color: rgba(255,255,255,0.55); line-height: 1.55; }
                            .dc-card-meta { display: flex; align-items: center; gap: 10px; margin-top: 10px; }
                            .dc-badge { font-size: 0.7rem; font-weight: 700; padding: 2px 8px; border-radius: 20px; text-transform: uppercase; letter-spacing: 0.06em; }
                            .dc-badge.approved { background: rgba(16,185,129,0.18); color: #10b981; }
                            .dc-badge.rejected { background: rgba(239,68,68,0.18); color: #ef4444; }
                            .dc-badge.pending { background: rgba(245,158,11,0.18); color: #f59e0b; }
                            .dc-meta-author { font-size: 0.75rem; color: rgba(255,255,255,0.35); }
                            .dc-delete-btn { background: none; border: none; color: rgba(255,255,255,0.25); cursor: pointer; padding: 4px; border-radius: 6px; transition: color 0.15s; }
                            .dc-delete-btn:hover { color: #ef4444; }
                            .dc-empty { text-align: center; padding: 3rem; color: rgba(255,255,255,0.3); font-size: 0.9rem; }
                            .dc-outcome-actions { display: flex; gap: 6px; margin-top: 10px; }
                            .dc-outcome-action { font-size: 0.72rem; font-weight: 700; padding: 3px 10px; border-radius: 20px; border: 1.5px solid; cursor: pointer; font-family: 'DM Sans', sans-serif; transition: all 0.15s; background: transparent; }
                            .dc-outcome-action.approve { border-color: #10b981; color: #10b981; } .dc-outcome-action.approve:hover { background: rgba(16,185,129,0.15); }
                            .dc-outcome-action.reject { border-color: #ef4444; color: #ef4444; } .dc-outcome-action.reject:hover { background: rgba(239,68,68,0.15); }
                            .dc-outcome-action.reset { border-color: rgba(255,255,255,0.2); color: rgba(255,255,255,0.4); } .dc-outcome-action.reset:hover { background: rgba(255,255,255,0.05); }
                            .dc-comment-section { padding: 0.75rem 1.25rem; border-top: 1px solid rgba(255,255,255,0.06); margin-top: 4px; }
                            .dc-comment-toggle { background: none; border: none; color: rgba(255,255,255,0.35); font-family: 'DM Sans', sans-serif; font-size: 0.77rem; cursor: pointer; padding: 0; display: flex; align-items: center; gap: 5px; }
                            .dc-comment-toggle:hover { color: rgba(255,255,255,0.65); }
                            .dc-comment-list { display: flex; flex-direction: column; gap: 6px; margin-top: 10px; }
                            .dc-comment-item { display: flex; gap: 8px; align-items: flex-start; }
                            .dc-comment-author { font-size: 0.73rem; font-weight: 700; color: #10b981; flex-shrink: 0; }
                            .dc-comment-text { font-size: 0.82rem; color: rgba(255,255,255,0.6); line-height: 1.45; }
                            .dc-comment-row { display: flex; gap: 8px; margin-top: 10px; }
                            .dc-comment-input { flex: 1; background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; color: #fff; font-family: 'DM Sans', sans-serif; font-size: 0.82rem; padding: 7px 10px; outline: none; }
                            .dc-comment-input::placeholder { color: rgba(255,255,255,0.2); }
                            .dc-comment-send { background: rgba(16,185,129,0.15); border: 1px solid rgba(16,185,129,0.3); border-radius: 8px; color: #10b981; font-size: 0.78rem; font-weight: 600; padding: 7px 12px; cursor: pointer; font-family: 'DM Sans', sans-serif; white-space: nowrap; }
                        `}</style>
                        <div className="dc-wrap">
                            <div className="dc-header">
                                <div className="dc-title">
                                    <div className="dc-title-icon"><Scale size={16} color="#fff" /></div>
                                    Décisions
                                </div>
                                {!showDecisionForm && (
                                    <button className="dc-btn-add" onClick={() => setShowDecisionForm(true)}>
                                        <Plus size={14} /> Nouvelle décision
                                    </button>
                                )}
                            </div>
                            {showDecisionForm && (
                                <div className="dc-form">
                                    <input className="dc-input" placeholder="Titre de la décision" value={newDecision.title} onChange={e => setNewDecision(p => ({ ...p, title: e.target.value }))} />
                                    <textarea className="dc-input" style={{ minHeight: 80, resize: 'none' }} placeholder="Description ou contexte (optionnel)" value={newDecision.description} onChange={e => setNewDecision(p => ({ ...p, description: e.target.value }))} />
                                    <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.35)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b', display: 'inline-block' }} />
                                        La décision sera soumise en statut <strong style={{ color: '#f59e0b' }}>En attente</strong> pour validation par les admins.
                                    </div>
                                    <div className="dc-form-actions">
                                        <button className="dc-btn-cancel" onClick={() => setShowDecisionForm(false)}>Annuler</button>
                                        <button className="dc-btn-submit" disabled={addingDecision} onClick={handleAddDecision}>Enregistrer</button>
                                    </div>
                                </div>
                            )}
                            <div className="dc-list">
                                {decisions.length === 0 && <div className="dc-empty">Aucune décision enregistrée pour l'instant.</div>}
                                {decisions.map(dec => {
                                    const isAdminOrCreator = objective?.creator_id === user?.uid || memberships.find((m: any) => m.user_id === user?.uid)?.role === 'admin';
                                    const commOpen = openDecComments.has(dec.id);
                                    return (
                                        <div key={dec.id} className="dc-card" style={{ flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
                                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '1.1rem 1.25rem 1rem 1.5rem', position: 'relative' }}>
                                                <div className={`dc-card-stripe ${dec.outcome}`} />
                                                <div className="dc-card-body">
                                                    <div className="dc-card-title">{dec.title}</div>
                                                    {dec.description && <div className="dc-card-desc">{dec.description}</div>}
                                                    <div className="dc-card-meta">
                                                        <span className={`dc-badge ${dec.outcome}`}>{dec.outcome === 'approved' ? 'Approuvée' : dec.outcome === 'rejected' ? 'Rejetée' : 'En attente'}</span>
                                                        <span className="dc-meta-author">par {dec.creator_name}</span>
                                                        {dec.created_at && <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.25)', marginLeft: 'auto' }}>{fmtDate(dec.created_at)}</span>}
                                                    </div>
                                                    {isAdminOrCreator && (
                                                        <div className="dc-outcome-actions">
                                                            {dec.outcome !== 'approved' && <button className="dc-outcome-action approve" onClick={() => handleSetDecisionOutcome(dec.id, 'approved')}>✓ Approuver</button>}
                                                            {dec.outcome !== 'rejected' && <button className="dc-outcome-action reject" onClick={() => handleSetDecisionOutcome(dec.id, 'rejected')}>✗ Rejeter</button>}
                                                            {dec.outcome !== 'pending' && <button className="dc-outcome-action reset" onClick={() => handleSetDecisionOutcome(dec.id, 'pending')}>Remettre en attente</button>}
                                                        </div>
                                                    )}
                                                </div>
                                                {dec.creator_id === user?.uid && (
                                                    <button className="dc-delete-btn" onClick={() => handleDeleteDecision(dec.id)}><Trash2 size={14} /></button>
                                                )}
                                            </div>
                                            <div className="dc-comment-section">
                                                <button className="dc-comment-toggle" onClick={() => toggleDecComments(dec.id)}>
                                                    <MessageSquare size={12} /> {commOpen ? 'Masquer' : `Commentaires${decComments[dec.id]?.length ? ` (${decComments[dec.id].length})` : ''}`}
                                                </button>
                                                {commOpen && (
                                                    <>
                                                        {(decComments[dec.id] || []).length === 0 && <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.25)', marginTop: 8, fontStyle: 'italic' }}>Aucun commentaire.</div>}
                                                        <div className="dc-comment-list">
                                                            {(decComments[dec.id] || []).map((c: any) => (
                                                                <div key={c.id} className="dc-comment-item">
                                                                    <span className="dc-comment-author">{c.creator_name}</span>
                                                                    <span className="dc-comment-text">{c.text}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                        <div className="dc-comment-row">
                                                            <input className="dc-comment-input" placeholder="Ajouter un commentaire…" value={decCommentInputs[dec.id] ?? ''} onChange={e => setDecCommentInputs(p => ({ ...p, [dec.id]: e.target.value }))} onKeyDown={e => e.key === 'Enter' && handleAddDecComment(dec.id)} />
                                                            <button className="dc-comment-send" onClick={() => handleAddDecComment(dec.id)}>Envoyer</button>
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}

                {/* ── ANNONCES ─────────────────────────────────────────────── */}
                {activeTab === 'annonces' && (
                    <div style={{ padding: '0 2rem 2rem' }}>
                        <style>{`
                            .an-wrap { font-family: 'DM Sans', sans-serif; max-width: 860px; }
                            .an-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.5rem; }
                            .an-title { font-family: 'Outfit', sans-serif; font-size: 1.3rem; font-weight: 700; color: #fff; display: flex; align-items: center; gap: 10px; }
                            .an-title-icon { width: 32px; height: 32px; background: linear-gradient(135deg, #f97316, #ea580c); border-radius: 8px; display: flex; align-items: center; justify-content: center; }
                            .an-btn-add { display: flex; align-items: center; gap: 6px; background: linear-gradient(135deg, #f97316, #ea580c); border: none; border-radius: 10px; color: #fff; font-family: 'DM Sans', sans-serif; font-size: 0.85rem; font-weight: 600; padding: 8px 16px; cursor: pointer; transition: opacity 0.2s; }
                            .an-btn-add:hover { opacity: 0.88; }
                            .an-form { background: rgba(249,115,22,0.06); border: 1.5px solid rgba(249,115,22,0.22); border-radius: 14px; padding: 1.25rem; margin-bottom: 1.5rem; display: flex; flex-direction: column; gap: 10px; }
                            .an-input { background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); border-radius: 9px; color: #fff; font-family: 'DM Sans', sans-serif; font-size: 0.9rem; padding: 10px 14px; outline: none; width: 100%; box-sizing: border-box; }
                            .an-input:focus { border-color: rgba(249,115,22,0.5); }
                            .an-input::placeholder { color: rgba(255,255,255,0.25); }
                            .an-form-actions { display: flex; gap: 8px; justify-content: flex-end; }
                            .an-btn-cancel { background: transparent; border: 1px solid rgba(255,255,255,0.15); border-radius: 8px; color: rgba(255,255,255,0.5); font-family: 'DM Sans', sans-serif; font-size: 0.83rem; padding: 7px 14px; cursor: pointer; }
                            .an-btn-submit { background: #f97316; border: none; border-radius: 8px; color: #fff; font-family: 'DM Sans', sans-serif; font-size: 0.83rem; font-weight: 600; padding: 7px 16px; cursor: pointer; transition: opacity 0.2s; }
                            .an-btn-submit:disabled { opacity: 0.5; }
                            .an-list { display: flex; flex-direction: column; gap: 14px; }
                            .an-card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07); border-radius: 16px; padding: 0; overflow: hidden; position: relative; }
                            .an-card-top { height: 3px; background: linear-gradient(90deg, #f97316, #fbbf24, #f97316); }
                            .an-card-inner { padding: 1.25rem 1.5rem; }
                            .an-card-title { font-family: 'Outfit', sans-serif; font-weight: 700; font-size: 1.05rem; color: #fff; margin-bottom: 8px; display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
                            .an-card-body { font-size: 0.88rem; color: rgba(255,255,255,0.6); line-height: 1.65; }
                            .an-card-meta { display: flex; align-items: center; gap: 8px; margin-top: 12px; }
                            .an-author-badge { display: flex; align-items: center; gap: 6px; font-size: 0.75rem; color: rgba(255,255,255,0.4); }
                            .an-author-dot { width: 6px; height: 6px; border-radius: 50%; background: #f97316; }
                            .an-delete-btn { background: none; border: none; color: rgba(255,255,255,0.25); cursor: pointer; padding: 2px; transition: color 0.15s; flex-shrink: 0; }
                            .an-delete-btn:hover { color: #ef4444; }
                            .an-empty { text-align: center; padding: 3rem; color: rgba(255,255,255,0.3); font-size: 0.9rem; }
                            .an-comment-section { padding: 0.75rem 1.5rem; border-top: 1px solid rgba(255,255,255,0.06); }
                            .an-comment-toggle { background: none; border: none; color: rgba(255,255,255,0.35); font-family: 'DM Sans', sans-serif; font-size: 0.77rem; cursor: pointer; padding: 0; display: flex; align-items: center; gap: 5px; }
                            .an-comment-toggle:hover { color: rgba(255,255,255,0.65); }
                            .an-comment-list { display: flex; flex-direction: column; gap: 6px; margin-top: 10px; }
                            .an-comment-item { display: flex; gap: 8px; align-items: flex-start; }
                            .an-comment-author { font-size: 0.73rem; font-weight: 700; color: #f97316; flex-shrink: 0; }
                            .an-comment-text { font-size: 0.82rem; color: rgba(255,255,255,0.6); line-height: 1.45; }
                            .an-comment-row { display: flex; gap: 8px; margin-top: 10px; }
                            .an-comment-input { flex: 1; background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; color: #fff; font-family: 'DM Sans', sans-serif; font-size: 0.82rem; padding: 7px 10px; outline: none; }
                            .an-comment-input::placeholder { color: rgba(255,255,255,0.2); }
                            .an-comment-send { background: rgba(249,115,22,0.15); border: 1px solid rgba(249,115,22,0.3); border-radius: 8px; color: #f97316; font-size: 0.78rem; font-weight: 600; padding: 7px 12px; cursor: pointer; font-family: 'DM Sans', sans-serif; white-space: nowrap; }
                        `}</style>
                        <div className="an-wrap">
                            <div className="an-header">
                                <div className="an-title">
                                    <div className="an-title-icon"><Megaphone size={16} color="#fff" /></div>
                                    Annonces
                                </div>
                                {!showAnnouncementForm && objective?.creator_id === user?.uid && (
                                    <button className="an-btn-add" onClick={() => setShowAnnouncementForm(true)}>
                                        <Plus size={14} /> Publier une annonce
                                    </button>
                                )}
                            </div>
                            {showAnnouncementForm && (
                                <div className="an-form">
                                    <input className="an-input" placeholder="Titre de l'annonce" value={newAnnouncement.title} onChange={e => setNewAnnouncement(p => ({ ...p, title: e.target.value }))} />
                                    <textarea className="an-input" style={{ minHeight: 90, resize: 'none' }} placeholder="Corps de l'annonce…" value={newAnnouncement.body} onChange={e => setNewAnnouncement(p => ({ ...p, body: e.target.value }))} />
                                    <div className="an-form-actions">
                                        <button className="an-btn-cancel" onClick={() => setShowAnnouncementForm(false)}>Annuler</button>
                                        <button className="an-btn-submit" disabled={addingAnnouncement} onClick={handleAddAnnouncement}>Publier</button>
                                    </div>
                                </div>
                            )}
                            <div className="an-list">
                                {announcements.length === 0 && <div className="an-empty">Aucune annonce pour l'instant.</div>}
                                {announcements.map(ann => {
                                    const commOpen = openAnnComments.has(ann.id);
                                    return (
                                        <div key={ann.id} className="an-card">
                                            <div className="an-card-top" />
                                            <div className="an-card-inner">
                                                <div className="an-card-title">
                                                    <span>{ann.title}</span>
                                                    {ann.creator_id === user?.uid && (
                                                        <button className="an-delete-btn" onClick={() => handleDeleteAnnouncement(ann.id)}><Trash2 size={14} /></button>
                                                    )}
                                                </div>
                                                {ann.body && <div className="an-card-body">{ann.body}</div>}
                                                <div className="an-card-meta">
                                                    <div className="an-author-badge">
                                                        <div className="an-author-dot" />
                                                        {ann.creator_name}
                                                    </div>
                                                    {ann.created_at && <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.25)', marginLeft: 'auto' }}>{fmtDate(ann.created_at)}</span>}
                                                </div>
                                            </div>
                                            <div className="an-comment-section">
                                                <button className="an-comment-toggle" onClick={() => toggleAnnComments(ann.id)}>
                                                    <MessageSquare size={12} /> {commOpen ? 'Masquer' : `Commentaires${annComments[ann.id]?.length ? ` (${annComments[ann.id].length})` : ''}`}
                                                </button>
                                                {commOpen && (
                                                    <>
                                                        {(annComments[ann.id] || []).length === 0 && <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.25)', marginTop: 8, fontStyle: 'italic' }}>Aucun commentaire.</div>}
                                                        <div className="an-comment-list">
                                                            {(annComments[ann.id] || []).map((c: any) => (
                                                                <div key={c.id} className="an-comment-item">
                                                                    <span className="an-comment-author">{c.creator_name}</span>
                                                                    <span className="an-comment-text">{c.text}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                        <div className="an-comment-row">
                                                            <input className="an-comment-input" placeholder="Ajouter un commentaire…" value={annCommentInputs[ann.id] ?? ''} onChange={e => setAnnCommentInputs(p => ({ ...p, [ann.id]: e.target.value }))} onKeyDown={e => e.key === 'Enter' && handleAddAnnComment(ann.id)} />
                                                            <button className="an-comment-send" onClick={() => handleAddAnnComment(ann.id)}>Envoyer</button>
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}

                {/* ── Q&A ──────────────────────────────────────────────────── */}
                {activeTab === 'qa' && (
                    <div style={{ padding: '0 2rem 2rem' }}>
                        <style>{`
                            .qa-wrap { font-family: 'DM Sans', sans-serif; max-width: 860px; }
                            .qa-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.5rem; }
                            .qa-title { font-family: 'Outfit', sans-serif; font-size: 1.3rem; font-weight: 700; color: #fff; display: flex; align-items: center; gap: 10px; }
                            .qa-title-icon { width: 32px; height: 32px; background: linear-gradient(135deg, #6366f1, #4f46e5); border-radius: 8px; display: flex; align-items: center; justify-content: center; }
                            .qa-btn-ask { display: flex; align-items: center; gap: 6px; background: linear-gradient(135deg, #6366f1, #4f46e5); border: none; border-radius: 10px; color: #fff; font-family: 'DM Sans', sans-serif; font-size: 0.85rem; font-weight: 600; padding: 8px 16px; cursor: pointer; transition: opacity 0.2s; }
                            .qa-btn-ask:hover { opacity: 0.88; }
                            .qa-form { background: rgba(99,102,241,0.06); border: 1.5px solid rgba(99,102,241,0.22); border-radius: 14px; padding: 1.25rem; margin-bottom: 1.5rem; display: flex; flex-direction: column; gap: 10px; }
                            .qa-input { background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); border-radius: 9px; color: #fff; font-family: 'DM Sans', sans-serif; font-size: 0.9rem; padding: 10px 14px; outline: none; width: 100%; box-sizing: border-box; resize: none; }
                            .qa-input:focus { border-color: rgba(99,102,241,0.5); }
                            .qa-input::placeholder { color: rgba(255,255,255,0.25); }
                            .qa-form-actions { display: flex; gap: 8px; justify-content: flex-end; }
                            .qa-btn-cancel { background: transparent; border: 1px solid rgba(255,255,255,0.15); border-radius: 8px; color: rgba(255,255,255,0.5); font-family: 'DM Sans', sans-serif; font-size: 0.83rem; padding: 7px 14px; cursor: pointer; }
                            .qa-btn-submit { background: #6366f1; border: none; border-radius: 8px; color: #fff; font-family: 'DM Sans', sans-serif; font-size: 0.83rem; font-weight: 600; padding: 7px 16px; cursor: pointer; transition: opacity 0.2s; }
                            .qa-btn-submit:disabled { opacity: 0.5; }
                            .qa-list { display: flex; flex-direction: column; gap: 16px; }
                            .qa-thread { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07); border-radius: 16px; overflow: hidden; }
                            .qa-q-row { display: flex; gap: 12px; padding: 1.1rem 1.25rem; }
                            .qa-badge-q { flex-shrink: 0; width: 28px; height: 28px; border-radius: 8px; background: linear-gradient(135deg, #6366f1, #4f46e5); display: flex; align-items: center; justify-content: center; font-size: 0.72rem; font-weight: 800; color: #fff; letter-spacing: -0.02em; margin-top: 1px; }
                            .qa-badge-a { flex-shrink: 0; width: 28px; height: 28px; border-radius: 8px; background: linear-gradient(135deg, #10b981, #059669); display: flex; align-items: center; justify-content: center; font-size: 0.72rem; font-weight: 800; color: #fff; margin-top: 1px; }
                            .qa-q-text { font-size: 0.95rem; color: rgba(255,255,255,0.88); line-height: 1.55; flex: 1; }
                            .qa-q-meta { font-size: 0.73rem; color: rgba(255,255,255,0.35); margin-top: 5px; }
                            .qa-q-actions { display: flex; gap: 6px; align-items: flex-start; }
                            .qa-del-btn { background: none; border: none; color: rgba(255,255,255,0.2); cursor: pointer; padding: 2px; }
                            .qa-del-btn:hover { color: #ef4444; }
                            .qa-answer-row { border-top: 1px solid rgba(255,255,255,0.06); background: rgba(16,185,129,0.04); display: flex; gap: 12px; padding: 1rem 1.25rem; }
                            .qa-a-text { font-size: 0.9rem; color: rgba(255,255,255,0.75); line-height: 1.55; flex: 1; }
                            .qa-a-meta { font-size: 0.73rem; color: rgba(255,255,255,0.35); margin-top: 5px; }
                            .qa-reply-row { border-top: 1px solid rgba(255,255,255,0.06); padding: 0.75rem 1.25rem; display: flex; gap: 8px; }
                            .qa-reply-input { flex: 1; background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; color: #fff; font-family: 'DM Sans', sans-serif; font-size: 0.85rem; padding: 8px 12px; outline: none; }
                            .qa-reply-input:focus { border-color: rgba(16,185,129,0.4); }
                            .qa-reply-input::placeholder { color: rgba(255,255,255,0.2); }
                            .qa-reply-btn { background: #10b981; border: none; border-radius: 8px; color: #fff; font-family: 'DM Sans', sans-serif; font-size: 0.82rem; font-weight: 600; padding: 8px 14px; cursor: pointer; white-space: nowrap; }
                            .qa-reply-btn:disabled { opacity: 0.5; }
                            .qa-empty { text-align: center; padding: 3rem; color: rgba(255,255,255,0.3); font-size: 0.9rem; }
                        `}</style>
                        <div className="qa-wrap">
                            <div className="qa-header">
                                <div className="qa-title">
                                    <div className="qa-title-icon"><HelpCircle size={16} color="#fff" /></div>
                                    Questions & Réponses
                                </div>
                                {!showQuestionForm && (
                                    <button className="qa-btn-ask" onClick={() => setShowQuestionForm(true)}>
                                        <Plus size={14} /> Poser une question
                                    </button>
                                )}
                            </div>
                            {showQuestionForm && (
                                <div className="qa-form">
                                    <textarea className="qa-input" style={{ minHeight: 80 }} placeholder="Votre question…" value={newQuestionText} onChange={e => setNewQuestionText(e.target.value)} />
                                    <div className="qa-form-actions">
                                        <button className="qa-btn-cancel" onClick={() => setShowQuestionForm(false)}>Annuler</button>
                                        <button className="qa-btn-submit" disabled={addingQuestion} onClick={handleAddQuestion}>Envoyer</button>
                                    </div>
                                </div>
                            )}
                            <div className="qa-list">
                                {questions.length === 0 && <div className="qa-empty">Aucune question pour l'instant — soyez le premier à en poser une !</div>}
                                {questions.map(q => (
                                    <div key={q.id} className="qa-thread">
                                        <div className="qa-q-row">
                                            <div className="qa-badge-q">Q</div>
                                            <div style={{ flex: 1 }}>
                                                <div className="qa-q-text">{q.question}</div>
                                                <div className="qa-q-meta">posée par {q.creator_name}{q.created_at && <span style={{ marginLeft: 8, opacity: 0.7 }}>· {fmtDate(q.created_at)}</span>}</div>
                                            </div>
                                            {q.creator_id === user?.uid && (
                                                <div className="qa-q-actions">
                                                    <button className="qa-del-btn" onClick={() => handleDeleteQuestion(q.id)}><Trash2 size={13} /></button>
                                                </div>
                                            )}
                                        </div>
                                        {q.answer ? (
                                            <div className="qa-answer-row">
                                                <div className="qa-badge-a">R</div>
                                                <div style={{ flex: 1 }}>
                                                    <div className="qa-a-text">{q.answer}</div>
                                                    <div className="qa-a-meta">répondu par {q.answered_by}{q.answered_at && <span style={{ marginLeft: 8, opacity: 0.7 }}>· {fmtDate(q.answered_at)}</span>}</div>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="qa-reply-row">
                                                <input className="qa-reply-input" placeholder="Votre réponse…" value={answerInputs[q.id] ?? ''} onChange={e => setAnswerInputs(p => ({ ...p, [q.id]: e.target.value }))} />
                                                <button className="qa-reply-btn" disabled={answeringId === q.id} onClick={() => handleAnswerQuestion(q.id)}>Répondre</button>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* ── FOCUS DU JOUR ────────────────────────────────────────── */}
                {activeTab === 'focus' && (
                    <div style={{ padding: '0 2rem 2rem' }}>
                        <style>{`
                            .fd-wrap { font-family: 'DM Sans', sans-serif; max-width: 900px; }
                            .fd-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.5rem; }
                            .fd-title { font-family: 'Outfit', sans-serif; font-size: 1.3rem; font-weight: 700; color: #fff; display: flex; align-items: center; gap: 10px; }
                            .fd-title-icon { width: 32px; height: 32px; background: linear-gradient(135deg, #ec4899, #db2777); border-radius: 8px; display: flex; align-items: center; justify-content: center; }
                            .fd-date-badge { font-size: 0.78rem; color: rgba(255,255,255,0.4); background: rgba(255,255,255,0.06); border-radius: 20px; padding: 4px 12px; border: 1px solid rgba(255,255,255,0.09); }
                            .fd-mine { background: rgba(236,72,153,0.07); border: 1.5px solid rgba(236,72,153,0.22); border-radius: 16px; padding: 1.25rem 1.5rem; margin-bottom: 1.75rem; }
                            .fd-mine-label { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.08em; color: #ec4899; font-weight: 700; margin-bottom: 10px; }
                            .fd-mine-row { display: flex; gap: 10px; align-items: flex-end; }
                            .fd-mine-input { flex: 1; background: rgba(0,0,0,0.3); border: 1px solid rgba(236,72,153,0.25); border-radius: 10px; color: #fff; font-family: 'DM Sans', sans-serif; font-size: 0.95rem; padding: 10px 14px; outline: none; }
                            .fd-mine-input:focus { border-color: rgba(236,72,153,0.55); }
                            .fd-mine-input::placeholder { color: rgba(255,255,255,0.25); }
                            .fd-mine-btn { background: linear-gradient(135deg, #ec4899, #db2777); border: none; border-radius: 10px; color: #fff; font-family: 'DM Sans', sans-serif; font-size: 0.85rem; font-weight: 600; padding: 10px 18px; cursor: pointer; white-space: nowrap; transition: opacity 0.2s; }
                            .fd-mine-btn:disabled { opacity: 0.5; }
                            .fd-section-label { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.08em; color: rgba(255,255,255,0.35); font-weight: 700; margin-bottom: 12px; }
                            .fd-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; }
                            .fd-card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07); border-radius: 14px; padding: 1.1rem 1.25rem; position: relative; overflow: hidden; transition: border-color 0.2s; }
                            .fd-card:hover { border-color: rgba(236,72,153,0.25); }
                            .fd-card.is-me { border-color: rgba(236,72,153,0.35); background: rgba(236,72,153,0.06); }
                            .fd-card-glow { position: absolute; top: -20px; right: -20px; width: 80px; height: 80px; border-radius: 50%; background: radial-gradient(circle, rgba(236,72,153,0.12), transparent 70%); pointer-events: none; }
                            .fd-card-name { font-family: 'Outfit', sans-serif; font-weight: 700; font-size: 0.88rem; color: rgba(255,255,255,0.6); margin-bottom: 8px; display: flex; align-items: center; gap: 6px; }
                            .fd-card-dot { width: 6px; height: 6px; border-radius: 50%; background: #ec4899; flex-shrink: 0; }
                            .fd-card-focus { font-size: 0.93rem; color: rgba(255,255,255,0.85); line-height: 1.55; }
                            .fd-me-badge { font-size: 0.65rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.07em; background: rgba(236,72,153,0.25); color: #ec4899; border-radius: 20px; padding: 1px 7px; margin-left: auto; }
                            .fd-card-actions { display: flex; gap: 4px; margin-left: 6px; }
                            .fd-action-btn { background: none; border: none; color: rgba(255,255,255,0.25); cursor: pointer; padding: 2px; border-radius: 5px; transition: color 0.15s; line-height: 1; }
                            .fd-action-btn:hover { color: #ec4899; }
                            .fd-action-btn.del:hover { color: #ef4444; }
                            .fd-empty-team { text-align: center; padding: 1.5rem; color: rgba(255,255,255,0.25); font-size: 0.85rem; font-style: italic; }
                        `}</style>
                        <div className="fd-wrap">
                            <div className="fd-header">
                                <div className="fd-title">
                                    <div className="fd-title-icon"><Crosshair size={16} color="#fff" /></div>
                                    Focus du jour
                                </div>
                                <span className="fd-date-badge">{new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
                            </div>
                            <div className="fd-mine">
                                <div className="fd-mine-label">Mon focus aujourd'hui</div>
                                <div className="fd-mine-row">
                                    <input className="fd-mine-input" placeholder="Sur quoi allez-vous vous concentrer aujourd'hui ?" value={myFocusText} onChange={e => { setMyFocusText(e.target.value); setFocusError(''); }} onKeyDown={e => e.key === 'Enter' && handleSaveFocus()} />
                                    <button className="fd-mine-btn" disabled={savingFocus} onClick={handleSaveFocus}>{savingFocus ? '…' : focusSaved ? '✓ Sauvegardé' : 'Sauvegarder'}</button>
                                </div>
                                {focusError && <div style={{ marginTop: 8, fontSize: '0.8rem', color: '#f87171' }}>{focusError}</div>}
                            </div>
                            <div className="fd-section-label">Focus de l'équipe</div>
                            <div className="fd-grid">
                                {dailyFocusItems.length === 0 && (
                                    <div className="fd-empty-team" style={{ gridColumn: '1/-1' }}>Aucun focus partagé aujourd'hui.</div>
                                )}
                                {dailyFocusItems.map(f => {
                                    const isMe = f.user_id === user?.uid;
                                    return (
                                        <div key={f.id} className={`fd-card${isMe ? ' is-me' : ''}`}>
                                            <div className="fd-card-glow" />
                                            <div className="fd-card-name">
                                                <div className="fd-card-dot" />
                                                {f.user_name}
                                                {isMe && <span className="fd-me-badge">Moi</span>}
                                                {isMe && (
                                                    <div className="fd-card-actions">
                                                        <button className="fd-action-btn" title="Modifier" onClick={() => setMyFocusText(f.focus)}><Edit3 size={12} /></button>
                                                        <button className="fd-action-btn del" title="Supprimer" onClick={handleDeleteFocus}><Trash2 size={12} /></button>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="fd-card-focus">{f.focus}</div>
                                            {f.created_at && <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.2)', marginTop: 8 }}>{fmtDate(f.created_at)}</div>}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}


                {/* ── ROADMAP ─────────────────────────────────────────────── */}
                {activeTab === 'roadmap' && (() => {
                    // ─── VIEW SETUP ───────────────────────────────────────────
                    const LW = 160;
                    const CW = rmZoom;
                    const PCOLS = ['#6366f1','#ec4899','#f97316','#10b981','#f59e0b','#14b8a6','#8b5cf6','#3b82f6'];
                    const MCOL: Record<string,string> = { milestone:'#f59e0b', deadline:'#ef4444', launch:'#10b981', review:'#3b82f6' };
                    const MLBL: Record<string,string> = { milestone:'Jalon', deadline:'Deadline', launch:'Lancement', review:'Revue' };
                    const isAoC = objective?.creator_id === user?.uid || memberships.find((m: any) => m.user_id === user?.uid)?.role === 'admin';
                    const STICKY_BG = 'rgba(10,10,18,0.98)';
                    const cm = new Date();

                    const ZOOM_STEPS = rmView === 'week'
                        ? [25, 35, 50, 70, 100, 140, 200, 280]
                        : rmView === 'quarter'
                            ? [160, 220, 300, 400, 540]
                            : [45, 60, 80, 100, 130, 165, 210, 280, 380, 520];

                    // Build columns & visible range
                    type Col = { d: Date; label: string; subLabel?: string; accent: boolean; isNew: boolean };
                    const cols: Col[] = [];
                    let vs: Date, ve: Date;

                    const getISOWeek = (d: Date) => {
                        const t = new Date(d); t.setDate(t.getDate() + 3 - (t.getDay() + 6) % 7);
                        const w1 = new Date(t.getFullYear(), 0, 4);
                        return 1 + Math.round(((t.getTime() - w1.getTime()) / 86400000 - 3 + (w1.getDay() + 6) % 7) / 7);
                    };

                    if (rmView === 'week') {
                        const COLS = 26;
                        const today = new Date(); today.setHours(0,0,0,0);
                        const dow = today.getDay() || 7;
                        vs = new Date(today); vs.setDate(today.getDate() - (dow - 1) - 3*7 + rmOffset * 7);
                        ve = new Date(vs); ve.setDate(vs.getDate() + COLS * 7);
                        for (let i = 0; i < COLS; i++) {
                            const d = new Date(vs); d.setDate(d.getDate() + i * 7);
                            const wn = getISOWeek(d);
                            const isMonthStart = d.getDate() <= 7;
                            const monthLbl = isMonthStart ? d.toLocaleDateString('fr-FR', { month: 'short' }) : '';
                            cols.push({ d, label: `S${String(wn).padStart(2,'0')}`, subLabel: monthLbl, accent: isMonthStart, isNew: isMonthStart });
                        }
                    } else if (rmView === 'quarter') {
                        const COLS = 8;
                        const today = new Date(); today.setHours(0,0,0,0);
                        const curQ = Math.floor(today.getMonth() / 3);
                        vs = new Date(today.getFullYear(), curQ * 3 - 3 + rmOffset * 3, 1);
                        ve = new Date(vs.getFullYear(), vs.getMonth() + COLS * 3, 1);
                        for (let i = 0; i < COLS; i++) {
                            const d = new Date(vs.getFullYear(), vs.getMonth() + i * 3, 1);
                            const q = Math.floor(d.getMonth() / 3) + 1;
                            const isYS = q === 1;
                            cols.push({ d, label: `T${q}`, subLabel: String(d.getFullYear()), accent: isYS, isNew: isYS });
                        }
                    } else {
                        const COLS = 14;
                        const today = new Date(); today.setHours(0,0,0,0);
                        vs = new Date(today.getFullYear(), today.getMonth() - 2 + rmOffset, 1);
                        ve = new Date(vs.getFullYear(), vs.getMonth() + COLS, 1);
                        for (let i = 0; i < COLS; i++) {
                            const d = new Date(vs.getFullYear(), vs.getMonth() + i, 1);
                            const q = Math.floor(d.getMonth() / 3) + 1;
                            const qStart = d.getMonth() % 3 === 0;
                            cols.push({ d, label: d.toLocaleDateString('fr-FR', { month: 'short' }), subLabel: qStart ? `T${q} ${d.getFullYear()}` : undefined, accent: qStart, isNew: qStart });
                        }
                    }

                    const totalMs = ve.getTime() - vs.getTime();
                    const TW = cols.length * CW;
                    const dateToX = (ds: string) => { const d = new Date(ds + 'T00:00:00'); return Math.round(((d.getTime() - vs.getTime()) / totalMs) * TW); };
                    const now = new Date(); const todayX = Math.round(((now.getTime() - vs.getTime()) / totalMs) * TW); const todayInView = todayX >= 0 && todayX <= TW;

                    const showWeeks = rmView === 'month' && CW >= 185;
                    const showDays = rmView === 'month' && CW >= 420;
                    const showMonthsInQ = rmView === 'quarter' && CW >= 250;

                    // ─── DATE PICKER ──────────────────────────────────────────
                    const renderPicker = (fid: string, val: string, onChange: (v: string) => void, ph: string) => {
                        const isOpen = rmPickerOpen === fid;
                        const fmtVal = val ? new Date(val + 'T00:00:00').toLocaleDateString('fr-FR', { day:'numeric', month:'short', year:'numeric' }) : '';
                        const calY = rmPickerCal.y; const calM = rmPickerCal.m;
                        const firstDay = new Date(calY, calM, 1).getDay();
                        const daysInMonth = new Date(calY, calM + 1, 0).getDate();
                        const prevMonth = () => { const nm = calM === 0 ? { y: calY-1, m: 11 } : { y: calY, m: calM-1 }; setRmPickerCal(nm); };
                        const nextMonth = () => { const nm = calM === 11 ? { y: calY+1, m: 0 } : { y: calY, m: calM+1 }; setRmPickerCal(nm); };
                        const DAY_NAMES = ['D','L','M','M','J','V','S'];
                        const cells: (number|null)[] = [];
                        const startOffset = firstDay === 0 ? 6 : firstDay - 1;
                        for (let i = 0; i < startOffset; i++) cells.push(null);
                        for (let d = 1; d <= daysInMonth; d++) cells.push(d);
                        while (cells.length % 7 !== 0) cells.push(null);
                        const selD = val ? new Date(val + 'T00:00:00') : null;
                        const todayD = new Date(); todayD.setHours(0,0,0,0);
                        return (
                            <div style={{ position: 'relative' }}>
                                <button type="button" className="rm-dp-btn" onClick={() => { setRmPickerOpen(isOpen ? null : fid); setRmPickerCal({ y: selD ? selD.getFullYear() : new Date().getFullYear(), m: selD ? selD.getMonth() : new Date().getMonth() }); }}>
                                    <span style={{ color: fmtVal ? '#fff' : 'rgba(255,255,255,0.25)' }}>{fmtVal || ph}</span>
                                    <Calendar size={13} color="rgba(245,158,11,0.7)" />
                                </button>
                                {isOpen && (<>
                                    <div style={{ position:'fixed', inset:0, zIndex:198 }} onClick={() => setRmPickerOpen(null)} />
                                    <div className="rm-dp-popup">
                                        <div className="rm-dp-nav">
                                            <button type="button" className="rm-dp-nav-btn" onClick={prevMonth}>‹</button>
                                            <span className="rm-dp-month-label">{new Date(calY, calM).toLocaleDateString('fr-FR',{month:'long',year:'numeric'})}</span>
                                            <button type="button" className="rm-dp-nav-btn" onClick={nextMonth}>›</button>
                                        </div>
                                        <div className="rm-dp-grid">
                                            {DAY_NAMES.map((d,i) => <div key={i} className="rm-dp-dow">{d}</div>)}
                                            {cells.map((d,i) => {
                                                if (!d) return <div key={i} />;
                                                const thisDate = new Date(calY, calM, d); thisDate.setHours(0,0,0,0);
                                                const isToday = thisDate.getTime() === todayD.getTime();
                                                const isSel = selD ? thisDate.getTime() === selD.getTime() : false;
                                                const ds = `${calY}-${String(calM+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
                                                return <button key={i} type="button" className={`rm-dp-day${isSel?' rm-dp-sel':''}${isToday&&!isSel?' rm-dp-today':''}`} onClick={() => { onChange(ds); setRmPickerOpen(null); }}>{d}</button>;
                                            })}
                                        </div>
                                        <div className="rm-dp-foot">
                                            <button type="button" className="rm-dp-clear" onClick={() => { onChange(''); setRmPickerOpen(null); }}>Effacer</button>
                                            <button type="button" className="rm-dp-now" onClick={() => { const t = new Date(); onChange(`${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`); setRmPickerOpen(null); }}>Aujourd'hui</button>
                                        </div>
                                    </div>
                                </>)}
                            </div>
                        );
                    };

                    return (
                        <div style={{ padding: '0 2rem 2rem' }}>
                            <style>{`
                                .rm-wrap{font-family:'DM Sans',sans-serif;max-width:100%}
                                .rm-hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:1.5rem;flex-wrap:wrap;gap:12px}
                                .rm-title{font-family:'Outfit',sans-serif;font-size:1.3rem;font-weight:700;color:#fff;display:flex;align-items:center;gap:10px}
                                .rm-title-icon{width:32px;height:32px;background:linear-gradient(135deg,#f59e0b,#b45309);border-radius:8px;display:flex;align-items:center;justify-content:center;box-shadow:0 0 18px rgba(245,158,11,0.3)}
                                .rm-hdr-right{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
                                .rm-view-grp{display:flex;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.09);border-radius:10px;overflow:hidden;flex-shrink:0}
                                .rm-view-btn{background:transparent;border:none;color:rgba(255,255,255,0.45);font-family:'DM Sans',sans-serif;font-size:0.8rem;font-weight:500;padding:7px 15px;cursor:pointer;transition:all 0.15s;white-space:nowrap}
                                .rm-view-btn:hover{color:#fff;background:rgba(255,255,255,0.06)}
                                .rm-view-btn-active{background:rgba(245,158,11,0.15)!important;color:#f59e0b!important;font-weight:700!important}
                                .rm-nav-grp{display:flex;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.09);border-radius:9px;overflow:hidden}
                                .rm-nav-btn{background:transparent;border:none;color:rgba(255,255,255,0.5);font-family:'DM Sans',sans-serif;font-size:0.82rem;padding:7px 14px;cursor:pointer;transition:all 0.15s}
                                .rm-nav-btn:hover{background:rgba(255,255,255,0.08);color:#fff}
                                .rm-today-btn{background:transparent;border:none;border-left:1px solid rgba(255,255,255,0.09);border-right:1px solid rgba(255,255,255,0.09);color:#f59e0b;font-family:'DM Sans',sans-serif;font-size:0.78rem;padding:7px 13px;cursor:pointer;font-weight:600}
                                .rm-add-phase{display:flex;align-items:center;gap:5px;background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.25);border-radius:9px;color:#f59e0b;font-family:'DM Sans',sans-serif;font-size:0.83rem;font-weight:600;padding:7px 14px;cursor:pointer;transition:all 0.15s}
                                .rm-add-phase:hover{background:rgba(245,158,11,0.2)}
                                .rm-add-ms{display:flex;align-items:center;gap:5px;background:linear-gradient(135deg,#f59e0b,#b45309);border:none;border-radius:9px;color:#1a0900;font-family:'DM Sans',sans-serif;font-size:0.83rem;font-weight:700;padding:7px 14px;cursor:pointer;box-shadow:0 4px 14px rgba(245,158,11,0.2)}
                                .rm-zoom-grp{display:flex;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.09);border-radius:9px;overflow:hidden;align-items:center}
                                .rm-zoom-btn{background:transparent;border:none;color:rgba(255,255,255,0.5);font-family:'DM Sans',sans-serif;font-size:1rem;line-height:1;padding:6px 13px;cursor:pointer;transition:all 0.15s;user-select:none}
                                .rm-zoom-btn:hover{background:rgba(255,255,255,0.08);color:#fff}
                                .rm-zoom-btn:disabled{opacity:0.25;cursor:not-allowed}
                                .rm-form{background:rgba(245,158,11,0.05);border:1.5px solid rgba(245,158,11,0.18);border-radius:14px;padding:1.25rem;margin-bottom:1.5rem;display:flex;flex-direction:column;gap:10px}
                                .rm-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
                                .rm-lbl{font-size:0.7rem;text-transform:uppercase;letter-spacing:0.08em;color:rgba(255,255,255,0.35);margin-bottom:5px;font-weight:600;font-family:'Outfit',sans-serif}
                                .rm-inp{background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1);border-radius:9px;color:#fff;font-family:'DM Sans',sans-serif;font-size:0.88rem;padding:9px 13px;outline:none;width:100%;box-sizing:border-box}
                                .rm-inp:focus{border-color:rgba(245,158,11,0.45)}
                                .rm-inp::placeholder{color:rgba(255,255,255,0.2)}
                                .rm-color-row{display:flex;gap:7px;flex-wrap:wrap}
                                .rm-chip{width:24px;height:24px;border-radius:50%;cursor:pointer;transition:transform 0.15s;border:2px solid transparent;flex-shrink:0}
                                .rm-chip:hover,.rm-chip.sel{border-color:rgba(255,255,255,0.85);transform:scale(1.2)}
                                .rm-type-row{display:flex;gap:6px;flex-wrap:wrap}
                                .rm-tc{background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:7px;color:rgba(255,255,255,0.45);font-family:'DM Sans',sans-serif;font-size:0.78rem;padding:5px 12px;cursor:pointer;transition:all 0.15s}
                                .rm-tc.sel{background:rgba(245,158,11,0.15);border-color:rgba(245,158,11,0.4);color:#f59e0b}
                                .rm-fa{display:flex;gap:8px;justify-content:flex-end;margin-top:2px}
                                .rm-cancel{background:transparent;border:1px solid rgba(255,255,255,0.12);border-radius:8px;color:rgba(255,255,255,0.4);font-family:'DM Sans',sans-serif;font-size:0.82rem;padding:7px 14px;cursor:pointer}
                                .rm-submit{background:#f59e0b;border:none;border-radius:8px;color:#1a0900;font-family:'DM Sans',sans-serif;font-size:0.82rem;font-weight:700;padding:7px 16px;cursor:pointer}
                                .rm-submit:disabled{opacity:0.5;cursor:not-allowed}
                                .rm-tl-outer{border-radius:14px;border:1px solid rgba(255,255,255,0.07);background:rgba(0,0,0,0.22);overflow:hidden}
                                .rm-tl-scroll{overflow-x:auto;overflow-y:visible}
                                .rm-tl-scroll::-webkit-scrollbar{height:4px}
                                .rm-tl-scroll::-webkit-scrollbar-track{background:rgba(255,255,255,0.03)}
                                .rm-tl-scroll::-webkit-scrollbar-thumb{background:rgba(245,158,11,0.3);border-radius:2px}
                                .rm-empty-wrap{padding:4rem 2rem;text-align:center}
                                .rm-empty-icon{width:60px;height:60px;background:rgba(245,158,11,0.07);border:1px solid rgba(245,158,11,0.15);border-radius:16px;display:flex;align-items:center;justify-content:center;margin:0 auto 1rem}
                                .rm-empty-title{font-family:'Outfit',sans-serif;font-size:1.1rem;font-weight:700;color:rgba(255,255,255,0.65);margin-bottom:6px}
                                .rm-empty-sub{font-size:0.83rem;color:rgba(255,255,255,0.28);max-width:380px;margin:0 auto;line-height:1.6}
                                .rm-dp-btn{display:flex;align-items:center;justify-content:space-between;gap:8px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1);border-radius:9px;color:#fff;font-family:'DM Sans',sans-serif;font-size:0.88rem;padding:9px 13px;cursor:pointer;width:100%;box-sizing:border-box;text-align:left;transition:border-color 0.15s}
                                .rm-dp-btn:hover{border-color:rgba(245,158,11,0.35)}
                                .rm-dp-popup{position:absolute;top:calc(100% + 6px);left:0;z-index:199;background:#141420;border:1px solid rgba(245,158,11,0.25);border-radius:14px;padding:14px;width:240px;box-shadow:0 20px 60px rgba(0,0,0,0.7),0 0 0 1px rgba(255,255,255,0.04)}
                                .rm-dp-nav{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
                                .rm-dp-nav-btn{background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.08);border-radius:6px;color:rgba(255,255,255,0.6);font-size:1rem;line-height:1;padding:4px 10px;cursor:pointer;transition:all 0.15s}
                                .rm-dp-nav-btn:hover{background:rgba(245,158,11,0.15);color:#f59e0b;border-color:rgba(245,158,11,0.3)}
                                .rm-dp-month-label{font-family:'Outfit',sans-serif;font-size:0.82rem;font-weight:700;color:#fff;text-transform:capitalize}
                                .rm-dp-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:2px}
                                .rm-dp-dow{font-size:0.6rem;text-align:center;color:rgba(255,255,255,0.25);font-family:'Outfit',sans-serif;font-weight:700;text-transform:uppercase;padding:4px 0}
                                .rm-dp-day{background:transparent;border:none;color:rgba(255,255,255,0.55);font-family:'DM Sans',sans-serif;font-size:0.78rem;cursor:pointer;border-radius:6px;padding:5px 0;transition:all 0.12s;width:100%}
                                .rm-dp-day:hover{background:rgba(245,158,11,0.15);color:#f59e0b}
                                .rm-dp-today{background:rgba(245,158,11,0.08);color:#f59e0b;font-weight:700}
                                .rm-dp-sel{background:linear-gradient(135deg,#f59e0b,#b45309)!important;color:#1a0900!important;font-weight:700!important}
                                .rm-dp-foot{display:flex;justify-content:space-between;margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.07)}
                                .rm-dp-clear{background:transparent;border:none;color:rgba(255,255,255,0.3);font-family:'DM Sans',sans-serif;font-size:0.75rem;cursor:pointer;padding:0}
                                .rm-dp-now{background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.25);border-radius:6px;color:#f59e0b;font-family:'DM Sans',sans-serif;font-size:0.75rem;font-weight:600;cursor:pointer;padding:4px 10px}
                                .rm-detail{background:rgba(0,0,0,0.35);border:1px solid rgba(255,255,255,0.09);border-radius:14px;padding:1.1rem 1.3rem;margin-bottom:1.25rem;display:flex;flex-direction:column;gap:8px;position:relative;overflow:hidden}
                                .rm-da{position:absolute;left:0;top:0;bottom:0;width:3px}
                                .rm-dc{position:absolute;top:10px;right:12px;background:transparent;border:none;color:rgba(255,255,255,0.28);font-size:0.9rem;cursor:pointer;line-height:1;padding:2px 5px;border-radius:4px}
                                .rm-dc:hover{color:#fff;background:rgba(255,255,255,0.08)}
                                .rm-dt{font-family:'Outfit',sans-serif;font-size:1rem;font-weight:700;color:#fff;padding-right:28px}
                                .rm-dm{font-size:0.75rem;color:rgba(255,255,255,0.38);display:flex;gap:12px;flex-wrap:wrap;align-items:center}
                                .rm-ddesc{font-size:0.82rem;color:rgba(255,255,255,0.5);line-height:1.55;background:rgba(255,255,255,0.03);border-radius:8px;padding:8px 10px;border:1px solid rgba(255,255,255,0.06)}
                                .rm-dfoot{display:flex;gap:8px;margin-top:4px}
                                .rm-edit-btn{background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.25);border-radius:7px;color:#f59e0b;font-family:'DM Sans',sans-serif;font-size:0.75rem;cursor:pointer;padding:5px 12px;transition:all 0.15s;display:flex;align-items:center;gap:5px}
                                .rm-edit-btn:hover{background:rgba(245,158,11,0.2)}
                                .rm-del-btn{background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);border-radius:7px;color:rgba(239,68,68,0.7);font-family:'DM Sans',sans-serif;font-size:0.75rem;cursor:pointer;padding:5px 12px;transition:all 0.15s;display:flex;align-items:center;gap:5px}
                                .rm-del-btn:hover{background:rgba(239,68,68,0.18);color:#ef4444}

                                .rm-ai-btn{display:flex;align-items:center;gap:6px;background:linear-gradient(135deg,rgba(245,158,11,0.15),rgba(99,102,241,0.12));border:1px solid rgba(245,158,11,0.3);border-radius:9px;color:#f59e0b;font-family:'DM Sans',sans-serif;font-size:0.83rem;font-weight:700;padding:7px 14px;cursor:pointer;transition:all 0.2s;position:relative;overflow:hidden}
                                .rm-ai-btn::before{content:'';position:absolute;inset:0;background:linear-gradient(135deg,rgba(245,158,11,0.08),rgba(99,102,241,0.08));opacity:0;transition:opacity 0.2s}
                                .rm-ai-btn:hover::before{opacity:1}
                                .rm-ai-btn:hover{border-color:rgba(245,158,11,0.5);box-shadow:0 0 20px rgba(245,158,11,0.15)}
                                .rm-ai-panel{background:linear-gradient(135deg,rgba(8,8,20,0.97),rgba(12,8,24,0.97));border:1px solid rgba(245,158,11,0.2);border-radius:16px;padding:1.5rem;margin-bottom:1.5rem;position:relative;overflow:hidden}
                                .rm-ai-panel::before{content:'';position:absolute;inset:0;background:radial-gradient(ellipse at 20% 0%,rgba(245,158,11,0.06) 0%,transparent 60%),radial-gradient(ellipse at 80% 100%,rgba(99,102,241,0.05) 0%,transparent 60%);pointer-events:none}
                                .rm-ai-hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:1.25rem}
                                .rm-ai-title{display:flex;align-items:center;gap:10px;font-family:'Outfit',sans-serif;font-size:1.05rem;font-weight:800;color:#fff}
                                .rm-ai-icon{width:34px;height:34px;background:linear-gradient(135deg,#f59e0b,#b45309);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:1.1rem;box-shadow:0 0 20px rgba(245,158,11,0.3),inset 0 1px 0 rgba(255,255,255,0.2)}
                                .rm-ai-close{background:transparent;border:none;color:rgba(255,255,255,0.3);font-size:1.1rem;cursor:pointer;line-height:1;padding:4px 8px;border-radius:6px;transition:all 0.15s}
                                .rm-ai-close:hover{color:#fff;background:rgba(255,255,255,0.08)}
                                .rm-ai-sources{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:1.1rem}
                                .rm-ai-chip{display:flex;align-items:center;gap:5px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);border-radius:20px;padding:4px 10px;font-size:0.72rem;color:rgba(255,255,255,0.5);font-family:'DM Sans',sans-serif}
                                .rm-ai-chip-dot{width:6px;height:6px;border-radius:50%;flex-shrink:0}
                                .rm-ai-chip-active{border-color:rgba(245,158,11,0.25);background:rgba(245,158,11,0.06);color:rgba(245,158,11,0.8)}
                                .rm-ai-chip-active .rm-ai-chip-dot{background:#f59e0b;box-shadow:0 0 6px #f59e0b}
                                .rm-ai-textarea{background:rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.09);border-radius:12px;color:#fff;font-family:'DM Sans',sans-serif;font-size:0.88rem;line-height:1.6;padding:12px 16px;resize:none;width:100%;box-sizing:border-box;min-height:90px;outline:none;transition:border-color 0.2s}
                                .rm-ai-textarea:focus{border-color:rgba(245,158,11,0.35)}
                                .rm-ai-textarea::placeholder{color:rgba(255,255,255,0.2)}
                                .rm-ai-actions{display:flex;gap:8px;margin-top:12px;align-items:center}
                                .rm-ai-gen-btn{display:flex;align-items:center;gap:7px;background:linear-gradient(135deg,#f59e0b,#b45309);border:none;border-radius:10px;color:#1a0900;font-family:'Outfit',sans-serif;font-size:0.88rem;font-weight:800;padding:10px 20px;cursor:pointer;box-shadow:0 4px 20px rgba(245,158,11,0.25);transition:all 0.2s;letter-spacing:0.02em}
                                .rm-ai-gen-btn:hover{box-shadow:0 6px 28px rgba(245,158,11,0.38);transform:translateY(-1px)}
                                .rm-ai-gen-btn:disabled{opacity:0.5;cursor:not-allowed;transform:none}
                                .rm-ai-hint{font-size:0.72rem;color:rgba(255,255,255,0.2);font-family:'DM Sans',sans-serif;line-height:1.5}
                                .rm-ai-preview{margin-top:1.25rem;padding-top:1.25rem;border-top:1px solid rgba(255,255,255,0.07)}
                                .rm-ai-preview-title{font-family:'Outfit',sans-serif;font-size:0.78rem;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:rgba(245,158,11,0.7);margin-bottom:0.9rem;display:flex;align-items:center;gap:6px}
                                .rm-ai-phase-item{display:flex;align-items:flex-start;gap:10px;padding:9px 12px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px;margin-bottom:6px}
                                .rm-ai-phase-bar{width:4px;border-radius:2px;flex-shrink:0;align-self:stretch;min-height:32px}
                                .rm-ai-phase-info{flex:1;min-width:0}
                                .rm-ai-phase-name{font-family:'DM Sans',sans-serif;font-size:0.85rem;font-weight:600;color:#fff;margin-bottom:2px}
                                .rm-ai-phase-dates{font-size:0.72rem;color:rgba(255,255,255,0.35);font-family:'DM Sans',sans-serif}
                                .rm-ai-phase-desc{font-size:0.73rem;color:rgba(255,255,255,0.4);margin-top:3px;line-height:1.4}
                                .rm-ai-ms-list{display:flex;flex-wrap:wrap;gap:5px;margin-top:10px;margin-bottom:14px}
                                .rm-ai-ms-tag{display:flex;align-items:center;gap:5px;padding:4px 10px;border-radius:6px;font-size:0.72rem;font-family:'DM Sans',sans-serif;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);color:rgba(255,255,255,0.55)}
                                .rm-ai-ms-diamond{width:8px;height:8px;border-radius:2px;transform:rotate(45deg);flex-shrink:0}
                                .rm-ai-apply-row{display:flex;gap:8px;margin-top:4px}
                                .rm-ai-apply-btn{display:flex;align-items:center;gap:6px;background:linear-gradient(135deg,#10b981,#059669);border:none;border-radius:9px;color:#fff;font-family:'Outfit',sans-serif;font-size:0.85rem;font-weight:700;padding:9px 18px;cursor:pointer;box-shadow:0 4px 16px rgba(16,185,129,0.2);transition:all 0.2s}
                                .rm-ai-apply-btn:hover{box-shadow:0 6px 22px rgba(16,185,129,0.32);transform:translateY(-1px)}
                                .rm-ai-apply-btn:disabled{opacity:0.5;cursor:not-allowed;transform:none}
                                .rm-ai-regen-btn{background:transparent;border:1px solid rgba(255,255,255,0.12);border-radius:9px;color:rgba(255,255,255,0.4);font-family:'DM Sans',sans-serif;font-size:0.82rem;padding:9px 16px;cursor:pointer;transition:all 0.15s}
                                .rm-ai-regen-btn:hover{border-color:rgba(255,255,255,0.25);color:rgba(255,255,255,0.7)}
                                @keyframes rm-ai-pulse{0%,100%{opacity:1}50%{opacity:0.5}}
                                .rm-ai-generating{display:flex;align-items:center;gap:10px;padding:16px;background:rgba(245,158,11,0.04);border:1px solid rgba(245,158,11,0.12);border-radius:12px;margin-top:12px}
                                .rm-ai-gen-dots{display:flex;gap:4px}
                                .rm-ai-gen-dot{width:6px;height:6px;border-radius:50%;background:#f59e0b;animation:rm-ai-pulse 1.4s ease-in-out infinite}
                                .rm-ai-gen-dot:nth-child(2){animation-delay:0.2s}
                                .rm-ai-gen-dot:nth-child(3){animation-delay:0.4s}
                                .rm-ai-gen-text{font-size:0.8rem;color:rgba(245,158,11,0.7);font-family:'DM Sans',sans-serif}
                            `}</style>
                            <div className="rm-wrap">
                                {/* ── HEADER ── */}
                                <div className="rm-hdr">
                                    <div className="rm-title">
                                        <div className="rm-title-icon"><Map size={16} color="#fff" /></div>
                                        Roadmap
                                    </div>
                                    <div className="rm-hdr-right">
                                        {/* View selector */}
                                        <div className="rm-view-grp">
                                            {([['week','Semaine'],['month','Mois'],['quarter','Trimestre']] as const).map(([v, l]) => (
                                                <button key={v} className={`rm-view-btn${rmView === v ? ' rm-view-btn-active' : ''}`} onClick={() => { setRmView(v); setRmOffset(0); setRmZoom(v === 'week' ? 70 : v === 'quarter' ? 280 : 130); setRmSelected(null); setRmEditing(null); }}>
                                                    {l}
                                                </button>
                                            ))}
                                        </div>
                                        {/* Zoom */}
                                        <div className="rm-zoom-grp">
                                            <button className="rm-zoom-btn" disabled={rmZoom <= ZOOM_STEPS[0]} onClick={() => { const i = ZOOM_STEPS.indexOf(rmZoom); setRmZoom(i > 0 ? ZOOM_STEPS[i-1] : ZOOM_STEPS[0]); }}>−</button>
                                            <button className="rm-zoom-btn" disabled={rmZoom >= ZOOM_STEPS[ZOOM_STEPS.length-1]} onClick={() => { const i = ZOOM_STEPS.indexOf(rmZoom); setRmZoom(i < ZOOM_STEPS.length-1 ? ZOOM_STEPS[i+1] : ZOOM_STEPS[ZOOM_STEPS.length-1]); }}>+</button>
                                        </div>
                                        {/* Navigation */}
                                        <div className="rm-nav-grp">
                                            <button className="rm-nav-btn" onClick={() => setRmOffset(o => o - (rmView === 'week' ? 4 : 1))}>← Préc</button>
                                            <button className="rm-today-btn" onClick={() => setRmOffset(0)}>Aujourd'hui</button>
                                            <button className="rm-nav-btn" onClick={() => setRmOffset(o => o + (rmView === 'week' ? 4 : 1))}>Suiv →</button>
                                        </div>
                                        {isAoC && (
                                            <button className="rm-ai-btn" onClick={() => { setRmAiOpen(o => !o); setRmAiPreview(null); if (rmMsGenOpen) setRmMsGenOpen(false); }}>
                                                ✦ Générer avec IA
                                            </button>
                                        )}
                                        {isAoC && roadmapPhases.length > 0 && (
                                            <button className="rm-ai-btn" style={{ background: 'linear-gradient(135deg,rgba(16,185,129,0.15),rgba(99,102,241,0.12))', borderColor: 'rgba(16,185,129,0.35)', color: '#34d399' }} onClick={() => { setRmMsGenOpen(o => !o); setRmMsPreview(null); if (rmAiOpen) setRmAiOpen(false); }}>
                                                ◈ Jalons IA
                                            </button>
                                        )}
                                        {isAoC && <>
                                            <button className="rm-add-phase" onClick={() => { setShowPhaseForm(true); setShowMilestoneForm(false); setRmSelected(null); setRmEditing(null); }}>
                                                <Plus size={13} /> Phase
                                            </button>
                                            <button className="rm-add-ms" onClick={() => { setShowMilestoneForm(true); setShowPhaseForm(false); setRmSelected(null); setRmEditing(null); }}>
                                                <Flag size={13} /> Jalon
                                            </button>
                                        </>}
                                    </div>
                                </div>


                                {/* ── AI GENERATION PANEL ── */}
                                {rmAiOpen && (() => {
                                    const MCOL2: Record<string,string> = { milestone:'#f59e0b', deadline:'#ef4444', launch:'#10b981', review:'#3b82f6' };
                                    const MLBL2: Record<string,string> = { milestone:'Jalon', deadline:'Deadline', launch:'Lancement', review:'Revue' };
                                    const sources = [
                                        { label: `${milestones.length} étape${milestones.length !== 1 ? 's' : ''}`, active: milestones.length > 0 },
                                        { label: `${decisions.length} décision${decisions.length !== 1 ? 's' : ''}`, active: decisions.length > 0 },
                                        { label: `${announcements.length} annonce${announcements.length !== 1 ? 's' : ''}`, active: announcements.length > 0 },
                                        { label: `${questions.filter((q: any) => q.answer).length} Q&R`, active: questions.some((q: any) => q.answer) },
                                        { label: `${resources.length} ressource${resources.length !== 1 ? 's' : ''}`, active: resources.length > 0 },
                                        { label: `${memberships.length} membre${memberships.length !== 1 ? 's' : ''}`, active: memberships.length > 0 },
                                    ];
                                    return (
                                        <div className="rm-ai-panel">
                                            <div className="rm-ai-hdr">
                                                <div className="rm-ai-title">
                                                    <div className="rm-ai-icon">✦</div>
                                                    Génération IA de Roadmap
                                                </div>
                                                <button className="rm-ai-close" onClick={() => { setRmAiOpen(false); setRmAiPreview(null); }}>✕</button>
                                            </div>

                                            <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.3)', fontFamily: "'DM Sans',sans-serif", marginBottom: 10 }}>Données analysées :</div>
                                            <div className="rm-ai-sources">
                                                {sources.map((s, i) => (
                                                    <div key={i} className={`rm-ai-chip${s.active ? ' rm-ai-chip-active' : ''}`}>
                                                        <div className="rm-ai-chip-dot" style={{ background: s.active ? '#f59e0b' : 'rgba(255,255,255,0.2)' }} />
                                                        {s.label}
                                                    </div>
                                                ))}
                                            </div>

                                            <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.3)', fontFamily: "'DM Sans',sans-serif", marginBottom: 7 }}>Instructions supplémentaires <span style={{ color: 'rgba(255,255,255,0.18)' }}>(optionnel)</span></div>
                                            <textarea
                                                className="rm-ai-textarea"
                                                placeholder="Ex: Le projet doit être livré avant fin juin. Priorisez la phase de tests. On a une contrainte de 3 développeurs disponibles seulement à partir de mars..."
                                                value={rmAiPrompt}
                                                onChange={e => setRmAiPrompt(e.target.value)}
                                            />

                                            <div className="rm-ai-actions">
                                                <button className="rm-ai-gen-btn" disabled={rmAiGenerating} onClick={handleGenerateRoadmap}>
                                                    {rmAiGenerating ? '⏳ Génération…' : '✦ Générer la roadmap'}
                                                </button>
                                                <div className="rm-ai-hint">L'IA analysera toutes les informations<br />de ce projet pour créer une roadmap personnalisée.</div>
                                            </div>

                                            {rmAiGenerating && (
                                                <div className="rm-ai-generating">
                                                    <div className="rm-ai-gen-dots">
                                                        <div className="rm-ai-gen-dot" />
                                                        <div className="rm-ai-gen-dot" />
                                                        <div className="rm-ai-gen-dot" />
                                                    </div>
                                                    <div className="rm-ai-gen-text">Analyse des données et génération de la roadmap en cours…</div>
                                                </div>
                                            )}

                                            {rmAiPreview && !rmAiGenerating && (
                                                <div className="rm-ai-preview">
                                                    <div className="rm-ai-preview-title">
                                                        <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#10b981', boxShadow: '0 0 8px #10b981' }} />
                                                        Roadmap générée — {rmAiPreview.phases.length} phase{rmAiPreview.phases.length !== 1 ? 's' : ''}, {rmAiPreview.milestones.length} jalon{rmAiPreview.milestones.length !== 1 ? 's' : ''}
                                                    </div>

                                                    {rmAiPreview.phases.map((ph: any, i: number) => {
                                                        const phaseMilestones = rmAiPreview.milestones.filter((ms: any) => ms.phase_index === i);
                                                        return (
                                                            <div key={i} className="rm-ai-phase-item">
                                                                <div className="rm-ai-phase-bar" style={{ background: ph.color }} />
                                                                <div className="rm-ai-phase-info">
                                                                    <div className="rm-ai-phase-name">{ph.title}</div>
                                                                    <div className="rm-ai-phase-dates">
                                                                        {ph.start_date ? new Date(ph.start_date+'T00:00:00').toLocaleDateString('fr-FR',{day:'numeric',month:'short',year:'numeric'}) : '?'} → {ph.end_date ? new Date(ph.end_date+'T00:00:00').toLocaleDateString('fr-FR',{day:'numeric',month:'short',year:'numeric'}) : '?'}
                                                                    </div>
                                                                    {ph.description && <div className="rm-ai-phase-desc">{ph.description}</div>}
                                                                    {phaseMilestones.length > 0 && (
                                                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                                                                            {phaseMilestones.map((ms: any, j: number) => (
                                                                                <div key={j} className="rm-ai-ms-tag">
                                                                                    <div className="rm-ai-ms-diamond" style={{ background: MCOL2[ms.type] || '#f59e0b' }} />
                                                                                    {ms.title} · {ms.date ? new Date(ms.date+'T00:00:00').toLocaleDateString('fr-FR',{day:'numeric',month:'short'}) : '?'}
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}

                                                    {rmAiPreview.milestones.filter((ms: any) => ms.phase_index < 0).length > 0 && (
                                                        <div style={{ marginBottom: 8 }}>
                                                            <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.25)', marginBottom: 5, fontFamily: "'DM Sans',sans-serif" }}>Jalons sans phase</div>
                                                            <div className="rm-ai-ms-list">
                                                                {rmAiPreview.milestones.filter((ms: any) => ms.phase_index < 0).map((ms: any, j: number) => (
                                                                    <div key={j} className="rm-ai-ms-tag">
                                                                        <div className="rm-ai-ms-diamond" style={{ background: MCOL2[ms.type] || '#f59e0b' }} />
                                                                        {ms.title} · {ms.date}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}

                                                    <div className="rm-ai-apply-row">
                                                        <button className="rm-ai-apply-btn" disabled={rmAiApplying} onClick={handleApplyRoadmap}>
                                                            {rmAiApplying ? '⏳ Application…' : '✓ Appliquer cette roadmap'}
                                                        </button>
                                                        <button className="rm-ai-regen-btn" onClick={handleGenerateRoadmap}>↺ Regénérer</button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })()}

                                {/* ── MILESTONE GENERATOR PANEL ── */}
                                {rmMsGenOpen && roadmapPhases.length > 0 && (() => {
                                    const MCOL3: Record<string,string> = { milestone:'#f59e0b', deadline:'#ef4444', launch:'#10b981', review:'#3b82f6' };
                                    const MLBL3: Record<string,string> = { milestone:'Jalon', deadline:'Deadline', launch:'Lancement', review:'Revue' };
                                    return (
                                        <div className="rm-ai-panel" style={{ borderColor: 'rgba(16,185,129,0.25)', background: 'linear-gradient(135deg,rgba(8,20,14,0.97),rgba(8,16,24,0.97))' }}>
                                            <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 10% 0%,rgba(16,185,129,0.07) 0%,transparent 55%),radial-gradient(ellipse at 90% 100%,rgba(99,102,241,0.05) 0%,transparent 55%)', pointerEvents: 'none' }} />
                                            <div className="rm-ai-hdr">
                                                <div className="rm-ai-title">
                                                    <div className="rm-ai-icon" style={{ background: 'linear-gradient(135deg,#10b981,#059669)', boxShadow: '0 0 20px rgba(16,185,129,0.3),inset 0 1px 0 rgba(255,255,255,0.2)' }}>◈</div>
                                                    Générateur de Jalons IA
                                                </div>
                                                <button className="rm-ai-close" onClick={() => { setRmMsGenOpen(false); setRmMsPreview(null); }}>✕</button>
                                            </div>
                                            <div style={{ marginBottom: '1rem' }}>
                                                <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: 8 }}>Phases détectées</div>
                                                <div className="rm-ai-sources">
                                                    {roadmapPhases.map(ph => (
                                                        <span key={ph.id} className="rm-ai-chip" style={{ borderColor: `${ph.color}40`, color: ph.color, background: `${ph.color}12` }}>
                                                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: ph.color, display: 'inline-block', flexShrink: 0 }} />
                                                            {ph.title}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                            {roadmapMilestones.length > 0 && (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)', borderRadius: 10, padding: '8px 12px', marginBottom: '1rem' }}>
                                                    <span style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.4)' }}>⚠ {roadmapMilestones.length} jalon{roadmapMilestones.length > 1 ? 's' : ''} existant{roadmapMilestones.length > 1 ? 's' : ''} — l'IA ne les dupliquera pas.</span>
                                                </div>
                                            )}
                                            <div className="rm-ai-sources" style={{ marginBottom: '0.75rem' }}>
                                                <textarea placeholder="Instructions optionnelles — contraintes, livrables clés, dates importantes…" value={rmMsGenPrompt} onChange={e => setRmMsGenPrompt(e.target.value)} rows={2}
                                                    style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, color: '#fff', fontFamily: 'inherit', fontSize: '0.85rem', padding: '10px 12px', resize: 'vertical', outline: 'none', boxSizing: 'border-box' }} />
                                            </div>
                                            {!rmMsPreview && (
                                                <button onClick={handleGenerateMilestones} disabled={rmMsGenerating}
                                                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 11, border: 'none', background: rmMsGenerating ? 'rgba(16,185,129,0.15)' : 'linear-gradient(135deg,#10b981,#059669)', color: '#fff', fontWeight: 700, fontSize: '0.88rem', cursor: rmMsGenerating ? 'not-allowed' : 'pointer', fontFamily: 'inherit', boxShadow: rmMsGenerating ? 'none' : '0 4px 16px rgba(16,185,129,0.4)', transition: 'all 0.2s' }}>
                                                    {rmMsGenerating ? <><span style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', animation: 'spin 0.8s linear infinite', display: 'inline-block' }} /> Génération en cours…</> : '◈ Générer les jalons'}
                                                </button>
                                            )}
                                            {rmMsPreview && (
                                                <div style={{ marginTop: '0.5rem' }}>
                                                    <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#34d399', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                                                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
                                                        {rmMsPreview.length} jalon{rmMsPreview.length !== 1 ? 's' : ''} générés
                                                    </div>
                                                    {roadmapPhases.map(ph => {
                                                        const phaseMilestones = rmMsPreview.filter(m => m.phase_id === ph.id);
                                                        if (!phaseMilestones.length) return null;
                                                        return (
                                                            <div key={ph.id} style={{ marginBottom: 12 }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                                                                    <span style={{ width: 8, height: 8, borderRadius: 2, background: ph.color, flexShrink: 0 }} />
                                                                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{ph.title}</span>
                                                                </div>
                                                                {phaseMilestones.map((m, i) => (
                                                                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, marginBottom: 6 }}>
                                                                        <span style={{ padding: '2px 7px', borderRadius: 6, fontSize: '0.66rem', fontWeight: 700, background: `${MCOL3[m.type] || '#f59e0b'}18`, color: MCOL3[m.type] || '#f59e0b', border: `1px solid ${MCOL3[m.type] || '#f59e0b'}30`, flexShrink: 0, marginTop: 1 }}>{MLBL3[m.type] || m.type}</span>
                                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                                            <div style={{ fontSize: '0.87rem', fontWeight: 600, color: '#f4f4f5', marginBottom: 2 }}>{m.title}</div>
                                                                            <div style={{ fontSize: '0.73rem', color: 'rgba(255,255,255,0.35)' }}>{m.date} · {m.rationale}</div>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        );
                                                    })}
                                                    <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                                                        <button onClick={handleApplyMilestones} disabled={rmMsApplying}
                                                            style={{ flex: 1, padding: '10px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#10b981,#059669)', color: '#fff', fontWeight: 700, fontSize: '0.88rem', cursor: rmMsApplying ? 'not-allowed' : 'pointer', fontFamily: 'inherit', boxShadow: '0 4px 14px rgba(16,185,129,0.35)', transition: 'all 0.2s' }}>
                                                            {rmMsApplying ? 'Application…' : `✓ Ajouter ${rmMsPreview.length} jalons à la roadmap`}
                                                        </button>
                                                        <button onClick={handleGenerateMilestones} disabled={rmMsGenerating}
                                                            style={{ padding: '10px 16px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.55)', fontSize: '0.85rem', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' }}>
                                                            ↺ Regénérer
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })()}

                                {/* ── PHASE FORM ── */}
                                {showPhaseForm && (
                                    <div className="rm-form">
                                        <div className="rm-lbl">Nouvelle phase</div>
                                        <input className="rm-inp" placeholder="Nom de la phase (ex: Recherche, MVP, Lancement…)" value={newPhase.title} onChange={e => setNewPhase(p => ({ ...p, title: e.target.value }))} />
                                        <div className="rm-form-grid">
                                            <div><div className="rm-lbl">Début</div>{renderPicker('phase-start', newPhase.start_date, v => setNewPhase(p => ({ ...p, start_date: v })), 'Choisir une date')}</div>
                                            <div><div className="rm-lbl">Fin</div>{renderPicker('phase-end', newPhase.end_date, v => setNewPhase(p => ({ ...p, end_date: v })), 'Choisir une date')}</div>
                                        </div>
                                        <div>
                                            <div className="rm-lbl" style={{ marginBottom: 8 }}>Couleur</div>
                                            <div className="rm-color-row">{PCOLS.map(c => <div key={c} className={`rm-chip${newPhase.color === c ? ' sel' : ''}`} style={{ background: c }} onClick={() => setNewPhase(p => ({ ...p, color: c }))} />)}</div>
                                        </div>
                                        <textarea className="rm-inp" style={{ minHeight: 56, resize: 'none' }} placeholder="Description (optionnel)" value={newPhase.description} onChange={e => setNewPhase(p => ({ ...p, description: e.target.value }))} />
                                        <div className="rm-fa">
                                            <button className="rm-cancel" onClick={() => setShowPhaseForm(false)}>Annuler</button>
                                            <button className="rm-submit" disabled={addingPhase} onClick={handleAddPhase}>Ajouter la phase</button>
                                        </div>
                                    </div>
                                )}

                                {/* ── MILESTONE FORM ── */}
                                {showMilestoneForm && (
                                    <div className="rm-form">
                                        <div className="rm-lbl">Nouveau jalon</div>
                                        <input className="rm-inp" placeholder="Nom du jalon (ex: MVP livré, Demo client, Release v1…)" value={newMilestone.title} onChange={e => setNewMilestone(p => ({ ...p, title: e.target.value }))} />
                                        <div className="rm-form-grid">
                                            <div><div className="rm-lbl">Date</div>{renderPicker('ms-date', newMilestone.date, v => setNewMilestone(p => ({ ...p, date: v })), 'Choisir une date')}</div>
                                            <div>
                                                <div className="rm-lbl">Phase associée</div>
                                                <select className="rm-inp" value={newMilestone.phase_id} onChange={e => setNewMilestone(p => ({ ...p, phase_id: e.target.value }))}>
                                                    <option value="">Aucune</option>
                                                    {roadmapPhases.map(ph => <option key={ph.id} value={ph.id}>{ph.title}</option>)}
                                                </select>
                                            </div>
                                        </div>
                                        <div>
                                            <div className="rm-lbl" style={{ marginBottom: 8 }}>Type</div>
                                            <div className="rm-type-row">
                                                {(['milestone','deadline','launch','review'] as const).map(t => (
                                                    <button key={t} className={`rm-tc${newMilestone.type === t ? ' sel' : ''}`} onClick={() => setNewMilestone(p => ({ ...p, type: t }))}>{MLBL[t]}</button>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="rm-fa">
                                            <button className="rm-cancel" onClick={() => setShowMilestoneForm(false)}>Annuler</button>
                                            <button className="rm-submit" disabled={addingMilestone} onClick={handleAddMilestone}>Ajouter le jalon</button>
                                        </div>
                                    </div>
                                )}

                                {/* ── DETAIL / EDIT PANEL ── */}
                                {rmSelected && (() => {
                                    const isPhase = rmSelected.type === 'phase';
                                    const d = rmSelected.data;
                                    const col = isPhase ? d.color : (MCOL[d.type] || '#f59e0b');
                                    const canEdit = isAoC || d.creator_id === user?.uid;
                                    const isEditMode = rmEditing?.data.id === d.id;

                                    if (isEditMode) {
                                        return (
                                            <div className="rm-detail">
                                                <div className="rm-da" style={{ background: col }} />
                                                <div className="rm-dt" style={{ fontSize: '0.88rem', color: 'rgba(255,255,255,0.5)', fontWeight: 500, fontFamily: "'DM Sans',sans-serif" }}>Modifier {isPhase ? 'la phase' : 'le jalon'}</div>
                                                <input className="rm-inp" style={{ marginTop: 2 }} value={editData.title || ''} onChange={e => setEditData((p: any) => ({ ...p, title: e.target.value }))} placeholder={isPhase ? 'Nom de la phase' : 'Nom du jalon'} />
                                                {isPhase ? (<>
                                                    <div className="rm-form-grid">
                                                        <div><div className="rm-lbl">Début</div>{renderPicker('edit-ps', editData.start_date || '', v => setEditData((p: any) => ({ ...p, start_date: v })), 'Date de début')}</div>
                                                        <div><div className="rm-lbl">Fin</div>{renderPicker('edit-pe', editData.end_date || '', v => setEditData((p: any) => ({ ...p, end_date: v })), 'Date de fin')}</div>
                                                    </div>
                                                    <div>
                                                        <div className="rm-lbl" style={{ marginBottom: 8 }}>Couleur</div>
                                                        <div className="rm-color-row">{PCOLS.map(c => <div key={c} className={`rm-chip${(editData.color||'#6366f1') === c ? ' sel' : ''}`} style={{ background: c }} onClick={() => setEditData((p: any) => ({ ...p, color: c }))} />)}</div>
                                                    </div>
                                                    <textarea className="rm-inp" style={{ minHeight: 52, resize: 'none' }} placeholder="Description (optionnel)" value={editData.description || ''} onChange={e => setEditData((p: any) => ({ ...p, description: e.target.value }))} />
                                                </>) : (<>
                                                    <div><div className="rm-lbl">Date</div>{renderPicker('edit-md', editData.date || '', v => setEditData((p: any) => ({ ...p, date: v })), 'Date du jalon')}</div>
                                                    <div>
                                                        <div className="rm-lbl">Phase associée</div>
                                                        <select className="rm-inp" value={editData.phase_id || ''} onChange={e => setEditData((p: any) => ({ ...p, phase_id: e.target.value }))}>
                                                            <option value="">Aucune</option>
                                                            {roadmapPhases.map(ph => <option key={ph.id} value={ph.id}>{ph.title}</option>)}
                                                        </select>
                                                    </div>
                                                    <div>
                                                        <div className="rm-lbl" style={{ marginBottom: 8 }}>Type</div>
                                                        <div className="rm-type-row">
                                                            {(['milestone','deadline','launch','review'] as const).map(t => (
                                                                <button key={t} className={`rm-tc${(editData.type||'milestone') === t ? ' sel' : ''}`} onClick={() => setEditData((p: any) => ({ ...p, type: t }))}>{MLBL[t]}</button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </>)}
                                                <div className="rm-fa">
                                                    <button className="rm-cancel" onClick={() => setRmEditing(null)}>Annuler</button>
                                                    <button className="rm-submit" disabled={savingEdit} onClick={handleSaveEdit}>{savingEdit ? 'Enregistrement…' : 'Enregistrer'}</button>
                                                </div>
                                            </div>
                                        );
                                    }

                                    return (
                                        <div className="rm-detail">
                                            <div className="rm-da" style={{ background: col }} />
                                            <button className="rm-dc" onClick={() => { setRmSelected(null); setRmEditing(null); }}>✕</button>
                                            <div className="rm-dt">{d.title}</div>
                                            <div className="rm-dm">
                                                {isPhase ? (<>
                                                    <span>📅 {d.start_date ? new Date(d.start_date+'T00:00:00').toLocaleDateString('fr-FR',{day:'numeric',month:'short',year:'numeric'}) : '—'}</span>
                                                    <span>→ {d.end_date ? new Date(d.end_date+'T00:00:00').toLocaleDateString('fr-FR',{day:'numeric',month:'short',year:'numeric'}) : '—'}</span>
                                                    {d.start_date && d.end_date && <span style={{ color: col }}>{Math.round((new Date(d.end_date+'T00:00:00').getTime() - new Date(d.start_date+'T00:00:00').getTime()) / 86400000)} jours</span>}
                                                </>) : (<>
                                                    <span>📅 {d.date ? new Date(d.date+'T00:00:00').toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'}) : '—'}</span>
                                                    <span style={{ background: `${col}22`, color: col, border: `1px solid ${col}44`, borderRadius: 5, padding: '1px 8px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{MLBL[d.type]}</span>
                                                </>)}
                                                {d.creator_name && <span>👤 {d.creator_name}</span>}
                                            </div>
                                            {isPhase && d.description && <div className="rm-ddesc">{d.description}</div>}
                                            {!isPhase && d.phase_id && (() => {
                                                const linked = milestones.filter((m: any) => m.phase_id === d.phase_id);
                                                const pending = linked.filter((m: any) => !m.completed);
                                                const done = linked.length - pending.length;
                                                if (linked.length === 0) return null;
                                                return (
                                                    <div style={{ marginTop: 12, padding: '10px 12px', background: 'rgba(255,255,255,0.04)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)' }}>
                                                        <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.35)', fontWeight: 700, marginBottom: 8 }}>
                                                            Étapes liées · {done}/{linked.length} complétées
                                                        </div>
                                                        {pending.slice(0, 5).map((m: any) => (
                                                            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, fontSize: '0.72rem', color: 'rgba(255,255,255,0.55)' }}>
                                                                <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', flexShrink: 0 }} />
                                                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.text}</span>
                                                            </div>
                                                        ))}
                                                        {pending.length > 5 && <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>+{pending.length - 5} autres en attente</div>}
                                                        {pending.length === 0 && <div style={{ fontSize: '0.72rem', color: '#10b981' }}>✓ Toutes les étapes sont complétées</div>}
                                                    </div>
                                                );
                                            })()}
                                            {canEdit && (
                                                <div className="rm-dfoot">
                                                    <button className="rm-edit-btn" onClick={() => { setRmEditing({ type: rmSelected.type, data: d }); setEditData(isPhase ? { title: d.title, color: d.color, start_date: d.start_date, end_date: d.end_date, description: d.description || '' } : { title: d.title, date: d.date, type: d.type, phase_id: d.phase_id || '' }); }}>
                                                        <Edit3 size={11} /> Modifier
                                                    </button>
                                                    <button className="rm-del-btn" onClick={() => { isPhase ? handleDeletePhase(d.id) : handleDeleteMilestone(d.id); setRmSelected(null); }}>
                                                        <Trash2 size={11} /> Supprimer
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })()}

                                {/* ── EMPTY STATE ── */}
                                {roadmapPhases.length === 0 && roadmapMilestones.length === 0 && !showPhaseForm && !showMilestoneForm && (
                                    <div className="rm-empty-wrap">
                                        <div className="rm-empty-icon"><Map size={26} color="#f59e0b" /></div>
                                        <div className="rm-empty-title">Votre roadmap est vierge</div>
                                        <div className="rm-empty-sub">Créez des phases pour visualiser vos grandes étapes stratégiques, puis ponctuez-les de jalons clés sur la timeline.</div>
                                    </div>
                                )}

                                {/* ── TIMELINE ── */}
                                {(roadmapPhases.length > 0 || roadmapMilestones.length > 0) && (
                                    <div className="rm-tl-outer">
                                        <div className="rm-tl-scroll">
                                            <div style={{ width: LW + TW, position: 'relative' }}>

                                                {/* Header row */}
                                                <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.18)' }}>
                                                    <div style={{ width: LW, flexShrink: 0, position: 'sticky', left: 0, zIndex: 6, background: STICKY_BG, borderRight: '1px solid rgba(255,255,255,0.07)', padding: '10px 14px', display: 'flex', alignItems: 'flex-end' }}>
                                                        <span style={{ fontSize: '0.58rem', textTransform: 'uppercase', letterSpacing: '0.11em', color: 'rgba(255,255,255,0.2)', fontFamily: "'Outfit',sans-serif", fontWeight: 700 }}>Phases</span>
                                                    </div>
                                                    <div style={{ display: 'flex' }}>
                                                        {cols.map((col, i) => {
                                                            const isCurrentPeriod = (() => {
                                                                if (rmView === 'week') { const wn = getISOWeek(cm); return col.label === `S${String(wn).padStart(2,'0')}` && col.d.getFullYear() === cm.getFullYear(); }
                                                                if (rmView === 'quarter') { const q = Math.floor(cm.getMonth()/3)+1; return col.d.getFullYear() === cm.getFullYear() && `T${q}` === col.label; }
                                                                return col.d.getMonth() === cm.getMonth() && col.d.getFullYear() === cm.getFullYear();
                                                            })();
                                                            return (
                                                                <div key={i} style={{ width: CW, flexShrink: 0, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', borderRight: '1px solid rgba(255,255,255,0.04)', position: 'relative', background: col.accent ? 'rgba(245,158,11,0.03)' : 'transparent', overflow: 'hidden' }}>
                                                                    {col.accent && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'rgba(245,158,11,0.22)' }} />}
                                                                    {col.subLabel && <div style={{ fontFamily: "'Outfit',sans-serif", fontSize: '0.58rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: col.accent ? '#f59e0b' : 'rgba(255,255,255,0.3)', padding: '6px 0 2px 10px', lineHeight: 1 }}>{col.subLabel}</div>}
                                                                    <div style={{ fontSize: rmView === 'week' ? '0.68rem' : '0.73rem', lineHeight: 1, color: isCurrentPeriod ? 'rgba(245,158,11,0.9)' : 'rgba(255,255,255,0.38)', fontWeight: isCurrentPeriod ? 700 : 400, fontFamily: "'DM Sans',sans-serif", padding: '4px 0 8px 10px' }}>
                                                                        {col.label}
                                                                    </div>
                                                                    {showWeeks && (
                                                                        <div style={{ display: 'flex', height: 8, marginBottom: 4 }}>
                                                                            {Array.from({ length: 4 }, (_, wi) => <div key={wi} style={{ width: '25%', borderLeft: wi > 0 ? '1px dashed rgba(255,255,255,0.08)' : 'none', height: '100%' }} />)}
                                                                        </div>
                                                                    )}
                                                                    {showDays && (() => {
                                                                        const daysInM = new Date(col.d.getFullYear(), col.d.getMonth()+1, 0).getDate();
                                                                        return (
                                                                            <div style={{ display: 'flex' }}>
                                                                                {Array.from({ length: daysInM }, (_, di) => (
                                                                                    <div key={di} style={{ width: CW / daysInM, flexShrink: 0, textAlign: 'center', fontSize: '0.52rem', color: (di+1) === cm.getDate() && col.d.getMonth() === cm.getMonth() && col.d.getFullYear() === cm.getFullYear() ? '#f59e0b' : 'rgba(255,255,255,0.25)', paddingBottom: 4, borderRight: di < daysInM-1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>{di+1}</div>
                                                                                ))}
                                                                            </div>
                                                                        );
                                                                    })()}
                                                                    {showMonthsInQ && (() => {
                                                                        const mLabels = [0,1,2].map(mi => {
                                                                            const md = new Date(col.d.getFullYear(), col.d.getMonth() + mi, 1);
                                                                            return md.toLocaleDateString('fr-FR', { month: 'short' });
                                                                        });
                                                                        return (
                                                                            <div style={{ display: 'flex', paddingBottom: 4 }}>
                                                                                {mLabels.map((ml, mi) => <div key={mi} style={{ width: '33.33%', textAlign: 'center', fontSize: '0.6rem', color: 'rgba(255,255,255,0.3)', borderLeft: mi > 0 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>{ml}</div>)}
                                                                            </div>
                                                                        );
                                                                    })()}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>

                                                {/* Grid lines */}
                                                {cols.map((col, i) => (
                                                    <div key={i} style={{ position: 'absolute', left: LW + i * CW, top: 0, bottom: 0, width: 1, background: col.accent ? 'rgba(245,158,11,0.09)' : 'rgba(255,255,255,0.04)', zIndex: 0, pointerEvents: 'none' }} />
                                                ))}
                                                {showWeeks && cols.map((col, i) => {
                                                    const daysInM = new Date(col.d.getFullYear(), col.d.getMonth()+1, 0).getDate();
                                                    const pxPerDay = CW / daysInM;
                                                    return [7, 14, 21].map(day => day < daysInM && (
                                                        <div key={`${i}-w${day}`} style={{ position: 'absolute', left: LW + i * CW + day * pxPerDay, top: 0, bottom: 0, width: 1, background: 'rgba(255,255,255,0.04)', zIndex: 0, pointerEvents: 'none', borderLeft: '1px dashed rgba(255,255,255,0.05)' }} />
                                                    ));
                                                })}

                                                {/* Today line */}
                                                {todayInView && (
                                                    <div style={{ position: 'absolute', left: LW + todayX, top: 0, bottom: 0, width: 2, background: 'linear-gradient(180deg,#f59e0b 60%,rgba(245,158,11,0.1))', zIndex: 15, pointerEvents: 'none' }}>
                                                        <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: 8, height: 8, borderRadius: '50%', background: '#f59e0b', boxShadow: '0 0 14px rgba(245,158,11,0.9)' }} />
                                                    </div>
                                                )}

                                                {/* Phase rows */}
                                                {roadmapPhases.length === 0 && (
                                                    <div style={{ display: 'flex', height: 56 }}>
                                                        <div style={{ width: LW, flexShrink: 0, position: 'sticky', left: 0, zIndex: 6, background: STICKY_BG, borderRight: '1px solid rgba(255,255,255,0.07)', padding: '0 14px', display: 'flex', alignItems: 'center' }}>
                                                            <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.2)', fontStyle: 'italic' }}>Aucune phase</span>
                                                        </div>
                                                        <div style={{ flex: 1 }} />
                                                    </div>
                                                )}
                                                {roadmapPhases.map((phase, pi) => {
                                                    const x1 = dateToX(phase.start_date);
                                                    const x2 = dateToX(phase.end_date);
                                                    const bw = Math.max(4, x2 - x1);
                                                    const isSel = rmSelected?.type === 'phase' && rmSelected.data.id === phase.id;
                                                    return (
                                                        <div key={phase.id} style={{ display: 'flex', height: 52, borderBottom: '1px solid rgba(255,255,255,0.04)', background: isSel ? `${phase.color}12` : pi % 2 === 1 ? 'rgba(255,255,255,0.01)' : 'transparent', transition: 'background 0.2s' }}>
                                                            <div style={{ width: LW, flexShrink: 0, position: 'sticky', left: 0, zIndex: 6, background: STICKY_BG, borderRight: '1px solid rgba(255,255,255,0.07)', padding: '0 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                                                                <div style={{ width: 8, height: 8, borderRadius: '50%', background: phase.color, flexShrink: 0, boxShadow: `0 0 6px ${phase.color}88` }} />
                                                                <span style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.7)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: "'DM Sans',sans-serif" }}>{phase.title}</span>
                                                            </div>
                                                            <div style={{ flex: 1, position: 'relative', zIndex: 2, overflow: 'hidden' }}>
                                                                {(() => {
                                                                    const phLinked = milestones.filter((m: any) => m.phase_id === phase.id);
                                                                    const phDone = phLinked.filter((m: any) => m.completed).length;
                                                                    const phPct = phLinked.length > 0 ? Math.round((phDone / phLinked.length) * 100) : 0;
                                                                    return (
                                                                        <div onClick={() => setRmSelected(isSel ? null : { type: 'phase', data: phase })} style={{ position: 'absolute', left: x1, width: bw, top: '50%', transform: 'translateY(-50%)', height: 26, borderRadius: 6, background: `linear-gradient(135deg,${phase.color}CC,${phase.color}88)`, border: isSel ? `2px solid ${phase.color}` : `1px solid ${phase.color}55`, display: 'flex', alignItems: 'center', padding: '0 10px', fontSize: '0.7rem', fontWeight: 600, color: '#fff', fontFamily: "'DM Sans',sans-serif", whiteSpace: 'nowrap', overflow: 'hidden', boxShadow: isSel ? `0 0 20px ${phase.color}44` : `0 2px 14px ${phase.color}33`, cursor: 'pointer', transition: 'all 0.15s' }}>
                                                                            {phLinked.length > 0 && <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${phPct}%`, background: 'rgba(255,255,255,0.18)', borderRadius: 6, transition: 'width 0.4s ease', pointerEvents: 'none' }} />}
                                                                            {bw > 60 && <span style={{ position: 'relative', zIndex: 1 }}>{phase.title}</span>}
                                                                            {phLinked.length > 0 && bw > 80 && <span style={{ position: 'relative', zIndex: 1, marginLeft: 'auto', fontSize: '0.6rem', opacity: 0.8 }}>{phDone}/{phLinked.length}</span>}
                                                                        </div>
                                                                    );
                                                                })()}
                                                            </div>
                                                        </div>
                                                    );
                                                })}

                                                {/* Milestones section */}
                                                {roadmapMilestones.length > 0 && (
                                                    <>
                                                        <div style={{ display: 'flex', height: 22, background: 'rgba(0,0,0,0.18)', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                                                            <div style={{ width: LW, flexShrink: 0, position: 'sticky', left: 0, zIndex: 6, background: 'rgba(8,8,14,0.98)', borderRight: '1px solid rgba(255,255,255,0.07)', padding: '0 12px', display: 'flex', alignItems: 'center', gap: 5 }}>
                                                                <Flag size={10} color="#f59e0b" />
                                                                <span style={{ fontSize: '0.58rem', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.3)', fontFamily: "'Outfit',sans-serif", fontWeight: 700 }}>Jalons</span>
                                                            </div>
                                                            <div style={{ flex: 1 }} />
                                                        </div>
                                                        <div style={{ display: 'flex', height: 86 }}>
                                                            <div style={{ width: LW, flexShrink: 0, position: 'sticky', left: 0, zIndex: 6, background: STICKY_BG, borderRight: '1px solid rgba(255,255,255,0.07)' }} />
                                                            <div style={{ flex: 1, position: 'relative', zIndex: 2 }}>
                                                                {roadmapMilestones.map(ms => {
                                                                    const x = dateToX(ms.date);
                                                                    const col = MCOL[ms.type] || '#f59e0b';
                                                                    const isSel = rmSelected?.type === 'milestone' && rmSelected.data.id === ms.id;
                                                                    const today2 = new Date(); today2.setHours(0,0,0,0);
                                                                    const msDate = ms.date ? new Date(ms.date+'T00:00:00') : null;
                                                                    const daysToMs = msDate ? Math.round((msDate.getTime() - today2.getTime()) / 86400000) : null;
                                                                    const phPending = ms.phase_id ? milestones.filter((m: any) => m.phase_id === ms.phase_id && !m.completed).length : 0;
                                                                    const isWarning = daysToMs !== null && daysToMs <= 3 && daysToMs >= 0 && phPending > 0;
                                                                    const isLate = daysToMs !== null && daysToMs < 0 && phPending > 0;
                                                                    const dotCol = isLate ? '#ef4444' : isWarning ? '#f59e0b' : col;
                                                                    return (
                                                                        <div key={ms.id} onClick={() => setRmSelected(isSel ? null : { type: 'milestone', data: ms })} style={{ position: 'absolute', left: x, top: '50%', transform: 'translateX(-50%) translateY(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 8, cursor: 'pointer' }} title={`${ms.title} — ${MLBL[ms.type]}`}>
                                                                            <div style={{ position: 'relative' }}>
                                                                                <div style={{ width: isSel ? 16 : 13, height: isSel ? 16 : 13, borderRadius: 3, transform: 'rotate(45deg)', background: dotCol, boxShadow: isSel ? `0 0 20px ${dotCol}AA, 0 0 8px ${dotCol}` : `0 0 12px ${dotCol}77`, flexShrink: 0, border: isSel ? '2px solid rgba(255,255,255,0.6)' : 'none', transition: 'all 0.15s' }} />
                                                                                {(isWarning || isLate) && <div style={{ position: 'absolute', top: -5, right: -6, width: 10, height: 10, borderRadius: '50%', background: isLate ? '#ef4444' : '#f59e0b', border: '1px solid rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.45rem', fontWeight: 900, color: '#fff', animation: 'pulse 1.5s infinite' }}>!</div>}
                                                                            </div>
                                                                            <div style={{ marginTop: 7, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                                                                                <div style={{ fontSize: '0.63rem', color: isSel ? '#fff' : 'rgba(255,255,255,0.6)', whiteSpace: 'nowrap', maxWidth: 88, overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'center', fontFamily: "'DM Sans',sans-serif", fontWeight: isSel ? 600 : 400 }}>{ms.title}</div>
                                                                                <div style={{ fontSize: '0.57rem', color: dotCol, fontFamily: "'Outfit',sans-serif", fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{isLate ? 'EN RETARD' : isWarning ? `⚠ J-${daysToMs}` : MLBL[ms.type]}</div>
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    </>
                                                )}

                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })()}



            </div>
            {/* Edit Objective Modal */}
            {showEditObjModal && (
                <div
                    className="modal-backdrop fade-enter flex items-center justify-center p-4"
                    style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(12px)', zIndex: 1000 }}
                    onClick={e => { if (e.target === e.currentTarget) { setShowEditObjModal(false); setNavbarVisible(true); } }}
                >
                    <div
                        className="card glass-panel w-full relative shadow-2xl no-scrollbar"
                        style={{ maxWidth: '620px', border: '1px solid rgba(255,255,255,0.1)', padding: '0', overflow: 'hidden', maxHeight: '90vh', overflowY: 'auto', animation: 'scaleUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)' }}
                    >
                        {/* Modal Top Banner */}
                        <div style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.18), rgba(236,72,153,0.1))', padding: '1.75rem 2rem 1.5rem', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                            <button onClick={() => { setShowEditObjModal(false); setNavbarVisible(true); }} style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'rgba(255,255,255,0.6)' }} className="hover:text-white">
                                <X size={16} />
                            </button>
                            <div className="flex items-center gap-4">
                                <div style={{ background: 'rgba(99,102,241,0.2)', padding: '12px', borderRadius: '14px', border: '1px solid rgba(99,102,241,0.3)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Edit3 className="text-primary" size={26} />
                                </div>
                                <div className="flex flex-col justify-center">
                                    <h3 className="m-0 text-xl font-bold" style={{ lineHeight: '1', marginBottom: '4px', marginTop: '15px' }}>Modifier le salon</h3>
                                    <p className="m-0 text-sm opacity-60" style={{ lineHeight: '1' }}>Ajustez les paramètres de votre objectif</p>
                                </div>
                            </div>
                        </div>

                        <form onSubmit={handleUpdateObjective} className="flex flex-col gap-6" style={{ padding: '1.75rem 2rem' }}>
                            {/* Title */}
                            <div className="flex flex-col gap-1.5">
                                <label className="text-sm font-semibold text-slate-300">Titre de l'objectif <span className="text-red-400">*</span></label>
                                <input
                                    type="text" className="input"
                                    placeholder="Ex: Coder un SaaS"
                                    required
                                    value={editObjTitle} onChange={e => setEditObjTitle(e.target.value)}
                                    style={{ fontSize: '1rem' }}
                                />
                            </div>

                            {/* Description */}
                            <div className="flex flex-col gap-1.5">
                                <label className="text-sm font-semibold text-slate-300">Description <span className="text-xs opacity-40">(optionnel)</span></label>
                                <textarea
                                    className="input" rows={2}
                                    placeholder="Détails du projet..."
                                    value={editObjDesc} onChange={e => setEditObjDesc(e.target.value)}
                                    style={{ resize: 'vertical', minHeight: '64px' }}
                                />
                            </div>

                            {/* Category visual picker */}
                            <div className="flex flex-col gap-2">
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <label className="text-sm font-semibold text-slate-300">Catégorie <span className="text-red-400">*</span></label>
                                    <span style={{ fontSize: '0.72rem', color: editObjCats.length >= 3 ? '#f59e0b' : '#71717a' }}>
                                        {editObjCats.length}/3 max
                                    </span>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: '8px' }}>
                                    {[
                                        { id: 'Code', label: 'Code', icon: Code, color: '#6366f1' },
                                        { id: 'Design', label: 'Design', icon: Palette, color: '#ec4899' },
                                        { id: 'Lecture', label: 'Lecture', icon: BookOpen, color: '#f59e0b' },
                                        { id: 'Musique', label: 'Musique', icon: Music, color: '#10b981' },
                                        { id: 'Sport', label: 'Sport', icon: Dumbbell, color: '#ef4444' },
                                        { id: 'Science', label: 'Science', icon: FlaskConical, color: '#3b82f6' },
                                        { id: 'Business', label: 'Business', icon: Briefcase, color: '#8b5cf6' },
                                        { id: 'Écriture', label: 'Écriture', icon: Pen, color: '#f97316' },
                                        { id: 'Autre', label: 'Autre', icon: Star, color: '#64748b' },
                                    ].map(cat => {
                                        const CatIcon = cat.icon;
                                        const isSelected = editObjCats.includes(cat.id);
                                        const isDisabled = !isSelected && editObjCats.length >= 3;
                                        return (
                                            <div
                                                key={cat.id}
                                                onClick={() => {
                                                    if (isDisabled) return;
                                                    setEditObjCats(prev =>
                                                        prev.includes(cat.id)
                                                            ? prev.filter(c => c !== cat.id)
                                                            : [...prev, cat.id]
                                                    );
                                                }}
                                                style={{
                                                    cursor: isDisabled ? 'not-allowed' : 'pointer',
                                                    opacity: isDisabled ? 0.35 : 1,
                                                    display: 'flex', flexDirection: 'column',
                                                    alignItems: 'center', gap: '6px', padding: '10px 6px',
                                                    borderRadius: '12px',
                                                    border: isSelected ? `2px solid ${cat.color}` : '2px solid rgba(255,255,255,0.06)',
                                                    background: isSelected ? `${cat.color}18` : 'rgba(255,255,255,0.02)',
                                                    transition: 'all 0.15s',
                                                }}
                                            >
                                                <div style={{ background: `${cat.color}22`, borderRadius: '8px', padding: '6px', display: 'flex' }}>
                                                    <CatIcon size={18} style={{ color: cat.color }} />
                                                </div>
                                                <span style={{ fontSize: '11px', fontWeight: isSelected ? 700 : 500, color: isSelected ? cat.color : 'rgba(255,255,255,0.5)' }}>{cat.label}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                                {/* fallback custom input if none selected */}
                                {editObjCats.length === 0 && (
                                    <input type="text" className="input mt-1" placeholder="Ou tapez une catégorie personnalisée"
                                        onChange={e => setEditObjCats([e.target.value])} style={{ fontSize: '0.875rem' }} />
                                )}
                            </div>

                            {/* Hours presets */}
                            <div className="flex flex-col gap-2">
                                <label className="text-sm font-semibold text-slate-300">Nombre d'heures cible <span className="text-red-400">*</span></label>
                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                                    {HOUR_PRESETS.map(h => (
                                        <button
                                            key={h} type="button"
                                            onClick={() => setEditObjHours(String(h))}
                                            style={{
                                                padding: '6px 16px', borderRadius: '20px', fontSize: '13px', fontWeight: 600,
                                                cursor: 'pointer', transition: 'all 0.15s',
                                                border: editObjHours === String(h) ? '2px solid rgba(99,102,241,0.8)' : '2px solid rgba(255,255,255,0.08)',
                                                background: editObjHours === String(h) ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.03)',
                                                color: editObjHours === String(h) ? 'rgba(165,180,252,1)' : 'rgba(255,255,255,0.5)',
                                            }}
                                        >{h}h</button>
                                    ))}
                                    <div className="flex gap-2 items-center flex-1">
                                        <input
                                            type="number" min="1" max="9999"
                                            value={editObjHours}
                                            onChange={e => setEditObjHours(e.target.value)}
                                            placeholder="Nombre"
                                            className="input"
                                            style={{ width: '80px', padding: '6px 10px', fontSize: '13px', textAlign: 'center' }}
                                        />
                                        <select
                                            className="input"
                                            value={editObjFreq}
                                            onChange={e => setEditObjFreq(e.target.value)}
                                            style={{ flex: 1, padding: '6px 10px', fontSize: '13px' }}
                                        >
                                            <option value="total">Total</option>
                                            <option value="daily">Par jour</option>
                                            <option value="weekly">Par semaine</option>
                                            <option value="monthly">Par mois</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            {/* Formation E-learning */}
                            <div className="flex flex-col gap-1.5">
                                <label className="text-sm font-semibold text-slate-300">Lien vers une formation E-learning <span className="text-xs opacity-40">(optionnel)</span></label>
                                <input
                                    type="url" className="input"
                                    placeholder="https://www.udemy... ou coursera..."
                                    value={editObjLearningLink} onChange={e => setEditObjLearningLink(e.target.value)}
                                    style={{ fontSize: '0.95rem' }}
                                />
                            </div>

                            {/* Visibility toggle */}
                            <div
                                onClick={() => setEditObjPublic(!editObjPublic)}
                                style={{
                                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '14px',
                                    padding: '14px 16px', borderRadius: '14px', transition: 'all 0.2s',
                                    background: editObjPublic ? 'rgba(34,197,94,0.07)' : 'rgba(255,255,255,0.03)',
                                    border: editObjPublic ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(255,255,255,0.08)',
                                }}
                            >
                                <div style={{ width: '40px', height: '40px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: editObjPublic ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.05)' }}>
                                    {editObjPublic ? <Globe size={20} style={{ color: '#4ade80' }} /> : <Lock size={20} style={{ color: 'rgba(255,255,255,0.4)' }} />}
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: '14px', fontWeight: 600, color: editObjPublic ? '#4ade80' : 'rgba(255,255,255,0.8)', marginBottom: '2px' }}>
                                        {editObjPublic ? 'Salon Public' : 'Salon Privé'}
                                    </div>
                                    <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>
                                        {editObjPublic ? 'Visible par tous dans le portail d\'exploration.' : 'Accessible uniquement sur invitation.'}
                                    </div>
                                </div>
                                {/* Toggle switch */}
                                <div style={{ width: '44px', height: '24px', borderRadius: '12px', background: editObjPublic ? 'rgba(34,197,94,0.4)' : 'rgba(255,255,255,0.1)', border: editObjPublic ? '1px solid rgba(34,197,94,0.5)' : '1px solid rgba(255,255,255,0.15)', position: 'relative', flexShrink: 0, transition: 'all 0.2s' }}>
                                    <div style={{ position: 'absolute', top: '3px', left: editObjPublic ? '22px' : '3px', width: '16px', height: '16px', borderRadius: '50%', background: editObjPublic ? '#4ade80' : 'rgba(255,255,255,0.5)', transition: 'left 0.2s' }} />
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="flex justify-end gap-3 pt-4 border-t border-white/8">
                                <button type="button" className="btn btn-ghost px-6" onClick={() => { setShowEditObjModal(false); setNavbarVisible(true); }}>
                                    Annuler
                                </button>
                                <button type="submit" className="btn btn-primary" disabled={updatingObj}>
                                    {updatingObj ? 'Sauvegarde...' : 'Sauvegarder'} <Save size={18} />
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Custom Delete Confirmation Modal */}
            {showDeleteConfirm && (
                <>
                    <div
                        onClick={() => setShowDeleteConfirm(false)}
                        style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)', animation: 'fadeOverlay 0.18s ease' }}
                    />
                    <div style={{
                        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
                        zIndex: 2001, width: 380,
                        background: '#18181b',
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: 24,
                        boxShadow: '0 32px 72px rgba(0,0,0,0.8), 0 0 0 1px rgba(239,68,68,0.1)',
                        padding: '32px 32px 28px',
                        animation: 'scaleUp 0.2s cubic-bezier(0.16,1,0.3,1)',
                    }}>
                        {/* Icon */}
                        <div style={{ width: 52, height: 52, borderRadius: 14, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
                            <Trash2 size={24} style={{ color: '#ef4444' }} />
                        </div>
                        {/* Title */}
                        <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#f4f4f5', marginBottom: 10, letterSpacing: '-0.02em' }}>
                            Supprimer ce salon ?
                        </div>
                        {/* Subtitle */}
                        <div style={{ fontSize: '0.9rem', color: '#a1a1aa', lineHeight: 1.6, marginBottom: 32 }}>
                            Cette action est <strong>irréversible</strong>. Toutes les données (messages, ressources, étapes) seront définitivement effacées.
                        </div>
                        {/* Buttons */}
                        <div style={{ display: 'flex', gap: 12 }}>
                            <button
                                onClick={() => setShowDeleteConfirm(false)}
                                style={{
                                    flex: 1, padding: '12px 0', borderRadius: 12,
                                    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
                                    color: '#a1a1aa', fontSize: '0.9rem', fontWeight: 600,
                                    cursor: 'pointer', transition: 'all 0.2s',
                                }}
                                className="hover:bg-white/5 hover:text-white"
                            >
                                Annuler
                            </button>
                            <button
                                onClick={confirmDeleteObjective}
                                style={{
                                    flex: 1, padding: '12px 0', borderRadius: 12,
                                    background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                                    border: 'none',
                                    color: '#fff', fontSize: '0.9rem', fontWeight: 700,
                                    cursor: 'pointer',
                                    boxShadow: '0 8px 20px rgba(239,68,68,0.3)',
                                    transition: 'all 0.2s',
                                }}
                                className="hover:opacity-90 hover:scale-[1.02]"
                            >
                                Supprimer
                            </button>
                        </div>
                    </div>
                </>
            )}
            {/* Session Deletion Confirmation Modal */}
            {deleteConfirm.show && (
                <>
                    <div
                        onClick={() => setDeleteConfirm(prev => ({ ...prev, show: false }))}
                        style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(10px)', animation: 'fadeOverlay 0.2s ease' }}
                    />
                    <div style={{
                        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
                        zIndex: 3001, width: 400,
                        background: '#1a1a24',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: 24,
                        boxShadow: '0 32px 80px rgba(0,0,0,0.9), 0 0 0 1px rgba(99,102,241,0.15)',
                        padding: '36px 32px 32px',
                        animation: 'scaleUp 0.3s cubic-bezier(0.16,1,0.3,1)',
                        textAlign: 'center'
                    }}>
                        <div style={{ width: 64, height: 64, borderRadius: 20, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
                            <Trash2 size={30} style={{ color: '#ef4444' }} />
                        </div>
                        <h3 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#fff', marginBottom: 12, letterSpacing: '-0.025em' }}>
                            {deleteConfirm.title}
                        </h3>
                        <p style={{ fontSize: '0.95rem', color: '#94a3b8', lineHeight: 1.6, marginBottom: 32 }}>
                            {deleteConfirm.desc}
                        </p>
                        <div style={{ display: 'flex', gap: 14 }}>
                            <button
                                onClick={() => setDeleteConfirm(prev => ({ ...prev, show: false }))}
                                style={{
                                    flex: 1, padding: '14px 0', borderRadius: 14,
                                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                                    color: '#94a3b8', fontSize: '0.95rem', fontWeight: 600,
                                    cursor: 'pointer', transition: 'all 0.2s'
                                }}
                                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = '#fff'; }}
                                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = '#94a3b8'; }}
                            >
                                Annuler
                            </button>
                            <button
                                onClick={confirmDeleteAction}
                                style={{
                                    flex: 1, padding: '14px 0', borderRadius: 14,
                                    background: 'linear-gradient(135deg, #ef4444, #b91c1c)',
                                    border: 'none',
                                    color: '#fff', fontSize: '0.95rem', fontWeight: 700,
                                    cursor: 'pointer',
                                    boxShadow: '0 10px 25px rgba(239,68,68,0.35)',
                                    transition: 'all 0.2s'
                                }}
                                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 12px 30px rgba(239,68,68,0.45)'; }}
                                onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 10px 25px rgba(239,68,68,0.35)'; }}
                            >
                                Confirmer
                            </button>
                        </div>
                    </div>
                </>
            )}

            {/* Floating AI assistant — available on all tabs */}
            {objective && (
                <FloatingAiAssistant context={{
                    id: typeof id === 'string' ? id : Array.isArray(id) ? id[0] : '',
                    type: 'objective',
                    title: objective.title || '',
                    description: objective.description || '',
                    category: objective.category || '',
                    members: memberships.map((m: any) => ({ name: m.user_name || m.display_name || 'Membre' })),
                    recentMessages: messages.slice(-15).map((m: any) => ({ user_name: m.user_name || 'Inconnu', content: m.content || '' })),
                    milestones: milestones.map((ms: any) => ({ text: ms.text, completed: ms.completed })),
                    resources: resources.map((r: any) => ({ text: r.text })),
                    currentUserName: user?.displayName || user?.email || undefined,
                }} />
            )}
        </div>
    );
}
