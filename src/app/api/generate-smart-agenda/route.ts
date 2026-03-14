import { google } from '@ai-sdk/google';
import { generateObject } from 'ai';
import { z } from 'zod';

export async function POST(req: Request) {
    try {
        const { title, category, targetHours, rhythm, timePref } = await req.json();

        // rhythm can be: 'leger' (1-2x / week), 'regulier' (3-4x / week), 'intensif' (daily/almost daily)

        const prompt = `
Tu es un planificateur de projets et un coach d'apprentissage pro-actif pour un groupe de travail.
Le projet/salon s'appelle "${title}" (Catégorie: ${category}). L'objectif de temps de travail est de ${targetHours} heures par membre.

Ton objectif est de créer un **Plan d'Action Intelligent (Smart Agenda)** complet. Tu vas d'abord décomposer l'objectif global en une série d'étapes (milestones) logiques, avec une estimation de temps, puis tu vas proposer un planning de sessions concrètes pour avancer sur ces étapes.

**1. Étapes Logiques (Milestones)**
Génère une liste d'étapes clés nécessaires pour accomplir "${title}". 
- Les étapes doivent être orientées vers l'action et claires (ex: "Configurer l'environnement de développement", "Lire le chapitre 1 à 3", "Rédiger l'introduction").
- Pour chaque étape, estime le temps nécessaire en heures. La somme du temps estimé pour toutes les étapes doit s'approcher de ${targetHours}h.

**2. Sessions de travail (Agenda)**
Ensuite, crée un planning de futures sessions de travail réparties sur les 2 prochaines semaines.
Rythme demandé par l'utilisateur: "${rhythm}".
- Rythme Léger: 2 à 3 sessions au total, espacées.
- Rythme Régulier: 4 à 6 sessions au total.
- Rythme Intensif: 8 à 10 sessions au total.

${timePref ? `⚠️ Très important : Les membres ont spécifié des préférences d'horaires : "${timePref}". Adapte l'heure des sessions de travail à ces préférences.` : ''}

Aujourd'hui nous sommes le ${new Date().toISOString()}.
Génère des dates (format ISO 8601 YYYY-MM-DDTHH:mm:00Z) réparties **dans le futur** (dans les 14 prochains jours). Varie les heures en fonction des préférences.
Pour chaque session, fais un lien clair avec le Milestone correspondant dans la description.
`;

        const { object } = await generateObject({
            model: google('gemini-2.5-flash'),
            schema: z.object({
                milestones: z.array(z.object({
                    title: z.string().describe("Titre court et clair de l'étape"),
                    description: z.string().describe("Description de 1 ou 2 phrases de ce qu'il faut accomplir"),
                    estimated_hours: z.number().describe("Nombre d'heures estimées pour cette étape (par exemple 2.5)"),
                })),
                sessions: z.array(z.object({
                    title: z.string().describe("Titre de la session (ex: Intro et configuration)"),
                    description: z.string().describe("Description de ce sur quoi les membres devraient se concentrer"),
                    type: z.enum(['travail', 'discussion', 'recherche']),
                    scheduled_at: z.string().describe("Date ISO 8601 future"),
                }))
            }),
            prompt: prompt,
        });

        return Response.json(object);

    } catch (error: any) {
        console.error('Error generating smart agenda:', error);
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
}
