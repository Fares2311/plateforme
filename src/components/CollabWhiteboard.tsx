'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { db } from '@/lib/firebase';
import {
    collection, addDoc, updateDoc, doc as fsDoc, onSnapshot, deleteDoc,
    getDocs, query, orderBy, serverTimestamp, setDoc,
} from 'firebase/firestore';
import { useAuth } from '@/context/AuthContext';
import {
    Pen, Eraser, Trash2, Download, X, Minus, Plus, Type,
    Bold, Italic, Underline, Strikethrough, Undo2, Redo2, FilePlus,
    Square, Circle, Triangle, ArrowRight,
} from 'lucide-react';

// ─── Types ─────────────────────────────────────────────────────────────────────
interface Point { x: number; y: number }
type ShapeType = 'freehand' | 'line' | 'arrow' | 'rect' | 'circle' | 'triangle';
type LineStyle = 'solid' | 'dashed' | 'dotted';
type Tool = 'pen' | 'eraser' | 'line' | 'arrow' | 'rect' | 'circle' | 'triangle' | 'text';

interface Stroke {
    id?: string; uid: string; color: string; width: number;
    isEraser?: boolean; points: Point[];
    shapeType?: ShapeType; lineStyle?: LineStyle; filled?: boolean;
    created_at?: any; page?: number;
}
interface TextItem {
    id?: string; uid: string; text: string;
    x: number; y: number; color: string; fontSize: number;
    bold?: boolean; italic?: boolean; underline?: boolean; strikethrough?: boolean;
    created_at?: any; page?: number;
}
interface TextAnchor { normX: number; normY: number; screenX: number; screenY: number; scaleX: number }
interface UndoEntry { undo: () => Promise<void>; redo: () => Promise<void> }
interface DragState { id: string; item: TextItem; startNormX: number; startNormY: number; hasMoved: boolean }
interface HoverInfo { id: string; screenX: number; screenY: number; screenFontSize: number }
interface PageConfig { id: string; index: number; background: string }
interface Props { boardPath: string; onClose: () => void; style?: React.CSSProperties; }

const SHAPE_TOOLS: Tool[] = ['line', 'arrow', 'rect', 'circle', 'triangle'];

// ─── Constants ─────────────────────────────────────────────────────────────────
const COLORS = [
    '#ffffff', '#6366f1', '#818cf8', '#10b981',
    '#f59e0b', '#ef4444', '#ec4899', '#06b6d4',
    '#f97316', '#a3e635', '#000000',
];

interface BgOption { id: string; label: string; solid: string; css?: string }
const BG_OPTIONS: BgOption[] = [
    { id: 'dark',       label: 'Sombre',        solid: '#111113' },
    { id: 'black',      label: 'Noir',           solid: '#000000' },
    { id: 'navy',       label: 'Marine',         solid: '#0d1b2a' },
    { id: 'white',      label: 'Blanc',          solid: '#f5f5f0' },
    { id: 'grid-dark',  label: 'Grille sombre',  solid: '#111113',
        css: 'linear-gradient(rgba(255,255,255,0.06) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.06) 1px,transparent 1px)' },
    { id: 'dots-dark',  label: 'Points sombres', solid: '#111113',
        css: 'radial-gradient(rgba(255,255,255,0.18) 1.5px,transparent 1.5px)' },
    { id: 'grid-white', label: 'Grille claire',  solid: '#f5f5f0',
        css: 'linear-gradient(rgba(0,0,0,0.07) 1px,transparent 1px),linear-gradient(90deg,rgba(0,0,0,0.07) 1px,transparent 1px)' },
];

// ─── Style helpers ─────────────────────────────────────────────────────────────
const toolBtn = (active: boolean): React.CSSProperties => ({
    padding: '5px 9px', borderRadius: 8, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    border: `1px solid ${active ? 'rgba(99,102,241,0.7)' : 'rgba(255,255,255,0.1)'}`,
    background: active ? 'rgba(99,102,241,0.22)' : 'rgba(255,255,255,0.04)',
    color: active ? '#a5b4fc' : 'rgba(255,255,255,0.55)', transition: 'all 0.15s',
});
const fmtBtn = (active: boolean): React.CSSProperties => ({
    padding: '4px 7px', borderRadius: 7, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    border: `1px solid ${active ? 'rgba(99,102,241,0.6)' : 'rgba(255,255,255,0.08)'}`,
    background: active ? 'rgba(99,102,241,0.18)' : 'transparent',
    color: active ? '#a5b4fc' : 'rgba(255,255,255,0.45)', transition: 'all 0.12s',
});
const iBtn = (disabled = false): React.CSSProperties => ({
    padding: '5px 8px', borderRadius: 8,
    cursor: disabled ? 'default' : 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    border: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(255,255,255,0.04)',
    color: disabled ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.55)',
    opacity: disabled ? 0.5 : 1,
});
const divider: React.CSSProperties = {
    width: 1, height: 22, background: 'rgba(255,255,255,0.1)', flexShrink: 0, margin: '0 2px',
};

// ─── Canvas / geometry helpers ─────────────────────────────────────────────────
function mkFont(t: Pick<TextItem, 'bold' | 'italic' | 'fontSize'>) {
    return [t.italic ? 'italic' : '', t.bold ? 'bold' : '', `${t.fontSize}px`,
        'Inter,-apple-system,sans-serif'].filter(Boolean).join(' ');
}
function renderText(ctx: CanvasRenderingContext2D, t: TextItem, cw: number, ch: number) {
    ctx.save();
    ctx.font = mkFont(t);
    ctx.fillStyle = t.color;
    const lines = t.text.split('\n');
    const lh = t.fontSize * 1.4;
    lines.forEach((line, i) => {
        const ly = t.y * ch + i * lh;
        ctx.fillText(line, t.x * cw, ly);
        if (!line) return;
        const w = ctx.measureText(line).width;
        const th = Math.max(1, t.fontSize * 0.06);
        if (t.underline) ctx.fillRect(t.x * cw, ly + th * 2, w, th);
        if (t.strikethrough) ctx.fillRect(t.x * cw, ly - t.fontSize * 0.33, w, th);
    });
    ctx.restore();
}
function textBounds(ctx: CanvasRenderingContext2D, t: TextItem, cw: number, ch: number) {
    ctx.font = mkFont(t);
    const lines = t.text.split('\n');
    const lh = t.fontSize * 1.4;
    const maxW = Math.max(...lines.map(l => ctx.measureText(l).width), 10);
    return { x: t.x * cw, y: t.y * ch - t.fontSize, w: maxW, h: lines.length * lh };
}
function bgStyle(bgId: string): React.CSSProperties {
    const base: React.CSSProperties = { position: 'absolute', inset: 0 };
    if (bgId.startsWith('#')) return { ...base, background: bgId };
    const opt = BG_OPTIONS.find(b => b.id === bgId);
    if (!opt || !opt.css) return { ...base, background: opt?.solid ?? '#111113' };
    const size = bgId.includes('dots') ? '24px 24px' : '40px 40px';
    return { ...base, background: opt.solid, backgroundImage: opt.css, backgroundSize: size };
}
function bgSolidColor(bgId: string): string {
    if (bgId.startsWith('#')) return bgId;
    return BG_OPTIONS.find(b => b.id === bgId)?.solid ?? '#111113';
}
function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
    const dx = bx - ax, dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(px - ax, py - ay);
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
function renderStrokeItem(ctx: CanvasRenderingContext2D, stroke: Stroke, cw: number, ch: number) {
    if (stroke.points.length < 2) return;
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.lineWidth = stroke.width;
    const ls = stroke.lineStyle ?? 'solid';
    if (ls === 'dashed') ctx.setLineDash([stroke.width * 4, stroke.width * 2]);
    else if (ls === 'dotted') ctx.setLineDash([stroke.width * 0.5, stroke.width * 3]);
    else ctx.setLineDash([]);
    if (stroke.isEraser) {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.strokeStyle = 'rgba(0,0,0,1)';
        ctx.fillStyle = 'rgba(0,0,0,1)';
    } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = stroke.color;
        ctx.fillStyle = stroke.color;
    }
    const type = stroke.shapeType ?? 'freehand';
    if (type === 'freehand') {
        ctx.beginPath();
        ctx.moveTo(stroke.points[0].x * cw, stroke.points[0].y * ch);
        stroke.points.slice(1).forEach(p => ctx.lineTo(p.x * cw, p.y * ch));
        ctx.stroke();
    } else {
        const p0 = stroke.points[0], p1 = stroke.points[stroke.points.length - 1];
        const x0 = p0.x * cw, y0 = p0.y * ch, x1 = p1.x * cw, y1 = p1.y * ch;
        if (type === 'line') {
            ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
        } else if (type === 'arrow') {
            ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
            const angle = Math.atan2(y1 - y0, x1 - x0);
            const aw = Math.max(stroke.width * 4, 14);
            ctx.setLineDash([]);
            ctx.fillStyle = stroke.isEraser ? 'rgba(0,0,0,1)' : stroke.color;
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x1 - aw * Math.cos(angle - Math.PI / 6), y1 - aw * Math.sin(angle - Math.PI / 6));
            ctx.lineTo(x1 - aw * Math.cos(angle + Math.PI / 6), y1 - aw * Math.sin(angle + Math.PI / 6));
            ctx.closePath(); ctx.fill();
        } else if (type === 'rect') {
            const rx = Math.min(x0, x1), ry = Math.min(y0, y1);
            const rw = Math.abs(x1 - x0), rh = Math.abs(y1 - y0);
            if (stroke.filled) { ctx.globalAlpha = 0.35; ctx.fillRect(rx, ry, rw, rh); ctx.globalAlpha = 1; }
            ctx.strokeRect(rx, ry, rw, rh);
        } else if (type === 'circle') {
            const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
            const rx = Math.abs(x1 - x0) / 2, ry2 = Math.abs(y1 - y0) / 2;
            ctx.beginPath();
            ctx.ellipse(cx, cy, Math.max(1, rx), Math.max(1, ry2), 0, 0, Math.PI * 2);
            if (stroke.filled) { ctx.globalAlpha = 0.35; ctx.fill(); ctx.globalAlpha = 1; }
            ctx.stroke();
        } else if (type === 'triangle') {
            const mx = (x0 + x1) / 2;
            ctx.beginPath(); ctx.moveTo(mx, y0); ctx.lineTo(x1, y1); ctx.lineTo(x0, y1); ctx.closePath();
            if (stroke.filled) { ctx.globalAlpha = 0.35; ctx.fill(); ctx.globalAlpha = 1; }
            ctx.stroke();
        }
    }
    ctx.restore();
}
function hitTestStroke(stroke: Stroke, normX: number, normY: number, cw: number, ch: number): boolean {
    if (stroke.points.length < 2) return false;
    const px = normX * cw, py = normY * ch;
    const type = stroke.shapeType ?? 'freehand';
    const tol = Math.max(stroke.width / 2 + 6, 8);
    if (type === 'freehand') {
        for (let i = 1; i < stroke.points.length; i++) {
            const ax = stroke.points[i - 1].x * cw, ay = stroke.points[i - 1].y * ch;
            const bx = stroke.points[i].x * cw, by = stroke.points[i].y * ch;
            if (distToSegment(px, py, ax, ay, bx, by) <= tol) return true;
        }
        return false;
    }
    const p0 = stroke.points[0], p1 = stroke.points[stroke.points.length - 1];
    const x0 = p0.x * cw, y0 = p0.y * ch, x1 = p1.x * cw, y1 = p1.y * ch;
    if (type === 'line' || type === 'arrow') return distToSegment(px, py, x0, y0, x1, y1) <= tol;
    return px >= Math.min(x0, x1) - tol && px <= Math.max(x0, x1) + tol &&
           py >= Math.min(y0, y1) - tol && py <= Math.max(y0, y1) + tol;
}

// ─── Component ─────────────────────────────────────────────────────────────────
export default function CollabWhiteboard({ boardPath, onClose, style }: Props) {
    const { user } = useAuth();

    const baseCanvasRef = useRef<HTMLCanvasElement>(null);
    const liveCanvasRef = useRef<HTMLCanvasElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const allStrokesRef = useRef<Stroke[]>([]);
    const allTextsRef = useRef<TextItem[]>([]);
    const textsRef = useRef<TextItem[]>([]);

    const [strokes, setStrokes] = useState<Stroke[]>([]);
    const [texts, setTexts] = useState<TextItem[]>([]);

    const [pages, setPages] = useState<PageConfig[]>([]);
    const [currentPage, setCurrentPage] = useState(0);
    const currentBg = pages.find(p => p.index === currentPage)?.background ?? 'dark';

    const [tool, setTool] = useState<Tool>('pen');
    const [color, setColor] = useState('#ffffff');
    const [brushSize, setBrushSize] = useState(3);
    const [isDrawing, setIsDrawing] = useState(false);
    const [lineStyle, setLineStyle] = useState<LineStyle>('solid');
    const [filled, setFilled] = useState(false);

    const [bold, setBold] = useState(false);
    const [italic, setItalic] = useState(false);
    const [underline, setUnderline] = useState(false);
    const [strikethrough, setStrikethrough] = useState(false);

    const [textAnchor, setTextAnchor] = useState<TextAnchor | null>(null);
    const [textValue, setTextValue] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);

    const [hoverInfo, setHoverInfo] = useState<HoverInfo | null>(null);
    const [draggingId, setDraggingId] = useState<string | null>(null);
    const [draggedPos, setDraggedPos] = useState<{ normX: number; normY: number } | null>(null);
    const dragStateRef = useRef<DragState | null>(null);
    const isOverHoverToolbarRef = useRef(false);
    const hoverClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Context menus
    const [contextMenu, setContextMenu] = useState<{ textId: string; x: number; y: number } | null>(null);
    const [strokeCtxMenu, setStrokeCtxMenu] = useState<{ strokeId: string; x: number; y: number } | null>(null);
    const contextMenuRef = useRef<HTMLDivElement>(null);
    const strokeCtxMenuRef = useRef<HTMLDivElement>(null);

    // Shape drawing
    const shapeStartRef = useRef<Point | null>(null);

    // Undo/Redo
    const undoStack = useRef<UndoEntry[]>([]);
    const redoStack = useRef<UndoEntry[]>([]);
    const [canUndo, setCanUndo] = useState(false);
    const [canRedo, setCanRedo] = useState(false);
    const [undoCount, setUndoCount] = useState(0);
    const [redoCount, setRedoCount] = useState(0);
    const isUndoRedoRunning = useRef(false);

    const currentPoints = useRef<Point[]>([]);
    const fontSize = Math.max(24, brushSize * 8);

    // ── Undo helpers ──────────────────────────────────────────────────────────
    const pushUndo = useCallback((entry: UndoEntry) => {
        undoStack.current = [...undoStack.current.slice(-49), entry];
        redoStack.current = [];
        setCanUndo(true); setCanRedo(false);
        setUndoCount(undoStack.current.length); setRedoCount(0);
    }, []);

    const handleUndo = useCallback(async () => {
        if (isUndoRedoRunning.current) return;
        const e = undoStack.current.pop(); if (!e) return;
        isUndoRedoRunning.current = true;
        try {
            await e.undo();
            redoStack.current.push(e);
            setCanUndo(undoStack.current.length > 0); setCanRedo(true);
            setUndoCount(undoStack.current.length); setRedoCount(redoStack.current.length);
        } finally { isUndoRedoRunning.current = false; }
    }, []);

    const handleRedo = useCallback(async () => {
        if (isUndoRedoRunning.current) return;
        const e = redoStack.current.pop(); if (!e) return;
        isUndoRedoRunning.current = true;
        try {
            await e.redo();
            undoStack.current.push(e);
            setCanUndo(true); setCanRedo(redoStack.current.length > 0);
            setUndoCount(undoStack.current.length); setRedoCount(redoStack.current.length);
        } finally { isUndoRedoRunning.current = false; }
    }, []);

    const handleUndoRef = useRef(handleUndo);
    const handleRedoRef = useRef(handleRedo);
    handleUndoRef.current = handleUndo;
    handleRedoRef.current = handleRedo;

    // ── Keyboard shortcuts ───────────────────────────────────────────────────
    useEffect(() => {
        const fn = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLTextAreaElement) return;
            const mod = e.ctrlKey || e.metaKey;
            if (mod && !e.shiftKey && e.key === 'z') { e.preventDefault(); handleUndoRef.current(); }
            if (mod && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) { e.preventDefault(); handleRedoRef.current(); }
        };
        window.addEventListener('keydown', fn);
        return () => window.removeEventListener('keydown', fn);
    }, []);

    // ── Firestore: pages ──────────────────────────────────────────────────────
    useEffect(() => {
        setDoc(fsDoc(db, boardPath, 'page_config', 'p0'),
            { index: 0, background: 'dark', created_at: serverTimestamp() }, { merge: true });
        const q = query(collection(db, boardPath, 'page_config'), orderBy('index', 'asc'));
        return onSnapshot(q, snap => {
            setPages(snap.docs.map(d => ({ id: d.id, ...d.data() as { index: number; background: string } })));
        });
    }, [boardPath]);

    // ── Firestore: strokes ────────────────────────────────────────────────────
    useEffect(() => {
        const q = query(collection(db, boardPath, 'strokes'), orderBy('created_at', 'asc'));
        return onSnapshot(q, snap => {
            allStrokesRef.current = snap.docs.map(d => ({ id: d.id, ...d.data() } as Stroke));
            setStrokes(allStrokesRef.current.filter(s => (s.page ?? 0) === currentPage));
        });
    }, [boardPath]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Firestore: texts ──────────────────────────────────────────────────────
    useEffect(() => {
        const q = query(collection(db, boardPath, 'texts'), orderBy('created_at', 'asc'));
        return onSnapshot(q, snap => {
            allTextsRef.current = snap.docs.map(d => ({ id: d.id, ...d.data() } as TextItem));
            const filtered = allTextsRef.current.filter(t => (t.page ?? 0) === currentPage);
            setTexts(filtered); textsRef.current = filtered;
        });
    }, [boardPath]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Re-filter when page changes ───────────────────────────────────────────
    useEffect(() => {
        setStrokes(allStrokesRef.current.filter(s => (s.page ?? 0) === currentPage));
        const filtered = allTextsRef.current.filter(t => (t.page ?? 0) === currentPage);
        setTexts(filtered); textsRef.current = filtered;
    }, [currentPage]);

    // ── Switch page ───────────────────────────────────────────────────────────
    const switchPage = useCallback((index: number) => {
        setCurrentPage(index);
        setTextAnchor(null); setTextValue(''); setEditingId(null);
        setHoverInfo(null); setDraggingId(null); setDraggedPos(null);
        setContextMenu(null); setStrokeCtxMenu(null);
        dragStateRef.current = null; shapeStartRef.current = null;
        undoStack.current = []; redoStack.current = [];
        setCanUndo(false); setCanRedo(false); setUndoCount(0); setRedoCount(0);
    }, []);

    // ── Pages CRUD ────────────────────────────────────────────────────────────
    const addPage = useCallback(async () => {
        const maxIdx = pages.length > 0 ? Math.max(...pages.map(p => p.index)) : -1;
        const newIdx = maxIdx + 1;
        await setDoc(fsDoc(db, boardPath, 'page_config', `p${newIdx}`),
            { index: newIdx, background: 'dark', created_at: serverTimestamp() });
        switchPage(newIdx);
    }, [boardPath, pages, switchPage]);

    const deletePage = useCallback(async (index: number) => {
        if (pages.length <= 1) return;
        const [s, t] = await Promise.all([
            getDocs(collection(db, boardPath, 'strokes')),
            getDocs(collection(db, boardPath, 'texts')),
        ]);
        await Promise.all([
            ...s.docs.filter(d => (d.data().page ?? 0) === index).map(d => deleteDoc(d.ref)),
            ...t.docs.filter(d => (d.data().page ?? 0) === index).map(d => deleteDoc(d.ref)),
            deleteDoc(fsDoc(db, boardPath, 'page_config', `p${index}`)),
        ]);
        if (currentPage === index) switchPage(pages.filter(p => p.index !== index)[0]?.index ?? 0);
    }, [boardPath, pages, currentPage, switchPage]);

    const changeBackground = useCallback(async (bgId: string) => {
        await updateDoc(fsDoc(db, boardPath, 'page_config', `p${currentPage}`), { background: bgId });
    }, [boardPath, currentPage]);

    // ── Redraw base canvas ────────────────────────────────────────────────────
    useEffect(() => {
        const canvas = baseCanvasRef.current; if (!canvas) return;
        const ctx = canvas.getContext('2d'); if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.globalCompositeOperation = 'source-over';
        strokes.forEach(stroke => renderStrokeItem(ctx, stroke, canvas.width, canvas.height));
        ctx.globalCompositeOperation = 'source-over';
        texts.forEach(t => {
            if (t.id === editingId || t.id === draggingId) return;
            renderText(ctx, t, canvas.width, canvas.height);
        });
        ctx.globalCompositeOperation = 'source-over';
    }, [strokes, texts, editingId, draggingId]);

    // ── Live canvas: drag / hover outline ─────────────────────────────────────
    useEffect(() => {
        const canvas = liveCanvasRef.current;
        if (!canvas || tool !== 'text') return;
        const ctx = canvas.getContext('2d'); if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (draggingId && draggedPos) {
            const t = textsRef.current.find(x => x.id === draggingId);
            if (t) renderText(ctx, { ...t, x: draggedPos.normX, y: draggedPos.normY }, canvas.width, canvas.height);
        }
        if (hoverInfo && !draggingId) {
            const t = textsRef.current.find(x => x.id === hoverInfo.id);
            if (t) {
                const { x, y, w, h } = textBounds(ctx, t, canvas.width, canvas.height);
                ctx.save();
                ctx.strokeStyle = 'rgba(99,102,241,0.6)'; ctx.lineWidth = 1.5;
                ctx.setLineDash([4, 3]);
                ctx.strokeRect(x - 4, y - 2, w + 8, h + 4);
                ctx.restore();
            }
        }
    }, [tool, draggingId, draggedPos, hoverInfo]);

    // ── Clear live canvas when leaving text tool ──────────────────────────────
    useEffect(() => {
        if (tool !== 'text') {
            liveCanvasRef.current?.getContext('2d')?.clearRect(0, 0, 1920, 1080);
            setHoverInfo(null); dragStateRef.current = null;
            setDraggingId(null); setDraggedPos(null);
        }
    }, [tool]);

    // ── Auto-resize textarea ──────────────────────────────────────────────────
    useEffect(() => {
        const ta = textareaRef.current; if (!ta) return;
        ta.style.height = 'auto';
        ta.style.height = ta.scrollHeight + 'px';
    }, [textValue]);

    // ── Helpers ───────────────────────────────────────────────────────────────
    const getPoint = useCallback((
        e: React.MouseEvent | React.TouchEvent | MouseEvent,
        canvas: HTMLCanvasElement,
    ): Point => {
        const rect = canvas.getBoundingClientRect();
        const src = 'touches' in e
            ? ((e as React.TouchEvent).touches[0] || (e as any).changedTouches?.[0])
            : e as React.MouseEvent;
        return { x: (src.clientX - rect.left) / rect.width, y: (src.clientY - rect.top) / rect.height };
    }, []);

    const drawLive = useCallback((pts: Point[]) => {
        const canvas = liveCanvasRef.current;
        if (!canvas || pts.length < 2) return;
        const ctx = canvas.getContext('2d'); if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.beginPath(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.lineWidth = brushSize;
        ctx.strokeStyle = tool === 'eraser' ? 'rgba(255,255,255,0.4)' : color;
        ctx.moveTo(pts[0].x * canvas.width, pts[0].y * canvas.height);
        pts.slice(1).forEach(p => ctx.lineTo(p.x * canvas.width, p.y * canvas.height));
        ctx.stroke();
    }, [brushSize, color, tool]);

    const drawShapePreview = useCallback((start: Point, end: Point) => {
        const canvas = liveCanvasRef.current; if (!canvas) return;
        const ctx = canvas.getContext('2d'); if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        renderStrokeItem(ctx, {
            uid: '', color, width: brushSize, points: [start, end],
            shapeType: tool as ShapeType, lineStyle, filled,
        }, canvas.width, canvas.height);
    }, [color, brushSize, tool, lineStyle, filled]);

    const hitTestText = useCallback((normX: number, normY: number): TextItem | null => {
        const canvas = baseCanvasRef.current; if (!canvas) return null;
        const ctx = canvas.getContext('2d'); if (!ctx) return null;
        const px = normX * canvas.width, py = normY * canvas.height;
        for (let i = textsRef.current.length - 1; i >= 0; i--) {
            const t = textsRef.current[i];
            const { x, y, w, h } = textBounds(ctx, t, canvas.width, canvas.height);
            if (px >= x - 6 && px <= x + w + 6 && py >= y - 6 && py <= y + h + 6) return t;
        }
        return null;
    }, []);

    const hitTestStrokeItem = useCallback((normX: number, normY: number): Stroke | null => {
        const canvas = baseCanvasRef.current; if (!canvas) return null;
        const pageStrokes = allStrokesRef.current.filter(s => (s.page ?? 0) === currentPage && !s.isEraser);
        for (let i = pageStrokes.length - 1; i >= 0; i--) {
            if (hitTestStroke(pageStrokes[i], normX, normY, canvas.width, canvas.height)) return pageStrokes[i];
        }
        return null;
    }, [currentPage]);

    // ── Commit text ───────────────────────────────────────────────────────────
    const commitTextFn = useCallback(async () => {
        if (!textAnchor || !user) { setTextAnchor(null); setTextValue(''); setEditingId(null); return; }
        if (!textValue.trim()) {
            if (editingId) {
                const item = textsRef.current.find(t => t.id === editingId);
                if (item) {
                    const { id: _id, created_at: _ca, ...data } = item as any;
                    await deleteDoc(fsDoc(db, boardPath, 'texts', editingId));
                    let restoredRef: any = null;
                    pushUndo({
                        undo: async () => { restoredRef = await addDoc(collection(db, boardPath, 'texts'), { ...data, created_at: serverTimestamp() }); },
                        redo: async () => { if (restoredRef) await deleteDoc(restoredRef); },
                    });
                }
            }
            setTextAnchor(null); setTextValue(''); setEditingId(null); setHoverInfo(null); return;
        }
        const payload = {
            uid: user.uid, text: textValue.trim(),
            x: textAnchor.normX, y: textAnchor.normY,
            color, fontSize, bold, italic, underline, strikethrough, page: currentPage,
        };
        if (editingId) {
            const prev = textsRef.current.find(t => t.id === editingId);
            if (prev) {
                const { id: _, created_at: __, ...prevData } = prev as any;
                const id = editingId;
                await updateDoc(fsDoc(db, boardPath, 'texts', id), payload);
                pushUndo({
                    undo: async () => { await updateDoc(fsDoc(db, boardPath, 'texts', id), prevData); },
                    redo: async () => { await updateDoc(fsDoc(db, boardPath, 'texts', id), payload); },
                });
            }
        } else {
            let ref = await addDoc(collection(db, boardPath, 'texts'), { ...payload, created_at: serverTimestamp() });
            pushUndo({
                undo: async () => { await deleteDoc(ref); },
                redo: async () => { ref = await addDoc(collection(db, boardPath, 'texts'), { ...payload, created_at: serverTimestamp() }); },
            });
        }
        setTextAnchor(null); setTextValue(''); setEditingId(null);
    }, [textAnchor, textValue, user, editingId, boardPath, color, fontSize, bold, italic, underline, strikethrough, currentPage, pushUndo]);

    const commitTextRef = useRef(commitTextFn);
    commitTextRef.current = commitTextFn;

    // ── Delete text / stroke ──────────────────────────────────────────────────
    const deleteTextItem = useCallback(async (id: string) => {
        const item = textsRef.current.find(t => t.id === id); if (!item) return;
        if (editingId === id) { setTextAnchor(null); setTextValue(''); setEditingId(null); }
        setHoverInfo(null);
        const { id: _id, created_at: _ca, ...data } = item as any;
        await deleteDoc(fsDoc(db, boardPath, 'texts', id));
        let restoredRef: any = null;
        pushUndo({
            undo: async () => { restoredRef = await addDoc(collection(db, boardPath, 'texts'), { ...data, created_at: serverTimestamp() }); },
            redo: async () => { if (restoredRef) await deleteDoc(restoredRef); },
        });
    }, [boardPath, editingId, pushUndo]);

    const deleteStrokeItem = useCallback(async (id: string) => {
        const item = allStrokesRef.current.find(s => s.id === id); if (!item) return;
        const { id: _id, created_at: _ca, ...data } = item as any;
        await deleteDoc(fsDoc(db, boardPath, 'strokes', id));
        let restoredRef: any = null;
        pushUndo({
            undo: async () => { restoredRef = await addDoc(collection(db, boardPath, 'strokes'), { ...data, created_at: serverTimestamp() }); },
            redo: async () => { if (restoredRef) await deleteDoc(restoredRef); },
        });
    }, [boardPath, pushUndo]);

    // ── Open text editor ──────────────────────────────────────────────────────
    const openTextEdit = useCallback((item: TextItem) => {
        const canvas = liveCanvasRef.current; if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        setEditingId(item.id ?? null); setTextValue(item.text); setColor(item.color);
        setBrushSize(Math.max(1, Math.round(item.fontSize / 8)));
        setBold(item.bold ?? false); setItalic(item.italic ?? false);
        setUnderline(item.underline ?? false); setStrikethrough(item.strikethrough ?? false);
        setTextAnchor({ normX: item.x, normY: item.y, screenX: item.x * rect.width, screenY: item.y * rect.height, scaleX: rect.width / 1920 });
        setHoverInfo(null);
        setTimeout(() => textareaRef.current?.focus(), 30);
    }, []);

    // ── Finish freehand stroke ────────────────────────────────────────────────
    const finishStroke = useCallback(async () => {
        if (!isDrawing || !user) return;
        setIsDrawing(false);
        const live = liveCanvasRef.current;
        if (live) live.getContext('2d')?.clearRect(0, 0, live.width, live.height);
        const pts = currentPoints.current;
        if (pts.length < 2) return;
        currentPoints.current = [];
        const strokeData = { uid: user.uid, color, width: brushSize, isEraser: tool === 'eraser', points: pts, shapeType: 'freehand' as ShapeType, lineStyle, page: currentPage };
        let ref = await addDoc(collection(db, boardPath, 'strokes'), { ...strokeData, created_at: serverTimestamp() });
        pushUndo({
            undo: async () => { await deleteDoc(ref); },
            redo: async () => { ref = await addDoc(collection(db, boardPath, 'strokes'), { ...strokeData, created_at: serverTimestamp() }); },
        });
    }, [isDrawing, user, boardPath, color, brushSize, tool, lineStyle, currentPage, pushUndo]);

    // ── Finish shape ──────────────────────────────────────────────────────────
    const finishShape = useCallback(async (startPt: Point, endPt: Point) => {
        if (!user) return;
        shapeStartRef.current = null;
        const live = liveCanvasRef.current;
        if (live) live.getContext('2d')?.clearRect(0, 0, live.width, live.height);
        const dx = (endPt.x - startPt.x) * 1920, dy = (endPt.y - startPt.y) * 1080;
        if (Math.abs(dx) < 3 && Math.abs(dy) < 3) return;
        const strokeData = { uid: user.uid, color, width: brushSize, isEraser: false, points: [startPt, endPt], shapeType: tool as ShapeType, lineStyle, filled, page: currentPage };
        let ref = await addDoc(collection(db, boardPath, 'strokes'), { ...strokeData, created_at: serverTimestamp() });
        pushUndo({
            undo: async () => { await deleteDoc(ref); },
            redo: async () => { ref = await addDoc(collection(db, boardPath, 'strokes'), { ...strokeData, created_at: serverTimestamp() }); },
        });
    }, [user, boardPath, color, brushSize, tool, lineStyle, filled, currentPage, pushUndo]);

    // ── Mouse / Touch handlers ────────────────────────────────────────────────
    const handleMouseDown = useCallback((e: React.MouseEvent | React.TouchEvent) => {
        const canvas = liveCanvasRef.current; if (!canvas) return;
        if ('touches' in e) e.preventDefault();
        const pt = getPoint(e, canvas);
        if (tool === 'text') {
            const hit = hitTestText(pt.x, pt.y);
            if (hit) dragStateRef.current = { id: hit.id!, item: { ...hit }, startNormX: pt.x, startNormY: pt.y, hasMoved: false };
            return;
        }
        if (SHAPE_TOOLS.includes(tool)) { shapeStartRef.current = pt; return; }
        currentPoints.current = [pt];
        setIsDrawing(true);
    }, [tool, getPoint, hitTestText]);

    const handleMouseMove = useCallback((e: React.MouseEvent | React.TouchEvent) => {
        const canvas = liveCanvasRef.current; if (!canvas) return;
        if ('touches' in e) e.preventDefault();
        const pt = getPoint(e, canvas);
        if (tool === 'text') {
            if (dragStateRef.current) {
                const dx = pt.x - dragStateRef.current.startNormX;
                const dy = pt.y - dragStateRef.current.startNormY;
                if (!dragStateRef.current.hasMoved && (Math.abs(dx) * 1920 > 6 || Math.abs(dy) * 1080 > 6)) {
                    dragStateRef.current.hasMoved = true;
                    setDraggingId(dragStateRef.current.id); setHoverInfo(null);
                }
                if (dragStateRef.current.hasMoved) {
                    const { item } = dragStateRef.current;
                    setDraggedPos({ normX: Math.max(0.01, Math.min(0.99, item.x + dx)), normY: Math.max(0.02, Math.min(0.98, item.y + dy)) });
                }
            } else {
                const hit = hitTestText(pt.x, pt.y);
                if (hit && hit.id !== hoverInfo?.id) {
                    const rect = canvas.getBoundingClientRect();
                    setHoverInfo({ id: hit.id!, screenX: hit.x * rect.width, screenY: hit.y * rect.height, screenFontSize: Math.max(12, Math.round(hit.fontSize * rect.width / 1920)) });
                }
            }
            return;
        }
        if (SHAPE_TOOLS.includes(tool) && shapeStartRef.current) {
            drawShapePreview(shapeStartRef.current, pt); return;
        }
        if (!isDrawing) return;
        currentPoints.current.push(pt);
        drawLive(currentPoints.current);
    }, [tool, getPoint, hitTestText, hoverInfo, isDrawing, drawLive, drawShapePreview]);

    const handleMouseUp = useCallback(async (e: React.MouseEvent | React.TouchEvent) => {
        const canvas = liveCanvasRef.current; if (!canvas) return;
        if (tool === 'text') {
            if (dragStateRef.current) {
                const { id, item, hasMoved } = dragStateRef.current;
                dragStateRef.current = null;
                if (hasMoved && draggedPos) {
                    const { x: prevX, y: prevY } = item;
                    const { normX: newX, normY: newY } = draggedPos;
                    setDraggingId(null); setDraggedPos(null);
                    await updateDoc(fsDoc(db, boardPath, 'texts', id), { x: newX, y: newY });
                    pushUndo({
                        undo: async () => { await updateDoc(fsDoc(db, boardPath, 'texts', id), { x: prevX, y: prevY }); },
                        redo: async () => { await updateDoc(fsDoc(db, boardPath, 'texts', id), { x: newX, y: newY }); },
                    });
                } else {
                    setDraggingId(null); setDraggedPos(null);
                    openTextEdit(item);
                }
            } else if (e.type === 'mouseup') {
                const pt = getPoint(e, canvas);
                const hit = hitTestText(pt.x, pt.y);
                if (!hit) {
                    const rect = canvas.getBoundingClientRect();
                    setEditingId(null); setTextValue('');
                    setTextAnchor({ normX: pt.x, normY: pt.y, screenX: pt.x * rect.width, screenY: pt.y * rect.height, scaleX: rect.width / 1920 });
                    setTimeout(() => textareaRef.current?.focus(), 30);
                }
            }
            return;
        }
        if (SHAPE_TOOLS.includes(tool) && shapeStartRef.current) {
            await finishShape(shapeStartRef.current, getPoint(e, canvas)); return;
        }
        await finishStroke();
    }, [tool, draggedPos, boardPath, pushUndo, openTextEdit, getPoint, hitTestText, finishStroke, finishShape]);

    const handleMouseLeave = useCallback(async () => {
        if (tool === 'text') {
            if (hoverClearTimerRef.current) clearTimeout(hoverClearTimerRef.current);
            hoverClearTimerRef.current = setTimeout(() => { if (!isOverHoverToolbarRef.current) setHoverInfo(null); }, 200);
            return;
        }
        if (SHAPE_TOOLS.includes(tool)) {
            shapeStartRef.current = null;
            liveCanvasRef.current?.getContext('2d')?.clearRect(0, 0, 1920, 1080);
            return;
        }
        await finishStroke();
    }, [tool, finishStroke]);

    // ── Right-click context menu ──────────────────────────────────────────────
    const handleContextMenu = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        const canvas = liveCanvasRef.current; if (!canvas) return;
        const pt = getPoint(e, canvas);
        const hitText = hitTestText(pt.x, pt.y);
        if (hitText) {
            setStrokeCtxMenu(null);
            setContextMenu({ textId: hitText.id!, x: e.clientX, y: e.clientY });
            return;
        }
        const hitStroke = hitTestStrokeItem(pt.x, pt.y);
        if (hitStroke) {
            setContextMenu(null);
            setStrokeCtxMenu({ strokeId: hitStroke.id!, x: e.clientX, y: e.clientY });
        }
    }, [getPoint, hitTestText, hitTestStrokeItem]);

    useEffect(() => {
        if (!contextMenu) return;
        const fn = (e: MouseEvent) => { if (contextMenuRef.current?.contains(e.target as Node)) return; setContextMenu(null); };
        document.addEventListener('mousedown', fn);
        return () => document.removeEventListener('mousedown', fn);
    }, [contextMenu]);

    useEffect(() => {
        if (!strokeCtxMenu) return;
        const fn = (e: MouseEvent) => { if (strokeCtxMenuRef.current?.contains(e.target as Node)) return; setStrokeCtxMenu(null); };
        document.addEventListener('mousedown', fn);
        return () => document.removeEventListener('mousedown', fn);
    }, [strokeCtxMenu]);

    // ── Text keyboard shortcuts ───────────────────────────────────────────────
    const handleTextKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        const mod = e.ctrlKey || e.metaKey;
        if (mod && e.key === 'b') { e.preventDefault(); setBold(v => !v); }
        if (mod && e.key === 'i') { e.preventDefault(); setItalic(v => !v); }
        if (mod && e.key === 'u') { e.preventDefault(); setUnderline(v => !v); }
        if (mod && e.key === 'd') { e.preventDefault(); setStrikethrough(v => !v); }
        if (mod && e.key === 'Enter') { e.preventDefault(); commitTextRef.current(); }
        if (e.key === 'Escape') { setTextAnchor(null); setTextValue(''); setEditingId(null); }
    };

    // ── Clear page ────────────────────────────────────────────────────────────
    const handleClear = async () => {
        const [s, t] = await Promise.all([getDocs(collection(db, boardPath, 'strokes')), getDocs(collection(db, boardPath, 'texts'))]);
        const pageStrokes = s.docs.filter(d => (d.data().page ?? 0) === currentPage);
        const pageTexts = t.docs.filter(d => (d.data().page ?? 0) === currentPage);
        const savedS = pageStrokes.map(d => ({ ...d.data() as Stroke }));
        const savedT = pageTexts.map(d => ({ ...d.data() as TextItem }));
        await Promise.all([...pageStrokes.map(d => deleteDoc(d.ref)), ...pageTexts.map(d => deleteDoc(d.ref))]);
        let rS: any[] = [], rT: any[] = [];
        pushUndo({
            undo: async () => {
                rS = await Promise.all(savedS.map(x => addDoc(collection(db, boardPath, 'strokes'), { ...x, created_at: serverTimestamp() })));
                rT = await Promise.all(savedT.map(x => addDoc(collection(db, boardPath, 'texts'), { ...x, created_at: serverTimestamp() })));
            },
            redo: async () => { await Promise.all([...rS.map(r => deleteDoc(r)), ...rT.map(r => deleteDoc(r))]); },
        });
    };

    // ── Download ──────────────────────────────────────────────────────────────
    const handleDownload = () => {
        const base = baseCanvasRef.current; if (!base) return;
        const temp = document.createElement('canvas');
        temp.width = base.width; temp.height = base.height;
        const ctx = temp.getContext('2d')!;
        ctx.fillStyle = bgSolidColor(currentBg); ctx.fillRect(0, 0, temp.width, temp.height);
        ctx.drawImage(base, 0, 0);
        const a = document.createElement('a');
        a.download = `tableau-page-${currentPage + 1}.png`; a.href = temp.toDataURL('image/png'); a.click();
    };

    const cursor = tool === 'eraser'
        ? `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Ccircle cx='12' cy='12' r='10' fill='none' stroke='white' stroke-width='2'/%3E%3C/svg%3E") 12 12, cell`
        : tool === 'text' ? (hoverInfo ? 'grab' : 'text') : 'crosshair';

    const screenFontSize = textAnchor ? Math.max(12, Math.round(fontSize * textAnchor.scaleX)) : Math.max(10, brushSize * 3);
    const isEmpty = strokes.length === 0 && texts.length === 0;

    // Shared context menu styles
    const ctxMenuStyle: React.CSSProperties = {
        position: 'fixed', zIndex: 50, background: 'rgba(20,20,24,0.97)',
        border: '1px solid rgba(99,102,241,0.3)', borderRadius: 8, padding: 4,
        display: 'flex', flexDirection: 'column', gap: 2,
        boxShadow: '0 8px 24px rgba(0,0,0,0.55)', backdropFilter: 'blur(10px)', minWidth: 130,
    };
    const ctxItemBase: React.CSSProperties = {
        display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
        borderRadius: 6, border: 'none', background: 'transparent',
        cursor: 'pointer', fontSize: '0.72rem', fontWeight: 600,
        fontFamily: 'inherit', width: '100%', textAlign: 'left',
    };

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 272, bottom: 0,
            zIndex: 9, display: 'flex', flexDirection: 'column',
            fontFamily: 'Inter,-apple-system,BlinkMacSystemFont,sans-serif',
            background: '#111113', ...style,
        }}>
            {/* ── Top toolbar ── */}
            <div style={{
                height: 50, flexShrink: 0, background: 'rgba(20,20,24,0.97)',
                borderBottom: '1px solid rgba(255,255,255,0.08)',
                display: 'flex', alignItems: 'center', gap: 4, padding: '0 10px',
                backdropFilter: 'blur(8px)', overflowX: 'auto',
            }}>
                <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'rgba(255,255,255,0.2)', textTransform: 'uppercase', letterSpacing: '0.1em', flexShrink: 0 }}>Tableau</span>
                <div style={divider} />

                {/* Undo / Redo */}
                <button onClick={handleUndo} disabled={!canUndo} title={`Annuler (Ctrl+Z)${undoCount > 0 ? ` · ${undoCount}` : ''}`} style={iBtn(!canUndo)}><Undo2 size={14} /></button>
                <button onClick={handleRedo} disabled={!canRedo} title={`Rétablir (Ctrl+Y)${redoCount > 0 ? ` · ${redoCount}` : ''}`} style={iBtn(!canRedo)}><Redo2 size={14} /></button>
                <div style={divider} />

                {/* Freehand tools */}
                <button onClick={() => setTool('pen')} title="Crayon" style={toolBtn(tool === 'pen')}><Pen size={14} /></button>
                <button onClick={() => setTool('eraser')} title="Gomme" style={toolBtn(tool === 'eraser')}><Eraser size={14} /></button>
                <div style={divider} />

                {/* Shape tools */}
                <button onClick={() => setTool('line')} title="Ligne" style={toolBtn(tool === 'line')}><Minus size={14} /></button>
                <button onClick={() => setTool('arrow')} title="Flèche" style={toolBtn(tool === 'arrow')}><ArrowRight size={13} /></button>
                <button onClick={() => setTool('rect')} title="Rectangle" style={toolBtn(tool === 'rect')}><Square size={13} /></button>
                <button onClick={() => setTool('circle')} title="Ellipse" style={toolBtn(tool === 'circle')}><Circle size={13} /></button>
                <button onClick={() => setTool('triangle')} title="Triangle" style={toolBtn(tool === 'triangle')}><Triangle size={13} /></button>
                <div style={divider} />

                {/* Line style (pen + shapes) */}
                {tool !== 'text' && tool !== 'eraser' && (<>
                    <button onClick={() => setLineStyle('solid')} title="Plein" style={fmtBtn(lineStyle === 'solid')}>
                        <span style={{ fontSize: '0.65rem', fontWeight: 900 }}>—</span>
                    </button>
                    <button onClick={() => setLineStyle('dashed')} title="Tirets" style={fmtBtn(lineStyle === 'dashed')}>
                        <span style={{ fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.5px' }}>- -</span>
                    </button>
                    <button onClick={() => setLineStyle('dotted')} title="Pointillés" style={fmtBtn(lineStyle === 'dotted')}>
                        <span style={{ fontSize: '0.65rem', fontWeight: 900, letterSpacing: '1px' }}>···</span>
                    </button>
                    <div style={divider} />
                </>)}

                {/* Fill toggle (shapes only, not line/arrow) */}
                {SHAPE_TOOLS.includes(tool) && tool !== 'line' && tool !== 'arrow' && (<>
                    <button onClick={() => setFilled(v => !v)} title={filled ? 'Rempli' : 'Contour seul'} style={fmtBtn(filled)}>
                        <Square size={12} style={{ fill: filled ? 'currentColor' : 'transparent', stroke: 'currentColor' }} />
                    </button>
                    <div style={divider} />
                </>)}

                {/* Text tool */}
                <button onClick={() => { setTool('text'); setTextAnchor(null); setTextValue(''); setEditingId(null); }} title="Texte" style={toolBtn(tool === 'text')}><Type size={14} /></button>

                {/* Text formatting */}
                {tool === 'text' && (<>
                    <div style={divider} />
                    <button onClick={() => setBold(v => !v)} title="Gras (Ctrl+B)" style={fmtBtn(bold)}><Bold size={13} /></button>
                    <button onClick={() => setItalic(v => !v)} title="Italique (Ctrl+I)" style={fmtBtn(italic)}><Italic size={13} /></button>
                    <button onClick={() => setUnderline(v => !v)} title="Souligné (Ctrl+U)" style={fmtBtn(underline)}><Underline size={13} /></button>
                    <button onClick={() => setStrikethrough(v => !v)} title="Barré (Ctrl+D)" style={fmtBtn(strikethrough)}><Strikethrough size={13} /></button>
                </>)}
                <div style={divider} />

                {/* Colors */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                    {COLORS.map(c => (
                        <button key={c} onClick={() => { setColor(c); if (tool === 'eraser') setTool('pen'); }}
                            style={{
                                width: 15, height: 15, borderRadius: '50%', background: c, cursor: 'pointer', flexShrink: 0,
                                border: color === c && tool !== 'eraser' ? '2px solid white' : c === '#000000' ? '1px solid rgba(255,255,255,0.2)' : '2px solid transparent',
                                boxShadow: color === c && tool !== 'eraser' ? `0 0 0 2px ${c}60` : 'none', transition: 'all 0.12s',
                            }}
                        />
                    ))}
                </div>
                <div style={divider} />

                {/* Size */}
                <button onClick={() => setBrushSize(s => Math.max(1, s - 1))} style={iBtn()} title="Réduire"><Minus size={11} /></button>
                {tool === 'text' ? (
                    <span style={{ fontSize: Math.max(10, brushSize * 3) + 'px', color, fontWeight: bold ? 700 : 600, fontStyle: italic ? 'italic' : 'normal', lineHeight: 1, flexShrink: 0, minWidth: 16, textAlign: 'center' }}>A</span>
                ) : (
                    <div style={{ width: Math.max(6, brushSize * 2) + 'px', height: Math.max(6, brushSize * 2) + 'px', borderRadius: '50%', background: tool === 'eraser' ? 'rgba(255,255,255,0.3)' : color, flexShrink: 0, minWidth: 6, minHeight: 6, border: color === '#000000' && tool !== 'eraser' ? '1px solid rgba(255,255,255,0.3)' : 'none' }} />
                )}
                <button onClick={() => setBrushSize(s => Math.min(60, s + 1))} style={iBtn()} title="Augmenter"><Plus size={11} /></button>
                <span style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.25)', minWidth: 16, textAlign: 'center', flexShrink: 0 }}>{brushSize}</span>

                <div style={{ flex: 1 }} />
                <button onClick={handleDownload} title="Télécharger" style={iBtn()}><Download size={14} /></button>
                <button onClick={handleClear} title="Effacer la page" style={{ ...iBtn(), color: '#fca5a5', borderColor: 'rgba(239,68,68,0.25)', background: 'rgba(239,68,68,0.08)' }}><Trash2 size={14} /></button>
                <div style={divider} />
                <button onClick={onClose} title="Masquer" style={{ ...iBtn(), color: 'rgba(255,255,255,0.4)' }}><X size={15} /></button>
            </div>

            {/* ── Canvas area ── */}
            <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
                <div style={bgStyle(currentBg)} />
                <canvas ref={baseCanvasRef} width={1920} height={1080}
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
                <canvas
                    ref={liveCanvasRef} width={1920} height={1080}
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', cursor, touchAction: 'none' }}
                    onMouseDown={handleMouseDown} onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp} onMouseLeave={handleMouseLeave}
                    onContextMenu={handleContextMenu}
                    onTouchStart={handleMouseDown} onTouchMove={handleMouseMove} onTouchEnd={handleMouseUp}
                />

                {/* Floating text editor */}
                {tool === 'text' && textAnchor && (
                    <div style={{ position: 'absolute', left: textAnchor.screenX, top: textAnchor.screenY - screenFontSize * 1.1, zIndex: 10, pointerEvents: 'auto' }}>
                        <textarea
                            ref={textareaRef} value={textValue}
                            onChange={e => setTextValue(e.target.value)}
                            onKeyDown={handleTextKeyDown}
                            onBlur={() => commitTextRef.current()}
                            rows={1}
                            style={{
                                display: 'block', background: 'rgba(17,17,19,0.6)', backdropFilter: 'blur(6px)',
                                border: `1px dashed ${color}77`, borderRadius: 4, outline: 'none',
                                color, fontSize: screenFontSize + 'px',
                                fontWeight: bold ? 700 : 600, fontStyle: italic ? 'italic' : 'normal',
                                textDecoration: [underline && 'underline', strikethrough && 'line-through'].filter(Boolean).join(' ') || 'none',
                                fontFamily: 'Inter,-apple-system,sans-serif', caretColor: color,
                                minWidth: 120, maxWidth: `calc(100vw - ${textAnchor.screenX + 40}px)`,
                                padding: '2px 5px', resize: 'none', overflow: 'hidden', lineHeight: 1.4, whiteSpace: 'pre',
                            }}
                            autoFocus placeholder="Tapez votre texte…"
                        />
                        <div style={{ marginTop: 3, fontSize: '0.55rem', color: 'rgba(255,255,255,0.22)', whiteSpace: 'nowrap', pointerEvents: 'none' }}>
                            ↵ nouvelle ligne · Ctrl+↵ valider · Vider+Blur supprime · Échap annule
                        </div>
                    </div>
                )}

                {/* Hover action bar */}
                {tool === 'text' && hoverInfo && !textAnchor && !draggingId && (
                    <div
                        style={{ position: 'absolute', left: hoverInfo.screenX, top: hoverInfo.screenY - hoverInfo.screenFontSize * 1.15 - 30, display: 'flex', gap: 4, zIndex: 20, pointerEvents: 'auto' }}
                        onMouseEnter={() => { if (hoverClearTimerRef.current) clearTimeout(hoverClearTimerRef.current); isOverHoverToolbarRef.current = true; }}
                        onMouseLeave={() => { isOverHoverToolbarRef.current = false; setHoverInfo(null); }}
                    >
                        <button
                            onMouseDown={e => e.stopPropagation()}
                            onClick={e => { e.stopPropagation(); const t = textsRef.current.find(x => x.id === hoverInfo.id); if (t) openTextEdit(t); }}
                            title="Modifier"
                            style={{ height: 24, padding: '0 9px', borderRadius: 6, cursor: 'pointer', background: 'rgba(99,102,241,0.9)', border: '1px solid rgba(99,102,241,1)', color: 'white', fontSize: '0.6rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}
                        >
                            <Type size={10} /> Modifier
                        </button>
                        <button
                            onMouseDown={e => e.stopPropagation()}
                            onClick={e => { e.stopPropagation(); deleteTextItem(hoverInfo.id); }}
                            title="Supprimer"
                            style={{ height: 24, width: 24, borderRadius: 6, cursor: 'pointer', background: 'rgba(239,68,68,0.9)', border: '1px solid rgba(239,68,68,1)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                            <X size={10} />
                        </button>
                    </div>
                )}

                {/* Right-click context menu — text block */}
                {contextMenu && (
                    <div ref={contextMenuRef} style={{ ...ctxMenuStyle, left: contextMenu.x, top: contextMenu.y }}>
                        <button
                            onClick={() => { const t = textsRef.current.find(x => x.id === contextMenu.textId); if (t) { setTool('text'); openTextEdit(t); } setContextMenu(null); }}
                            style={{ ...ctxItemBase, color: 'rgba(255,255,255,0.85)' }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(99,102,241,0.2)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                            <Type size={12} /> Modifier
                        </button>
                        <button
                            onClick={() => { deleteTextItem(contextMenu.textId); setContextMenu(null); }}
                            style={{ ...ctxItemBase, color: '#fca5a5' }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.15)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                            <X size={12} /> Supprimer
                        </button>
                    </div>
                )}

                {/* Right-click context menu — stroke / shape */}
                {strokeCtxMenu && (
                    <div ref={strokeCtxMenuRef} style={{ ...ctxMenuStyle, left: strokeCtxMenu.x, top: strokeCtxMenu.y }}>
                        <button
                            onClick={() => { deleteStrokeItem(strokeCtxMenu.strokeId); setStrokeCtxMenu(null); }}
                            style={{ ...ctxItemBase, color: '#fca5a5' }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.15)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                            <Trash2 size={12} /> Supprimer
                        </button>
                    </div>
                )}

                {/* Empty state */}
                {isEmpty && !isDrawing && !textAnchor && (
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', gap: 8 }}>
                        <div style={{ fontSize: '2.5rem', opacity: 0.15 }}>✏️</div>
                        <p style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.15)', margin: 0, fontWeight: 500 }}>
                            Dessinez ou tapez du texte — synchronisé en temps réel
                        </p>
                    </div>
                )}
            </div>

            {/* ── Page bar ── */}
            <div style={{
                height: 38, flexShrink: 0, background: 'rgba(16,16,20,0.98)',
                borderTop: '1px solid rgba(255,255,255,0.07)',
                display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px', overflowX: 'auto',
            }}>
                <span style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.2)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', flexShrink: 0 }}>Fond</span>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
                    {BG_OPTIONS.map(bg => (
                        <button key={bg.id} title={bg.label} onClick={() => changeBackground(bg.id)}
                            style={{
                                width: 18, height: 18, borderRadius: 4, cursor: 'pointer', flexShrink: 0,
                                background: bg.solid, backgroundImage: bg.css ?? 'none',
                                backgroundSize: bg.id.includes('dots') ? '6px 6px' : '8px 8px',
                                border: currentBg === bg.id ? '2px solid #6366f1' : '1px solid rgba(255,255,255,0.15)',
                                boxShadow: currentBg === bg.id ? '0 0 0 1px #6366f1' : 'none', transition: 'border 0.12s',
                            }}
                        />
                    ))}
                    <label title="Couleur personnalisée" style={{ position: 'relative', display: 'flex', alignItems: 'center', cursor: 'pointer', flexShrink: 0 }}>
                        <input type="color" value={currentBg.startsWith('#') ? currentBg : '#6366f1'}
                            onChange={e => changeBackground(e.target.value)}
                            style={{ opacity: 0, position: 'absolute', inset: 0, width: '100%', height: '100%', cursor: 'pointer', padding: 0, border: 'none' }}
                        />
                        <div style={{
                            width: 18, height: 18, borderRadius: 4, flexShrink: 0, pointerEvents: 'none',
                            background: currentBg.startsWith('#') ? currentBg : 'conic-gradient(red 0deg,#ff0 60deg,lime 120deg,cyan 180deg,blue 240deg,magenta 300deg,red 360deg)',
                            border: currentBg.startsWith('#') ? '2px solid #6366f1' : '1px solid rgba(255,255,255,0.2)',
                            boxShadow: currentBg.startsWith('#') ? '0 0 0 1px #6366f1' : 'none',
                        }} />
                    </label>
                </div>

                <div style={{ ...divider, margin: '0 4px' }} />

                <div style={{ display: 'flex', gap: 4, alignItems: 'center', flex: 1, overflowX: 'auto' }}>
                    {pages.map((p, i) => (
                        <div key={p.id} onClick={() => switchPage(p.index)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 5,
                                padding: '3px 10px', borderRadius: 6, cursor: 'pointer', flexShrink: 0,
                                background: currentPage === p.index ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.04)',
                                border: `1px solid ${currentPage === p.index ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.08)'}`,
                                color: currentPage === p.index ? '#a5b4fc' : 'rgba(255,255,255,0.45)',
                                fontSize: '0.68rem', fontWeight: 600, transition: 'all 0.12s',
                            }}
                        >
                            <span>Page {i + 1}</span>
                            {pages.length > 1 && (
                                <button title="Supprimer cette page" onClick={e => { e.stopPropagation(); deletePage(p.index); }}
                                    style={{ width: 14, height: 14, borderRadius: 3, border: 'none', background: 'transparent', cursor: 'pointer', color: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.5, padding: 0 }}
                                    onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                                    onMouseLeave={e => (e.currentTarget.style.opacity = '0.5')}
                                >
                                    <X size={9} />
                                </button>
                            )}
                        </div>
                    ))}
                </div>

                <button onClick={addPage} title="Nouvelle page"
                    style={{ ...iBtn(), flexShrink: 0, padding: '4px 10px', gap: 5, display: 'flex', alignItems: 'center', fontSize: '0.65rem', fontWeight: 600, color: 'rgba(255,255,255,0.5)' }}
                >
                    <FilePlus size={13} /> Nouvelle page
                </button>
            </div>
        </div>
    );
}
