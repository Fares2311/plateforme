import { google } from '@ai-sdk/google';
import { generateText } from 'ai';

export async function POST(req: Request) {
    try {
        const { title, chatHistory, userQuery } = await req.json();

        const prompt = `L'objectif de l'utilisateur est : "${title}". 
Voici l'historique récent de sa discussion (avec toi ou son groupe) pour contexte : 
${chatHistory.map((m: any) => `${m.user_name}: ${m.content}`).join('\n')}

L'utilisateur te pose cette question : "${userQuery}"

En tant que "Coach IA", réponds directement à sa question de façon concise, pertinente, et motivante. 
Utilise un ton chaleureux, quelques emojis, et limite toi à 2-3 phrases maximum. 
Ne signe pas le message, on sait que c'est toi.`;

        const { text } = await generateText({
            model: google('gemini-2.5-flash'),
            prompt: prompt,
        });

        return Response.json({ message: text.trim() });

    } catch (error) {
        console.error('AI Generation Error:', error);
        return new Response('Failed to generate coach message', { status: 500 });
    }
}
