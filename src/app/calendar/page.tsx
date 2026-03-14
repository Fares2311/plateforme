'use client';

import { useState, useEffect, useMemo } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, collectionGroup } from 'firebase/firestore';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Calendar, Clock, Users, ArrowRight } from 'lucide-react';
import Link from 'next/link';

const MONTHS_FR = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const DAYS_FR = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

type CalEvent = {
    id: string;
    title: string;
    session_title: string;
    type: 'travail' | 'discussion' | 'recherche';
    date: Date;
    objective_id: string;
    objective_title: string;
    attendees: string[];
    creator_id: string;
};

const TYPE_COLOR: Record<string, string> = {
    travail: '#6366f1',
    discussion: '#ec4899',
    recherche: '#8b5cf6',
};

const TYPE_LABEL: Record<string, string> = {
    travail: '💼 Travail',
    discussion: '💬 Discussion',
    recherche: '🔎 Recherche',
};

function getDaysInMonth(year: number, month: number) {
    return new Date(year, month + 1, 0).getDate();
}
function getFirstDayOfMonth(year: number, month: number) {
    const d = new Date(year, month, 1).getDay();
    return d === 0 ? 6 : d - 1;
}

export default function CalendarPage() {
    const { user } = useAuth();
    const router = useRouter();
    const today = new Date();

    const [events, setEvents] = useState<CalEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [viewYear, setViewYear] = useState(today.getFullYear());
    const [viewMonth, setViewMonth] = useState(today.getMonth());
    const [selectedDay, setSelectedDay] = useState<number | null>(today.getDate());
    const [view, setView] = useState<'month' | 'list'>('month');

    useEffect(() => {
        if (!user) return;
        const load = async () => {
            try {
                // 1. Get all objectives the user is a member of
                const memQ = query(collection(db, 'memberships'), where('user_id', '==', user.uid));
                const memSnap = await getDocs(memQ);
                const objectiveIds = memSnap.docs.map(d => d.data().objective_id as string);

                if (objectiveIds.length === 0) { setLoading(false); return; }

                // 2. Fetch objective titles
                const objTitles: Record<string, string> = {};
                await Promise.all(
                    objectiveIds.map(async (oid) => {
                        const objSnap = await getDocs(query(collection(db, 'objectives'), where('__name__', '==', oid)));
                        if (!objSnap.empty) objTitles[oid] = objSnap.docs[0].data().title;
                    })
                );

                // 3. Fetch all sessions for all objectives
                const allEvents: CalEvent[] = [];
                await Promise.all(
                    objectiveIds.map(async (oid) => {
                        const sessSnap = await getDocs(collection(db, 'objectives', oid, 'sessions'));
                        sessSnap.docs.forEach(d => {
                            const data = d.data();
                            const rawDate = data.scheduled_at?.toDate ? data.scheduled_at.toDate() : new Date(data.scheduled_at);
                            allEvents.push({
                                id: d.id,
                                title: data.title,
                                session_title: data.title,
                                type: data.type ?? 'travail',
                                date: rawDate,
                                objective_id: oid,
                                objective_title: objTitles[oid] ?? 'Salon',
                                attendees: data.attendees ?? [],
                                creator_id: data.creator_id,
                            });
                        });
                    })
                );
                allEvents.sort((a, b) => a.date.getTime() - b.date.getTime());
                setEvents(allEvents);
            } catch (err) {
                console.error('Calendar load error', err);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [user]);

    // Events for selected day
    const eventsForDay = useMemo(() => {
        if (!selectedDay) return [];
        return events.filter(e =>
            e.date.getFullYear() === viewYear &&
            e.date.getMonth() === viewMonth &&
            e.date.getDate() === selectedDay
        );
    }, [events, viewYear, viewMonth, selectedDay]);

    // Events grouped by day for current month
    const eventsByDay = useMemo(() => {
        const map: Record<number, CalEvent[]> = {};
        events.forEach(e => {
            if (e.date.getFullYear() === viewYear && e.date.getMonth() === viewMonth) {
                const d = e.date.getDate();
                if (!map[d]) map[d] = [];
                map[d].push(e);
            }
        });
        return map;
    }, [events, viewYear, viewMonth]);

    // Upcoming events (next 30 days)
    const upcomingEvents = useMemo(() => {
        const now = new Date();
        const limit = new Date(now.getTime() + 30 * 24 * 3600 * 1000);
        return events.filter(e => e.date >= now && e.date <= limit).slice(0, 20);
    }, [events]);

    const prevMonth = () => {
        if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
        else setViewMonth(m => m - 1);
        setSelectedDay(null);
    };
    const nextMonth = () => {
        if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
        else setViewMonth(m => m + 1);
        setSelectedDay(null);
    };

    const daysInMonth = getDaysInMonth(viewYear, viewMonth);
    const firstDay = getFirstDayOfMonth(viewYear, viewMonth);

    const formatTime = (date: Date) =>
        `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

    return (
        <div className="container fade-enter" style={{ maxWidth: '1000px', padding: '2rem 1.5rem' }}>

            {/* Header */}
            <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
                <div>
                    <h2 className="flex items-center gap-2 m-0">
                        <Calendar className="text-primary" /> Mon Calendrier
                    </h2>
                    <p className="text-secondary m-0 mt-1 text-sm">Toutes vos sessions planifiées, tous salons confondus</p>
                </div>
                <div className="flex gap-2">
                    <button className={`btn btn-sm ${view === 'month' ? 'btn-primary' : 'btn-ghost text-secondary'}`} onClick={() => setView('month')}>
                        📅 Mois
                    </button>
                    <button className={`btn btn-sm ${view === 'list' ? 'btn-primary' : 'btn-ghost text-secondary'}`} onClick={() => setView('list')}>
                        📋 Liste
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="card card-glass text-center py-16">
                    <div className="loader mx-auto" style={{ width: '2rem', height: '2rem', borderRadius: '50%', border: '3px solid var(--color-border)', borderTopColor: 'var(--color-primary)', animation: 'spin 1s linear infinite' }} />
                    <p className="text-secondary mt-4">Chargement de vos sessions...</p>
                </div>
            ) : view === 'list' ? (
                /* LIST VIEW */
                <div>
                    <h4 className="text-secondary mb-4" style={{ fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                        Sessions à venir — 30 prochains jours
                    </h4>
                    {upcomingEvents.length === 0 ? (
                        <div className="card card-glass text-center py-16">
                            <Calendar size={48} className="text-primary mx-auto mb-4 opacity-30" />
                            <h3 className="text-secondary">Aucune session à venir</h3>
                            <p className="opacity-50">Programmez des sessions dans vos salons via l'onglet Agenda.</p>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-3">
                            {upcomingEvents.map((ev, i) => {
                                const color = TYPE_COLOR[ev.type] ?? '#6366f1';
                                const isPast = ev.date < new Date();
                                return (
                                    <Link
                                        key={ev.id}
                                        href={`/objective/${ev.objective_id}`}
                                        className="card card-glass fade-enter"
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem 1.25rem',
                                            borderLeft: `3px solid ${color}`, textDecoration: 'none',
                                            opacity: isPast ? 0.5 : 1, animationDelay: `${i * 0.05}s`,
                                            transition: 'background 0.2s ease'
                                        }}
                                    >
                                        {/* Date block */}
                                        <div style={{ textAlign: 'center', minWidth: '52px', background: `${color}18`, borderRadius: '10px', padding: '0.5rem 0.25rem' }}>
                                            <div style={{ fontSize: '1.5rem', fontWeight: 800, lineHeight: 1, color }}>{ev.date.getDate()}</div>
                                            <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', fontWeight: 600, opacity: 0.7, letterSpacing: '0.06em' }}>
                                                {MONTHS_FR[ev.date.getMonth()].substring(0, 3)}
                                            </div>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                <span style={{ fontSize: '0.75rem', background: `${color}22`, color, padding: '2px 8px', borderRadius: '10px', fontWeight: 700 }}>
                                                    {TYPE_LABEL[ev.type]}
                                                </span>
                                                {isPast && <span style={{ fontSize: '0.7rem', opacity: 0.5 }}>Passée</span>}
                                            </div>
                                            <div style={{ fontWeight: 600, fontSize: '0.95rem' }} className="truncate">{ev.session_title}</div>
                                            <div className="flex items-center gap-3 mt-1" style={{ fontSize: '0.8rem', opacity: 0.6 }}>
                                                <span><Clock size={11} className="inline mr-1" />{formatTime(ev.date)}</span>
                                                <span className="truncate">{ev.objective_title}</span>
                                                <span><Users size={11} className="inline mr-1" />{ev.attendees.length}</span>
                                            </div>
                                        </div>
                                        <ArrowRight size={16} style={{ opacity: 0.3, flexShrink: 0 }} />
                                    </Link>
                                );
                            })}
                        </div>
                    )}
                </div>
            ) : (
                /* MONTH VIEW */
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '1.5rem' }}>
                    {/* Calendar grid */}
                    <div className="card card-glass" style={{ padding: '1.25rem' }}>
                        {/* Month nav */}
                        <div className="flex items-center justify-between mb-4">
                            <button className="btn btn-sm btn-ghost" onClick={prevMonth}><ChevronLeft size={18} /></button>
                            <h3 className="m-0" style={{ fontSize: '1.1rem' }}>{MONTHS_FR[viewMonth]} {viewYear}</h3>
                            <button className="btn btn-sm btn-ghost" onClick={nextMonth}><ChevronRight size={18} /></button>
                        </div>

                        {/* Day headers */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', marginBottom: '6px' }}>
                            {DAYS_FR.map(d => (
                                <div key={d} style={{ textAlign: 'center', fontSize: '0.72rem', fontWeight: 700, opacity: 0.4, paddingBottom: '4px' }}>{d}</div>
                            ))}
                        </div>

                        {/* Day cells */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '3px' }}>
                            {/* Empty offset cells */}
                            {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
                            {/* Days */}
                            {Array.from({ length: daysInMonth }).map((_, i) => {
                                const day = i + 1;
                                const dayEvents = eventsByDay[day] ?? [];
                                const isToday = today.getFullYear() === viewYear && today.getMonth() === viewMonth && today.getDate() === day;
                                const isSelected = selectedDay === day;
                                const isPast = new Date(viewYear, viewMonth, day) < new Date(today.getFullYear(), today.getMonth(), today.getDate());

                                return (
                                    <div
                                        key={day}
                                        onClick={() => setSelectedDay(day)}
                                        style={{
                                            borderRadius: '10px',
                                            padding: '6px 4px',
                                            cursor: 'pointer',
                                            background: isSelected
                                                ? 'linear-gradient(135deg, var(--color-primary), var(--color-secondary))'
                                                : isToday
                                                    ? 'rgba(99,102,241,0.12)'
                                                    : dayEvents.length > 0
                                                        ? 'rgba(255,255,255,0.04)'
                                                        : 'transparent',
                                            outline: isToday && !isSelected ? '1px solid var(--color-primary)' : 'none',
                                            opacity: isPast && !isSelected ? 0.5 : 1,
                                            transition: 'all 0.15s ease',
                                            minHeight: '52px',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            alignItems: 'center',
                                            gap: '3px'
                                        }}
                                    >
                                        <span style={{ fontSize: '0.85rem', fontWeight: isSelected || isToday ? 700 : 400, color: isSelected ? '#fff' : 'inherit' }}>
                                            {day}
                                        </span>
                                        {/* Event dots */}
                                        <div style={{ display: 'flex', gap: '2px', flexWrap: 'wrap', justifyContent: 'center' }}>
                                            {dayEvents.slice(0, 3).map((ev, di) => (
                                                <div
                                                    key={di}
                                                    style={{
                                                        width: '6px', height: '6px', borderRadius: '50%',
                                                        background: isSelected ? 'rgba(255,255,255,0.8)' : (TYPE_COLOR[ev.type] ?? '#6366f1'),
                                                    }}
                                                />
                                            ))}
                                            {dayEvents.length > 3 && (
                                                <div style={{ fontSize: '0.55rem', fontWeight: 700, opacity: 0.7 }}>+{dayEvents.length - 3}</div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Legend */}
                        <div className="flex gap-4 justify-center mt-5" style={{ fontSize: '0.75rem', opacity: 0.5 }}>
                            {Object.entries(TYPE_COLOR).map(([type, color]) => (
                                <span key={type} className="flex items-center gap-1">
                                    <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: color }} />
                                    {type}
                                </span>
                            ))}
                        </div>
                    </div>

                    {/* Day detail panel */}
                    <div className="card card-glass" style={{ padding: '1.25rem', overflowY: 'auto', maxHeight: '520px' }}>
                        {selectedDay ? (
                            <>
                                <h4 className="m-0 mb-4" style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: '0.75rem' }}>
                                    📅 {selectedDay} {MONTHS_FR[viewMonth]}
                                </h4>
                                {eventsForDay.length === 0 ? (
                                    <div className="text-center py-8" style={{ opacity: 0.4 }}>
                                        <Calendar size={32} className="mx-auto mb-2" />
                                        <p style={{ fontSize: '0.85rem' }}>Aucune session ce jour</p>
                                    </div>
                                ) : (
                                    <div className="flex flex-col gap-3">
                                        {eventsForDay.map(ev => {
                                            const color = TYPE_COLOR[ev.type] ?? '#6366f1';
                                            return (
                                                <Link
                                                    key={ev.id}
                                                    href={`/objective/${ev.objective_id}`}
                                                    style={{ textDecoration: 'none' }}
                                                >
                                                    <div
                                                        className="card card-glass"
                                                        style={{ padding: '0.75rem', borderLeft: `3px solid ${color}`, cursor: 'pointer', transition: 'background 0.15s ease' }}
                                                    >
                                                        <div style={{ fontSize: '0.72rem', color, fontWeight: 700, marginBottom: '4px' }}>
                                                            {TYPE_LABEL[ev.type]}
                                                        </div>
                                                        <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '4px' }}>{ev.session_title}</div>
                                                        <div style={{ fontSize: '0.78rem', opacity: 0.6, display: 'flex', gap: '0.75rem' }}>
                                                            <span><Clock size={11} className="inline mr-1" />{formatTime(ev.date)}</span>
                                                            <span><Users size={11} className="inline mr-1" />{ev.attendees.length} participant{ev.attendees.length !== 1 ? 's' : ''}</span>
                                                        </div>
                                                        <div style={{ fontSize: '0.75rem', opacity: 0.45, marginTop: '4px' }}>
                                                            {ev.objective_title}
                                                        </div>
                                                    </div>
                                                </Link>
                                            );
                                        })}
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="text-center py-8" style={{ opacity: 0.3 }}>
                                <Calendar size={40} className="mx-auto mb-3" />
                                <p style={{ fontSize: '0.85rem' }}>Sélectionnez un jour pour voir les sessions</p>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
