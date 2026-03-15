'use client';
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Paperclip, Link, Code, Send, Info, Bot, X, FileText, ExternalLink, History, Plus, Trash2, MessageSquare } from 'lucide-react';

export interface SalonContext {
    id: string;
    type: 'objective' | 'project';
    title: string;
    description?: string;
    category?: string;
    members: { name: string }[];
    recentMessages: { user_name: string; content: string }[];
    milestones?: { text: string; completed: boolean }[];
    resources?: { text: string }[];
    currentUserName?: string;
}

interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    label?: string;
}

interface Conversation {
    id: string;
    title: string;
    messages: ChatMessage[];
    createdAt: number;
}

interface AttachedFile {
    name: string;
    content: string;
}

interface Props {
    context: SalonContext;
}

const CONVS_PREFIX = 'fai-convs-';

const formatConvDate = (ts: number): string => {
    const d = new Date(ts);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
        return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    }
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return 'Hier';
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
};

export function FloatingAiAssistant({ context }: Props) {
    const convsKey = `${CONVS_PREFIX}${context.type}-${context.id}`;

    const [isOpen, setIsOpen]               = useState(false);
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [activeConvId, setActiveConvId]   = useState<string>('');
    const [showConvList, setShowConvList]   = useState(false);
    const [msgs, setMsgs]                   = useState<ChatMessage[]>([]);
    const [input, setInput]                 = useState('');
    const [charCount, setCharCount]         = useState(0);
    const [loading, setLoading]             = useState(false);

    const [attachedFile, setAttachedFile]   = useState<AttachedFile | null>(null);
    const [showLinkBar, setShowLinkBar]     = useState(false);
    const [linkInput, setLinkInput]         = useState('');
    const [showCodeBox, setShowCodeBox]     = useState(false);
    const [codeInput, setCodeInput]         = useState('');

    const maxChars     = 2000;
    const messagesEnd  = useRef<HTMLDivElement>(null);
    const inputRef     = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const linkInputRef = useRef<HTMLInputElement>(null);
    const abortRef     = useRef<AbortController | null>(null);

    // ── Persist conversations ──────────────────────────────────────────
    const saveConversations = useCallback((convs: Conversation[]) => {
        try { localStorage.setItem(convsKey, JSON.stringify(convs)); } catch { /* ignore */ }
    }, [convsKey]);

    // ── Load conversations on mount / salon change ─────────────────────
    useEffect(() => {
        try {
            const saved = localStorage.getItem(convsKey);
            if (saved) {
                const convs: Conversation[] = JSON.parse(saved);
                if (convs.length > 0) {
                    setConversations(convs);
                    setActiveConvId(convs[0].id);
                    setMsgs(convs[0].messages);
                    return;
                }
            }
        } catch { /* ignore */ }
        const fresh: Conversation = { id: crypto.randomUUID(), title: 'Nouvelle conversation', messages: [], createdAt: Date.now() };
        setConversations([fresh]);
        setActiveConvId(fresh.id);
        setMsgs([]);
        saveConversations([fresh]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [convsKey]);

    // ── Update active conversation in storage ──────────────────────────
    const updateActiveConv = useCallback((newMsgs: ChatMessage[]) => {
        setConversations(prev => {
            const title = newMsgs.find(m => m.role === 'user')?.content.slice(0, 45).trim() || 'Nouvelle conversation';
            const updated = prev.map(c => c.id === activeConvId ? { ...c, messages: newMsgs, title } : c);
            saveConversations(updated);
            return updated;
        });
    }, [activeConvId, saveConversations]);

    // ── Conversation management ────────────────────────────────────────
    const newConversation = useCallback(() => {
        abortRef.current?.abort();
        const conv: Conversation = { id: crypto.randomUUID(), title: 'Nouvelle conversation', messages: [], createdAt: Date.now() };
        setConversations(prev => {
            const updated = [conv, ...prev];
            saveConversations(updated);
            return updated;
        });
        setActiveConvId(conv.id);
        setMsgs([]);
        setShowConvList(false);
        setInput('');
        setAttachedFile(null);
        setCodeInput('');
        setShowCodeBox(false);
        setShowLinkBar(false);
        setLoading(false);
    }, [saveConversations]);

    const switchConversation = useCallback((conv: Conversation) => {
        abortRef.current?.abort();
        setLoading(false);
        setActiveConvId(conv.id);
        setMsgs(conv.messages);
        setShowConvList(false);
        setInput('');
        setCharCount(0);
        setAttachedFile(null);
        setCodeInput('');
        setShowCodeBox(false);
        setShowLinkBar(false);
    }, []);

    const deleteConversation = useCallback((convId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setConversations(prev => {
            let updated = prev.filter(c => c.id !== convId);
            if (updated.length === 0) {
                const fresh: Conversation = { id: crypto.randomUUID(), title: 'Nouvelle conversation', messages: [], createdAt: Date.now() };
                updated = [fresh];
            }
            saveConversations(updated);
            if (convId === activeConvId) {
                setActiveConvId(updated[0].id);
                setMsgs(updated[0].messages);
            }
            return updated;
        });
    }, [activeConvId, saveConversations]);

    const clearCurrentConv = useCallback(() => {
        setMsgs([]);
        setConversations(prev => {
            const updated = prev.map(c => c.id === activeConvId ? { ...c, messages: [], title: 'Nouvelle conversation' } : c);
            saveConversations(updated);
            return updated;
        });
    }, [activeConvId, saveConversations]);

    useEffect(() => { messagesEnd.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs]);
    useEffect(() => { if (isOpen && !showConvList) setTimeout(() => inputRef.current?.focus(), 80); }, [isOpen, showConvList]);
    useEffect(() => { if (showLinkBar) setTimeout(() => linkInputRef.current?.focus(), 50); }, [showLinkBar]);

    // ── File picker ───────────────────────────────────────────────────
    const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => setAttachedFile({ name: file.name, content: (ev.target?.result as string) ?? '' });
        reader.readAsText(file);
        e.target.value = '';
    };

    // ── Insert link ───────────────────────────────────────────────────
    const insertLink = () => {
        const url = linkInput.trim();
        if (!url) { setShowLinkBar(false); return; }
        setInput(prev => prev ? `${prev} ${url} ` : `${url} `);
        setLinkInput('');
        setShowLinkBar(false);
        inputRef.current?.focus();
    };

    // ── Build payload ─────────────────────────────────────────────────
    const buildPayload = (text: string): string => {
        let full = text;
        if (codeInput.trim()) full += `\n\`\`\`\n${codeInput.trim()}\n\`\`\``;
        if (attachedFile)     full += `\n\n[Fichier joint : ${attachedFile.name}]\n\`\`\`\n${attachedFile.content.slice(0, 8000)}\n\`\`\``;
        return full;
    };

    // ── Send ──────────────────────────────────────────────────────────
    const send = useCallback(async () => {
        const text = input.trim();
        const hasCode = showCodeBox && codeInput.trim();
        const hasFile = !!attachedFile;
        if (!text && !hasCode && !hasFile) return;
        if (loading) return;

        const displayText = text
            + (hasCode ? `\n\`\`\`\n${codeInput.trim()}\n\`\`\`` : '')
            + (hasFile ? `\n📎 ${attachedFile!.name}` : '');

        const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: displayText, label: displayText };
        const asstId  = crypto.randomUUID();
        const asstMsg: ChatMessage = { id: asstId, role: 'assistant', content: '' };

        const nextMsgs = [...msgs, userMsg, asstMsg];
        setMsgs(nextMsgs);
        setInput('');
        setCharCount(0);
        setAttachedFile(null);
        setCodeInput('');
        setShowCodeBox(false);
        setShowLinkBar(false);
        setLoading(true);
        if (inputRef.current) inputRef.current.style.height = 'auto';

        abortRef.current = new AbortController();

        try {
            const history = [...msgs, { role: 'user', content: buildPayload(text) }].map(m => ({ role: m.role, content: m.content }));
            const res = await fetch('/api/salon-ai', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages: history, context }),
                signal: abortRef.current.signal,
            });

            if (!res.ok || !res.body) throw new Error('network');

            const reader  = res.body.getReader();
            const decoder = new TextDecoder();
            let accumulated = '';
            let currentMsgs = nextMsgs;

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                accumulated += decoder.decode(value, { stream: true });
                currentMsgs = nextMsgs.map(m => m.id === asstId ? { ...m, content: accumulated } : m);
                setMsgs(currentMsgs);
            }

            updateActiveConv(currentMsgs);

        } catch (err: any) {
            if (err.name !== 'AbortError') {
                setMsgs(prev => {
                    const updated = prev.map(m => m.id === asstId ? { ...m, content: '⚠️ Erreur de connexion. Réessayez.' } : m);
                    updateActiveConv(updated);
                    return updated;
                });
            }
        } finally {
            setLoading(false);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [input, loading, msgs, context, attachedFile, codeInput, showCodeBox, updateActiveConv]);

    const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    };

    const hasMessages = msgs.length > 0;
    const canSend     = (input.trim() || (showCodeBox && codeInput.trim()) || !!attachedFile) && !loading;
    const convCount   = conversations.length;

    return (
        <>
            <style>{`
                @keyframes fai-popIn {
                    0%   { opacity: 0; transform: scale(0.8) translateY(20px); }
                    100% { opacity: 1; transform: scale(1)   translateY(0);    }
                }
                @keyframes fai-pulse {
                    0%, 100% { opacity: 1; }
                    50%       { opacity: 0.5; }
                }
                @keyframes fai-ping {
                    75%, 100% { transform: scale(1.6); opacity: 0; }
                }
                @keyframes fai-dot {
                    0%, 60%, 100% { transform: translateY(0);   opacity: 0.4; }
                    30%           { transform: translateY(-4px); opacity: 1;   }
                }
                .floating-ai-button:hover {
                    transform: scale(1.1) rotate(5deg) !important;
                    box-shadow: 0 0 30px rgba(139,92,246,0.9), 0 0 50px rgba(124,58,237,0.7), 0 0 70px rgba(109,40,217,0.5) !important;
                }
                .fai-pulse { animation: fai-pulse 2s cubic-bezier(0.4,0,0.6,1) infinite; }
                .fai-ping  { animation: fai-ping  1s cubic-bezier(0,0,0.2,1)   infinite; }
                .fai-d1    { animation: fai-dot 1.4s 0s   infinite; }
                .fai-d2    { animation: fai-dot 1.4s .2s  infinite; }
                .fai-d3    { animation: fai-dot 1.4s .4s  infinite; }
                .fai-icon-btn {
                    position:relative; padding:10px; background:transparent; border:none;
                    cursor:pointer; border-radius:8px; color:#71717a; transition:all .22s; display:flex;
                }
                .fai-icon-btn:hover { background:rgba(39,39,42,0.8); color:#e4e4e7; }
                .fai-icon-btn.active { color:#a5b4fc; background:rgba(99,102,241,0.12); }
                .fai-tooltip {
                    position:absolute; top:-36px; left:50%; transform:translateX(-50%);
                    padding:4px 8px; background:rgba(9,9,11,0.95); color:#e4e4e7;
                    font-size:0.69rem; border-radius:6px; white-space:nowrap;
                    opacity:0; transition:all .2s; pointer-events:none;
                    border:1px solid rgba(63,63,70,0.5); backdrop-filter:blur(4px); z-index:10;
                }
                .fai-icon-btn:hover .fai-tooltip { opacity:1; transform:translateX(-50%) translateY(-3px); }
                .fai-send-btn:hover:not(:disabled) {
                    background:linear-gradient(to right,#b91c1c,#dc2626) !important;
                    transform:scale(1.08) rotate(-2deg);
                    box-shadow:0 0 20px rgba(239,68,68,0.4) !important;
                }
                .fai-msgs { scrollbar-width:thin; scrollbar-color:rgba(255,255,255,0.1) transparent; }
                .fai-msgs::-webkit-scrollbar { width:3px; }
                .fai-msgs::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.12); border-radius:4px; }
                .fai-ta { scrollbar-width:none; -ms-overflow-style:none; }
                .fai-ta::-webkit-scrollbar { display:none; }
                .fai-code-ta { scrollbar-width:thin; scrollbar-color:rgba(99,102,241,0.3) transparent; }
                .fai-code-ta::-webkit-scrollbar { width:3px; }
                .fai-code-ta::-webkit-scrollbar-thumb { background:rgba(99,102,241,0.3); border-radius:4px; }
                .fai-conv-item {
                    display:flex; align-items:center; gap:8px; padding:8px 10px;
                    border-radius:10px; cursor:pointer; transition:background .15s;
                    border:1px solid transparent;
                }
                .fai-conv-item:hover { background:rgba(255,255,255,0.05); border-color:rgba(255,255,255,0.06); }
                .fai-conv-item.fai-conv-active { background:rgba(99,102,241,0.12); border-color:rgba(99,102,241,0.2); }
                .fai-conv-del {
                    opacity:0; transition:opacity .15s, color .15s; background:none; border:none;
                    cursor:pointer; color:#71717a; display:flex; padding:4px; border-radius:6px; flex-shrink:0;
                }
                .fai-conv-item:hover .fai-conv-del { opacity:1; }
                .fai-conv-del:hover { color:#f87171 !important; }
                .fai-conv-list { scrollbar-width:thin; scrollbar-color:rgba(255,255,255,0.1) transparent; }
                .fai-conv-list::-webkit-scrollbar { width:3px; }
                .fai-conv-list::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.12); border-radius:4px; }
                .fai-hdr-btn {
                    background:none; border:none; cursor:pointer; display:flex; align-items:center;
                    justify-content:center; padding:5px; border-radius:7px;
                    transition:background .18s, color .18s; color:#71717a; position:relative;
                }
                .fai-hdr-btn:hover { background:rgba(63,63,70,0.55); color:#e4e4e7; }
                .fai-hdr-btn.fai-hdr-active { color:#a5b4fc; background:rgba(99,102,241,0.15); }
                .fai-hdr-btn.fai-hdr-danger:hover { color:#f87171 !important; }
            `}</style>

            <input ref={fileInputRef} type="file" accept=".txt,.md,.js,.ts,.tsx,.jsx,.py,.json,.csv,.html,.css,.sql,.xml,.yaml,.yml" style={{ display:'none' }} onChange={onFileChange} />

            <div style={{ position:'fixed', bottom:'1.5rem', right:'1.5rem', zIndex:9999 }}>

                {/* ── Floating Button ── */}
                <button
                    className="floating-ai-button"
                    onClick={() => setIsOpen(o => !o)}
                    style={{
                        position:'relative', width:'4rem', height:'4rem', borderRadius:'50%',
                        display:'flex', alignItems:'center', justifyContent:'center',
                        border:'2px solid rgba(255,255,255,0.2)', cursor:'pointer',
                        background:'linear-gradient(135deg, rgba(99,102,241,0.8) 0%, rgba(168,85,247,0.8) 100%)',
                        boxShadow:'0 0 20px rgba(139,92,246,0.7), 0 0 40px rgba(124,58,237,0.5), 0 0 60px rgba(109,40,217,0.3)',
                        transition:'all 0.5s',
                        transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                    }}
                >
                    <div style={{ position:'absolute', inset:0, borderRadius:'50%', background:'linear-gradient(to bottom,rgba(255,255,255,0.2),transparent)', opacity:0.3 }} />
                    <div style={{ position:'absolute', inset:0, borderRadius:'50%', border:'2px solid rgba(255,255,255,0.1)' }} />
                    <div style={{ position:'relative', zIndex:10, color:'#fff', display:'flex' }}>
                        {isOpen ? <X size={24} /> : <Bot size={30} />}
                    </div>
                    <div className="fai-ping" style={{ position:'absolute', inset:0, borderRadius:'50%', background:'rgba(99,102,241,0.4)', opacity:0.2 }} />
                </button>

                {/* ── Panel ── */}
                {isOpen && (
                    <div style={{ position:'absolute', bottom:'5rem', right:0, width:'max-content', maxWidth:500, minWidth:360, animation:'fai-popIn 0.3s cubic-bezier(0.175,0.885,0.32,1.275) forwards' }}>
                        <div style={{ position:'relative', display:'flex', flexDirection:'column', borderRadius:24, background:'linear-gradient(135deg, rgba(39,39,42,0.82), rgba(24,24,27,0.92))', border:'1px solid rgba(113,113,122,0.45)', boxShadow:'0 25px 50px -12px rgba(0,0,0,0.85)', backdropFilter:'blur(40px) saturate(160%)', overflow:'hidden' }}>

                            {/* ── Header ── */}
                            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 14px 8px' }}>
                                <div style={{ display:'flex', alignItems:'center', gap:6, minWidth:0 }}>
                                    <div className="fai-pulse" style={{ width:8, height:8, borderRadius:'50%', background:'#22c55e', flexShrink:0 }} />
                                    <span style={{ fontSize:'0.75rem', fontWeight:500, color:'#a1a1aa', whiteSpace:'nowrap' }}>AI Assistant</span>
                                    <span style={{ fontSize:'0.68rem', color:'rgba(255,255,255,0.22)', marginLeft:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:110 }}>· {context.title}</span>
                                </div>
                                <div style={{ display:'flex', alignItems:'center', gap:3, flexShrink:0 }}>
                                    <span style={{ padding:'3px 7px', fontSize:'0.69rem', fontWeight:500, background:'rgba(39,39,42,0.6)', color:'#d4d4d8', borderRadius:14 }}>Gemini</span>
                                    <span style={{ padding:'3px 7px', fontSize:'0.69rem', fontWeight:500, background:'rgba(99,102,241,0.12)', color:'#a5b4fc', border:'1px solid rgba(99,102,241,0.25)', borderRadius:14 }}>Salon AI</span>

                                    {/* New conversation */}
                                    <button className="fai-hdr-btn" onClick={newConversation} title="Nouvelle conversation">
                                        <Plus size={14} />
                                    </button>

                                    {/* Conversation list toggle */}
                                    <button
                                        className={`fai-hdr-btn${showConvList ? ' fai-hdr-active' : ''}`}
                                        onClick={() => setShowConvList(v => !v)}
                                        title="Conversations"
                                    >
                                        <History size={14} />
                                        {convCount > 1 && !showConvList && (
                                            <span style={{ position:'absolute', top:0, right:0, minWidth:14, height:14, borderRadius:7, background:'rgba(99,102,241,0.9)', fontSize:'0.58rem', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', padding:'0 3px', fontWeight:700, lineHeight:1 }}>
                                                {convCount > 9 ? '9+' : convCount}
                                            </span>
                                        )}
                                    </button>

                                    {/* Clear current conversation */}
                                    {hasMessages && !showConvList && (
                                        <button className="fai-hdr-btn fai-hdr-danger" onClick={clearCurrentConv} title="Effacer cette conversation">
                                            <X size={13} />
                                        </button>
                                    )}

                                    {/* Close panel */}
                                    <button className="fai-hdr-btn" onClick={() => setIsOpen(false)}>
                                        <X size={15} />
                                    </button>
                                </div>
                            </div>

                            {showConvList ? (
                                /* ── Conversations Panel ── */
                                <div style={{ display:'flex', flexDirection:'column', padding:'4px 0 16px' }}>
                                    {/* New conv button */}
                                    <div style={{ padding:'0 12px 8px' }}>
                                        <button
                                            onClick={newConversation}
                                            style={{ width:'100%', display:'flex', alignItems:'center', gap:8, padding:'8px 12px', background:'rgba(99,102,241,0.1)', border:'1px solid rgba(99,102,241,0.25)', borderRadius:10, cursor:'pointer', color:'#a5b4fc', fontSize:'0.8rem', fontWeight:500, transition:'background .18s' }}
                                            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(99,102,241,0.18)'; }}
                                            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(99,102,241,0.1)'; }}
                                        >
                                            <Plus size={14} />
                                            Nouvelle conversation
                                        </button>
                                    </div>

                                    {/* List */}
                                    <div className="fai-conv-list" style={{ maxHeight:300, overflowY:'auto', padding:'0 12px', display:'flex', flexDirection:'column', gap:2 }}>
                                        {conversations.map(conv => {
                                            const isActive = conv.id === activeConvId;
                                            const msgCount = conv.messages.filter(m => m.role === 'user').length;
                                            return (
                                                <div
                                                    key={conv.id}
                                                    className={`fai-conv-item${isActive ? ' fai-conv-active' : ''}`}
                                                    onClick={() => switchConversation(conv)}
                                                >
                                                    <MessageSquare size={13} style={{ flexShrink:0, color: isActive ? '#a5b4fc' : '#52525b' }} />
                                                    <div style={{ flex:1, minWidth:0 }}>
                                                        <div style={{ fontSize:'0.81rem', color: isActive ? '#e4e4e7' : '#a1a1aa', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontWeight: isActive ? 500 : 400 }}>
                                                            {conv.title}
                                                        </div>
                                                        <div style={{ fontSize:'0.67rem', color:'#52525b', marginTop:1 }}>
                                                            {msgCount === 0 ? 'Vide' : `${msgCount} message${msgCount > 1 ? 's' : ''}`} · {formatConvDate(conv.createdAt)}
                                                        </div>
                                                    </div>
                                                    <button
                                                        className="fai-conv-del"
                                                        onClick={e => deleteConversation(conv.id, e)}
                                                        title="Supprimer"
                                                    >
                                                        <Trash2 size={12} />
                                                    </button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ) : (
                                /* ── Chat View ── */
                                <>
                                    {/* Messages */}
                                    {hasMessages && (
                                        <div className="fai-msgs" style={{ maxHeight:260, overflowY:'auto', padding:'8px 16px', display:'flex', flexDirection:'column', gap:8, borderBottom:'1px solid rgba(255,255,255,0.06)' }}>
                                            {msgs.map(msg => {
                                                const isUser = msg.role === 'user';
                                                return (
                                                    <div key={msg.id} style={{ display:'flex', justifyContent: isUser ? 'flex-end' : 'flex-start', alignItems:'flex-start', gap:7 }}>
                                                        {!isUser && (
                                                            <div style={{ width:20, height:20, borderRadius:6, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', background:'linear-gradient(135deg,rgba(99,102,241,0.7),rgba(168,85,247,0.7))', marginTop:2 }}>
                                                                <Bot size={11} color="#fff" />
                                                            </div>
                                                        )}
                                                        <div style={{
                                                            maxWidth:'82%', padding:'7px 11px',
                                                            borderRadius: isUser ? '12px 12px 3px 12px' : '12px 12px 12px 3px',
                                                            background: isUser ? 'linear-gradient(135deg,rgba(99,102,241,0.75),rgba(139,92,246,0.75))' : 'rgba(255,255,255,0.06)',
                                                            border: isUser ? 'none' : '1px solid rgba(255,255,255,0.08)',
                                                            fontSize:'0.8rem', lineHeight:1.55,
                                                            color: isUser ? '#fff' : 'rgba(255,255,255,0.87)',
                                                            wordBreak:'break-word', whiteSpace:'pre-wrap',
                                                        }}>
                                                            {msg.content}
                                                        </div>
                                                    </div>
                                                );
                                            })}

                                            {/* Typing dots */}
                                            {loading && msgs[msgs.length - 1]?.content === '' && (
                                                <div style={{ display:'flex', gap:7, alignItems:'flex-start' }}>
                                                    <div style={{ width:20, height:20, borderRadius:6, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', background:'linear-gradient(135deg,rgba(99,102,241,0.7),rgba(168,85,247,0.7))', marginTop:2 }}>
                                                        <Bot size={11} color="#fff" />
                                                    </div>
                                                    <div style={{ padding:'8px 12px', borderRadius:'12px 12px 12px 3px', background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.08)', display:'flex', gap:4, alignItems:'center' }}>
                                                        <span className="fai-d1" style={{ width:5, height:5, borderRadius:'50%', background:'rgba(139,92,246,0.85)', display:'inline-block' }} />
                                                        <span className="fai-d2" style={{ width:5, height:5, borderRadius:'50%', background:'rgba(139,92,246,0.85)', display:'inline-block' }} />
                                                        <span className="fai-d3" style={{ width:5, height:5, borderRadius:'50%', background:'rgba(139,92,246,0.85)', display:'inline-block' }} />
                                                    </div>
                                                </div>
                                            )}
                                            <div ref={messagesEnd} />
                                        </div>
                                    )}

                                    {/* Attachment chips */}
                                    {attachedFile && (
                                        <div style={{ display:'flex', gap:6, padding:'8px 16px 0', flexWrap:'wrap' }}>
                                            <div style={{ display:'flex', alignItems:'center', gap:5, padding:'3px 8px', background:'rgba(99,102,241,0.12)', border:'1px solid rgba(99,102,241,0.25)', borderRadius:20, fontSize:'0.72rem', color:'#a5b4fc' }}>
                                                <FileText size={11} />
                                                <span style={{ maxWidth:120, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{attachedFile.name}</span>
                                                <button onClick={() => setAttachedFile(null)} style={{ background:'none', border:'none', cursor:'pointer', color:'#a5b4fc', display:'flex', padding:0 }}><X size={10} /></button>
                                            </div>
                                        </div>
                                    )}

                                    {/* Link bar */}
                                    {showLinkBar && (
                                        <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 16px 0' }}>
                                            <ExternalLink size={13} style={{ color:'#71717a', flexShrink:0 }} />
                                            <input
                                                ref={linkInputRef}
                                                value={linkInput}
                                                onChange={e => setLinkInput(e.target.value)}
                                                onKeyDown={e => { if (e.key === 'Enter') insertLink(); if (e.key === 'Escape') setShowLinkBar(false); }}
                                                placeholder="Coller un lien URL…"
                                                style={{ flex:1, background:'rgba(39,39,42,0.5)', border:'1px solid rgba(99,102,241,0.3)', borderRadius:8, padding:'5px 10px', fontSize:'0.8rem', color:'#f4f4f5', outline:'none', fontFamily:'inherit' }}
                                            />
                                            <button onClick={insertLink} style={{ padding:'5px 10px', background:'rgba(99,102,241,0.2)', border:'1px solid rgba(99,102,241,0.35)', borderRadius:8, cursor:'pointer', color:'#a5b4fc', fontSize:'0.72rem', fontWeight:500 }}>Insérer</button>
                                            <button onClick={() => setShowLinkBar(false)} style={{ background:'none', border:'none', cursor:'pointer', color:'#71717a', display:'flex' }}><X size={14} /></button>
                                        </div>
                                    )}

                                    {/* Code box */}
                                    {showCodeBox && (
                                        <div style={{ margin:'8px 16px 0', borderRadius:10, overflow:'hidden', border:'1px solid rgba(99,102,241,0.25)' }}>
                                            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'5px 10px', background:'rgba(99,102,241,0.1)', borderBottom:'1px solid rgba(99,102,241,0.15)' }}>
                                                <span style={{ fontSize:'0.7rem', color:'#a5b4fc', fontFamily:'monospace' }}>code</span>
                                                <button onClick={() => { setShowCodeBox(false); setCodeInput(''); }} style={{ background:'none', border:'none', cursor:'pointer', color:'#71717a', display:'flex' }}><X size={12} /></button>
                                            </div>
                                            <textarea
                                                className="fai-code-ta"
                                                value={codeInput}
                                                onChange={e => setCodeInput(e.target.value)}
                                                rows={4}
                                                placeholder="Collez votre code ici…"
                                                style={{ width:'100%', background:'rgba(0,0,0,0.35)', border:'none', outline:'none', resize:'none', padding:'8px 12px', fontSize:'0.78rem', color:'#e4e4e7', fontFamily:'monospace', lineHeight:1.6 }}
                                            />
                                        </div>
                                    )}

                                    {/* Textarea */}
                                    <div style={{ position:'relative', overflow:'hidden' }}>
                                        <textarea
                                            ref={inputRef}
                                            className="fai-ta"
                                            value={input}
                                            onChange={e => { setInput(e.target.value); setCharCount(e.target.value.length); }}
                                            onKeyDown={onKeyDown}
                                            rows={hasMessages ? 2 : 4}
                                            placeholder={hasMessages ? 'Continuez la conversation…' : 'What would you like to explore today? Ask anything about this salon…'}
                                            style={{
                                                width:'100%', padding: hasMessages ? '10px 20px' : '14px 20px',
                                                background:'transparent', border:'none', outline:'none',
                                                resize:'none', minHeight: hasMessages ? 52 : 100,
                                                fontSize:'0.9375rem', lineHeight:1.65, color:'#f4f4f5',
                                                fontFamily:'inherit',
                                            }}
                                        />
                                    </div>

                                    {/* Controls */}
                                    <div style={{ padding:'0 14px 14px' }}>
                                        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                                            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                                                <div style={{ display:'flex', alignItems:'center', gap:1, padding:3, background:'rgba(39,39,42,0.45)', borderRadius:10, border:'1px solid rgba(63,63,70,0.45)' }}>
                                                    <button className="fai-icon-btn" onClick={() => fileInputRef.current?.click()}>
                                                        <Paperclip size={14} />
                                                        <span className="fai-tooltip">Fichier</span>
                                                    </button>
                                                    <button className={`fai-icon-btn${showLinkBar ? ' active' : ''}`} onClick={() => { setShowLinkBar(v => !v); setShowCodeBox(false); }}>
                                                        <Link size={14} />
                                                        <span className="fai-tooltip">Lien</span>
                                                    </button>
                                                    <button className={`fai-icon-btn${showCodeBox ? ' active' : ''}`} onClick={() => { setShowCodeBox(v => !v); setShowLinkBar(false); }}>
                                                        <Code size={14} />
                                                        <span className="fai-tooltip">Code</span>
                                                    </button>
                                                </div>
                                            </div>
                                            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                                                <span style={{ fontSize:'0.72rem', fontWeight:500, color:'#71717a' }}>
                                                    {charCount}<span style={{ color:'#a1a1aa' }}>/{maxChars}</span>
                                                </span>
                                                <button
                                                    className="fai-send-btn"
                                                    onClick={send}
                                                    disabled={!canSend}
                                                    style={{
                                                        position:'relative', padding:11,
                                                        background: canSend ? 'linear-gradient(to right,#dc2626,#ef4444)' : 'rgba(39,39,42,0.6)',
                                                        border:'none', borderRadius:11, cursor: canSend ? 'pointer' : 'default',
                                                        color: canSend ? '#fff' : '#52525b', display:'flex',
                                                        boxShadow: canSend ? '0 8px 20px -4px rgba(239,68,68,0.35)' : 'none',
                                                        transition:'all 0.25s',
                                                    }}
                                                >
                                                    <Send size={17} />
                                                </button>
                                            </div>
                                        </div>

                                        {/* Footer */}
                                        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:10, paddingTop:10, borderTop:'1px solid rgba(39,39,42,0.6)', fontSize:'0.69rem', color:'#71717a', gap:16 }}>
                                            <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                                                <Info size={11} />
                                                <span>
                                                    <kbd style={{ padding:'1px 5px', background:'rgba(39,39,42,1)', border:'1px solid rgba(82,82,91,0.8)', borderRadius:4, color:'#a1a1aa', fontFamily:'monospace', fontSize:'0.67rem' }}>Shift+↵</kbd>
                                                    {' '}saut de ligne
                                                </span>
                                            </div>
                                            <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                                                <div className="fai-pulse" style={{ width:5, height:5, borderRadius:'50%', background:'#22c55e' }} />
                                                <span>Opérationnel</span>
                                            </div>
                                        </div>
                                    </div>
                                </>
                            )}

                            {/* Overlay tint */}
                            <div style={{ position:'absolute', inset:0, borderRadius:24, pointerEvents:'none', background:'linear-gradient(135deg,rgba(99,102,241,0.04),transparent,rgba(147,51,234,0.04))' }} />
                        </div>
                    </div>
                )}
            </div>
        </>
    );
}
