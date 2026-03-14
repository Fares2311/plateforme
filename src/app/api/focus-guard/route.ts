import { google } from '@ai-sdk/google';
import { generateObject } from 'ai';
import { z } from 'zod';

export async function POST(req: Request) {
    try {
        const { userName, partnerName, pauseCount, resetEarly, weeklyGoal } = await req.json();

        const triggerCtx = resetEarly
            ? `${userName} a réinitialisé son minuteur avant la fin d'une session focus.`
            : `${userName} a mis en pause son minuteur ${pauseCount} fois lors de la même session focus.`;

        const prompt = `Tu es "Focus Guard", un coach bienveillant et proactif qui aide les binômes d'accountability à rester concentrés.
${triggerCtx}
Objectif de la paire : ${weeklyGoal}h de travail par semaine avec ${partnerName}.

Génère :
1. Un message court et bienveillant (2-3 phrases max) adressé directement à ${userName} qui reconnaît la difficulté, pose une question empathique, et propose de découper la tâche.
2. 3 sous-tâches concrètes et actionnables pour aider à démarrer (chacune réalisable en 15-25 minutes, sans connaître la tâche exacte — reste générique mais utile).

Le message doit être chaleureux, jamais culpabilisant. Utilise "tu" (tutoiement).`;

        const { object } = await generateObject({
            model: google('gemini-2.5-flash'),
            schema: z.object({
                message: z.string().describe('Message bienveillant de 2-3 phrases pour l\'utilisateur'),
                subtasks: z.array(z.string()).length(3).describe('3 sous-tâches concrètes de 15-25 min'),
            }),
            prompt,
        });

        return Response.json(object);
    } catch (error) {
        console.error('Focus Guard error:', error);
        return new Response('Failed', { status: 500 });
    }
}
