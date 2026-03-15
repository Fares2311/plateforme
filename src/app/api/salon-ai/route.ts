import { google } from '@ai-sdk/google';
import { streamText } from 'ai';

export async function POST(req: Request) {
    const { messages, context } = await req.json();

    const system = buildSystemPrompt(context);

    const result = streamText({
        model: google('gemini-2.5-flash'),
        system,
        messages,
    });

    return result.toTextStreamResponse();
}

function buildSystemPrompt(ctx: any): string {
    const lines: string[] = [];

    lines.push(`Tu es un assistant IA intégré dans un salon collaboratif appelé "${ctx.title || 'ce salon'}".`);
    lines.push(`Type de salon : ${ctx.type === 'project' ? 'Projet' : 'Objectif'}.`);

    if (ctx.description) lines.push(`\nDescription : ${ctx.description}`);
    if (ctx.category)    lines.push(`Catégorie : ${ctx.category}`);

    if (ctx.members?.length) {
        lines.push(`\nMembres (${ctx.members.length}) : ${ctx.members.map((m: any) => m.name).join(', ')}`);
    }

    if (ctx.milestones?.length) {
        const done = ctx.milestones.filter((m: any) => m.completed).length;
        lines.push(`\nJalons / Tâches — ${done}/${ctx.milestones.length} complétés :`);
        ctx.milestones.slice(0, 12).forEach((m: any) => {
            lines.push(`  ${m.completed ? '✅' : '⬜'} ${m.text}`);
        });
    }

    if (ctx.resources?.length) {
        lines.push(`\nRessources partagées :`);
        ctx.resources.slice(0, 8).forEach((r: any) => lines.push(`  • ${r.text}`));
    }

    if (ctx.recentMessages?.length) {
        lines.push(`\nDerniers messages du chat du salon :`);
        ctx.recentMessages.slice(-12).forEach((m: any) => {
            lines.push(`  ${m.user_name}: ${m.content}`);
        });
    }

    lines.push(`
Règles :
- Réponds dans la langue de l'utilisateur (français ou anglais).
- Sois concis, pertinent et utile pour CE salon spécifique.
- Utilise le contexte ci-dessus pour personnaliser tes réponses.
- Aide avec planification, questions de contenu, motivation, organisation.
- Ton chaleureux et professionnel. Emojis avec modération.`);

    if (ctx.currentUserName) lines.push(`\nUtilisateur actuel : ${ctx.currentUserName}`);

    return lines.join('\n');
}
