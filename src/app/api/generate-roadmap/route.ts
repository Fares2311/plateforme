import { google } from '@ai-sdk/google';
import { generateObject } from 'ai';
import { z } from 'zod';

export async function POST(req: Request) {
    try {
        const {
            type, title, description, category, members,
            milestones, resources, decisions, announcements,
            questions, focuses, userPrompt, today,
        } = await req.json();

        if (!title) return new Response('Missing title', { status: 400 });

        const PHASE_COLORS = ['#6366f1','#ec4899','#f97316','#10b981','#f59e0b','#14b8a6','#8b5cf6','#3b82f6'];

        const contextSections: string[] = [];
        if (description) contextSections.push(`Description: ${description}`);
        if (category) contextSections.push(`Catégorie: ${category}`);
        if (members?.length) contextSections.push(`Membres (${members.length}): ${members.slice(0,8).join(', ')}`);
        if (milestones?.length) contextSections.push(`Étapes/tâches existantes:\n${milestones.map((m: any) => `  - [${m.completed ? 'x' : ' '}] ${m.text}`).join('\n')}`);
        if (focuses?.length) contextSections.push(`Points de focus:\n${focuses.map((f: string) => `  - ${f}`).join('\n')}`);
        if (decisions?.length) contextSections.push(`Décisions prises:\n${decisions.map((d: any) => `  - ${d.title}${d.description ? ': ' + d.description : ''}${d.outcome ? ' [' + d.outcome + ']' : ''}`).join('\n')}`);
        if (announcements?.length) contextSections.push(`Annonces:\n${announcements.map((a: any) => `  - ${a.title}${a.content ? ': ' + a.content.slice(0,120) : ''}`).join('\n')}`);
        if (questions?.length) contextSections.push(`Q&R:\n${questions.filter((q: any) => q.answer).map((q: any) => `  Q: ${q.question}\n  R: ${q.answer}`).join('\n')}`);
        if (resources?.length) contextSections.push(`Ressources: ${resources.slice(0,10).join(', ')}`);

        const systemPrompt = `Tu es un expert en gestion de projet et planification stratégique. Tu analyses les données d'un ${type === 'project' ? 'projet' : 'objectif'} pour générer une roadmap réaliste et actionnable avec des phases et des jalons clés.

Règles importantes:
- Génère entre 2 et 6 phases logiques et progressives
- Génère entre 2 et 10 jalons (milestones) clés bien répartis
- Les dates doivent être cohérentes et réalistes par rapport à aujourd'hui (${today})
- Les dates au format YYYY-MM-DD
- phase_index référence l'index de la phase dans le tableau (0 = première phase)
- Les types de jalons: milestone (jalon général), deadline (date limite), launch (lancement), review (revue)
- Si des délais ou contraintes sont mentionnés, respecte-les absolument
- La roadmap doit couvrir typiquement de 1 à 12 mois selon la complexité
- Sois précis et opérationnel, pas générique`;

        const userContext = contextSections.length > 0
            ? `\n\nContexte du ${type === 'project' ? 'projet' : 'objectif'} "${title}":\n${contextSections.join('\n\n')}`
            : '';

        const finalPrompt = `${systemPrompt}${userContext}${userPrompt ? `\n\nInstructions supplémentaires de l'utilisateur:\n${userPrompt}` : ''}

Génère une roadmap complète pour ce ${type === 'project' ? 'projet' : 'objectif'}.`;

        const { object } = await generateObject({
            model: google('gemini-2.5-flash'),
            schema: z.object({
                phases: z.array(z.object({
                    title: z.string().describe('Nom court de la phase'),
                    description: z.string().describe('Description de ce qui se passe dans cette phase'),
                    start_date: z.string().describe('Date de début YYYY-MM-DD'),
                    end_date: z.string().describe('Date de fin YYYY-MM-DD'),
                    color_index: z.number().min(0).max(7).describe('Index de couleur 0-7'),
                })),
                milestones: z.array(z.object({
                    title: z.string().describe('Nom du jalon'),
                    date: z.string().describe('Date YYYY-MM-DD'),
                    type: z.enum(['milestone','deadline','launch','review']),
                    phase_index: z.number().min(-1).describe('Index de la phase associée (-1 = aucune)'),
                })),
            }),
            prompt: finalPrompt,
        });

        const phases = object.phases.map((p, i) => ({
            title: p.title,
            description: p.description,
            start_date: p.start_date,
            end_date: p.end_date,
            color: PHASE_COLORS[p.color_index % PHASE_COLORS.length],
        }));

        return Response.json({ phases, milestones: object.milestones });

    } catch (error) {
        console.error('AI Roadmap Generation Error:', error);
        return new Response('Failed to generate roadmap', { status: 500 });
    }
}
