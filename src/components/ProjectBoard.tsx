'use client';

import { useState, useEffect, useMemo } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, orderBy } from 'firebase/firestore';
import { Plus, CheckCircle, Clock, Save, Trash2, Calendar as CalendarIcon, LayoutDashboard, List as ListIcon, Tag, AlertCircle, Search, Filter, AlignJustify, MessageSquare, X, Send, Link2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import CalendarPicker from '@/components/CalendarPicker';

type TaskStatus = 'todo' | 'in_progress' | 'review' | 'done';
type TaskPriority = 'low' | 'medium' | 'high';
type BoardView = 'kanban' | 'list' | 'calendar';

interface ProjectTask {
    id: string;
    text: string;
    description: string;
    status: TaskStatus;
    priority: TaskPriority;
    assignees: string[];
    deadline: any;
    created_at: any;
    checklist?: { id: string; text: string; done: boolean }[];
    blocked_by?: string[];
}

interface TaskComment {
    id: string;
    user_id: string;
    user_name: string;
    photo_url?: string;
    content: string;
    created_at: any;
}

const STATUSES: { id: TaskStatus; label: string; color: string; icon: any }[] = [
    { id: 'todo', label: 'À faire', color: '#64748b', icon: AlertCircle },
    { id: 'in_progress', label: 'En cours', color: '#3b82f6', icon: Clock },
    { id: 'review', label: 'À réviser', color: '#f59e0b', icon: Tag },
    { id: 'done', label: 'Terminé', color: '#10b981', icon: CheckCircle }
];

const PRIORITIES: { id: TaskPriority; label: string; color: string }[] = [
    { id: 'low', label: 'Basse', color: '#64748b' },
    { id: 'medium', label: 'Moyenne', color: '#f59e0b' },
    { id: 'high', label: 'Haute', color: '#ef4444' }
];

export default function ProjectBoard({ projectId, user, projectMembers, currentUserRole = 'member', onActivity }: { projectId: string; user: any; projectMembers: any[]; currentUserRole?: 'admin' | 'member'; onActivity?: (type: string, payload: string) => void }) {
    const [tasks, setTasks] = useState<ProjectTask[]>([]);
    const [currentView, setCurrentView] = useState<BoardView>('kanban');

    // Filters
    const [searchQuery, setSearchQuery] = useState('');
    const [filterAssignee, setFilterAssignee] = useState<string>('all');

    // Task Form State
    const [showTaskForm, setShowTaskForm] = useState(false);
    const [editingTask, setEditingTask] = useState<ProjectTask | null>(null);
    const [formStatus, setFormStatus] = useState<TaskStatus>('todo');
    const [formText, setFormText] = useState('');
    const [formDesc, setFormDesc] = useState('');
    const [formPriority, setFormPriority] = useState<TaskPriority>('medium');
    const [formAssignees, setFormAssignees] = useState<string[]>([]);
    const [formDeadline, setFormDeadline] = useState<string>('');
    const [canEditForm, setCanEditForm] = useState<boolean>(true);
    const [formChecklist, setFormChecklist] = useState<{ id: string; text: string; done: boolean }[]>([]);
    const [newChecklistItem, setNewChecklistItem] = useState('');
    const [formBlockedBy, setFormBlockedBy] = useState<string[]>([]);
    const [taskComments, setTaskComments] = useState<TaskComment[]>([]);
    const [newComment, setNewComment] = useState('');

    useEffect(() => {
        if (!projectId) return;
        const q = query(collection(db, 'projects', projectId, 'tasks'));
        const unsub = onSnapshot(q, (snapshot) => {
            const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as ProjectTask[];
            list.sort((a, b) => {
                const ta = a.created_at?.seconds || 0;
                const tb = b.created_at?.seconds || 0;
                return ta - tb;
            });
            setTasks(list);
        });
        return unsub;
    }, [projectId]);

    // Load comments when editing a task
    useEffect(() => {
        if (!editingTask || !showTaskForm) { setTaskComments([]); return; }
        const q = query(collection(db, 'projects', projectId, 'tasks', editingTask.id, 'comments'), orderBy('created_at', 'asc'));
        const unsub = onSnapshot(q, snap => setTaskComments(snap.docs.map(d => ({ id: d.id, ...d.data() } as TaskComment))));
        return unsub;
    }, [editingTask?.id, showTaskForm, projectId]);

    const filteredTasks = useMemo(() => {
        let f = tasks;
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            f = f.filter(t => t.text.toLowerCase().includes(q) || t.description?.toLowerCase().includes(q));
        }
        if (filterAssignee !== 'all') {
            if (filterAssignee === 'me') {
                f = f.filter(t => t.assignees?.includes(user?.uid));
            } else if (filterAssignee === 'unassigned') {
                f = f.filter(t => !t.assignees || t.assignees.length === 0);
            } else {
                f = f.filter(t => t.assignees?.includes(filterAssignee));
            }
        }
        return f;
    }, [tasks, searchQuery, filterAssignee, user?.uid]);

    const openTaskForm = (status: TaskStatus = 'todo', task?: ProjectTask) => {
        let isEditable = true;
        if (task) {
            if (currentUserRole !== 'admin' && (!task.assignees || !task.assignees.includes(user?.uid))) {
                isEditable = false;
            }
            setCanEditForm(isEditable);
            setEditingTask(task);
            setFormStatus(task.status);
            setFormText(task.text);
            setFormDesc(task.description || '');
            setFormPriority(task.priority || 'medium');
            setFormAssignees(task.assignees || []);
            setFormChecklist(task.checklist || []);
            setFormBlockedBy(task.blocked_by || []);
            if (task.deadline?.toDate) {
                const date = task.deadline.toDate();
                const yyyy = date.getFullYear();
                const mm = String(date.getMonth() + 1).padStart(2, '0');
                const dd = String(date.getDate()).padStart(2, '0');
                const hh = String(date.getHours()).padStart(2, '0');
                const min = String(date.getMinutes()).padStart(2, '0');
                setFormDeadline(`${yyyy}-${mm}-${dd}T${hh}:${min}`);
            } else {
                setFormDeadline('');
            }
        } else {
            setCanEditForm(true);
            setEditingTask(null);
            setFormStatus(status);
            setFormText('');
            setFormDesc('');
            setFormPriority('medium');
            setFormAssignees(user && filterAssignee === 'me' ? [user.uid] : []);
            setFormDeadline('');
            setFormChecklist([]);
            setFormBlockedBy([]);
        }
        setShowTaskForm(true);
    };

    const handleSaveTask = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!canEditForm || !formText.trim()) return;

        let deadlineDate = null;
        if (formDeadline) {
            deadlineDate = new Date(formDeadline);
        }

        const taskData = {
            text: formText.trim(),
            description: formDesc.trim(),
            status: formStatus,
            priority: formPriority,
            assignees: formAssignees,
            deadline: deadlineDate,
            checklist: formChecklist,
            blocked_by: formBlockedBy,
            ...(editingTask ? {} : { created_at: serverTimestamp() })
        };

        if (editingTask) {
            await updateDoc(doc(db, 'projects', projectId, 'tasks', editingTask.id), taskData);
            onActivity?.('task_updated', `a modifié la tâche "${formText.trim()}"`);
        } else {
            await addDoc(collection(db, 'projects', projectId, 'tasks'), taskData);
            onActivity?.('task_created', `a créé la tâche "${formText.trim()}"`);
        }

        setShowTaskForm(false);
    };

    const handleDeleteTask = async (taskId: string) => {
        if (confirm('Êtes-vous sûr de vouloir supprimer cette tâche ?')) {
            await deleteDoc(doc(db, 'projects', projectId, 'tasks', taskId));
            setShowTaskForm(false);
        }
    };

    const handleAddComment = async () => {
        if (!newComment.trim() || !user || !editingTask) return;
        const member = projectMembers.find(m => m.user_id === user.uid);
        await addDoc(collection(db, 'projects', projectId, 'tasks', editingTask.id, 'comments'), {
            user_id: user.uid,
            user_name: member?.full_name || user.displayName || user.email?.split('@')[0] || 'Membre',
            photo_url: member?.photo_url || null,
            content: newComment.trim(),
            created_at: serverTimestamp(),
        });
        setNewComment('');
    };

    // --- DRAG AND DROP KANBAN ---
    const handleDragStart = (e: React.DragEvent, taskId: string) => {
        e.dataTransfer.setData('taskId', taskId);
        e.dataTransfer.effectAllowed = 'move';
        // Add tiny timeout before adding invisible class to source visually (optional advanced UX)
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    const handleDrop = async (e: React.DragEvent, targetStatus: TaskStatus) => {
        e.preventDefault();
        const taskId = e.dataTransfer.getData('taskId');
        if (taskId) {
            const task = tasks.find(t => t.id === taskId);
            if (task && task.status !== targetStatus) {
                await updateDoc(doc(db, 'projects', projectId, 'tasks', taskId), { status: targetStatus });
                const statusLabel = STATUSES.find(s => s.id === targetStatus)?.label || targetStatus;
                onActivity?.('task_moved', `a déplacé "${task.text}" → ${statusLabel}`);
            }
        }
    };

    // Helpers
    const getMember = (uid: string) => projectMembers.find(m => m.user_id === uid);

    const isOverdue = (deadline: any, status: TaskStatus) => {
        if (status === 'done' || !deadline || !deadline.toDate) return false;
        return deadline.toDate().getTime() < new Date().getTime() - 86400000; // Passed yesterday
    };

    return (
        <div className="fade-enter h-full flex flex-col relative w-full" style={{ gap: 'var(--space-6)' }}>
            {/* Header Controls */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', maxWidth: '900px', margin: '0 auto', width: '100%', padding: '0 1.5rem' }}>
                {/* Top Row: Title & Actions */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
                    <div>
                        <h4 style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>
                            <LayoutDashboard style={{ color: 'var(--color-primary)' }} size={24} /> 
                            Suivi des Tâches
                        </h4>
                        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', margin: '0.25rem 0 0 0' }}>Gérez vos tâches collaboratives avec fluidité.</p>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
                        {/* Search Input */}
                        <div style={{ position: 'relative' }}>
                            <Search style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-tertiary)' }} size={16} />
                            <input 
                                type="text" 
                                placeholder="Rechercher..." 
                                className="input"
                                style={{ paddingLeft: '2.5rem', minWidth: '220px', borderRadius: 'var(--radius-full)' }}
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>

                        {/* Assignee Filter */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', background: 'var(--color-bg-surface)', padding: '0.25rem 0.5rem', borderRadius: 'var(--radius-full)', border: '1px solid var(--color-border)' }}>
                            <Filter style={{ color: 'var(--color-text-tertiary)' }} size={16} />
                            <select 
                                style={{ background: 'transparent', border: 'none', color: 'var(--color-text-primary)', outline: 'none', cursor: canEditForm ? 'pointer' : 'default', padding: '0.25rem' }}
                                value={filterAssignee}
                                onChange={(e) => setFilterAssignee(e.target.value)}
                            >
                                <option value="all" style={{ background: 'var(--color-bg-surface-elevated)' }}>Toutes les tâches</option>
                                <option value="me" style={{ background: 'var(--color-bg-surface-elevated)' }}>Mes tâches</option>
                                <option value="unassigned" style={{ background: 'var(--color-bg-surface-elevated)' }}>Non assignées</option>
                                {projectMembers.filter(m => m !== null && user && m.user_id !== user.uid).map(m => (
                                    <option key={m.user_id} value={m.user_id} style={{ background: 'var(--color-bg-surface-elevated)' }}>{m.full_name}</option>
                                ))}
                            </select>
                        </div>

                        {/* View Toggles */}
                        <div style={{ display: 'flex', alignItems: 'center', background: 'var(--color-bg-surface)', padding: '0.25rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                            <button
                                onClick={() => setCurrentView('kanban')}
                                style={{ padding: '0.5rem', borderRadius: 'var(--radius-sm)', transition: 'background 0.2s', border: 'none', cursor: canEditForm ? 'pointer' : 'default', background: currentView === 'kanban' ? 'var(--color-primary)' : 'transparent', color: currentView === 'kanban' ? '#fff' : 'var(--color-text-tertiary)' }}
                                title="Tableau Kanban"
                            ><LayoutDashboard size={18} /></button>
                            <button
                                onClick={() => setCurrentView('list')}
                                style={{ padding: '0.5rem', borderRadius: 'var(--radius-sm)', transition: 'background 0.2s', border: 'none', cursor: canEditForm ? 'pointer' : 'default', background: currentView === 'list' ? 'var(--color-primary)' : 'transparent', color: currentView === 'list' ? '#fff' : 'var(--color-text-tertiary)' }}
                                title="Vue Liste"
                            ><ListIcon size={18} /></button>
                            <button
                                onClick={() => setCurrentView('calendar')}
                                style={{ padding: '0.5rem', borderRadius: 'var(--radius-sm)', transition: 'background 0.2s', border: 'none', cursor: canEditForm ? 'pointer' : 'default', background: currentView === 'calendar' ? 'var(--color-primary)' : 'transparent', color: currentView === 'calendar' ? '#fff' : 'var(--color-text-tertiary)' }}
                                title="Vue Calendrier"
                            ><CalendarIcon size={18} /></button>
                        </div>

                        <button 
                            onClick={() => openTaskForm()} 
                            className="btn btn-primary"
                            style={{ borderRadius: 'var(--radius-full)', padding: 'var(--space-2) var(--space-4)' }}
                        >
                            <Plus size={18} /> Nouvelle tâche
                        </button>
                    </div>
                </div>
            </div>

            {/* Main View Area */}
            <div style={{ flex: 1, overflow: currentView === 'kanban' ? 'visible' : 'hidden', position: 'relative', minHeight: '500px' }}>
                <AnimatePresence mode="wait">
                    {/* --- KANBAN VIEW --- */}
                    {currentView === 'kanban' && (
                        <motion.div
                            key="kanban"
                            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                            style={{ display: 'grid', gridTemplateColumns: `repeat(${STATUSES.length}, 1fr)`, gap: 'var(--space-4)', paddingBottom: 'var(--space-2)', paddingLeft: '1.5rem', paddingRight: '1.5rem', height: '100%', alignItems: 'flex-start', width: '100vw', marginLeft: 'calc(50% - 50vw)' }}
                        >
                            {STATUSES.map(col => {
                                const colTasks = filteredTasks.filter(t => t.status === col.id);
                                const StatusIcon = col.icon;
                                return (
                                    <div 
                                        key={col.id} 
                                        style={{ minWidth: 0, background: 'var(--color-bg-surface)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', maxHeight: '100%' }}
                                        onDragOver={handleDragOver}
                                        onDrop={(e) => handleDrop(e, col.id)}
                                    >
                                        <div style={{ padding: 'var(--space-4)', borderBottom: `2px solid ${col.color}40`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                                                <div style={{ width: '32px', height: '32px', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: col.color, background: `${col.color}20` }}>
                                                    <StatusIcon size={16} />
                                                </div>
                                                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>{col.label}</h3>
                                            </div>
                                            <span style={{ fontSize: '0.75rem', fontWeight: 700, background: 'rgba(255,255,255,0.05)', padding: '0.2rem 0.5rem', borderRadius: 'var(--radius-sm)', color: 'var(--color-text-secondary)' }}>
                                                {colTasks.length}
                                            </span>
                                        </div>
                                        
                                        <div style={{ padding: 'var(--space-3)', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                                            <AnimatePresence>
                                                {colTasks.map(task => {
                                                    const pColor = PRIORITIES.find(p => p.id === task.priority)?.color || '#f59e0b';
                                                    return (
                                                        <motion.div 
                                                            layout
                                                            initial={{ opacity: 0, scale: 0.95 }}
                                                            animate={{ opacity: 1, scale: 1 }}
                                                            exit={{ opacity: 0, scale: 0.95 }}
                                                            transition={{ duration: 0.2 }}
                                                            key={task.id}
                                                            draggable
                                                            onDragStart={(e: any) => handleDragStart(e, task.id)}
                                                            onClick={() => openTaskForm(task.status, task)}
                                                            className="card-glass"
                                                            style={{ padding: 'var(--space-4)', borderLeft: `4px solid ${pColor}`, cursor: canEditForm ? 'pointer' : 'default', position: 'relative', ...(isOverdue(task.deadline, task.status) ? { borderColor: 'var(--color-error)' } : {}) }}
                                                        >
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
                                                                <h4 style={{ margin: 0, fontSize: '0.875rem', fontWeight: 600, flex: 1, color: task.status === 'done' ? 'var(--color-text-tertiary)' : 'var(--color-text-primary)', textDecoration: task.status === 'done' ? 'line-through' : 'none', wordBreak: 'break-word' }}>
                                                                    {task.text}
                                                                </h4>
                                                                <AlignJustify size={14} style={{ color: 'var(--color-text-tertiary)', cursor: 'grab' }} />
                                                            </div>
                                                            {task.description && (
                                                                <p style={{ margin: '0 0 var(--space-3) 0', fontSize: '0.75rem', color: 'var(--color-text-secondary)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                                                    {task.description}
                                                                </p>
                                                            )}
                                                            
                                                            {/* Checklist progress + Blocked badge */}
                                                            {((task.checklist?.length || 0) > 0 || (task.blocked_by?.length || 0) > 0) && (
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: 'var(--space-2)', flexWrap: 'wrap' }}>
                                                                    {(task.checklist?.length || 0) > 0 && (
                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '0.65rem', fontWeight: 600, padding: '2px 6px', borderRadius: '4px', background: task.checklist!.every(i => i.done) ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.05)', color: task.checklist!.every(i => i.done) ? '#10b981' : 'var(--color-text-secondary)' }}>
                                                                            <CheckCircle size={9} />
                                                                            {task.checklist!.filter(i => i.done).length}/{task.checklist!.length}
                                                                        </div>
                                                                    )}
                                                                    {(task.blocked_by?.length || 0) > 0 && (
                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '0.65rem', fontWeight: 600, padding: '2px 6px', borderRadius: '4px', background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>
                                                                            <Link2 size={9} /> Bloqué
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 'var(--space-2)' }}>
                                                                <div className="avatar-stack">
                                                                    {task.assignees?.slice(0, 3).map(uid => {
                                                                        const m = getMember(uid);
                                                                        return m ? (
                                                                            <div key={uid} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--color-bg-surface-elevated)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-full)', padding: '2px 8px 2px 2px', marginLeft: '-0.5rem', zIndex: 1, position: 'relative' }} title={m.full_name}>
                                                                                <img src={m.photo_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(m.full_name)}&background=random`} alt={m.full_name} style={{ width: '20px', height: '20px', borderRadius: '50%' }} />
                                                                                <span style={{ fontSize: '0.65rem', fontWeight: 600, whiteSpace: 'nowrap' }}>{(m.full_name || 'Utilisateur').split(' ')[0]}</span>
                                                                            </div>
                                                                        ) : <div key={uid} style={{ width:'2rem', height:'2rem', borderRadius:'50%', background:'var(--color-primary)', border:'2px solid var(--color-bg-surface)', marginLeft:'-0.75rem', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.7rem', fontWeight: 'bold' }}>?</div>;
                                                                    })}
                                                                    {(task.assignees?.length || 0) > 3 && (
                                                                        <div style={{ width: '2rem', height: '2rem', borderRadius: '50%', background: 'var(--color-bg-surface-elevated)', border: '2px solid var(--color-bg-surface)', marginLeft: '-0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', fontWeight: 'bold' }}>
                                                                            +{(task.assignees?.length || 0) - 3}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                {task.deadline?.toDate && (
                                                                    <div style={{ fontSize: '0.65rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 6px', borderRadius: '4px', background: isOverdue(task.deadline, task.status) ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255,255,255,0.05)', color: isOverdue(task.deadline, task.status) ? 'var(--color-error)' : 'var(--color-text-secondary)' }}>
                                                                        <CalendarIcon size={10} />
                                                                        {task.deadline.toDate().toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </motion.div>
                                                    )
                                                })}
                                            </AnimatePresence>
                                            
                                            <button 
                                                onClick={() => openTaskForm(col.id)} 
                                                className="btn btn-ghost"
                                                style={{ width: '100%', border: '1px dashed var(--color-border)', justifyContent: 'center', color: 'var(--color-text-secondary)', padding: 'var(--space-2)' }}
                                            >
                                                <Plus size={16} /> Ajouter une tâche
                                            </button>
                                        </div>
                                    </div>
                                )
                            })}
                        </motion.div>
                    )}

                    {/* --- LIST VIEW --- */}
                    {currentView === 'list' && (
                        <motion.div 
                            key="list"
                            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                            className="card-glass"
                            style={{ padding: 0, height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
                        >
                            <div style={{ overflowX: 'auto', flex: 1 }}>
                                <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                                    <thead style={{ background: 'var(--color-bg-surface-elevated)', borderBottom: '1px solid var(--color-border)', position: 'sticky', top: 0, zIndex: 10 }}>
                                        <tr>
                                            <th style={{ padding: 'var(--space-3) var(--space-4)', fontWeight: 600, color: 'var(--color-text-secondary)' }}>Tâche</th>
                                            <th style={{ padding: 'var(--space-3) var(--space-4)', fontWeight: 600, color: 'var(--color-text-secondary)' }}>Statut</th>
                                            <th style={{ padding: 'var(--space-3) var(--space-4)', fontWeight: 600, color: 'var(--color-text-secondary)' }}>Priorité</th>
                                            <th style={{ padding: 'var(--space-3) var(--space-4)', fontWeight: 600, color: 'var(--color-text-secondary)' }}>Assignés</th>
                                            <th style={{ padding: 'var(--space-3) var(--space-4)', fontWeight: 600, color: 'var(--color-text-secondary)' }}>Échéance</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <AnimatePresence>
                                        {filteredTasks.length === 0 && (
                                            <tr><td colSpan={5} style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>Aucune tâche trouvée</td></tr>
                                        )}
                                        {filteredTasks.map(task => {
                                            const stat = STATUSES.find(s => s.id === task.status);
                                            const prio = PRIORITIES.find(p => p.id === task.priority);
                                            return (
                                                <motion.tr 
                                                    layout
                                                    key={task.id} 
                                                    onClick={() => openTaskForm(task.status, task)}
                                                    style={{ cursor: canEditForm ? 'pointer' : 'default', transition: 'background 0.2s', borderBottom: '1px solid var(--color-border)' }}
                                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                                >
                                                    <td style={{ padding: 'var(--space-3) var(--space-4)' }}>
                                                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                            <span style={{ fontWeight: 600, color: task.status === 'done' ? 'var(--color-text-tertiary)' : 'var(--color-text-primary)', textDecoration: task.status === 'done' ? 'line-through' : 'none' }}>{task.text}</span>
                                                            {task.description && <span style={{ fontSize: '0.75rem', color: 'var(--color-text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '300px' }}>{task.description}</span>}
                                                        </div>
                                                    </td>
                                                    <td style={{ padding: 'var(--space-3) var(--space-4)' }}>
                                                        <span className="badge" style={{ background: `${stat?.color}20`, color: stat?.color, gap: '4px' }}>
                                                            {stat?.icon && <stat.icon size={12} />}
                                                            {stat?.label}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: 'var(--space-3) var(--space-4)' }}>
                                                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: 600, color: prio?.color }}>
                                                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: prio?.color }}></span>
                                                            {prio?.label}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: 'var(--space-3) var(--space-4)' }}>
                                                        <div className="avatar-stack">
                                                            {task.assignees?.length ? task.assignees.slice(0, 3).map(uid => {
                                                                const m = getMember(uid);
                                                                return m ? (
                                                                    <div key={uid} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--color-bg-surface-elevated)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-full)', padding: '2px 8px 2px 2px', marginLeft: '-0.5rem', zIndex: 1, position: 'relative' }} title={m.full_name}>
                                                                                <img src={m.photo_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(m.full_name)}&background=random`} alt={m.full_name} style={{ width: '20px', height: '20px', borderRadius: '50%' }} />
                                                                                <span style={{ fontSize: '0.65rem', fontWeight: 600, whiteSpace: 'nowrap' }}>{(m.full_name || 'Utilisateur').split(' ')[0]}</span>
                                                                            </div>
                                                                ) : null;
                                                            }) : <span style={{ color: 'var(--color-text-tertiary)', fontSize: '0.75rem', fontStyle: 'italic' }}>Personne</span>}
                                                            {(task.assignees?.length || 0) > 3 && (
                                                                <div style={{ width: '2rem', height: '2rem', borderRadius: '50%', background: 'var(--color-bg-surface-elevated)', border: '2px solid var(--color-bg-surface)', marginLeft: '-0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', fontWeight: 'bold' }}>
                                                                    +{(task.assignees?.length || 0) - 3}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td style={{ padding: 'var(--space-3) var(--space-4)' }}>
                                                        {task.deadline?.toDate ? (
                                                            <span className="badge" style={{ background: isOverdue(task.deadline, task.status) ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.05)', color: isOverdue(task.deadline, task.status) ? 'var(--color-error)' : 'var(--color-text-secondary)' }}>
                                                                {task.deadline.toDate().toLocaleDateString('fr-FR')}
                                                            </span>
                                                        ) : <span style={{ color: 'var(--color-text-tertiary)' }}>-</span>}
                                                    </td>
                                                </motion.tr>
                                            )
                                        })}
                                        </AnimatePresence>
                                    </tbody>
                                </table>
                            </div>
                        </motion.div>
                    )}

                    {/* --- CALENDAR VIEW --- */}
                    {currentView === 'calendar' && (
                        <motion.div 
                            key="calendar"
                            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                            className="card-glass"
                            style={{ padding: 0, height: '100%', display: 'flex', flexDirection: 'column' }}
                        >
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', background: 'var(--color-bg-surface-elevated)', borderBottom: '1px solid var(--color-border)' }}>
                                {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map(day => (
                                    <div key={day} style={{ padding: 'var(--space-3)', textAlign: 'center', fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', borderRight: '1px solid var(--color-border)' }}>
                                        {day}
                                    </div>
                                ))}
                            </div>
                            <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gridAutoRows: 'minmax(80px, 1fr)' }}>
                                {Array.from({ length: 35 }).map((_, i) => {
                                    // Dummy calendar render (same logic)
                                    const today = new Date();
                                    const d = new Date(today.getFullYear(), today.getMonth(), i - today.getDay() + 2);
                                    const isToday = d.toDateString() === today.toDateString();
                                    const dayTasks = filteredTasks.filter(t => t.deadline?.toDate && t.deadline.toDate().toDateString() === d.toDateString());
                                    
                                    return (
                                        <div 
                                            key={i} 
                                            onClick={() => {
                                                const yyyy = d.getFullYear();
                                                const mm = String(d.getMonth() + 1).padStart(2, '0');
                                                const dd = String(d.getDate()).padStart(2, '0');
                                                setFormDeadline(`${yyyy}-${mm}-${dd}`);
                                                openTaskForm('todo');
                                            }}
                                            style={{ padding: 'var(--space-2)', borderRight: '1px solid var(--color-border)', borderBottom: '1px solid var(--color-border)', background: isToday ? 'rgba(99, 102, 241, 0.05)' : 'transparent', cursor: canEditForm ? 'pointer' : 'default', transition: 'background 0.2s', position: 'relative' }}
                                            onMouseEnter={e => { if(!isToday) e.currentTarget.style.background = 'rgba(255,255,255,0.02)' }}
                                            onMouseLeave={e => { if(!isToday) e.currentTarget.style.background = 'transparent' }}
                                        >
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-1)' }}>
                                                <span style={{ fontSize: '0.875rem', fontWeight: isToday ? 700 : 500, color: isToday ? 'var(--color-primary)' : 'var(--color-text-secondary)', background: isToday ? 'var(--color-primary-light)' : 'transparent', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%' }}>
                                                    {d.getDate()}
                                                </span>
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', overflowY: 'auto', maxHeight: '100px' }}>
                                                {dayTasks.map(t => {
                                                    const statColor = STATUSES.find(s => s.id === t.status)?.color || '#fff';
                                                    return (
                                                        <div 
                                                            key={t.id} 
                                                            onClick={(e) => { e.stopPropagation(); openTaskForm(t.status, t); }}
                                                            style={{ fontSize: '0.65rem', padding: '2px 6px', background: `${statColor}20`, color: statColor, borderRadius: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', borderLeft: `2px solid ${statColor}` }}
                                                        >
                                                            {t.text}
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Task Form Modal */}
            <AnimatePresence>
                {showTaskForm && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(16px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}
                        onClick={(e) => { if (e.target === e.currentTarget) setShowTaskForm(false); }}
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.96, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97, y: 10 }}
                            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                            style={{
                                width: '100%', maxWidth: 'min(1200px, calc(100vw - 48px))', maxHeight: '92vh',
                                background: 'linear-gradient(145deg, rgba(18,18,32,0.98) 0%, rgba(12,12,24,0.99) 100%)',
                                border: '1px solid rgba(255,255,255,0.08)',
                                borderRadius: '20px',
                                overflow: 'hidden',
                                boxShadow: '0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(99,102,241,0.1), inset 0 1px 0 rgba(255,255,255,0.06)',
                                display: 'flex', flexDirection: 'column',
                            }}
                        >
                            {/* Header */}
                            <div style={{
                                background: 'linear-gradient(135deg, rgba(99,102,241,0.18) 0%, rgba(168,85,247,0.12) 50%, rgba(59,130,246,0.08) 100%)',
                                borderBottom: '1px solid rgba(255,255,255,0.07)',
                                padding: '28px 32px 24px',
                                borderRadius: '20px 20px 0 0',
                                display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px',
                                flexShrink: 0,
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flex: 1 }}>
                                    <div style={{
                                        width: '44px', height: '44px', borderRadius: '12px', flexShrink: 0,
                                        background: editingTask ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'linear-gradient(135deg, #10b981, #059669)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        boxShadow: editingTask ? '0 4px 16px rgba(99,102,241,0.4)' : '0 4px 16px rgba(16,185,129,0.4)',
                                    }}>
                                        {editingTask ? <Save size={20} color="#fff" /> : <Plus size={20} color="#fff" />}
                                    </div>
                                    <div>
                                        <p style={{ margin: 0, fontSize: '0.72rem', fontWeight: 600, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '3px' }}>
                                            {editingTask ? 'Modifier la tâche' : 'Créer une tâche'}
                                        </p>
                                        <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#fff', lineHeight: 1.2 }}>
                                            {formText || (editingTask ? 'Tâche sans titre' : 'Nouvelle tâche')}
                                        </h2>
                                    </div>
                                </div>
                                <button
                                    type="button" onClick={() => setShowTaskForm(false)}
                                    style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', width: '36px', height: '36px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.6)', flexShrink: 0, transition: 'all 0.2s' }}
                                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.12)'; (e.currentTarget as HTMLButtonElement).style.color = '#fff'; }}
                                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.07)'; (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.6)'; }}
                                >
                                    <X size={16} />
                                </button>
                            </div>

                            {/* Body */}
                            <form onSubmit={handleSaveTask} style={{ overflowY: 'auto', flex: 1 }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 0 }}>

                                    {/* Left column */}
                                    <div style={{ padding: '28px 32px', borderRight: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', gap: '20px' }}>

                                        {/* Title */}
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>Titre</label>
                                            <input
                                                type="text" value={formText} onChange={e => setFormText(e.target.value)} required
                                                placeholder="Ex: Développer la page d'accueil"
                                                disabled={!canEditForm}
                                                style={{
                                                    width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                                                    borderRadius: '12px', padding: '12px 16px', fontSize: '1rem', fontWeight: 600,
                                                    color: '#fff', outline: 'none', transition: 'border-color 0.2s',
                                                    fontFamily: 'inherit',
                                                }}
                                                onFocus={e => e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)'}
                                                onBlur={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'}
                                            />
                                        </div>

                                        {/* Description */}
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>Description</label>
                                            <textarea
                                                value={formDesc} onChange={e => setFormDesc(e.target.value)}
                                                rows={4} placeholder="Détails, contexte, liens utiles..."
                                                disabled={!canEditForm}
                                                style={{
                                                    width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                                                    borderRadius: '12px', padding: '12px 16px', fontSize: '0.875rem',
                                                    color: '#fff', outline: 'none', resize: 'vertical', transition: 'border-color 0.2s',
                                                    fontFamily: 'inherit', lineHeight: 1.6, minHeight: '100px',
                                                }}
                                                onFocus={e => e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)'}
                                                onBlur={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'}
                                            />
                                        </div>

                                        {/* Status + Priority */}
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>Statut</label>
                                                <select
                                                    value={formStatus} onChange={e => setFormStatus(e.target.value as TaskStatus)} disabled={!canEditForm}
                                                    style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '10px 14px', fontSize: '0.875rem', color: '#fff', outline: 'none', fontFamily: 'inherit', cursor: canEditForm ? 'pointer' : 'not-allowed' }}
                                                >
                                                    {STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                                                </select>
                                            </div>
                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>Priorité</label>
                                                <select
                                                    value={formPriority} onChange={e => setFormPriority(e.target.value as TaskPriority)} disabled={!canEditForm}
                                                    style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '10px 14px', fontSize: '0.875rem', color: '#fff', outline: 'none', fontFamily: 'inherit', cursor: canEditForm ? 'pointer' : 'not-allowed' }}
                                                >
                                                    {PRIORITIES.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                                                </select>
                                            </div>
                                        </div>

                                        {/* Deadline */}
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>Échéance</label>
                                            <div style={{ pointerEvents: canEditForm ? 'auto' : 'none', opacity: canEditForm ? 1 : 0.5 }}>
                                                <CalendarPicker value={formDeadline} onChange={setFormDeadline} placeholder="Sélectionner une date et heure" />
                                            </div>
                                        </div>

                                        {/* Actions */}
                                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.05)', marginTop: '4px' }}>
                                            {editingTask && canEditForm && (
                                                <button type="button" onClick={() => handleDeleteTask(editingTask.id)}
                                                    style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 18px', borderRadius: '10px', border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.06)', color: '#ef4444', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600, marginRight: 'auto', transition: 'all 0.2s', fontFamily: 'inherit' }}>
                                                    <Trash2 size={15} /> Supprimer
                                                </button>
                                            )}
                                            <button type="button" onClick={() => setShowTaskForm(false)}
                                                style={{ padding: '10px 20px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600, transition: 'all 0.2s', fontFamily: 'inherit' }}>
                                                Annuler
                                            </button>
                                            {canEditForm && (
                                                <button type="submit"
                                                    style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 22px', borderRadius: '10px', border: 'none', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 700, boxShadow: '0 4px 16px rgba(99,102,241,0.35)', transition: 'all 0.2s', fontFamily: 'inherit' }}>
                                                    <Save size={15} /> Enregistrer
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Right column */}
                                    <div style={{ padding: '28px 24px', display: 'flex', flexDirection: 'column', gap: '24px', background: 'rgba(255,255,255,0.015)' }}>

                                        {/* Assignees */}
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>Assigner à</label>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                {projectMembers.map(m => {
                                                    if (!m || !m.user_id) return null;
                                                    const selected = formAssignees.includes(m.user_id);
                                                    return (
                                                        <label key={m.user_id} style={{
                                                            display: 'flex', alignItems: 'center', gap: '10px',
                                                            padding: '8px 12px', borderRadius: '10px', cursor: canEditForm ? 'pointer' : 'default',
                                                            background: selected ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.03)',
                                                            border: `1px solid ${selected ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.06)'}`,
                                                            transition: 'all 0.2s',
                                                            opacity: (!canEditForm && !selected) ? 0.4 : 1,
                                                            pointerEvents: !canEditForm ? 'none' : 'auto',
                                                        }}>
                                                            <input type="checkbox" checked={selected} onChange={e => { if (!canEditForm) return; if (e.target.checked) setFormAssignees([...formAssignees, m.user_id]); else setFormAssignees(formAssignees.filter(id => id !== m.user_id)); }} style={{ accentColor: '#6366f1', cursor: 'pointer', width: '14px', height: '14px', flexShrink: 0 }} disabled={!canEditForm} />
                                                            <img src={m.photo_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(m.full_name || 'U')}&background=random`} alt={m.full_name || 'U'} style={{ width: '26px', height: '26px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                                                            <span style={{ fontSize: '0.85rem', fontWeight: selected ? 600 : 400, color: selected ? '#fff' : 'rgba(255,255,255,0.55)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.full_name || 'Utilisateur'}</span>
                                                            {selected && <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#6366f1', flexShrink: 0 }} />}
                                                        </label>
                                                    );
                                                })}
                                            </div>
                                            {!canEditForm && <p style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.3)', margin: '6px 0 0', fontStyle: 'italic' }}>Seul un Admin peut modifier l'assignation.</p>}
                                        </div>

                                        {/* Checklist */}
                                        <div>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.72rem', fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>
                                                <CheckCircle size={13} /> Sous-tâches
                                                {formChecklist.length > 0 && (
                                                    <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: formChecklist.every(i => i.done) ? '#10b981' : 'rgba(255,255,255,0.4)', fontWeight: 700, letterSpacing: 0, textTransform: 'none' }}>
                                                        {formChecklist.filter(i => i.done).length}/{formChecklist.length}
                                                    </span>
                                                )}
                                            </label>
                                            {formChecklist.length > 0 && (
                                                <div style={{ marginBottom: '8px', height: '4px', borderRadius: '4px', background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                                                    <div style={{ height: '100%', width: `${formChecklist.length > 0 ? (formChecklist.filter(i => i.done).length / formChecklist.length) * 100 : 0}%`, background: 'linear-gradient(90deg, #10b981, #059669)', borderRadius: '4px', transition: 'width 0.3s' }} />
                                                </div>
                                            )}
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                                {formChecklist.map(item => (
                                                    <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', borderRadius: '8px', background: 'rgba(255,255,255,0.02)' }}>
                                                        <input type="checkbox" checked={item.done} onChange={() => setFormChecklist(prev => prev.map(i => i.id === item.id ? { ...i, done: !i.done } : i))} style={{ accentColor: '#10b981', cursor: 'pointer', width: '14px', height: '14px', flexShrink: 0 }} />
                                                        <span style={{ flex: 1, fontSize: '0.82rem', textDecoration: item.done ? 'line-through' : 'none', color: item.done ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.8)' }}>{item.text}</span>
                                                        {canEditForm && <button type="button" onClick={() => setFormChecklist(prev => prev.filter(i => i.id !== item.id))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.25)', padding: '2px', display: 'flex', flexShrink: 0 }}><X size={13} /></button>}
                                                    </div>
                                                ))}
                                                {canEditForm && (
                                                    <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                                                        <input type="text" value={newChecklistItem} onChange={e => setNewChecklistItem(e.target.value)} placeholder="Nouvelle sous-tâche..." style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '7px 10px', fontSize: '0.8rem', color: '#fff', outline: 'none', fontFamily: 'inherit' }} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (newChecklistItem.trim()) { setFormChecklist(prev => [...prev, { id: Date.now().toString(), text: newChecklistItem.trim(), done: false }]); setNewChecklistItem(''); }}}} />
                                                        <button type="button" onClick={() => { if (newChecklistItem.trim()) { setFormChecklist(prev => [...prev, { id: Date.now().toString(), text: newChecklistItem.trim(), done: false }]); setNewChecklistItem(''); }}} style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '8px', padding: '7px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#10b981' }}><Plus size={14} /></button>
                                                    </div>
                                                )}
                                                {formChecklist.length === 0 && !canEditForm && <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.25)', fontStyle: 'italic', margin: 0 }}>Aucune sous-tâche</p>}
                                            </div>
                                        </div>

                                        {/* Blocked by */}
                                        <div>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.72rem', fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}><Link2 size={13} /> Bloqué par</label>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                                {tasks.filter(t => t.id !== editingTask?.id && t.status !== 'done').length === 0 ? (
                                                    <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.25)', fontStyle: 'italic', margin: 0 }}>Aucune autre tâche active</p>
                                                ) : tasks.filter(t => t.id !== editingTask?.id && t.status !== 'done').map(t => {
                                                    const blocked = formBlockedBy.includes(t.id);
                                                    return (
                                                        <label key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', borderRadius: '8px', cursor: canEditForm ? 'pointer' : 'default', background: blocked ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.02)', border: `1px solid ${blocked ? 'rgba(239,68,68,0.35)' : 'transparent'}`, pointerEvents: !canEditForm ? 'none' : 'auto', transition: 'all 0.15s' }}>
                                                            <input type="checkbox" checked={blocked} onChange={e => { if (e.target.checked) setFormBlockedBy(prev => [...prev, t.id]); else setFormBlockedBy(prev => prev.filter(id => id !== t.id)); }} disabled={!canEditForm} style={{ accentColor: '#ef4444', cursor: canEditForm ? 'pointer' : 'not-allowed', width: '13px', height: '13px', flexShrink: 0 }} />
                                                            <span style={{ flex: 1, fontSize: '0.8rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: blocked ? '#ef4444' : 'rgba(255,255,255,0.5)' }}>{t.text}</span>
                                                        </label>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Comments — full width at bottom, only when editing */}
                                {editingTask && (
                                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', padding: '24px 32px' }}>
                                        <p style={{ margin: '0 0 14px 0', fontSize: '0.72rem', fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <MessageSquare size={13} /> Commentaires {taskComments.length > 0 && <span style={{ background: 'rgba(99,102,241,0.25)', color: '#a5b4fc', borderRadius: '20px', padding: '1px 8px', fontSize: '0.75rem', fontWeight: 700, letterSpacing: 0, textTransform: 'none' }}>{taskComments.length}</span>}
                                        </p>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '200px', overflowY: 'auto', marginBottom: '14px', paddingRight: '4px' }}>
                                            {taskComments.length === 0 ? (
                                                <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: '0.82rem', fontStyle: 'italic', margin: 0 }}>Aucun commentaire pour le moment.</p>
                                            ) : taskComments.map(c => (
                                                <div key={c.id} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                                                    <img src={c.photo_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(c.user_name)}&background=random`} alt={c.user_name} style={{ width: '30px', height: '30px', borderRadius: '50%', flexShrink: 0, objectFit: 'cover' }} />
                                                    <div style={{ flex: 1, background: 'rgba(255,255,255,0.04)', borderRadius: '12px', padding: '10px 14px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px', alignItems: 'center' }}>
                                                            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#a5b4fc' }}>{c.user_name}</span>
                                                            <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)' }}>{c.created_at ? new Date(c.created_at.toMillis()).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'À l\'instant'}</span>
                                                        </div>
                                                        <p style={{ margin: 0, fontSize: '0.83rem', lineHeight: 1.55, color: 'rgba(255,255,255,0.8)' }}>{c.content}</p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                            <input type="text" value={newComment} onChange={e => setNewComment(e.target.value)} placeholder="Écrire un commentaire..." style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: '12px', padding: '11px 16px', fontSize: '0.875rem', color: '#fff', outline: 'none', fontFamily: 'inherit', transition: 'border-color 0.2s' }} onFocus={e => e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)'} onBlur={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.09)'} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddComment(); }}} />
                                            <button type="button" onClick={handleAddComment} disabled={!newComment.trim()} style={{ background: newComment.trim() ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'rgba(255,255,255,0.06)', border: 'none', borderRadius: '12px', width: '44px', height: '44px', cursor: newComment.trim() ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', color: newComment.trim() ? '#fff' : 'rgba(255,255,255,0.25)', flexShrink: 0, transition: 'all 0.2s', boxShadow: newComment.trim() ? '0 4px 14px rgba(99,102,241,0.35)' : 'none' }}><Send size={16} /></button>
                                        </div>
                                    </div>
                                )}
                            </form>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Mobile FAB */}
            <div style={{ display: 'none' }} className="md:hidden">
            <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => openTaskForm()}
                className="btn btn-primary"
                style={{ position: 'fixed', bottom: '2rem', right: '2rem', width: '56px', height: '56px', borderRadius: '50%', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 40, boxShadow: 'var(--shadow-glow)' }}
            >
                <Plus size={24} />
            </motion.button>
            </div>
        </div>
    );
}
