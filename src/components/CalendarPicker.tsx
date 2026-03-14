'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, ChevronLeft, ChevronRight, Clock } from 'lucide-react';

interface CalendarPickerProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    required?: boolean;
}

const MONTHS_FR = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const DAYS_FR = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

function getDaysInMonth(year: number, month: number) {
    return new Date(year, month + 1, 0).getDate();
}
function getFirstDayOfMonth(year: number, month: number) {
    const d = new Date(year, month, 1).getDay();
    return d === 0 ? 6 : d - 1;
}

export default function CalendarPicker({ value, onChange, placeholder = 'Choisir une date...', required }: CalendarPickerProps) {
    const [open, setOpen] = useState(false);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const popoverRef = useRef<HTMLDivElement>(null);

    const parsed = value ? new Date(value) : null;
    const [viewYear, setViewYear] = useState(parsed?.getFullYear() ?? new Date().getFullYear());
    const [viewMonth, setViewMonth] = useState(parsed?.getMonth() ?? new Date().getMonth());
    const [selectedDate, setSelectedDate] = useState<{ y: number; m: number; d: number } | null>(
        parsed ? { y: parsed.getFullYear(), m: parsed.getMonth(), d: parsed.getDate() } : null
    );
    const [hour, setHour] = useState(parsed ? String(parsed.getHours()).padStart(2, '0') : '09');
    const [minute, setMinute] = useState(parsed ? String(parsed.getMinutes()).padStart(2, '0') : '00');

    // Position the popover below the trigger button
    const [popoverPos, setPopoverPos] = useState({ top: 0, left: 0, width: 0 });

    useEffect(() => {
        if (open && triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect();
            setPopoverPos({
                top: rect.bottom + 8 + window.scrollY,
                left: rect.left + window.scrollX,
                width: Math.max(300, rect.width),
            });
        }
    }, [open]);

    // Emit ISO string whenever date/time changes
    useEffect(() => {
        if (selectedDate) {
            const iso = `${selectedDate.y}-${String(selectedDate.m + 1).padStart(2, '0')}-${String(selectedDate.d).padStart(2, '0')}T${hour}:${minute}`;
            onChange(iso);
        }
    }, [selectedDate, hour, minute]);

    // Close on Escape
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [open]);

    const daysInMonth = getDaysInMonth(viewYear, viewMonth);
    const firstDay = getFirstDayOfMonth(viewYear, viewMonth);
    const today = new Date();

    const isSelected = (d: number) => selectedDate?.y === viewYear && selectedDate?.m === viewMonth && selectedDate?.d === d;
    const isToday = (d: number) => today.getFullYear() === viewYear && today.getMonth() === viewMonth && today.getDate() === d;
    const isPast = (d: number) => new Date(viewYear, viewMonth, d) < new Date(today.getFullYear(), today.getMonth(), today.getDate());

    const formattedDisplay = selectedDate
        ? `${String(selectedDate.d).padStart(2, '0')} ${MONTHS_FR[selectedDate.m]} ${selectedDate.y} – ${hour}:${minute}`
        : '';

    const selectStyle: React.CSSProperties = {
        padding: '0.35rem 0.5rem',
        fontSize: '0.9rem',
        background: '#1a1a22',
        border: '1px solid rgba(99,102,241,0.5)',
        borderRadius: '8px',
        color: '#fff',
        cursor: 'pointer',
        outline: 'none',
        minWidth: '60px',
        textAlign: 'center',
    };

    return (
        <div style={{ position: 'relative', width: '100%' }}>
            {/* Trigger */}
            <button
                ref={triggerRef}
                type="button"
                className="input"
                style={{
                    width: '100%', textAlign: 'left', display: 'flex',
                    alignItems: 'center', gap: '0.5rem', cursor: 'pointer',
                    background: open ? 'rgba(99,102,241,0.10)' : 'var(--color-bg-surface-elevated)',
                    borderColor: open ? 'var(--color-primary)' : undefined,
                    color: formattedDisplay ? 'inherit' : 'rgba(255,255,255,0.35)',
                }}
                onClick={() => setOpen(v => !v)}
            >
                <Calendar size={15} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
                <span style={{ flex: 1 }}>{formattedDisplay || placeholder}</span>
            </button>

            {/* Portal: renders backdrop + popover directly on document.body */}
            {open && typeof document !== 'undefined' && createPortal(
                <>
                    {/* Full-screen invisible backdrop: blocks ALL clicks to page content */}
                    <div
                        style={{
                            position: 'fixed',
                            top: 0, left: 0, right: 0, bottom: 0,
                            zIndex: 99998,
                            background: 'transparent',
                        }}
                        onClick={() => setOpen(false)}
                    />
                    {/* Popover positioned below the trigger */}
                    <div
                        ref={popoverRef}
                        style={{
                            position: 'absolute',
                            top: popoverPos.top,
                            left: popoverPos.left,
                            zIndex: 99999,
                            width: popoverPos.width,
                            minWidth: '340px',
                            padding: '1rem 1.25rem',
                            borderRadius: '14px',
                            boxShadow: '0 24px 64px rgba(0,0,0,0.8)',
                            border: '1px solid rgba(99,102,241,0.45)',
                            background: '#15151c',
                            overflow: 'hidden',
                        }}
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Month nav */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                            <button type="button" style={{ background: 'transparent', border: 'none', color: '#a1a1aa', cursor: 'pointer', padding: '0.25rem' }}
                                onClick={() => { if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); } else setViewMonth(m => m - 1); }}>
                                <ChevronLeft size={16} />
                            </button>
                            <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{MONTHS_FR[viewMonth]} {viewYear}</span>
                            <button type="button" style={{ background: 'transparent', border: 'none', color: '#a1a1aa', cursor: 'pointer', padding: '0.25rem' }}
                                onClick={() => { if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); } else setViewMonth(m => m + 1); }}>
                                <ChevronRight size={16} />
                            </button>
                        </div>

                        {/* Day headers */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', marginBottom: '4px' }}>
                            {DAYS_FR.map(d => (
                                <div key={d} style={{ textAlign: 'center', fontSize: '0.7rem', fontWeight: 700, opacity: 0.4 }}>{d}</div>
                            ))}
                        </div>

                        {/* Days grid */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>
                            {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
                            {Array.from({ length: daysInMonth }).map((_, i) => {
                                const day = i + 1;
                                const past = isPast(day);
                                const sel = isSelected(day);
                                const tod = isToday(day);
                                return (
                                    <button
                                        key={day} type="button" disabled={past}
                                        onClick={() => setSelectedDate({ y: viewYear, m: viewMonth, d: day })}
                                        style={{
                                            width: '100%', aspectRatio: '1', border: 'none', borderRadius: '8px',
                                            fontSize: '0.82rem', fontWeight: sel ? 700 : tod ? 600 : 400,
                                            cursor: past ? 'not-allowed' : 'pointer', opacity: past ? 0.25 : 1,
                                            background: sel ? 'linear-gradient(135deg,var(--color-primary),var(--color-secondary))' : tod ? 'rgba(99,102,241,0.15)' : 'transparent',
                                            color: sel ? '#fff' : 'inherit',
                                            outline: tod && !sel ? '1px solid var(--color-primary)' : 'none',
                                            boxShadow: sel ? '0 2px 12px rgba(99,102,241,0.4)' : 'none',
                                            transition: 'all 0.12s',
                                        }}
                                    >{day}</button>
                                );
                            })}
                        </div>

                        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', margin: '0.75rem 0' }} />

                        {/* Time row */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                            <Clock size={14} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
                            <span style={{ fontSize: '0.82rem', opacity: 0.65, flexShrink: 0 }}>Heure :</span>

                            <select value={hour} onChange={e => setHour(e.target.value)} style={selectStyle}>
                                {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')).map(h => (
                                    <option key={h} value={h} style={{ background: '#1a1a22' }}>{h}h</option>
                                ))}
                            </select>

                            <span style={{ opacity: 0.4, fontSize: '1rem' }}>:</span>

                            <select value={minute} onChange={e => setMinute(e.target.value)} style={selectStyle}>
                                {['00', '15', '30', '45'].map(m => (
                                    <option key={m} value={m} style={{ background: '#1a1a22' }}>{m}</option>
                                ))}
                            </select>

                            {selectedDate && (
                                <button
                                    type="button"
                                    style={{ padding: '0.3rem 0.7rem', whiteSpace: 'nowrap', fontSize: '0.82rem', marginLeft: 'auto', background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', flexShrink: 0 }}
                                    onClick={() => setOpen(false)}
                                >
                                    ✓ OK
                                </button>
                            )}
                        </div>
                    </div>
                </>,
                document.body
            )}
        </div>
    );
}
