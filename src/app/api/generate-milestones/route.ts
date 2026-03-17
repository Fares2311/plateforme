import { google } from '@ai-sdk/google';
import { generateObject } from 'ai';
import { z } from 'zod';

export async function POST(req: Request) {
    try {
        const {
            type, title, description, category,
            phases, existingMilestones, steps, decisions, userPrompt, today,
        } = await req.json();

        if (!title || !phases?.length) {
            return new Response('Missing title or phases', { status: 400 });
        }

        const phaseSummary = phases.map((p: any, i: number) =>
            `  Phase ${i + 1} [id:${p.id}] "${p.title}" — du ${p.start_date} au ${p.end_date}${p.description ? ` : ${p.description}` : ''}`
        ).join('\n');

        const contextParts: string[] = [];
        if (description) contextParts.push(`Description: ${description}`);
        if (category) contextParts.push(`Catégorie: ${Array.isArray(category) ? category.join(', ') : category}`);
        if (steps?.length) contextParts.push(`Étapes/tâches: ${steps.slice(0, 12).map((s: any) => `[${s.completed ? 'x' : ' '}] ${s.text}`).join(', ')}`);
        if (decisions?.length) contextParts.push(`Décisions: ${decisions.slice(0, 6).map((d: any) => d.title).join(', ')}`);
        if (existingMilestones?.length) contextParts.push(`Jalons existants (à ne pas dupliquer): ${existingMilestones.map((m: any) => `"${m.title}" (${m.date})`).join(', ')}`);

        const prompt = `Tu es un expert en gestion de projet. Analyse les phases d'une roadmap et génère des jalons (milestones) précis et réalistes pour chaque phase.

${type === 'project' ? 'Projet' : 'Objectif'}: "${title}"
${contextParts.length ? contextParts.join('\n') : ''}

Phases de la roadmap:
${phaseSummary}

Règles:
- Génère 1 à 3 jalons pertinents PAR phase — chaque jalon doit marquer un point de contrôle concret
- Utilise exactement l'id de phase fourni dans le champ phase_id (ex: "${phases[0].id}")
- Les dates doivent être dans l'intervalle de la phase concernée, au format YYYY-MM-DD
- Aujourd'hui: ${today}
- Types disponibles: milestone (jalon général), deadline (date limite critique), launch (mise en production / livraison), review (revue / rétrospective)
- Choisis le type qui correspond le mieux à la nature du jalon
- Titres courts et opérationnels (max 60 car), pas génériques${existingMilestones?.length ? '\n- Ne pas créer de jalons qui ressemblent aux existants' : ''}${userPrompt ? `\n\nInstructions supplémentaires: ${userPrompt}` : ''}

Génère des jalons concrets et actionnables qui reflètent réellement les livrables et points de contrôle de ce ${type === 'project' ? 'projet' : 'objectif'}.`;

        const { object } = await generateObject({
            model: google('gemini-2.5-flash'),
            schema: z.object({
                milestones: z.array(z.object({
                    title: z.string().describe('Titre court du jalon (max 60 caractères)'),
                    date: z.string().describe('Date YYYY-MM-DD dans l\'intervalle de la phase'),
                    type: z.enum(['milestone', 'deadline', 'launch', 'review']),
                    phase_id: z.string().describe('ID exact de la phase parente tel que fourni'),
                    rationale: z.string().describe('Une phrase expliquant pourquoi ce jalon est important'),
                })),
            }),
            prompt,
        });

        return Response.json({ milestones: object.milestones });

    } catch (error) {
        console.error('Milestone Generation Error:', error);
        return new Response('Failed to generate milestones', { status: 500 });
    }
}
