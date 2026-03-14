import { google } from '@ai-sdk/google';
import { generateObject } from 'ai';
import { z } from 'zod';

export async function POST(req: Request) {
    try {
        const { title, category, targetHours } = await req.json();

        if (!title) {
            return new Response('Missing objective title', { status: 400 });
        }

        const prompt = `Voici mon projet/objectif : "${title}". 
La catégorie est: "${category}". L'objectif m'a été assigné pour environ ${targetHours} heures.
Génère une roadmap détaillée (jusqu'à 10 étapes clés) pour m'aider à accomplir cela avec succès.
Pour chaque étape, donne-moi un titre court et une description détaillée (qui peut inclure des conseils, des pièges à éviter, ou comment s'y prendre).`;

        const { object } = await generateObject({
            model: google('gemini-2.5-flash'),
            schema: z.object({
                milestones: z.array(z.object({
                    title: z.string(),
                    description: z.string(),
                }))
            }),
            prompt: prompt,
        });

        return Response.json({ milestones: object.milestones });

    } catch (error) {
        console.error('AI Generation Error:', error);
        return new Response('Failed to generate roadmap', { status: 500 });
    }
}
