import { google } from '@ai-sdk/google';
import { generateObject } from 'ai';
import { z } from 'zod';

// The 8 archetypes the AI can assign (with their hex accent color)
const ARCHETYPES = [
    { type: 'Le Sprinter',            emoji: '⚡', color: '#f59e0b' },
    { type: 'Le Marathonien',         emoji: '🏃', color: '#10b981' },
    { type: 'Le Noctambule Productif',emoji: '🌙', color: '#818cf8' },
    { type: "L'Architecte",           emoji: '🏛️', color: '#06b6d4' },
    { type: 'Le Feu de Paille',       emoji: '🔥', color: '#ef4444' },
    { type: 'Le Régulier',            emoji: '⚙️', color: '#8b5cf6' },
    { type: "L'Explorateur",          emoji: '🧭', color: '#ec4899' },
    { type: 'Le Perfectionniste',     emoji: '🎯', color: '#64748b' },
];

export async function POST(req: Request) {
    try {
        const {
            totalHours, totalObjectives, totalPairs, userName,
            // New multi-dimensional questionnaire fields
            preferredTimes, mainChallenges, workStyle, motivators, motivationDip,
            // Legacy fallback (ignored if new fields present)
            preferredTime, mainChallenge,
        } = await req.json();

        const archetypeList = ARCHETYPES.map(a => `"${a.type}" (${a.emoji})`).join(', ');

        // Build questionnaire section — use new rich fields if available, else fall back to legacy
        const timesLine = Array.isArray(preferredTimes) && preferredTimes.length
            ? `- Créneaux de travail préférés : ${preferredTimes.join(', ')}`
            : preferredTime ? `- Moment préféré pour travailler : ${preferredTime}` : '';

        const challengesLine = Array.isArray(mainChallenges) && mainChallenges.length
            ? `- Principaux obstacles (jusqu'à 3) : ${mainChallenges.join(', ')}`
            : mainChallenge ? `- Principal défi : ${mainChallenge}` : '';

        const workStyleLine = workStyle
            ? `- Rythme de travail : ${workStyle}` : '';

        const motivatorsLine = Array.isArray(motivators) && motivators.length
            ? `- Sources de motivation (jusqu'à 3) : ${motivators.join(', ')}` : '';

        const motivationDipLine = motivationDip
            ? `- Baisse de motivation survient : ${motivationDip}` : '';

        const questionnaireSection = [timesLine, challengesLine, workStyleLine, motivatorsLine, motivationDipLine]
            .filter(Boolean).join('\n');

        const prompt = `Tu es un expert en psychologie de la productivité. Analyse les données de ${userName} et crée leur profil de discipline personnalisé.

Données comportementales :
- Heures de travail total : ${totalHours}h
- Objectifs rejoints : ${totalObjectives}
- Partenaires d'accountability : ${totalPairs}

Réponses au questionnaire :
${questionnaireSection}

Archetypes disponibles : ${archetypeList}

Instructions d'analyse :
1. Croise les données comportementales ET les réponses questionnaire pour choisir l'archetype le plus précis.
2. Le rythme de travail, les créneaux préférés et les sources de motivation sont les signaux les plus discriminants — pèse-les fortement.
3. Les obstacles et la baisse de motivation révèlent les points de fragilité — utilise-les pour les axes de progression.
4. La tagline est courte et percutante (5-7 mots max).
5. La description est personnalisée, bienveillante et précise (2-3 phrases) — mentionne des éléments concrets du profil.
6. Les forces sont concrètes et directement déduites des données (pas génériques).
7. Les axes de progression sont constructifs, jamais culpabilisants, et répondent aux vrais obstacles identifiés.
8. Le conseil est immédiatement actionnable, ultra-personnalisé, et tient compte du rythme et des motivations.
9. Réponds entièrement en français.`;

        const { object } = await generateObject({
            model: google('gemini-2.5-flash'),
            schema: z.object({
                type: z.string().describe('Nom exact de l\'archetype choisi parmi la liste'),
                emoji: z.string().describe('Emoji correspondant à l\'archetype'),
                color: z.string().describe('Couleur hex de l\'archetype (copie exacte depuis la liste)'),
                tagline: z.string().describe('Accroche courte et percutante'),
                description: z.string().describe('Description personnalisée de 2-3 phrases'),
                strengths: z.array(z.string()).length(3).describe('3 forces concrètes'),
                growth_areas: z.array(z.string()).length(2).describe('2 axes de progression bienveillants'),
                tip: z.string().describe('1 conseil immédiatement actionnable et ultra-personnalisé'),
            }),
            prompt,
        });

        // Override color/emoji with our canonical values to ensure consistency
        const canonical = ARCHETYPES.find(a => a.type === object.type);
        return Response.json({
            ...object,
            color: canonical?.color ?? object.color,
            emoji: canonical?.emoji ?? object.emoji,
        });
    } catch (error) {
        console.error('Discipline profile error:', error);
        return new Response('Failed', { status: 500 });
    }
}
