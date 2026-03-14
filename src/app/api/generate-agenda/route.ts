import { google } from '@ai-sdk/google';
import { generateObject } from 'ai';
import { z } from 'zod';

export async function POST(req: Request) {
  try {
    const { title, category, targetHours, rhythm, timePref } = await req.json();

    // rhythm can be: 'leger' (1-2x / week), 'regulier' (3-4x / week), 'intensif' (daily/almost daily)

    const prompt = `
Tu es un assistant de planification pour un groupe d'étude/coworking.
Le salon s'appelle "${title}" (Catégorie: ${category}). L'objectif horaire par membre est de ${targetHours} h.

Le but est de générer un planning de sessions à venir sur les 2 prochaines semaines, selon le rythme demandé: "${rhythm}".
- Rythme Léger: 2 à 3 sessions au total, espacées.
- Rythme Régulier: 4 à 6 sessions au total.
- Rythme Intensif: 8 à 10 sessions au total.

  ${timePref ? `Très important : Les membres ont spécifié des préférences d'horaires : "${timePref}". Adapte l'heure des sessions de travail à ces préférences.` : ''}

Important pour les dates:
Aujourd'hui nous sommes le ${new Date().toISOString()}.
Génère des dates(format ISO 8601 YYYY - MM - DDTHH: mm:00Z) réparties ** dans le futur ** (dans les 14 prochains jours). Varie les heures(matin, soir, week - end).
Assigne un 'type' de session de manière cohérente.
`;

    const { object } = await generateObject({
      model: google('gemini-2.5-flash'),
      schema: z.object({
        sessions: z.array(z.object({
          title: z.string(),
          description: z.string(),
          type: z.enum(['travail', 'discussion', 'recherche']),
          scheduled_at: z.string(), // ISO date
        }))
      }),
      prompt: prompt,
    });

    return Response.json({ sessions: object.sessions });

  } catch (error: any) {
    console.error('Error generating agenda:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
