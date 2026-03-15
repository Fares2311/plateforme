import { google } from '@ai-sdk/google';
import { generateText } from 'ai';

const fmtDate = (d: any) => {
    if (!d) return 'non définie';
    try {
        return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch { return d; }
};

export async function POST(req: Request) {
    try {
        const { projectTitle, members, tasks, sessions } = await req.json();

        // Build per-member schedule
        const now = new Date();
        const horizon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days

        const memberSchedules = members.map((m: any) => {
            const myTasks = tasks.filter((t: any) =>
                t.assignees?.includes(m.user_id) &&
                t.status !== 'done' &&
                t.deadline
            ).map((t: any) => ({
                title: t.text,
                deadline: t.deadline,
                priority: t.priority,
                status: t.status,
            }));

            const mySessions = sessions.filter((s: any) =>
                s.attendees?.includes(m.user_id) &&
                new Date(s.scheduled_at) >= now &&
                new Date(s.scheduled_at) <= horizon
            ).map((s: any) => ({
                title: s.title,
                date: s.scheduled_at,
                type: s.type,
            }));

            return {
                name: m.full_name,
                user_id: m.user_id,
                tasks: myTasks,
                sessions: mySessions,
                taskCount: myTasks.length,
                sessionCount: mySessions.length,
            };
        });

        const prompt = `Tu es un gestionnaire de projet expert. Analyse la charge de travail de l'équipe du projet "${projectTitle}" pour les 30 prochains jours.

CHARGE PAR MEMBRE :
${memberSchedules.map((m: any) => `
**${m.name}** (${m.taskCount} tâches, ${m.sessionCount} sessions à venir)
Tâches : ${m.tasks.length === 0 ? 'Aucune' : m.tasks.map((t: any) => `"${t.title}" (${t.priority}, deadline: ${fmtDate(t.deadline)})`).join(', ')}
Sessions : ${m.sessions.length === 0 ? 'Aucune' : m.sessions.map((s: any) => `"${s.title}" le ${fmtDate(s.date)}`).join(', ')}
`).join('\n')}

INSTRUCTIONS :
1. Détecte les surcharges (membre avec beaucoup plus de tâches que les autres)
2. Détecte les conflits de dates (deadline + session le même jour ou à ±1 jour)
3. Identifie les membres sous-chargés qui pourraient aider
4. Propose des redistributions concrètes et réalisables

Réponds UNIQUEMENT en JSON valide avec cette structure exacte :
{
  "overloaded": [{ "member": "nom", "reason": "explication courte" }],
  "conflicts": [{ "member": "nom", "conflict": "description du conflit de date" }],
  "underloaded": [{ "member": "nom", "capacity": "ce qu'il peut prendre en plus" }],
  "suggestions": [{ "action": "action concrète", "from": "membre qui donne", "to": "membre qui reçoit", "task": "tâche concernée" }],
  "summary": "résumé global en 1-2 phrases"
}`;

        const { text } = await generateText({
            model: google('gemini-2.5-flash'),
            prompt,
        });

        // Extract JSON from response
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('No JSON in response');

        const result = JSON.parse(jsonMatch[0]);
        return Response.json({ ...result, memberSchedules });

    } catch (error) {
        console.error('Conflict detection error:', error);
        return new Response('Failed to detect conflicts', { status: 500 });
    }
}
