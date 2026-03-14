const fs = require('fs');
const path = require('path');

const pbPath = '/Users/fares/Documents/Projet TEST/gitsync/src/components/ProjectBoard.tsx';
let pbc = fs.readFileSync(pbPath, 'utf8');

// 1. Add CalendarPicker import
pbc = pbc.replace(
    "import { motion, AnimatePresence } from 'framer-motion';",
    "import { motion, AnimatePresence } from 'framer-motion';\nimport CalendarPicker from '@/components/CalendarPicker';"
);

// 2. Props
pbc = pbc.replace(
    "export default function ProjectBoard({ projectId, user, projectMembers }: { projectId: string; user: any; projectMembers: any[] }) {",
    "export default function ProjectBoard({ projectId, user, projectMembers, currentUserRole = 'member' }: { projectId: string; user: any; projectMembers: any[]; currentUserRole?: 'admin' | 'member' }) {"
);

// 3. States
pbc = pbc.replace(
    "const [formDeadline, setFormDeadline] = useState<string>(''); // YYYY-MM-DD",
    "const [formDeadline, setFormDeadline] = useState<string>('');\n    const [canEditForm, setCanEditForm] = useState<boolean>(true);"
);

// 4. openTaskForm
pbc = pbc.replace(
    /const openTaskForm = \(status: TaskStatus = 'todo', task\?: ProjectTask\) => \{([\s\S]*?)setShowTaskForm\(true\);\n    \};/g,
    `const openTaskForm = (status: TaskStatus = 'todo', task?: ProjectTask) => {
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
            if (task.deadline?.toDate) {
                const date = task.deadline.toDate();
                const yyyy = date.getFullYear();
                const mm = String(date.getMonth() + 1).padStart(2, '0');
                const dd = String(date.getDate()).padStart(2, '0');
                const hh = String(date.getHours()).padStart(2, '0');
                const min = String(date.getMinutes()).padStart(2, '0');
                setFormDeadline(\`\${yyyy}-\${mm}-\${dd}T\${hh}:\${min}\`);
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
        }
        setShowTaskForm(true);
    };`
);

// 5. handleSaveTask parsing
pbc = pbc.replace(
    /let deadlineDate = null;\n        if \(formDeadline\) \{\n            \/\/ parse manual local date to midnight explicitly\n            const \[y, m, d\] = formDeadline\.split\('-'\)\.map\(Number\);\n            deadlineDate = new Date\(y, m - 1, d\);\n        \}/g,
    `let deadlineDate = null;
        if (formDeadline) {
            deadlineDate = new Date(formDeadline);
        }`
);

// 6. canEdit check in handleSaveTask
pbc = pbc.replace(
    `e.preventDefault();\n        if (!formText.trim()) return;`,
    `e.preventDefault();\n        if (!canEditForm || !formText.trim()) return;`
);

// 7. Replace type="date" and inputs with disabled={!canEditForm}
pbc = pbc.replace(
    `<input type="text" className="input" value={formText} onChange={e => setFormText(e.target.value)} required placeholder="Ex: Développer la page d'accueil" />`,
    `<input type="text" className="input" value={formText} onChange={e => setFormText(e.target.value)} required placeholder="Ex: Développer la page d'accueil" disabled={!canEditForm} />`
);
pbc = pbc.replace(
    `<textarea className="input" value={formDesc} onChange={e => setFormDesc(e.target.value)} rows={3} placeholder="Détails de la tâche..." style={{ resize: 'vertical' }} />`,
    `<textarea className="input" value={formDesc} onChange={e => setFormDesc(e.target.value)} rows={3} placeholder="Détails de la tâche..." style={{ resize: 'vertical' }} disabled={!canEditForm} />`
);
pbc = pbc.replace(
    `<select className="input" value={formStatus} onChange={e => setFormStatus(e.target.value as TaskStatus)}>`,
    `<select className="input" value={formStatus} onChange={e => setFormStatus(e.target.value as TaskStatus)} disabled={!canEditForm}>`
);
pbc = pbc.replace(
    `<select className="input" value={formPriority} onChange={e => setFormPriority(e.target.value as TaskPriority)}>`,
    `<select className="input" value={formPriority} onChange={e => setFormPriority(e.target.value as TaskPriority)} disabled={!canEditForm}>`
);
pbc = pbc.replace(
    `<input type="date" className="input" value={formDeadline} onChange={e => setFormDeadline(e.target.value)} />`,
    `<div style={{ pointerEvents: canEditForm ? 'auto' : 'none', opacity: canEditForm ? 1 : 0.6 }}>\n                                        <CalendarPicker value={formDeadline} onChange={setFormDeadline} placeholder="Sélectionner une date et heure" />\n                                    </div>`
);
// Assignee selection disabling
pbc = pbc.replace(
    `onClick={() => setFormAssignees(prev => isSelected ? prev.filter(id => id !== m.user_id) : [...prev, m.user_id])}`,
    `onClick={() => canEditForm && setFormAssignees(prev => isSelected ? prev.filter(id => id !== m.user_id) : [...prev, m.user_id])}`
);
pbc = pbc.replace(
    /cursor: 'pointer'/g,
    `cursor: canEditForm ? 'pointer' : 'default'`
);

// Hide save buttons if not canEditForm
pbc = pbc.replace(
    `{editingTask && (`,
    `{editingTask && canEditForm && (`
);
pbc = pbc.replace(
    `<button type="submit" className="btn btn-primary"><Save size={16} /> Enregistrer</button>`,
    `{canEditForm && <button type="submit" className="btn btn-primary"><Save size={16} /> Enregistrer</button>}`
);

// 8. Full Name Avatar Replacement (in kanban and list)
// Kanban:
pbc = pbc.replace(
    /<img key=\{uid\} src=\{m\.photo_url \|\| `https:\/\/ui-avatars\.com\/api\/\?name=\$\{encodeURIComponent\(m\.full_name\)\}&background=random`\} alt=\{m\.full_name\} title=\{m\.full_name\} \/>/g,
    `<div key={uid} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--color-bg-surface-elevated)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-full)', padding: '2px 8px 2px 2px', marginLeft: '-0.5rem', zIndex: 1, position: 'relative' }} title={m.full_name}>\n                                                                                <img src={m.photo_url || \`https://ui-avatars.com/api/?name=\${encodeURIComponent(m.full_name)}&background=random\`} alt={m.full_name} style={{ width: '20px', height: '20px', borderRadius: '50%' }} />\n                                                                                <span style={{ fontSize: '0.65rem', fontWeight: 600, whiteSpace: 'nowrap' }}>{m.full_name.split(' ')[0]}</span>\n                                                                            </div>`
);


// Save PB
fs.writeFileSync(pbPath, pbc, 'utf8');

// --- Session Page Update ---
const sessionPath = '/Users/fares/Documents/Projet TEST/gitsync/src/app/session/page.tsx';
let sessionc = fs.readFileSync(sessionPath, 'utf8');

// The objectiveId logic needs to accommodate type=project or type=objective.
sessionc = sessionc.replace("const objectiveId = params.get('id');", "const objectiveId = params.get('id');\n    const sessionType = params.get('type') === 'project' ? 'projects' : 'objectives';\n    const targetRouteType = params.get('type') === 'project' ? 'project' : 'objective';");

sessionc = sessionc.replace(/doc\(db, 'objectives', objectiveId\)/g, "doc(db, sessionType, objectiveId)");
sessionc = sessionc.replace(/doc\(db, 'objectives', objectiveId, 'live_session'/g, "doc(db, sessionType, objectiveId, 'live_session'");
sessionc = sessionc.replace(/collection\(db, 'objectives', objectiveId, 'live_session'\)/g, "collection(db, sessionType, objectiveId, 'live_session')");
sessionc = sessionc.replace(/collection\(db, 'objectives', objectiveId, 'session_resources'\)/g, "collection(db, sessionType, objectiveId, 'session_resources')");
sessionc = sessionc.replace(/doc\(db, 'objectives', objectiveId, 'session_resources'/g, "doc(db, sessionType, objectiveId, 'session_resources'");
sessionc = sessionc.replace(/doc\(db, 'objectives', objectiveId, 'whiteboard'/g, "doc(db, sessionType, objectiveId, 'whiteboard'");
sessionc = sessionc.replace(/db, 'objectives', objectiveId/g, "db, sessionType, objectiveId");

// Replace URL of /objective/${objectiveId} in session/page.tsx
sessionc = sessionc.replace(
    /router\.push\(`\/objective\/\$\{objectiveId\}`\)/g,
    "router.push(`/${targetRouteType}/${objectiveId}`)"
);

fs.writeFileSync(sessionPath, sessionc, 'utf8');

console.log("Applied updates successfully.");
