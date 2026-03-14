import { google } from '@ai-sdk/google';
import { generateText } from 'ai';

export async function POST(req: Request) {
    try {
        const { myName, partnerName, weeklyGoal, linkedSalon, myProgress, partnerProgress, userQuestion } = await req.json();

        const progressCtx = linkedSalon
            ? `Salon lié : "${linkedSalon}". ${myName} a complété ${myProgress}h, ${partnerName} a complété ${partnerProgress}h.`
            : '';

        const questionCtx = userQuestion?.trim()
            ? `\nQuestion posée par l'utilisateur : "${userQuestion.trim()}".`
            : '';

        const prompt = `Tu es un coach d'accountability motivant et bienveillant. Tu aides deux personnes à progresser ensemble.
Partenaires : ${myName} et ${partnerName}. Objectif commun : ${weeklyGoal}h de travail par semaine. ${progressCtx}${questionCtx}

Donne exactement 5 conseils concrets, courts et actionnables pour les aider à atteindre leur objectif ensemble. Chaque conseil doit être spécifique à leur contexte.
Réponds uniquement avec une liste de 5 lignes commençant par "- ". Sois direct, motivant et pratique. Pas d'introduction ni de conclusion.`;

        const { text } = await generateText({
            model: google('gemini-2.5-flash'),
            prompt,
        });

        const tips = text.split('\n')
            .map(l => l.trim())
            .filter(l => /^[-*•]|^\d+[.)]\s/.test(l))
            .map(l => l.replace(/^[-*•]\s*|^\d+[.)]\s*/, '').replace(/\*\*/g, '').trim())
            .filter(l => l.length > 0);

        return Response.json({ tips });
    } catch (error) {
        console.error('Accountability coach error:', error);
        return new Response('Failed to generate advice', { status: 500 });
    }
}
