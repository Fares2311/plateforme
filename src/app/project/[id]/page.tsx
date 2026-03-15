'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { db, storage } from '@/lib/firebase';
import { ref as storageRef, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { doc, getDoc, collection, query, where, getDocs, onSnapshot, orderBy, addDoc, serverTimestamp, updateDoc, arrayUnion, arrayRemove, setDoc, deleteDoc } from 'firebase/firestore';
import { Link as LinkIcon, Users, Edit3, Save, TrendingUp, Calendar, CheckSquare, MessageSquare, Send, Bot, FileText, BarChart2, Video, Rocket, LayoutDashboard, UserPlus, FileUp, Hash, Pin, SmilePlus, X, Target, Code, BookOpen, Clock, Globe, Lock, Palette, Music, Dumbbell, FlaskConical, Briefcase, Pen, ChevronRight, Star, Zap, Trash2, Upload, Download, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useLocale } from '@/context/LocaleContext';
import { useUI } from '@/context/UIContext';
import CalendarPicker from '@/components/CalendarPicker';
import Avatar from '@/components/Avatar';
import ProjectBoard from '@/components/ProjectBoard';
import { FloatingAiAssistant } from '@/components/ui/glowing-ai-chat-assistant';
import { motion, AnimatePresence } from 'framer-motion';

// Format hours: < 1h → "Xmin", ≥ 1h → up to 2 decimal places
const fmtHours = (h: number) => h < 1 ? `${Math.round(h * 60)}min` : `${parseFloat(h.toFixed(2))}h`;

export default function ProjectDetail() {
    const { id } = useParams();
    const { user } = useAuth();
    const router = useRouter();
    const { t } = useLocale();
    const { setNavbarVisible, setIsWorking: setIsWorkingGlobal } = useUI();

    const [project, setProject] = useState<any>(null);
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

    const [milestones, setMilestones] = useState<{ id: string, text: string, description?: string, estimated_hours?: number, completed: boolean }[]>([]);
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
    const [newGroupStep, setNewGroupStep] = useState({ text: '', description: '' });
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

    // Thread replies
    const [replyingTo, setReplyingTo] = useState<{ id: string; user_name: string; content: string } | null>(null);

    // @mentions
    const [mentionQuery, setMentionQuery] = useState<string | null>(null);
    const chatInputRef = useRef<HTMLInputElement>(null);

    // Activity feed
    type ActivityEntry = { id: string; type: string; user_name: string; payload: string; created_at: any };
    const [activities, setActivities] = useState<ActivityEntry[]>([]);

    // Friends state
    const [friendships, setFriendships] = useState<Record<string, any>>({});

    // Live presence state
    const [presenceMap, setPresenceMap] = useState<Record<string, { is_working: boolean; started_at: any; last_seen: any }>>({});
    const [isWorking, setIsWorking] = useState(false);
    const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
    // Ticker so stale presences disappear without a Firestore event
    const [, setTick] = useState(0);

    // Invite member by email
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteRole, setInviteRole] = useState<'admin' | 'member'>('member');
    const [inviting, setInviting] = useState(false);
    const [inviteMsg, setInviteMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // Edit modal: project-specific
    const [editGithubLink, setEditGithubLink] = useState('');

    // Live coworking room members
    const [liveRoomCount, setLiveRoomCount] = useState(0);
    const [liveRoomMembers, setLiveRoomMembers] = useState<{ uid: string; full_name: string; avatar_url?: string; avatar_style?: string }[]>([]);

    useEffect(() => {
        if (!user || !id) return;

        const fetchData = async () => {
            try {
                // Fetch Project
                const objDoc = await getDoc(doc(db, 'projects', id as string));
                if (!objDoc.exists()) {
                    router.push('/dashboard');
                    return;
                }
                setProject({ id: objDoc.id, ...objDoc.data() });

                // Fetch Memberships (Group Progress)
                const membershipsRef = collection(db, 'project_memberships');
                const q = query(membershipsRef, where('project_id', '==', id));
                const membershipDocs = await getDocs(q);

                const creatorId = objDoc.data().creator_id;
                const members = await Promise.all(membershipDocs.docs.map(async (m) => {
                    const mData = m.data();
                    const pDoc = await getDoc(doc(db, 'users', mData.user_id));
                    const userData = pDoc.exists() ? pDoc.data() : { full_name: 'Anonyme', email: '' };
                    return {
                        ...mData,
                        id: m.id,
                        user_id: mData.user_id,
                        role: mData.user_id === creatorId ? 'admin' : (mData.role || 'member'),
                        full_name: userData.full_name || userData.email || 'Membre',
                        photo_url: userData.avatar_url || null,
                        user: userData,
                    };
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
        const messagesRef = collection(db, 'projects', id as string, 'messages');
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
        const aiMessagesRef = collection(db, 'projects', id as string, 'ai_messages');
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
        const milestonesRef = collection(db, 'projects', id as string, 'milestones');
        const qMilestones = query(milestonesRef, orderBy('created_at', 'asc'));
        const unsubscribeMilestones = onSnapshot(qMilestones, (snapshot) => {
            const mlist = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as any;
            setMilestones(mlist);
        });

        // Realtime Resources Subscription (AI-generated)
        const resourcesRef = collection(db, 'projects', id as string, 'resources');
        const qResources = query(resourcesRef, orderBy('created_at', 'asc'));
        const unsubscribeResources = onSnapshot(qResources, (snapshot) => {
            const rlist = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as any;
            setResources(rlist);
        });

        // Realtime Shared Files Subscription (manual uploads by members)
        const sharedFilesRef = collection(db, 'projects', id as string, 'shared_files');
        const qSharedFiles = query(sharedFilesRef, orderBy('added_at', 'asc'));
        const unsubscribeSharedFiles = onSnapshot(qSharedFiles, (snapshot) => {
            setSharedFiles(snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as any);
        });

        // Realtime Sessions Subscription
        const sessionsRef = collection(db, 'projects', id as string, 'sessions');
        const qSessions = query(sessionsRef, orderBy('scheduled_at', 'asc'));
        const unsubscribeSessions = onSnapshot(qSessions, (snapshot) => {
            const sList = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as Session[];
            setSessions(sList);
        });

        // Realtime Polls Subscription
        const pollsRef = collection(db, 'projects', id as string, 'polls');
        const qPolls = query(pollsRef, orderBy('created_at', 'desc'));
        const unsubscribePolls = onSnapshot(qPolls, (snapshot) => {
            setPolls(snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as Poll[]);
        });

        // Realtime Personal Milestones subscription (only current user's)
        // Note: no orderBy to avoid needing a composite Firestore index — sorted client-side
        const personalRef = collection(db, 'projects', id as string, 'personal_milestones');
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
        const liveSessionRef = collection(db, 'projects', id as string, 'live_session');
        const unsubLiveSession = onSnapshot(liveSessionRef, (snap) => {
            setLiveRoomCount(snap.size);
            setLiveRoomMembers(snap.docs.map(d => ({
                uid: d.id,
                full_name: d.data().full_name || 'Membre',
                avatar_url: d.data().avatar_url,
                avatar_style: d.data().avatar_style,
            })));
        });

        // Realtime Activity Feed
        const activityRef = collection(db, 'projects', id as string, 'activity');
        const qActivity = query(activityRef, orderBy('created_at', 'desc'));
        const unsubActivity = onSnapshot(qActivity, (snap) => {
            setActivities(snap.docs.map(d => ({ id: d.id, ...d.data() } as ActivityEntry)));
        });

        // Realtime Presence Subscription
        const presenceRef = collection(db, 'projects', id as string, 'presence');
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
                    const presDoc = doc(db, 'projects', id as string, 'presence', user.uid);
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
            unsubActivity();
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

    const handleUpdateProject = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || user.uid !== project.creator_id) return;
        setUpdatingObj(true);
        try {
            await updateDoc(doc(db, 'projects', id as string), {
                title: editObjTitle,
                description: editObjDesc,
                github_link: editGithubLink.trim(),
                category: editObjCats,
                is_public: editObjPublic,
            });
            setShowEditObjModal(false);
            setNavbarVisible(true);
            setProject({
                ...project,
                title: editObjTitle,
                description: editObjDesc,
                github_link: editGithubLink.trim(),
                category: editObjCats,
                is_public: editObjPublic,
            });
        } catch (err) {
            console.error('Error updating project', err);
        } finally {
            setUpdatingObj(false);
        }
    };

    const generateInviteCode = async () => {
        if (!user || user.uid !== project?.creator_id) return;
        setGeneratingCode(true);
        try {
            const code = Math.random().toString(36).substring(2, 10).toUpperCase();
            await updateDoc(doc(db, 'projects', id as string), { invite_code: code, invite_link_enabled: true });
            setProject({ ...project, invite_code: code, invite_link_enabled: true });
        } catch (err) {
            console.error(err);
        } finally {
            setGeneratingCode(false);
        }
    };

    const toggleInviteLink = async () => {
        if (!user || user.uid !== project?.creator_id) return;
        setTogglingInvite(true);
        try {
            const newVal = !project.invite_link_enabled;
            await updateDoc(doc(db, 'projects', id as string), { invite_link_enabled: newVal });
            setProject({ ...project, invite_link_enabled: newVal });
        } catch (err) {
            console.error(err);
        } finally {
            setTogglingInvite(false);
        }
    };

    const copyInviteLink = () => {
        if (!project?.invite_code) return;
        const link = `${window.location.origin}/join/${project.invite_code}`;
        navigator.clipboard.writeText(link);
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 2000);
    };

    const logActivity = async (type: string, payload: string) => {
        if (!user || !id) return;
        const member = memberships.find((m: any) => m.user_id === user.uid);
        const userName = member?.full_name || user.displayName || user.email?.split('@')[0] || 'Membre';
        await addDoc(collection(db, 'projects', id as string, 'activity'), {
            type, payload, user_id: user.uid, user_name: userName, created_at: serverTimestamp(),
        });
    };

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim() || !user) return;

        try {
            await addDoc(collection(db, 'projects', id as string, 'messages'), {
                user_id: user.uid,
                user_name: user.displayName || user.email?.split('@')[0] || 'Utilisateur',
                content: newMessage.trim(),
                created_at: serverTimestamp(),
                reactions: {},
                pinned: false,
                ...(replyingTo ? { reply_to: replyingTo } : {}),
            });
            setNewMessage('');
            setReplyingTo(null);
            setMentionQuery(null);
            // Don't log every message to avoid spam — only log first message of the day would be ideal,
            // but for simplicity we skip activity logging for regular chat messages
        } catch (err) {
            console.error('Error sending message', err);
        }
    };

    const handleChatInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setNewMessage(val);
        // Detect @mention: find last @ and extract query
        const lastAt = val.lastIndexOf('@');
        if (lastAt !== -1) {
            const afterAt = val.slice(lastAt + 1);
            if (!afterAt.includes(' ')) {
                setMentionQuery(afterAt.toLowerCase());
                return;
            }
        }
        setMentionQuery(null);
    };

    const insertMention = (fullName: string) => {
        const lastAt = newMessage.lastIndexOf('@');
        const before = newMessage.slice(0, lastAt);
        setNewMessage(before + '@' + fullName + ' ');
        setMentionQuery(null);
        chatInputRef.current?.focus();
    };

    const renderMessageContent = (content: string) => {
        const parts = content.split(/(@\S+)/g);
        return parts.map((part, i) => {
            if (part.startsWith('@')) {
                const name = part.slice(1);
                const isMember = memberships.some((m: any) => m.full_name === name || m.full_name?.split(' ')[0] === name);
                return <span key={i} style={{ color: isMember ? 'var(--color-primary)' : 'inherit', fontWeight: isMember ? 700 : 'inherit' }}>{part}</span>;
            }
            return part;
        });
    };

    const handleToggleReaction = async (msgId: string, emoji: string) => {
        if (!user) return;
        const msgRef = doc(db, 'projects', id as string, 'messages', msgId);
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

    const handleDeleteProject = async () => {
        if (!project || !user || user.uid !== project.creator_id) return;
        setShowDeleteConfirm(true);
    };

    const confirmDeleteProject = async () => {
        if (!project || !user || user.uid !== project.creator_id) return;

        try {
            const oid = id as string;

            // 1. Delete subcollections
            const subcollections = ['milestones', 'resources', 'sessions', 'messages', 'ai_messages', 'shared_files'];
            for (const sub of subcollections) {
                const q = query(collection(db, 'projects', oid, sub));
                const snap = await getDocs(q);
                for (const d of snap.docs) {
                    await deleteDoc(d.ref);
                }
            }

            // 2. Delete memberships
            const mq = query(collection(db, 'project_memberships'), where('project_id', '==', oid));
            const mSnap = await getDocs(mq);
            for (const d of mSnap.docs) {
                await deleteDoc(d.ref);
            }

            // 3. Delete the project document itself
            await deleteDoc(doc(db, 'projects', oid));

            router.push('/dashboard');
        } catch (err) {
            console.error("Error deleting project:", err);
            alert("Une erreur est survenue lors de la suppression.");
        } finally {
            setShowDeleteConfirm(false);
        }
    };

    const handlePinMessage = async (msgId: string) => {
        if (!project) return;
        const pinnedNow: string[] = project.pinned_messages || [];
        // max 3 pinned
        if (pinnedNow.length >= 3 && !pinnedNow.includes(msgId)) return;
        const next = pinnedNow.includes(msgId)
            ? pinnedNow.filter((p: string) => p !== msgId)
            : [...pinnedNow, msgId];
        await updateDoc(doc(db, 'projects', id as string), { pinned_messages: next });
        setProject((prev: any) => ({ ...prev, pinned_messages: next }));
    };

    const handleGenerateSmartAgenda = async () => {
        if (!project) return;
        setGeneratingAI(true);
        try {
            const res = await fetch('/api/generate-smart-agenda', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: project.title,
                    category: Array.isArray(project.category) ? project.category.join(', ') : project.category,
                    targetHours: project.target_hours,
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
                        await deleteDoc(doc(db, 'projects', id as string, 'milestones', oldM.id));
                    } catch (e) {
                        console.error("Could not delete old milestone", e);
                    }
                }
                for (const m of data.milestones) {
                    await addDoc(collection(db, 'projects', id as string, 'milestones'), {
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
                        await deleteDoc(doc(db, 'projects', id as string, 'sessions', fs.id));
                    } catch (e) { console.error("Could not delete old session", e); }
                }

                for (const s of data.sessions) {
                    await addDoc(collection(db, 'projects', id as string, 'sessions'), {
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
        await addDoc(collection(db, 'projects', id as string, 'milestones'), {
            text: newGroupStep.text.trim(),
            description: newGroupStep.description.trim(),
            completed: false,
            created_at: serverTimestamp()
        });

        // Notify others in the room
        const othersToNotify = memberships.map((m: any) => m.user_id).filter((uid: string) => uid !== user.uid);
        for (const uid of othersToNotify) {
            await addDoc(collection(db, 'users', uid, 'notifications'), {
                message: `${user.displayName || user.email?.split('@')[0] || 'Un membre'} a ajouté une nouvelle étape "${newGroupStep.text.trim()}" dans le salon "${project?.title}".`,
                type: 'milestone_add',
                read: false,
                created_at: serverTimestamp()
            });
        }

        setNewGroupStep({ text: '', description: '' });
        setShowGroupStepForm(false);
    };

    const handleAISuggestMilestones = async () => {
        if (!project) return;
        setSuggestingAI(true);
        try {
            const res = await fetch('/api/generate-roadmap', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: project.title,
                    category: Array.isArray(project.category) ? project.category.join(', ') : project.category,
                    targetHours: project.target_hours,
                    existing: milestones.map(m => m.text), // pass existing so AI adds new ones
                    mode: 'suggest' // hint to suggest without duplicating
                })
            });
            const data = await res.json();
            if (data.milestones) {
                for (const m of data.milestones) {
                    await addDoc(collection(db, 'projects', id as string, 'milestones'), {
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
        if (!project) return;
        setGeneratingAIResources(true);
        try {
            const res = await fetch('/api/generate-resources', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: project.title,
                    category: Array.isArray(project.category) ? project.category.join(', ') : project.category,
                    userPrompt: aiResourcePrompt,
                })
            });
            const data = await res.json();

            if (data.resources) {
                // Delete old resources first
                for (const oldR of resources) {
                    try {
                        const { deleteDoc } = await import('firebase/firestore');
                        await deleteDoc(doc(db, 'projects', id as string, 'resources', oldR.id));
                    } catch (e) {
                        console.error("Could not delete old resource", e);
                    }
                }

                for (const text of data.resources) {
                    await addDoc(collection(db, 'projects', id as string, 'resources'), {
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
                const sRef = storageRef(storage, `projects/${oid}/shared_files/${user.uid}_${Date.now()}_${safeName}`);
                const task = uploadBytesResumable(sRef, resFile);
                await new Promise<void>((resolve, reject) => {
                    task.on('state_changed',
                        snap => setResUploadProgress(Math.round(snap.bytesTransferred / snap.totalBytes * 100)),
                        reject,
                        async () => {
                            const url = await getDownloadURL(task.snapshot.ref);
                            await addDoc(collection(db, 'projects', oid, 'shared_files'), {
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
            await addDoc(collection(db, 'projects', oid, 'shared_files'), {
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
        await deleteDoc(doc(db, 'projects', id as string, 'shared_files', fileId));
    };

    const handleCallCoach = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!project || !newAiMessage.trim() || !user) return;

        const userQuery = newAiMessage.trim();
        setNewAiMessage('');
        setCallingCoach(true);

        try {
            // Add user's question to the AI chat thread
            await addDoc(collection(db, 'projects', id as string, 'ai_messages'), {
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
                    title: project.title,
                    chatHistory: recentMessages,
                    userQuery: userQuery
                })
            });
            const data = await res.json();

            if (data.message) {
                await addDoc(collection(db, 'projects', id as string, 'ai_messages'), {
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
            const mRef = doc(db, 'projects', id as string, 'milestones', milestoneId);
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
                await addDoc(collection(db, 'projects', id as string, 'sessions'), {
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
                    message: `${user.displayName || user.email?.split('@')[0] || 'Un membre'} a planifié une session "${newSession.title}"${recurringLabel} le ${formattedDate} dans le salon "${project?.title}".`,
                    type: 'session_add',
                    link: `/project/${id}`,
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
        const sRef = doc(db, 'projects', id as string, 'sessions', session.id);
        const isAttending = session.attendees.includes(user.uid);
        await updateDoc(sRef, {
            attendees: isAttending ? arrayRemove(user.uid) : arrayUnion(user.uid)
        });
    };

    const handleUpdateSessionDate = async (session: Session) => {
        if (!editDate || !user) return;
        const newDate = new Date(editDate);
        const sRef = doc(db, 'projects', id as string, 'sessions', session.id);
        await updateDoc(sRef, { scheduled_at: newDate });

        // Format the new date nicely for the notification
        const formatted = newDate.toLocaleDateString('fr-FR', {
            weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit'
        });

        // Notify all attendees except the creator
        const othersToNotify = session.attendees.filter(uid => uid !== user.uid);
        for (const uid of othersToNotify) {
            await addDoc(collection(db, 'users', uid, 'notifications'), {
                message: `La session "${session.title}" dans le salon "${project?.title}" a été reprogrammée au ${formatted}.`,
                type: 'session_update',
                link: `/project/${id}`,
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
                    await deleteDoc(doc(db, 'projects', id as string, 'sessions', s.id));
                }
            } else {
                await deleteDoc(doc(db, 'projects', id as string, 'sessions', sessionId));
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
            await addDoc(collection(db, 'projects', id as string, 'polls'), {
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
        const pRef = doc(db, 'projects', id as string, 'polls', poll.id);
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
        const pRef = doc(db, 'projects', id as string, 'polls', poll.id);
        await updateDoc(pRef, { closed: !poll.closed });
    };

    const handleAddPersonalMilestone = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !newPersonalStep.trim()) return;
        await addDoc(collection(db, 'projects', id as string, 'personal_milestones'), {
            text: newPersonalStep.trim(),
            completed: false,
            user_id: user.uid,
            created_at: serverTimestamp()
        });
        setNewPersonalStep('');
    };

    const handleTogglePersonalMilestone = async (milestoneId: string, current: boolean) => {
        const mRef = doc(db, 'projects', id as string, 'personal_milestones', milestoneId);
        await updateDoc(mRef, { completed: !current });
    };

    const handleDeletePersonalMilestone = async (milestoneId: string) => {
        const { deleteDoc } = await import('firebase/firestore');
        const mRef = doc(db, 'projects', id as string, 'personal_milestones', milestoneId);
        await deleteDoc(mRef);
    };

    const toggleFocus = async () => {
        if (!user || !id) return;
        const presRef = doc(db, 'projects', id as string, 'presence', user.uid);
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
                message: `${user.displayName || user.email?.split('@')[0]} vous a envoyé une demande d'ami depuis le salon ${project?.title}.`,
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


    const handleUpdateRole = async (membershipId: string, newRole: 'admin' | 'member') => {
        try {
            await updateDoc(doc(db, 'project_memberships', membershipId), { role: newRole });
            setMemberships(prev => prev.map(m => m.id === membershipId ? { ...m, role: newRole } : m));
        } catch (err) {
            console.error("Erreur mise à jour rôle", err);
        }
    };

    const handleRemoveMember = async (membershipId: string, memberUserId: string) => {
        if (!user || !project) return;
        const isCreator = user.uid === project.creator_id;
        const isAdmin = memberships.find(m => m.user_id === user.uid)?.role === 'admin';
        if (!isCreator && !isAdmin) return;
        try {
            await deleteDoc(doc(db, 'project_memberships', membershipId));
            setMemberships(prev => prev.filter(m => m.id !== membershipId));
        } catch (err) {
            console.error('Erreur suppression membre', err);
        }
    };

    const handleInviteMemberByEmail = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!inviteEmail.trim() || !user || !project) return;
        setInviting(true);
        setInviteMsg(null);
        try {
            const usersSnap = await getDocs(query(collection(db, 'users'), where('email', '==', inviteEmail.trim().toLowerCase())));
            if (usersSnap.empty) {
                setInviteMsg({ type: 'error', text: 'Aucun compte trouvé avec cet email.' });
                return;
            }
            const targetUid = usersSnap.docs[0].id;
            const alreadyMember = memberships.some(m => m.user_id === targetUid);
            if (alreadyMember) {
                setInviteMsg({ type: 'error', text: 'Cette personne est déjà membre du salon.' });
                return;
            }
            await addDoc(collection(db, 'users', targetUid, 'notifications'), {
                type: 'project_invite',
                from_uid: user.uid,
                from_name: user.displayName || user.email?.split('@')[0] || 'Utilisateur',
                project_id: id,
                project_title: project.title,
                role: inviteRole,
                message: `${user.displayName || user.email?.split('@')[0] || 'Quelqu\'un'} vous invite à rejoindre le projet « ${project.title} »`,
                read: false,
                created_at: serverTimestamp(),
                link: `/project/${id}`
            });
            // Also update pending_invites on the project doc
            await updateDoc(doc(db, 'projects', id as string), {
                pending_invites: [...(project.pending_invites || []), { email: inviteEmail.trim().toLowerCase(), role: inviteRole }]
            });
            setInviteMsg({ type: 'success', text: `Invitation envoyée à ${inviteEmail.trim()} !` });
            setInviteEmail('');
        } catch (err) {
            console.error(err);
            setInviteMsg({ type: 'error', text: 'Erreur lors de l\'envoi de l\'invitation.' });
        } finally {
            setInviting(false);
        }
    };

    if (loading) return <div className="container py-16 text-center">{t('room_loading')}</div>;
    if (!project) return null;

    // ─── COMPOSITE GROUP PROGRESSION ──────────────────────────────────
    // 1. Hours dimension: avg. member completion vs target (40% weight)
    const totalCompleted = memberships.reduce((acc, m) => acc + (m.completed_hours ?? 0), 0);
    const totalTarget = project.target_hours * (memberships.length || 1);
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
                position: 'relative',
                overflow: 'hidden',
                padding: '3rem 3.5rem',
                marginBottom: '2.5rem',
                borderRadius: '24px',
                border: '1px solid rgba(99,102,241,0.18)',
                background: 'linear-gradient(135deg, #13131c 0%, #181825 100%)',
                boxShadow: '0 4px 64px rgba(0,0,0,0.5), 0 1px 0 rgba(255,255,255,0.05) inset',
            }}>
                {/* Background decorative glows */}
                <div style={{ position: 'absolute', top: '-120px', right: '-80px', width: '500px', height: '400px', background: 'radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 65%)', pointerEvents: 'none', zIndex: 0 }} />
                <div style={{ position: 'absolute', bottom: '-80px', left: '30%', width: '350px', height: '250px', background: 'radial-gradient(circle, rgba(236,72,153,0.07) 0%, transparent 65%)', pointerEvents: 'none', zIndex: 0 }} />

                {/* Creator action buttons (top right) */}
                {user?.uid === project.creator_id && (
                    <div style={{ position: 'absolute', top: '20px', right: '20px', zIndex: 10, display: 'flex', gap: '8px' }}>
                        <button
                            onClick={() => {
                                setEditObjTitle(project.title);
                                setEditObjDesc(project.description || '');
                                setEditObjCats(Array.isArray(project.category) ? [...project.category] : [project.category]);
                                setEditObjPublic(project.is_public || false);
                                setEditGithubLink(project.github_link || '');
                                setShowEditObjModal(true);
                                setNavbarVisible(false);
                            }}
                            style={{ padding: '7px 14px', background: 'rgba(255,255,255,0.05)', borderRadius: '10px', color: '#a1a1aa', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', fontWeight: 600, transition: 'all 0.15s' }}
                            title="Modifier le salon"
                        >
                            <Edit3 size={14} /> Modifier
                        </button>
                        <button
                            onClick={handleDeleteProject}
                            style={{ padding: '7px 12px', background: 'rgba(239,68,68,0.07)', borderRadius: '10px', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', fontWeight: 600, transition: 'all 0.15s' }}
                            title="Supprimer le salon"
                        >
                            <Trash2 size={14} />
                        </button>
                    </div>
                )}

                {/* 2-column layout */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '4rem', alignItems: 'center', position: 'relative', zIndex: 1 }}>

                    {/* LEFT: project identity + actions */}
                    <div>
                        {/* Categories */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px', marginBottom: '1.25rem' }}>
                            {Array.isArray(project.category) ? (
                                project.category.map((cat: string) => (
                                    <div key={cat} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: '999px', padding: '3px 12px', fontSize: '0.78rem', fontWeight: 600, color: '#a5b4fc' }}>
                                        <Hash size={11} /> {cat}
                                    </div>
                                ))
                            ) : (
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: '999px', padding: '3px 12px', fontSize: '0.78rem', fontWeight: 600, color: '#a5b4fc' }}>
                                    <Hash size={11} /> {project.category}
                                </div>
                            )}
                        </div>

                        {/* Title */}
                        <h1 className="text-gradient" style={{ fontSize: '2.6rem', margin: '0 0 0.9rem', lineHeight: 1.15, letterSpacing: '-0.03em' }}>{project.title}</h1>

                        {/* Description snippet */}
                        {project.description && (
                            <p style={{ margin: '0 0 1.75rem', opacity: 0.62, lineHeight: 1.75, maxWidth: '580px', fontSize: '0.98rem', color: 'var(--color-text-secondary)' }}>
                                {project.description.slice(0, 180)}{project.description.length > 180 ? '…' : ''}
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
                                        {working.length === 1
                                            ? `${working[0].user.full_name?.split(' ')[0] || 'Un membre'} travaille maintenant`
                                            : `${working.length} membres travaillent maintenant`}
                                    </span>
                                    <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#10b981', boxShadow: '0 0 0 2px rgba(16,185,129,0.3)', animation: 'pulse 2s infinite', display: 'inline-block' }} />
                                </div>
                            ) : (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1.5rem' }}>
                                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#3f3f46', display: 'inline-block' }} />
                                    <span style={{ fontSize: '0.82rem', color: '#52525b' }}>Personne ne travaille pour l'instant</span>
                                </div>
                            );
                        })()}

                        {/* Action buttons */}
                        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                            <button
                                onClick={toggleFocus}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '10px',
                                    padding: '12px 26px', borderRadius: '14px', fontWeight: 700,
                                    fontSize: '0.95rem', cursor: 'pointer', fontFamily: 'inherit',
                                    transition: 'all 0.25s cubic-bezier(0.4,0,0.2,1)',
                                    background: isWorking ? 'rgba(16,185,129,0.12)' : 'linear-gradient(135deg,#6366f1,#4f46e5)',
                                    color: isWorking ? '#10b981' : '#fff',
                                    border: isWorking ? '1px solid rgba(16,185,129,0.4)' : 'none',
                                    boxShadow: isWorking ? '0 0 20px rgba(16,185,129,0.2)' : '0 6px 24px rgba(99,102,241,0.35)',
                                }}
                            >
                                <Zap size={17} strokeWidth={2.5} style={{ fill: isWorking ? 'currentColor' : 'none' }} />
                                {isWorking ? 'Je m\'arrête' : 'Je commence à travailler'}
                            </button>

                            <Link
                                href={`/session?id=${project.id}&type=project`}
                                className="btn btn-outline btn-lg"
                                style={{
                                    padding: '12px 20px', borderRadius: '14px',
                                    display: 'flex', alignItems: 'center', gap: '10px',
                                    fontSize: '0.95rem',
                                    background: liveRoomCount > 0 ? 'rgba(16,185,129,0.08)' : undefined,
                                    borderColor: liveRoomCount > 0 ? 'rgba(16,185,129,0.35)' : undefined,
                                    color: liveRoomCount > 0 ? '#10b981' : undefined,
                                }}
                            >
                                <Video size={17} />
                                Coworking live
                                {liveRoomCount > 0 && (
                                    <span style={{
                                        display: 'flex', alignItems: 'center', gap: 4,
                                        background: 'rgba(16,185,129,0.12)',
                                        border: '1px solid rgba(16,185,129,0.25)',
                                        borderRadius: 6, padding: '2px 7px',
                                        fontSize: '0.7rem', fontWeight: 700, color: '#10b981',
                                        whiteSpace: 'nowrap',
                                    }}>
                                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#10b981', animation: 'pulse 1.5s infinite', display: 'inline-block' }} />
                                        {liveRoomCount} en direct
                                    </span>
                                )}
                            </Link>
                        </div>

                        {isWorking && (() => {
                            const startedAt = presenceMap[user?.uid ?? '']?.started_at;
                            return startedAt ? (
                                <div style={{ marginTop: '0.75rem', fontSize: '0.78rem', color: '#10b981', opacity: 0.7 }}>
                                    Session en cours ⚡
                                </div>
                            ) : null;
                        })()}
                    </div>

                    {/* RIGHT: stats + progress */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                        {/* Stats 2×2 grid */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.875rem' }}>
                            <div style={{ background: 'rgba(99,102,241,0.09)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: '16px', padding: '1.25rem 1rem', textAlign: 'center' }}>
                                <div style={{ fontSize: '1.85rem', fontWeight: 800, color: '#818cf8', lineHeight: 1 }}>{fmtHours(totalCompleted)}</div>
                                <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.07em', marginTop: '6px', fontWeight: 600 }}>Complétées</div>
                            </div>
                            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', padding: '1.25rem 1rem', textAlign: 'center' }}>
                                <div style={{ fontSize: '1.85rem', fontWeight: 800, lineHeight: 1 }}>{project.target_hours}h</div>
                                <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.07em', marginTop: '6px', fontWeight: 600 }}>{project.goal_frequency === 'daily' ? 'Obj./jour' : project.goal_frequency === 'weekly' ? 'Obj./sem.' : project.goal_frequency === 'monthly' ? 'Obj./mois' : 'Objectif'}</div>
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

                        {/* Composite progress */}
                        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '1.25rem 1.5rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.45, fontWeight: 700 }}>Progression globale</span>
                                <span style={{ color: '#818cf8', fontWeight: 900, fontSize: '1.5rem', lineHeight: 1 }}>{globalPerc}%</span>
                            </div>
                            {/* Stacked bar */}
                            <div style={{ height: '10px', borderRadius: '8px', background: 'rgba(0,0,0,0.4)', overflow: 'hidden', display: 'flex', boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.4)', marginBottom: '12px' }}>
                                <div style={{ width: `${hoursPerc * 0.4}%`, background: 'var(--color-primary)', transition: 'width 0.8s ease', minWidth: hoursPerc > 0 ? '2px' : 0 }} />
                                {milestonesTotal > 0 && <div style={{ width: `${milestonesPerc * 0.4}%`, background: 'var(--color-secondary)', transition: 'width 0.8s ease', minWidth: milestonesPerc > 0 ? '2px' : 0 }} />}
                                {sessionsTotal > 0 && <div style={{ width: `${sessionsPerc * 0.2}%`, background: '#a855f7', transition: 'width 0.8s ease', minWidth: sessionsPerc > 0 ? '2px' : 0 }} />}
                            </div>
                            {/* Legend */}
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', fontSize: '0.72rem', opacity: 0.55 }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                    <span style={{ display: 'inline-block', width: '9px', height: '9px', borderRadius: '3px', background: 'var(--color-primary)' }} />
                                    Heures {hoursPerc}%
                                </span>
                                {milestonesTotal > 0 && (
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                        <span style={{ display: 'inline-block', width: '9px', height: '9px', borderRadius: '3px', background: 'var(--color-secondary)' }} />
                                        Étapes {milestonesPerc}%
                                    </span>
                                )}
                                {sessionsTotal > 0 && (
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                        <span style={{ display: 'inline-block', width: '9px', height: '9px', borderRadius: '3px', background: '#a855f7' }} />
                                        Sessions {sessionsPerc}%
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Lateral Nav — fixed in left gutter, outside the 1400px container */}
            <nav style={{
                position: 'fixed',
                top: '90px',
                left: '16px',
                width: '188px',
                display: 'flex', flexDirection: 'column', gap: '2px',
                zIndex: 50,
                background: 'rgba(10,10,20,0.95)',
                backdropFilter: 'blur(24px)',
                border: '1px solid rgba(255,255,255,0.09)',
                borderRadius: '18px',
                padding: '10px',
                boxShadow: '0 8px 36px rgba(0,0,0,0.5)',
            }}>
                {/* Project mini-header */}
                <div style={{ padding: '4px 6px 10px', borderBottom: '1px solid rgba(255,255,255,0.06)', marginBottom: '6px' }}>
                    <div style={{ fontSize: '0.63rem', opacity: 0.35, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '4px', fontWeight: 700 }}>Salon</div>
                    <div style={{ fontSize: '0.84rem', fontWeight: 600, color: 'rgba(255,255,255,0.85)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.3 }}>
                        {project.title}
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
                    { id: 'activity',   Icon: TrendingUp,      label: 'Activité' },
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

            {/* Tab content */}

            <div className="tabs-content relative" style={{ width: '100%' }}>
                <AnimatePresence mode="wait">
                {/* TAB: OVERVIEW */}
                {activeTab === 'overview' && (
                    <motion.div
                        key="overview"
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -15 }}
                        transition={{ duration: 0.25, ease: "easeInOut" }}
                        className="tab-pane active">
                        {/* Overview content */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginBottom: '2.5rem' }}>

                        {/* Description card */}
                        {project.description && (
                            <div className="card card-glass fade-enter" style={{ borderLeft: '4px solid var(--color-primary)', padding: '1.5rem 1.75rem' }}>
                                <h4 className="flex items-center gap-2 m-0 mb-4" style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.1em', opacity: 0.5, fontWeight: 700 }}>
                                    📋 Description
                                </h4>
                                <p style={{ margin: 0, lineHeight: 1.8, opacity: 0.88, fontSize: '1rem' }}>{project.description}</p>
                            </div>
                )}

                        {/* E-Learning Link card */}
                        {project.learning_link && (
                            <a 
                                href={project.learning_link.startsWith('http') ? project.learning_link : `https://${project.learning_link}`}
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
                                    <p className="m-0 truncate" style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.5)', maxWidth: '280px' }}>
                                        {project.learning_link}
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

                        {/* GitHub Link card */}
                        {project.github_link && (
                            <a
                                href={project.github_link.startsWith('http') ? project.github_link : `https://${project.github_link}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="card card-glass fade-enter group"
                                style={{
                                    borderLeft: '3px solid #6366f1',
                                    textDecoration: 'none',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '1rem',
                                    padding: '1.25rem 1.5rem',
                                    transition: 'all 0.2s ease',
                                    background: 'linear-gradient(90deg, rgba(99,102,241,0.05) 0%, rgba(99,102,241,0) 100%)',
                                }}
                            >
                                <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: 'rgba(99,102,241,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    <Code size={20} style={{ color: '#818cf8' }} />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <h4 className="m-0 group-hover:text-white transition-colors" style={{ fontSize: '1.05rem', color: '#f4f4f5', marginBottom: '2px' }}>
                                        Voir le repository GitHub
                                    </h4>
                                    <p className="m-0 truncate" style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.5)', maxWidth: '280px' }}>
                                        {project.github_link}
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
                            const isCreator = user?.uid === project.creator_id;
                            const isPublic = project.is_public;
                            const hasCode = !!project.invite_code;
                            const linkEnabled = isPublic || project.invite_link_enabled;
                            if (!isPublic && !isCreator && !project.invite_link_enabled) return null;
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
                                                        background: project.invite_link_enabled ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.06)',
                                                        color: project.invite_link_enabled ? '#4ade80' : 'rgba(255,255,255,0.45)',
                                                    }}
                                                >
                                                    <div style={{ width: '28px', height: '15px', borderRadius: '8px', background: project.invite_link_enabled ? 'rgba(34,197,94,0.4)' : 'rgba(255,255,255,0.1)', border: project.invite_link_enabled ? '1px solid rgba(34,197,94,0.5)' : '1px solid rgba(255,255,255,0.15)', position: 'relative', flexShrink: 0 }}>
                                                        <div style={{ position: 'absolute', top: '2px', left: project.invite_link_enabled ? '14px' : '2px', width: '9px', height: '9px', borderRadius: '50%', background: project.invite_link_enabled ? '#4ade80' : 'rgba(255,255,255,0.5)', transition: 'left 0.2s' }} />
                                                    </div>
                                                    {project.invite_link_enabled ? 'Activé' : 'Désactivé'}
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
                                                    {project.invite_code}
                                                </span>
                                                <button
                                                    onClick={() => { navigator.clipboard.writeText(project.invite_code); setCopiedLink(true); setTimeout(() => setCopiedLink(false), 2000); }}
                                                    disabled={!linkEnabled}
                                                    style={{ padding: '5px 14px', borderRadius: '8px', fontSize: '0.78rem', fontWeight: 600, border: 'none', cursor: linkEnabled ? 'pointer' : 'default', background: copiedLink ? 'rgba(34,197,94,0.2)' : 'rgba(99,102,241,0.2)', color: copiedLink ? '#4ade80' : '#818cf8', flexShrink: 0, transition: 'all 0.2s' }}
                                                >
                                                    {copiedLink ? '✓ Copié' : 'Copier le code'}
                                                </button>
                                            </div>
                                            {/* Full link row */}
                                            <div className="flex items-center gap-2" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '10px', padding: '0.5rem 0.9rem' }}>
                                                <span style={{ flex: 1, fontSize: '0.78rem', fontFamily: 'monospace', opacity: 0.5, wordBreak: 'break-all' }}>
                                                    {typeof window !== 'undefined' ? window.location.origin : ''}/join/{project.invite_code}
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
                                    const memberPerc = Math.min(100, Math.round(((m.completed_hours ?? 0) / (project.target_hours || 1)) * 100));
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
                                                        <span style={{ fontSize: '0.65rem', background: m.role === 'admin' || project.creator_id === m.user_id ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255, 255, 255, 0.1)', color: m.role === 'admin' || project.creator_id === m.user_id ? '#fcd34d' : '#cbd5e1', borderRadius: '6px', padding: '2px 8px', fontWeight: 600 }}>
                                                            {project.creator_id === m.user_id ? 'Créateur' : m.role === 'admin' ? 'Admin' : 'Membre'}
                                                        </span>
                                                        {user?.uid === project.creator_id && !isMe && project.creator_id !== m.user_id && (
                                                            <select
                                                                className="text-xs bg-black/40 border border-white/10 rounded px-1 py-0.5 text-slate-300 ml-1 cursor-pointer hover:border-white/30"
                                                                value={m.role || 'member'}
                                                                onChange={(e) => handleUpdateRole(m.id, e.target.value as 'admin' | 'member')}
                                                                onClick={(e) => e.stopPropagation()}
                                                            >
                                                                <option value="member" className="bg-[#1a1a2e]">Membre</option>
                                                                <option value="admin" className="bg-[#1a1a2e]">Admin</option>
                                                            </select>
                                                        )}
                                                        {(user?.uid === project.creator_id || memberships.find(mb => mb.user_id === user?.uid)?.role === 'admin') && !isMe && project.creator_id !== m.user_id && (
                                                            <button
                                                                title="Retirer du salon"
                                                                onClick={e => { e.stopPropagation(); handleRemoveMember(m.id, m.user_id); }}
                                                                style={{ marginLeft: '4px', padding: '2px 6px', borderRadius: '6px', border: '1px solid rgba(239,68,68,0.25)', background: 'rgba(239,68,68,0.07)', color: '#f87171', cursor: 'pointer', fontSize: '0.65rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '3px', flexShrink: 0, transition: 'all 0.15s' }}
                                                                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.18)'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.5)'; }}
                                                                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.07)'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.25)'; }}
                                                            >
                                                                <X size={10} /> Retirer
                                                            </button>
                                                        )}
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
                                                {fmtHours(m.completed_hours ?? 0)} / {project.target_hours}h {project.goal_frequency === 'daily' ? '/ jour' : project.goal_frequency === 'weekly' ? '/ semaine' : project.goal_frequency === 'monthly' ? '/ mois' : ''}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* ── Invite a member ── */}
                            {(user?.uid === project.creator_id || memberships.find(m => m.user_id === user?.uid)?.role === 'admin') && (
                                <div style={{ marginTop: '2rem', padding: '1.5rem', borderRadius: '16px', background: 'rgba(99,102,241,0.04)', border: '1px solid rgba(99,102,241,0.15)' }}>
                                    <div className="flex items-center gap-3 mb-4">
                                        <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                            <UserPlus size={16} style={{ color: '#818cf8' }} />
                                        </div>
                                        <div>
                                            <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#a5b4fc' }}>Inviter un membre</div>
                                            <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.35)', marginTop: '1px' }}>L'invitation apparaîtra dans les notifications de la personne</div>
                                        </div>
                                    </div>
                                    <form onSubmit={handleInviteMemberByEmail} style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                                        <div style={{ flex: 1, minWidth: '200px' }}>
                                            <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Adresse email</label>
                                            <input
                                                type="email"
                                                className="input"
                                                placeholder="prenom@exemple.com"
                                                value={inviteEmail}
                                                onChange={e => { setInviteEmail(e.target.value); setInviteMsg(null); }}
                                                required
                                                style={{ fontSize: '0.9rem', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}
                                            />
                                        </div>
                                        <div style={{ minWidth: '130px' }}>
                                            <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Rôle</label>
                                            <select
                                                className="input"
                                                value={inviteRole}
                                                onChange={e => setInviteRole(e.target.value as 'admin' | 'member')}
                                                style={{ fontSize: '0.9rem', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}
                                            >
                                                <option value="member">Membre</option>
                                                <option value="admin">Admin</option>
                                            </select>
                                        </div>
                                        <button
                                            type="submit"
                                            disabled={inviting || !inviteEmail.trim()}
                                            style={{
                                                padding: '10px 20px', borderRadius: '12px', fontWeight: 700, fontSize: '0.85rem', cursor: inviting || !inviteEmail.trim() ? 'default' : 'pointer',
                                                background: inviting || !inviteEmail.trim() ? 'rgba(99,102,241,0.15)' : 'rgba(99,102,241,0.85)',
                                                color: inviting || !inviteEmail.trim() ? 'rgba(165,180,252,0.4)' : '#fff',
                                                border: '1px solid rgba(99,102,241,0.3)', transition: 'all 0.2s',
                                                display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0,
                                            }}
                                        >
                                            <UserPlus size={15} />
                                            {inviting ? 'Envoi...' : 'Inviter'}
                                        </button>
                                    </form>
                                    {inviteMsg && (
                                        <div style={{
                                            marginTop: '10px', padding: '8px 12px', borderRadius: '10px', fontSize: '0.82rem', fontWeight: 600,
                                            background: inviteMsg.type === 'success' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                                            color: inviteMsg.type === 'success' ? '#4ade80' : '#f87171',
                                            border: `1px solid ${inviteMsg.type === 'success' ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)'}`,
                                        }}>
                                            {inviteMsg.type === 'success' ? '✓ ' : '✕ '}{inviteMsg.text}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}

                {/* TAB: CHAT */}
                {activeTab === 'chat' && (
                    <motion.div key="chat" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -15 }} transition={{ duration: 0.25, ease: "easeInOut" }} className="tab-pane active">
                        <div style={{ height: 'calc(100vh - 180px)', minHeight: 640, display: 'flex', flexDirection: 'column', background: 'rgba(8,8,16,0.85)', borderRadius: 18, border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden' }}>

                            {/* Header */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 22px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)', flexShrink: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                        <MessageSquare size={15} style={{ color: '#818cf8' }} />
                                    </div>
                                    <div>
                                        <p style={{ margin: 0, fontSize: '0.88rem', fontWeight: 700, color: '#f0f0f8', letterSpacing: '-0.01em' }}>{t('room_chat_title')}</p>
                                        <p style={{ margin: 0, fontSize: '0.67rem', color: 'rgba(255,255,255,0.25)' }}>{messages.length} message{messages.length !== 1 ? 's' : ''} · mentionnez avec @</p>
                                    </div>
                                </div>
                                {(project?.pinned_messages || []).length > 0 && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.72rem', color: 'rgba(165,180,252,0.7)', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.18)', borderRadius: 8, padding: '4px 10px' }}>
                                        <Pin size={11} /> {(project.pinned_messages as string[]).length} épinglé{(project.pinned_messages as string[]).length > 1 ? 's' : ''}
                                    </div>
                                )}
                            </div>

                            {/* Pinned banner */}
                            {(project?.pinned_messages || []).length > 0 && (() => {
                                const pinned = (project.pinned_messages as string[]).map((pid: string) => messages.find(m => m.id === pid)).filter(Boolean);
                                if (!pinned.length) return null;
                                return (
                                    <div style={{ borderBottom: '1px solid rgba(99,102,241,0.15)', background: 'rgba(99,102,241,0.05)', padding: '8px 22px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                        {pinned.map((m: any) => (
                                            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <Pin size={10} style={{ color: '#818cf8', flexShrink: 0 }} />
                                                <span style={{ fontSize: '0.76rem', color: 'rgba(255,255,255,0.55)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                                                    <span style={{ fontWeight: 700, color: '#a5b4fc', marginRight: 5 }}>{m.user_name}</span>{m.content}
                                                </span>
                                                {project?.creator_id === user?.uid && (
                                                    <button onClick={() => handlePinMessage(m.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.25)', padding: 2, flexShrink: 0, display: 'flex' }} title="Désépingler"><X size={12} /></button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                );
                            })()}

                            {/* Messages */}
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
                                    const isCreator = project?.creator_id === user?.uid;
                                    const isPinned = (project?.pinned_messages || []).includes(msg.id);
                                    const canPin = isCreator && ((project?.pinned_messages || []).length < 3 || isPinned);
                                    const time = msg.created_at ? new Date(msg.created_at.toMillis()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '…';
                                    const prevMsg = messages[idx - 1];
                                    const sameAsPrev = prevMsg?.user_id === msg.user_id && prevMsg?.type !== 'system' && msg.user_id !== 'system' && !msg.reply_to;

                                    if (isSystem) return (
                                        <div key={msg.id} style={{ display: 'flex', justifyContent: 'center', padding: '10px 0' }}>
                                            <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.35)', background: 'rgba(255,255,255,0.05)', padding: '4px 14px', borderRadius: 20, border: '1px solid rgba(255,255,255,0.08)' }}>{msg.content}</span>
                                        </div>
                                    );

                                    return (
                                        <div key={msg.id} style={{ marginTop: sameAsPrev ? 2 : 14, position: 'relative' }}
                                            onMouseEnter={() => setHoverMsgId(msg.id)} onMouseLeave={() => setHoverMsgId(null)}>

                                            {isMe ? (
                                                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                                    <div style={{ maxWidth: '68%' }}>
                                                        {!sameAsPrev && (
                                                            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
                                                                <span style={{ fontSize: '0.63rem', color: 'rgba(255,255,255,0.22)' }}>{time}</span>
                                                                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#818cf8' }}>Vous</span>
                                                                {isPinned && <Pin size={10} style={{ color: '#818cf8' }} />}
                                                            </div>
                                                        )}
                                                        {msg.reply_to && (
                                                            <div style={{ marginBottom: 4, padding: '5px 10px', borderLeft: '2px solid #6366f1', background: 'rgba(99,102,241,0.08)', borderRadius: '0 8px 8px 0', fontSize: '0.75rem' }}>
                                                                <span style={{ fontWeight: 700, color: '#818cf8', marginRight: 5 }}>{msg.reply_to.user_name}</span>
                                                                <span style={{ color: 'rgba(255,255,255,0.4)' }}>{msg.reply_to.content.slice(0, 70)}{msg.reply_to.content.length > 70 ? '…' : ''}</span>
                                                            </div>
                                                        )}
                                                        <div style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', borderRadius: `${sameAsPrev ? 6 : 18}px 18px ${sameAsPrev ? 6 : 4}px 18px`, padding: '9px 14px', color: '#fff', fontSize: '0.875rem', lineHeight: 1.6, wordBreak: 'break-word', boxShadow: '0 2px 14px rgba(79,70,229,0.28)' }}>
                                                            {renderMessageContent(msg.content)}
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
                                                        {msg.reply_to && (
                                                            <div style={{ marginBottom: 4, padding: '5px 10px', borderLeft: '2px solid #6366f1', background: 'rgba(99,102,241,0.08)', borderRadius: '0 8px 8px 0', fontSize: '0.75rem' }}>
                                                                <span style={{ fontWeight: 700, color: '#818cf8', marginRight: 5 }}>{msg.reply_to.user_name}</span>
                                                                <span style={{ color: 'rgba(255,255,255,0.4)' }}>{msg.reply_to.content.slice(0, 70)}{msg.reply_to.content.length > 70 ? '…' : ''}</span>
                                                            </div>
                                                        )}
                                                        <p style={{ margin: 0, fontSize: '0.875rem', color: 'rgba(255,255,255,0.85)', lineHeight: 1.6, wordBreak: 'break-word' }}>{renderMessageContent(msg.content)}</p>
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
                                                    <button onClick={() => { setReplyingTo({ id: msg.id, user_name: msg.user_name, content: msg.content }); chatInputRef.current?.focus(); }}
                                                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '3px 6px', borderRadius: 6, borderLeft: '1px solid rgba(255,255,255,0.08)', marginLeft: 2, color: 'rgba(255,255,255,0.4)', fontSize: '0.72rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3 }}
                                                        title="Répondre">↩ Rép.</button>
                                                    {(canPin || isPinned) && (
                                                        <button onClick={() => handlePinMessage(msg.id)}
                                                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '3px 5px', borderRadius: 6, borderLeft: '1px solid rgba(255,255,255,0.08)', marginLeft: 0, color: isPinned ? '#a5b4fc' : 'rgba(255,255,255,0.35)', display: 'flex', alignItems: 'center' }}
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

                            {/* Input area */}
                            <div style={{ padding: '8px 16px 16px', flexShrink: 0, background: 'rgba(0,0,0,0.2)', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                                {/* Reply banner */}
                                {replyingTo && (
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, padding: '6px 12px', background: 'rgba(99,102,241,0.08)', borderLeft: '2px solid #6366f1', borderRadius: '0 8px 8px 0', fontSize: '0.77rem' }}>
                                        <div><span style={{ fontWeight: 700, color: '#818cf8', marginRight: 6 }}>↩ {replyingTo.user_name}</span><span style={{ color: 'rgba(255,255,255,0.38)' }}>{replyingTo.content.slice(0, 60)}{replyingTo.content.length > 60 ? '…' : ''}</span></div>
                                        <button onClick={() => setReplyingTo(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.25)', padding: 2, display: 'flex' }}><X size={13} /></button>
                                    </div>
                                )}
                                {/* @mention dropdown */}
                                {mentionQuery !== null && (
                                    <div style={{ marginBottom: 6, background: 'rgba(14,14,26,0.98)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.5)' }}>
                                        {memberships.filter((m: any) => m.full_name?.toLowerCase().includes(mentionQuery)).slice(0, 5).map((m: any) => (
                                            <button key={m.user_id} type="button" onClick={() => insertMention(m.full_name)}
                                                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', transition: 'background 0.12s' }}
                                                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')} onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                                                <Avatar uid={m.user_id} avatarUrl={m.user?.avatar_url} avatarStyle={m.user?.avatar_style} size={26} />
                                                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'rgba(255,255,255,0.8)' }}>{m.full_name}</span>
                                            </button>
                                        ))}
                                        {memberships.filter((m: any) => m.full_name?.toLowerCase().includes(mentionQuery)).length === 0 && (
                                            <div style={{ padding: '8px 14px', fontSize: '0.78rem', color: 'rgba(255,255,255,0.3)' }}>Aucun membre trouvé</div>
                                        )}
                                    </div>
                                )}
                                <form onSubmit={handleSendMessage} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 14, padding: '6px 6px 6px 16px', transition: 'border-color 0.15s' }}
                                    onFocusCapture={e => (e.currentTarget.style.borderColor = 'rgba(99,102,241,0.4)')}
                                    onBlurCapture={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.09)')}>
                                    <input ref={chatInputRef} type="text" value={newMessage} onChange={handleChatInputChange} placeholder={t('room_chat_placeholder')} required autoComplete="off"
                                        style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: '0.9rem', color: '#f0f0f8', padding: 0 }} />
                                    <button type="submit" style={{ width: 38, height: 38, flexShrink: 0, borderRadius: 10, background: newMessage.trim() ? 'linear-gradient(135deg,#4f46e5,#7c3aed)' : 'rgba(255,255,255,0.05)', border: 'none', cursor: newMessage.trim() ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s', boxShadow: newMessage.trim() ? '0 2px 10px rgba(79,70,229,0.35)' : 'none' }}>
                                        <Send size={15} style={{ color: newMessage.trim() ? '#fff' : 'rgba(255,255,255,0.25)', marginLeft: 1 }} />
                                    </button>
                                </form>
                            </div>
                        </div>
                    </motion.div>
                )}

                {/* TAB: AI CHAT */}
                {activeTab === 'ai-chat' && (
                    <motion.div key="ai-chat" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -15 }} transition={{ duration: 0.25, ease: "easeInOut" }} className="tab-pane active">
                        <div style={{ height: 'calc(100vh - 180px)', minHeight: 640, display: 'flex', flexDirection: 'column', background: 'rgba(8,6,16,0.9)', borderRadius: 18, border: '1px solid rgba(236,72,153,0.18)', overflow: 'hidden' }}>

                            {/* Header */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 22px', borderBottom: '1px solid rgba(236,72,153,0.12)', background: 'rgba(236,72,153,0.03)', flexShrink: 0 }}>
                                <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(236,72,153,0.12)', border: '1px solid rgba(236,72,153,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    <Bot size={15} style={{ color: '#f472b6' }} />
                                </div>
                                <div>
                                    <p style={{ margin: 0, fontSize: '0.88rem', fontWeight: 700, color: '#f0f0f8' }}>{t('room_ai_coach_title')}</p>
                                    <p style={{ margin: 0, fontSize: '0.67rem', color: 'rgba(255,255,255,0.25)' }}>Propulsé par Claude · Contexte du projet chargé</p>
                                </div>
                            </div>

                            {/* Messages */}
                            <div id="ai-chat-messages" className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '16px 22px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {aiMessages.length === 0 ? (
                                    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, opacity: 0.4 }}>
                                        <div style={{ width: 52, height: 52, borderRadius: 16, background: 'rgba(236,72,153,0.1)', border: '1px solid rgba(236,72,153,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <Bot size={24} style={{ color: '#f472b6' }} />
                                        </div>
                                        <p style={{ margin: 0, fontSize: '0.85rem', textAlign: 'center', maxWidth: 260, lineHeight: 1.5 }}>{t('room_ai_coach_empty').replace('{}', project.title)}</p>
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
                    </motion.div>
                )}

                {/* TAB: PROJECT BOARD */}
                {activeTab === 'milestones' && (
                    <motion.div
                        key="milestones"
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -15 }}
                        transition={{ duration: 0.25, ease: "easeInOut" }}
                        className="tab-pane active h-full"
                        style={{ minHeight: '600px' }}>
                        <ProjectBoard projectId={id as string} user={user} projectMembers={memberships} onActivity={logActivity} sessions={sessions} projectTitle={project?.title || 'Projet'} />
                    </motion.div>
                )}

                {/* TAB: POLLS */}
                {activeTab === 'polls' && (
                    <motion.div
                        key="polls"
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -15 }}
                        transition={{ duration: 0.25, ease: "easeInOut" }}
                        className="tab-pane active" >
                        <div className="flex justify-between items-center mb-6" style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: '1.25rem' }}>
                            <h3 className="flex items-center gap-2 m-0" style={{ fontSize: '1.15rem', fontWeight: 700 }}><BarChart2 style={{ color: 'var(--color-primary)' }} size={20} /> Sondages du Salon</h3>
                            <button className="btn btn-primary btn-sm shadow-glow" onClick={() => setShowPollForm(v => !v)}>
                                {showPollForm ? 'Annuler' : '+ Créer un sondage'}
                            </button>
                        </div>

                        {showPollForm && (
                            <form onSubmit={handleCreatePoll} className="card card-glass mb-6 flex flex-col gap-4 fade-enter" style={{ border: '1px solid var(--color-primary)', background: 'rgba(99,102,241,0.04)' }}>
                                <h4 className="m-0 text-primary">Nouveau sondage</h4>
                                <div className="flex flex-col gap-1">
                                    <label style={{ fontSize: '0.85rem', opacity: 0.7 }}>Question*</label>
                                    <input className="input" placeholder="Ex: Quel jour convient le mieux pour la prochaine session ?" value={newPoll.question} onChange={e => setNewPoll(p => ({ ...p, question: e.target.value }))} required />
                                </div>
                                <div className="flex flex-col gap-2">
                                    <label style={{ fontSize: '0.85rem', opacity: 0.7 }}>Options* (min. 2)</label>
                                    {newPoll.options.map((opt, i) => (
                                        <div key={i} className="flex gap-2 items-center">
                                            <input
                                                className="input flex-1"
                                                placeholder={`Option ${i + 1}`}
                                                value={opt}
                                                onChange={e => setNewPoll(p => { const opts = [...p.options]; opts[i] = e.target.value; return { ...p, options: opts }; })}
                                            />
                                            {newPoll.options.length > 2 && (
                                                <button type="button" className="btn btn-sm btn-ghost text-secondary" onClick={() => setNewPoll(p => ({ ...p, options: p.options.filter((_, j) => j !== i) }))}>✕</button>
                                            )}
                                        </div>
                                    ))}
                                    {newPoll.options.length < 6 && (
                                        <button type="button" className="btn btn-sm btn-ghost text-secondary" style={{ alignSelf: 'flex-start' }} onClick={() => setNewPoll(p => ({ ...p, options: [...p.options, ''] }))}>+ Ajouter une option</button>
                                    )}
                                </div>
                                <button type="submit" className="btn btn-primary" disabled={creatingPoll}>
                                    {creatingPoll ? 'Création...' : '✅ Créer le sondage'}
                                </button>
                            </form>
                        )}

                        {polls.length === 0 ? (
                            <div className="card card-glass text-center py-16">
                                <BarChart2 size={48} className="text-primary mx-auto mb-4 opacity-50" />
                                <h3 className="text-secondary mb-2">Aucun sondage créé</h3>
                                <p>Créez un sondage pour recueillir l'avis de votre groupe sur n'importe quel sujet.</p>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-5">
                                {polls.map((poll, idx) => {
                                    const totalVotes = poll.options.reduce((sum, o) => sum + o.votes.length, 0);
                                    const userVotedFor = poll.options.findIndex(o => user && o.votes.includes(user.uid));
                                    const winnerVotes = Math.max(...poll.options.map(o => o.votes.length));
                                    return (
                                        <div key={poll.id} className="card card-glass fade-enter" style={{ animationDelay: `${idx * 0.06}s`, border: poll.closed ? '1px solid var(--color-border)' : '1px solid rgba(99,102,241,0.25)', opacity: poll.closed ? 0.7 : 1 }}>
                                            <div className="flex justify-between items-start gap-3 flex-wrap mb-4">
                                                <div>
                                                    {poll.closed && <span className="badge text-secondary" style={{ fontSize: '0.7rem', padding: '2px 8px', marginBottom: '4px', display: 'inline-block' }}>🔒 Terminé</span>}
                                                    <h4 className="m-0">{poll.question}</h4>
                                                    <p className="text-sm text-secondary m-0 mt-1">Par {poll.creator_name} · {totalVotes} vote{totalVotes !== 1 ? 's' : ''}</p>
                                                </div>
                                                {user && poll.creator_id === user.uid && (
                                                    <button
                                                        className={`btn btn-sm ${poll.closed ? 'btn-outline' : 'btn-ghost text-secondary'}`}
                                                        onClick={() => handleClosePoll(poll)}
                                                        style={{ fontSize: '0.8rem', flexShrink: 0 }}
                                                    >
                                                        {poll.closed ? '🔓 Rouvrir' : '🔒 Clôturer'}
                                                    </button>
                                                )}
                                            </div>

                                            <div className="flex flex-col gap-3">
                                                {poll.options.map((opt, oi) => {
                                                    const pct = totalVotes > 0 ? Math.round((opt.votes.length / totalVotes) * 100) : 0;
                                                    const isMyVote = user && opt.votes.includes(user.uid);
                                                    const isWinner = opt.votes.length === winnerVotes && winnerVotes > 0 && poll.closed;
                                                    return (
                                                        <div key={oi}>
                                                            <div className="flex justify-between items-center mb-1">
                                                                <button
                                                                    type="button"
                                                                    disabled={poll.closed}
                                                                    className="flex items-center gap-2 text-left w-full"
                                                                    style={{ background: 'none', border: 'none', cursor: poll.closed ? 'default' : 'pointer', padding: 0 }}
                                                                    onClick={() => !poll.closed && handleVote(poll, oi)}
                                                                >
                                                                    <div style={{
                                                                        width: '18px', height: '18px', borderRadius: '50%', flexShrink: 0,
                                                                        border: `2px solid ${isMyVote ? 'var(--color-primary)' : 'var(--color-border)'}`,
                                                                        background: isMyVote ? 'var(--color-primary)' : 'transparent',
                                                                        transition: 'all 0.2s ease',
                                                                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                                                                    }}>
                                                                        {isMyVote && <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#fff' }} />}
                                                                    </div>
                                                                    <span style={{ fontWeight: isMyVote ? 600 : 400, flex: 1 }}>{opt.text}</span>
                                                                    {isWinner && <span style={{ fontSize: '0.75rem' }}>🏆</span>}
                                                                </button>
                                                                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: isMyVote ? 'var(--color-primary)' : 'inherit', minWidth: '36px', textAlign: 'right' }}>{pct}%</span>
                                                            </div>
                                                            {/* Progress bar */}
                                                            <div style={{ height: '6px', borderRadius: '4px', background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                                                                <div style={{
                                                                    height: '100%',
                                                                    width: `${pct}%`,
                                                                    borderRadius: '4px',
                                                                    background: isMyVote
                                                                        ? 'linear-gradient(90deg, var(--color-primary), var(--color-secondary))'
                                                                        : 'rgba(255,255,255,0.15)',
                                                                    transition: 'width 0.5s cubic-bezier(0.4,0,0.2,1)',
                                                                    boxShadow: isMyVote ? '0 0 8px rgba(99,102,241,0.5)' : 'none'
                                                                }} />
                                                            </div>
                                                            <div style={{ fontSize: '0.75rem', opacity: 0.4, marginTop: '2px' }}>{opt.votes.length} vote{opt.votes.length !== 1 ? 's' : ''}</div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                )}
                    </motion.div>
                )}

                {/* TAB: AGENDA */}
                {activeTab === 'agenda' && (
                    <motion.div
                        key="agenda"
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -15 }}
                        transition={{ duration: 0.25, ease: "easeInOut" }}
                        className="tab-pane active" >
                        <div className="flex justify-between items-center mb-6" style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: '1rem' }}>
                            <h3 className="flex items-center gap-2 m-0"><Calendar className="text-primary" /> {t('agenda_title')}</h3>
                            <div className="flex gap-2">
                                {sessions.length > 0 && (
                                    <button
                                        className="btn btn-sm btn-ghost text-red-400 hover:bg-red-500/10"
                                        style={{ fontSize: '0.8rem', border: '1px solid rgba(239, 68, 68, 0.2)' }}
                                        onClick={handleDeleteAllSessions}
                                    >
                                        <Trash2 size={14} /> Tout supprimer
                                    </button>
                                )}
                                <button
                                    className="btn btn-sm btn-outline shadow-glow"
                                    onClick={() => { setShowAgendaAI(v => !v); setShowSessionForm(false); }}
                                    style={{ fontSize: '0.8rem' }}
                                >
                                    {showAgendaAI ? '✕ Fermer IA' : '🤖 Générer avec l\'IA'}
                                </button>
                                <button
                                    className="btn btn-primary btn-sm shadow-glow"
                                    onClick={() => { setShowSessionForm(v => !v); setShowAgendaAI(false); }}
                                >
                                    {showSessionForm ? t('agenda_btn_cancel') : t('agenda_btn_add')}
                                </button>
                            </div>
                        </div>

                        {showAgendaAI && (
                            <div className="card card-glass mb-6 fade-enter" style={{ background: 'rgba(99,102,241,0.05)', border: '1px solid var(--color-primary)', padding: '1.25rem' }}>
                                <h4 className="flex items-center gap-2 m-0 mb-3 text-primary"><Bot size={18} /> Générer un planning</h4>
                                <p className="text-sm opacity-80 mb-4">L'IA va créer des sessions pour les 2 prochaines semaines selon le rythme choisi, parfait pour lancer le salon sans effort.</p>

                                <div className="flex gap-3 mb-4 flex-wrap">
                                    {[
                                        { id: 'leger', label: 'Léger', desc: '2-3 sessions' },
                                        { id: 'regulier', label: 'Régulier', desc: '4-6 sessions' },
                                        { id: 'intensif', label: 'Intensif', desc: '8-10 sessions' }
                                    ].map(r => (
                                        <div
                                            key={r.id}
                                            onClick={() => setAgendaRhythm(r.id as any)}
                                            style={{
                                                flex: 1, minWidth: '100px', cursor: 'pointer',
                                                border: agendaRhythm === r.id ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                                                background: agendaRhythm === r.id ? 'rgba(99,102,241,0.1)' : 'transparent',
                                                padding: '0.75rem', borderRadius: '12px', textAlign: 'center', transition: 'all 0.2s',
                                                transform: agendaRhythm === r.id ? 'translateY(-2px)' : 'none'
                                            }}
                                        >
                                            <div style={{ fontWeight: 700, color: agendaRhythm === r.id ? 'var(--color-primary)' : 'inherit' }}>{r.label}</div>
                                            <div style={{ fontSize: '0.75rem', opacity: 0.6, marginTop: '2px' }}>{r.desc}</div>
                                        </div>
                                    ))}
                                </div>

                                <div className="mb-4">
                                    <label style={{ fontSize: '0.85rem', opacity: 0.8, display: 'block', marginBottom: '4px' }}>Préférences d'horaires (optionnel)</label>
                                    <input
                                        type="text"
                                        className="input w-full"
                                        placeholder="Ex: Plutôt le soir après 18h, le week-end, uniquement le matin..."
                                        value={agendaTimePref}
                                        onChange={e => setAgendaTimePref(e.target.value)}
                                        style={{ fontSize: '0.85rem' }}
                                    />
                                </div>

                                <button
                                    className="btn btn-primary w-full shadow-glow"
                                    style={{ justifyContent: 'center' }}
                                    onClick={handleGenerateSmartAgenda}
                                    disabled={generatingAI}
                                >
                                    {generatingAI ? (
                                        <><div style={{ width: '16px', height: '16px', borderRadius: '50%', border: '2px solid #fff', borderTopColor: 'transparent', animation: 'spin 1s linear infinite' }} /> Génération du Smart Agenda...</>
                                    ) : '✨ Générer Smart Agenda'}
                                </button>
                            </div>
                )}

                        {showSessionForm && (
                            <form onSubmit={handleCreateSession} className="card mb-6 flex flex-col gap-4 fade-enter" style={{ background: '#161620', border: '1px solid rgba(99,102,241,0.4)', borderRadius: '14px' }}>
                                <h4 className="m-0 text-primary">{t('agenda_form_title')}</h4>
                                <div className="flex flex-col gap-1">
                                    <label style={{ fontSize: '0.85rem', opacity: 0.7 }}>{t('agenda_label_title')}</label>
                                    <input className="input" placeholder={t('agenda_placeholder_title')} value={newSession.title} onChange={e => setNewSession(s => ({ ...s, title: e.target.value }))} required />
                                </div>
                                <div className="flex gap-4 flex-wrap">
                                    <div className="flex flex-col gap-1 flex-1">
                                        <label style={{ fontSize: '0.85rem', opacity: 0.7 }}>{t('agenda_label_type')}</label>
                                        <select className="input" value={newSession.type} onChange={e => setNewSession(s => ({ ...s, type: e.target.value as 'travail' | 'discussion' | 'recherche' }))}>
                                            <option value="travail">{t('agenda_type_work')}</option>
                                            <option value="discussion">{t('agenda_type_discussion')}</option>
                                            <option value="recherche">{t('agenda_type_research')}</option>
                                        </select>
                                    </div>
                                    <div className="flex flex-col gap-1" style={{ minWidth: '200px' }}>
                                        <label style={{ fontSize: '0.85rem', opacity: 0.7 }}>{t('agenda_label_date')}</label>
                                        <CalendarPicker
                                            value={newSession.scheduled_at}
                                            onChange={v => setNewSession(s => ({ ...s, scheduled_at: v }))}
                                            placeholder={t('agenda_label_date')}
                                            required
                                        />
                                    </div>
                                    <div className="flex flex-col gap-1" style={{ minWidth: '170px' }}>
                                        <label style={{ fontSize: '0.85rem', opacity: 0.7 }}>🔄 Récurrence</label>
                                        <select className="input" value={newSession.recurring} onChange={e => setNewSession(s => ({ ...s, recurring: e.target.value as any }))}>
                                            <option value="none">Aucune (une seule fois)</option>
                                            <option value="weekly">Chaque semaine (×4)</option>
                                            <option value="biweekly">Toutes les 2 semaines (×4)</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="flex flex-col gap-1">
                                    <label style={{ fontSize: '0.85rem', opacity: 0.7 }}>{t('agenda_label_desc')}</label>
                                    <textarea className="input" rows={2} placeholder={t('agenda_desc_placeholder')} value={newSession.description} onChange={e => setNewSession(s => ({ ...s, description: e.target.value }))} />
                                </div>
                                <button type="submit" className="btn btn-primary" disabled={creatingSession}>
                                    {creatingSession ? t('agenda_creating') : t('agenda_btn_create')}
                                </button>
                            </form>
                        )}

                        {sessions.length === 0 ? (
                            <div className="card card-glass text-center py-16">
                                <Calendar size={48} className="text-primary mx-auto mb-4 opacity-50" />
                                <h3 className="text-secondary mb-2">{t('agenda_empty_title')}</h3>
                                <p>{t('agenda_empty_desc')}</p>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-4">
                                {sessions.map((s, idx) => {
                                    const isAttending = user && s.attendees.includes(user.uid);
                                    const isPast = s.scheduled_at?.toDate ? s.scheduled_at.toDate() < new Date() : new Date(s.scheduled_at) < new Date();
                                    const dateStr = s.scheduled_at?.toDate
                                        ? s.scheduled_at.toDate().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
                                        : new Date(s.scheduled_at).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
                                    return (
                                        <div key={s.id} className="card card-glass fade-enter" style={{ animationDelay: `${idx * 0.08}s`, opacity: isPast ? 0.6 : 1, borderLeft: `3px solid ${s.type === 'discussion' ? 'var(--color-secondary)' : s.type === 'recherche' ? '#7c3aed' : 'var(--color-primary)'}` }}>
                                            <div className="flex justify-between items-start gap-4">
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                        <span className={`badge text-white`} style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '12px', background: s.type === 'discussion' ? 'var(--color-secondary)' : s.type === 'recherche' ? '#7c3aed' : 'var(--color-primary)' }}>
                                                            {s.type === 'discussion' ? t('agenda_badge_discussion') : s.type === 'recherche' ? t('agenda_badge_research') : t('agenda_badge_work')}
                                                        </span>
                                                        {s.recurring && s.recurring !== 'none' && (
                                                            <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '10px', background: 'rgba(16,185,129,0.15)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)', fontWeight: 600 }}>
                                                                🔄 {s.recurring === 'weekly' ? 'Hebdo' : '2 sem.'}
                                                            </span>
                                                        )}
                                                        {isPast && <span className="badge text-secondary" style={{ fontSize: '0.7rem', padding: '2px 8px' }}>{t('agenda_badge_past')}</span>}
                                                    </div>
                                                    <h4 className="m-0 mb-1 break-words">{s.title}</h4>
                                                    <p className="text-sm text-secondary m-0">🗓 {dateStr} &nbsp;·&nbsp; {t('agenda_by')} {s.creator_name}</p>
                                                    {s.description && <p className="text-sm mt-2 mb-0 opacity-80" style={{ wordBreak: 'break-word' }}>{s.description}</p>}
                                                    <div className="flex items-center gap-2 mt-3">
                                                        <Users size={14} className="text-secondary" />
                                                        <span className="text-sm text-secondary">{s.attendees.length} participant{s.attendees.length > 1 ? 's' : ''}</span>
                                                        {/* Avatar placeholders */}
                                                        {s.attendees.slice(0, 4).map(attendeeUid => {
                                                            const member = memberships.find(m => m.user_id === attendeeUid);
                                                            return (
                                                                <Avatar
                                                                    key={attendeeUid}
                                                                    uid={attendeeUid}
                                                                    avatarUrl={member?.user?.avatar_url}
                                                                    avatarStyle={member?.user?.avatar_style}
                                                                    size={24}
                                                                    style={{ border: '2px solid var(--color-bg)', marginLeft: '-8px' }}
                                                                />
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                                {!isPast && (
                                                    <div className="flex flex-col gap-2 flex-shrink-0 items-end ml-2">
                                                        <button
                                                            className={`btn btn-sm flex-shrink-0 ${isAttending ? 'btn-outline text-secondary' : 'btn-primary shadow-glow'}`}
                                                            onClick={() => handleToggleAttendee(s)}
                                                        >
                                                            <UserPlus size={14} />
                                                            {isAttending ? t('agenda_btn_leave') : t('agenda_btn_join')}
                                                        </button>
                                                        {user && (s.creator_id === user.uid || project?.creator_id === user.uid) && (
                                                            <button
                                                                className="btn btn-sm btn-ghost text-red-400 hover:bg-red-500/10"
                                                                onClick={() => handleDeleteSession(s.id)}
                                                                title="Supprimer la session"
                                                            >
                                                                <Trash2 size={14} />
                                                            </button>
                                                        )}
                                                        {user && s.creator_id === user.uid && (
                                                            editingSessionId === s.id ? (
                                                                <div className="flex flex-col gap-2" style={{ minWidth: '220px' }}>
                                                                    <CalendarPicker
                                                                        value={editDate}
                                                                        onChange={v => setEditDate(v)}
                                                                    />
                                                                    <div className="flex gap-2">
                                                                        <button className="btn btn-sm btn-primary flex-1" onClick={() => handleUpdateSessionDate(s)} disabled={!editDate}>✓ OK</button>
                                                                        <button className="btn btn-sm btn-ghost text-secondary" onClick={() => { setEditingSessionId(null); setEditDate(''); }}>✕</button>
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                <button
                                                                    className="btn btn-sm btn-ghost text-secondary"
                                                                    style={{ fontSize: '0.8rem' }}
                                                                    onClick={() => {
                                                                        setEditingSessionId(s.id);
                                                                        const d = s.scheduled_at?.toDate ? s.scheduled_at.toDate() : new Date(s.scheduled_at);
                                                                        setEditDate(d.toISOString().slice(0, 16));
                                                                    }}
                                                                >
                                                                    {t('agenda_btn_edit_date')}
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
                    </motion.div>
                )}

                {/* TAB: RESOURCES */}
                {activeTab === 'resources' && (
                    <motion.div
                        key="resources"
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -15 }}
                        transition={{ duration: 0.25, ease: "easeInOut" }}
                        className="tab-pane active" >

                        {/* ── Section 1: Fichiers & liens partagés ── */}
                        <div className="flex justify-between items-start mb-6 flex-wrap gap-3" style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: '1.25rem' }}>
                            <div>
                                <h3 className="flex items-center gap-2 m-0" style={{ fontSize: '1.15rem' }}><FileUp className="text-primary" size={20} /> Fichiers & liens partagés</h3>
                                <p className="text-sm text-secondary m-0 mt-1">Partagés avec tous les membres du salon</p>
                            </div>
                            <button
                                className="btn btn-sm btn-ghost"
                                style={{ border: '1px solid var(--color-border)', fontSize: '0.82rem' }}
                                onClick={() => setShowAddResource(v => !v)}
                            >
                                {showAddResource ? '✕ Annuler' : '+ Ajouter manuellement'}
                            </button>
                        </div>

                        {/* Add form */}
                        {showAddResource && (
                            <div className="card card-glass mb-5 flex flex-col gap-4 fade-enter" style={{ border: '1px solid var(--color-primary)', background: 'rgba(99,102,241,0.04)', padding: '1rem' }}>
                                <h5 className="m-0 text-primary" style={{ fontSize: '0.9rem' }}>Nouveau fichier / lien</h5>
                                {/* Type toggle */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 4 }}>
                                    {(['link', 'file'] as const).map(type => (
                                        <button key={type} onClick={() => { setResType(type); setResTitle(''); setResUrl(''); setResFile(null); }} style={{
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                            padding: '8px 0', borderRadius: 8, border: 'none', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s',
                                            background: resType === type ? 'var(--color-primary)' : 'transparent',
                                            color: resType === type ? '#fff' : 'var(--color-text-secondary)',
                                        }}>
                                            {type === 'link' ? <><LinkIcon size={13} /> Lien</> : <><FileUp size={13} /> Fichier</>}
                                        </button>
                                    ))}
                                </div>

                                {resType === 'link' ? (
                                    <>
                                        <input className="input" placeholder="Titre *" value={resTitle} onChange={e => setResTitle(e.target.value)} />
                                        <input className="input" placeholder="URL (optionnel)" value={resUrl} onChange={e => setResUrl(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleAddResource(); }} />
                                    </>
                                ) : (
                                    <>
                                        <label className="flex flex-col items-center justify-center gap-2 cursor-pointer" style={{
                                            padding: '20px', borderRadius: 10, border: `1px dashed ${resFile ? 'var(--color-primary)' : 'var(--color-border)'}`,
                                            background: resFile ? 'rgba(99,102,241,0.06)' : 'rgba(255,255,255,0.02)', transition: 'all 0.15s',
                                        }}>
                                            <Upload size={18} style={{ color: resFile ? 'var(--color-primary)' : 'var(--color-text-secondary)' }} />
                                            <span className="text-sm" style={{ color: resFile ? 'var(--color-primary)' : 'var(--color-text-secondary)', textAlign: 'center', wordBreak: 'break-all' }}>
                                                {resFile ? resFile.name : 'Cliquer pour choisir un fichier'}
                                            </span>
                                            <input type="file" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) { setResFile(f); if (!resTitle) setResTitle(f.name); } }} />
                                        </label>
                                        <input className="input" placeholder="Titre (optionnel)" value={resTitle} onChange={e => setResTitle(e.target.value)} />
                                    </>
                                )}

                                {resUploading && (
                                    <div className="w-full rounded-full overflow-hidden" style={{ height: 4, background: 'var(--color-border)' }}>
                                        <div className="h-full bg-primary transition-all duration-300" style={{ width: `${resUploadProgress}%` }} />
                                    </div>
                )}

                                <div className="flex gap-3">
                                    <button className="btn btn-sm btn-ghost text-secondary flex-1" style={{ border: '1px solid var(--color-border)' }} onClick={() => { setShowAddResource(false); setResTitle(''); setResUrl(''); setResFile(null); }}>Annuler</button>
                                    <button className="btn btn-sm btn-primary flex-1" onClick={handleAddResource} disabled={resUploading || (resType === 'link' ? !resTitle.trim() : !resFile)}>
                                        {resUploading ? `Envoi ${resUploadProgress}%…` : '✓ Ajouter'}
                                    </button>
                                </div>
                            </div>
                )}

                        {/* Shared files list */}
                        {sharedFiles.length === 0 && !showAddResource ? (
                            <div className="card card-glass text-center py-10 mb-8">
                                <FileUp size={32} className="text-secondary mx-auto mb-3 opacity-40" />
                                <p className="text-secondary m-0">Aucun fichier partagé pour l&apos;instant.</p>
                                <p className="text-sm opacity-50 mt-1">Ajoutez des documents, liens ou ressources utiles pour tous les membres.</p>
                            </div>
                        ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '1rem', marginBottom: '2.5rem' }}>
                                {sharedFiles.map((f, idx) => (
                                    <div key={f.id} className="card card-glass fade-enter flex items-center gap-4" style={{ animationDelay: `${idx * 0.06}s`, background: 'rgba(255,255,255,0.02)', padding: '1.1rem 1.3rem' }}>
                                        <div className={`p-2.5 rounded-lg flex-shrink-0 ${f.type === 'file' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-indigo-500/10 text-indigo-400'}`}>
                                            {f.type === 'file' ? <FileText size={18} /> : <LinkIcon size={18} />}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="m-0 font-semibold truncate">{f.title}</p>
                                            <p className="m-0 text-xs text-secondary mt-0.5">
                                                par {f.added_by_name}
                                                {f.file_size ? ` · ${f.file_size > 1024 * 1024 ? (f.file_size / 1024 / 1024).toFixed(1) + ' MB' : Math.round(f.file_size / 1024) + ' KB'}` : ''}
                                            </p>
                                        </div>
                                        <div className="flex gap-2 flex-shrink-0">
                                            {f.url && (
                                                <a href={f.url} target="_blank" rel="noopener noreferrer"
                                                    className="btn btn-sm btn-ghost p-2 text-slate-300" style={{ border: '1px solid var(--color-border)' }}
                                                    title={f.type === 'file' ? 'Télécharger' : 'Ouvrir'}>
                                                    {f.type === 'file' ? <Download size={15} /> : <ExternalLink size={15} />}
                                                </a>
                                            )}
                                            {(user?.uid === f.added_by || user?.uid === project.creator_id) && (
                                                <button onClick={() => handleDeleteResource(f.id, f.storage_path)}
                                                    className="btn btn-sm btn-ghost p-2 text-slate-500" style={{ border: '1px solid transparent' }}
                                                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.1)'; e.currentTarget.style.color = '#f87171'; }}
                                                    onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.color = ''; }}
                                                    title="Supprimer">
                                                    <Trash2 size={15} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                )}

                        {/* ── Section 2: Ressources IA ── */}
                        <div style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: '1.25rem', marginBottom: '1.5rem' }}>
                            <h3 className="flex items-center gap-2 m-0 mb-1" style={{ fontSize: '1.15rem' }}><Bot className="text-secondary" size={20} /> Ressources générées par l&apos;IA</h3>
                            <p className="text-sm text-secondary m-0 mb-5">Suggestions et tutoriels adaptés à votre objectif</p>

                            {/* Prompt input */}
                            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
                                <div style={{ flex: 1 }}>
                                    <label style={{ fontSize: '0.75rem', color: '#71717a', fontWeight: 600, display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        Sur quoi as-tu besoin d&apos;aide ? <span style={{ opacity: 0.5, fontWeight: 400, textTransform: 'none' }}>(optionnel)</span>
                                    </label>
                                    <input
                                        className="input"
                                        type="text"
                                        placeholder={`Ex: débutant en Python, surtout la POO et les fichiers...`}
                                        value={aiResourcePrompt}
                                        onChange={e => setAiResourcePrompt(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter' && !generatingAIResources) handleGenerateResources(); }}
                                        disabled={generatingAIResources}
                                        style={{ fontSize: '0.875rem', width: '100%' }}
                                    />
                                </div>
                                <button
                                    className="btn btn-sm btn-primary"
                                    style={{ fontSize: '0.82rem', whiteSpace: 'nowrap', flexShrink: 0, height: '40px', paddingInline: '16px' }}
                                    onClick={handleGenerateResources}
                                    disabled={generatingAIResources}
                                >
                                    {generatingAIResources
                                        ? <><span style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', display: 'inline-block', animation: 'spin 0.8s linear infinite', marginRight: 6 }} />Génération...</>
                                        : resources.length > 0 ? '🔄 Regénérer' : '🤖 Générer'}
                                </button>
                            </div>
                        </div>

                        {generatingAIResources ? (
                            <div className="flex flex-col gap-3">
                                {[...Array(5)].map((_, i) => (
                                    <div key={i} className="card card-glass" style={{ height: 52, opacity: 0.4, animation: 'pulse 1.5s ease infinite', animationDelay: `${i * 0.1}s` }} />
                                ))}
                            </div>
                        ) : resources.length === 0 ? (
                            <div className="card card-glass text-center py-8" style={{ opacity: 0.7 }}>
                                <Bot size={28} className="text-secondary mx-auto mb-2 opacity-40" />
                                <p className="text-secondary m-0 text-sm">Lance une génération pour obtenir des ressources personnalisées.</p>
                            </div>
                        ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '1rem' }}>
                                {resources.map((r: any, idx) => (
                                    <div key={r.id} className="card card-glass fade-enter flex items-start gap-4" style={{ animationDelay: `${idx * 0.08}s`, background: 'rgba(255,255,255,0.02)', padding: '1.2rem 1.4rem' }}>
                                        <div className="p-2.5 rounded-lg flex-shrink-0 bg-secondary/10 text-secondary mt-0.5">
                                            <LinkIcon size={16} />
                                        </div>
                                        <p className="m-0 flex-1" style={{ lineHeight: '1.6' }}>{r.text}</p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </motion.div>
                )}
                {/* TAB: ACTIVITY */}
                {activeTab === 'activity' && (
                    <motion.div
                        key="activity"
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -15 }}
                        transition={{ duration: 0.25, ease: "easeInOut" }}
                        className="tab-pane active">
                        <div className="flex justify-between items-center mb-6" style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: '1.25rem' }}>
                            <h3 className="flex items-center gap-2 m-0" style={{ fontSize: '1.15rem', fontWeight: 700 }}><TrendingUp style={{ color: 'var(--color-primary)' }} size={20} /> Fil d'activité</h3>
                            <span style={{ fontSize: '0.8rem', color: 'var(--color-text-tertiary)' }}>{activities.length} événements</span>
                        </div>
                        {activities.length === 0 ? (
                            <div className="card card-glass text-center py-10" style={{ opacity: 0.7 }}>
                                <TrendingUp size={32} className="text-secondary mx-auto mb-3 opacity-30" />
                                <p className="text-secondary m-0">L'activité du salon apparaîtra ici.</p>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                {activities.map((a, i) => {
                                    const typeIcon: Record<string, string> = {
                                        task_created: '✅', task_moved: '↕️', task_deleted: '🗑️',
                                        message_sent: '💬', file_added: '📎', milestone_done: '🏆',
                                        member_joined: '👋', session_created: '📅', comment_added: '💭',
                                    };
                                    const icon = typeIcon[a.type] || '⚡';
                                    return (
                                        <div key={a.id} className="fade-enter" style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '10px 14px', borderRadius: '10px', background: i % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent', animationDelay: `${i * 0.03}s` }}>
                                            <span style={{ fontSize: '1rem', flexShrink: 0, marginTop: '1px' }}>{icon}</span>
                                            <div style={{ flex: 1 }}>
                                                <p style={{ margin: 0, fontSize: '0.875rem', lineHeight: 1.5 }}>
                                                    <span style={{ fontWeight: 700, color: 'var(--color-primary)' }}>{a.user_name} </span>
                                                    <span style={{ color: 'var(--color-text-primary)' }}>{a.payload}</span>
                                                </p>
                                                <span style={{ fontSize: '0.72rem', color: 'var(--color-text-tertiary)' }}>
                                                    {a.created_at ? new Date(a.created_at.toMillis()).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'À l\'instant'}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </motion.div>
                )}
                </AnimatePresence>
            </div>{/* end tabs-content */}

            {/* Edit Project Modal */}
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
                                    <p className="m-0 text-sm opacity-60" style={{ lineHeight: '1' }}>Ajustez les paramètres de votre projet</p>
                                </div>
                            </div>
                        </div>

                        <form onSubmit={handleUpdateProject} className="flex flex-col gap-6" style={{ padding: '1.75rem 2rem' }}>
                            {/* Title */}
                            <div className="flex flex-col gap-1.5">
                                <label className="text-sm font-semibold text-slate-300">Titre du projet <span className="text-red-400">*</span></label>
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

                            {/* GitHub link */}
                            <div className="flex flex-col gap-1.5">
                                <label className="text-sm font-semibold text-slate-300">Lien GitHub <span className="text-xs opacity-40">(optionnel)</span></label>
                                <input
                                    type="url" className="input"
                                    placeholder="https://github.com/votre-organisation/repo"
                                    value={editGithubLink} onChange={e => setEditGithubLink(e.target.value)}
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
                                onClick={confirmDeleteProject}
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
            {project && (
                <FloatingAiAssistant context={{
                    id: typeof id === 'string' ? id : Array.isArray(id) ? id[0] : '',
                    type: 'project',
                    title: project.title || '',
                    description: project.description || '',
                    category: project.category || '',
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
