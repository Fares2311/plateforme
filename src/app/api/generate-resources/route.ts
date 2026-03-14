import { google } from '@ai-sdk/google';
import { generateText } from 'ai';

export async function POST(req: Request) {
    try {
        const { title, category, userPrompt } = await req.json();

        if (!title) {
            return new Response('Missing objective title', { status: 400 });
        }

        const extraContext = userPrompt?.trim()
            ? `\nL'utilisateur précise : "${userPrompt.trim()}".`
            : '';

        const prompt = `Je travaille sur un projet intitulé "${title}" (catégorie : ${category || 'général'}).${extraContext}
En tant que mentor, recommande-moi exactement 5 ressources clés (cours en ligne, documentation officielle, outils, concepts à rechercher) pour progresser sur ce projet.
Réponds uniquement avec une liste de 5 lignes, chaque ligne commençant par "- ". Sois concis et très pertinent. Pas d'introduction ni de conclusion.`;

        const { text } = await generateText({
            model: google('gemini-2.5-flash'),
            prompt,
        });

        // Robust parsing: accept lines starting with -, *, •, or numbers like "1."
        const resources = text.split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0)
            .filter(line => /^[-*•]|^\d+[.)]\s/.test(line))
            .map(line => line.replace(/^[-*•]\s*|^\d+[.)]\s*/, '').replace(/\*\*/g, '').trim())
            .filter(line => line.length > 0);

        return Response.json({ resources });

    } catch (error) {
        console.error('AI Generation Error:', error);
        return new Response('Failed to generate resources', { status: 500 });
    }
}
