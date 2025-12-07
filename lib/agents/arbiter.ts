/**
 * Arbiter Agent - Final decision maker that synthesizes debate
 * Uses grok-4-1-fast-reasoning
 */

import { grok } from '../grok/client';
import { ARBITER_SYSTEM_PROMPT } from '../grok/prompts';
import type { XContent, ArbiterDecision } from '../types';

export async function makeArbiterDecision(
  content: XContent,
  prosecutorCase: string,
  prosecutorScore: number,
  defenderCase: string,
  defenderScore: number
): Promise<ArbiterDecision> {
  const prompt = `As the final arbiter, review both sides of this debate and make a balanced decision:

**CONTENT UNDER REVIEW:**
Type: ${content.type}
Text: "${content.text || 'N/A'}"
Author: @${content.authorUsername || 'Unknown'}

**PROSECUTOR'S ARGUMENT (Scam Probability: ${prosecutorScore}/100):**
${prosecutorCase}

**DEFENDER'S ARGUMENT (Legitimacy Probability: ${defenderScore}/100):**
${defenderCase}

**YOUR TASK:**
Weigh both arguments carefully. Consider:
1. X.com's commitment to free speech
2. User safety concerns
3. False positive risks
4. Evidence quality

Output your decision as JSON following the schema in your system prompt.`;

  try {
    const response = await grok.reason(prompt, ARBITER_SYSTEM_PROMPT);

    // Parse JSON response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in arbiter response');
    }

    const decision = JSON.parse(jsonMatch[0]);

    return {
      finalScore: decision.finalScore || Math.round((prosecutorScore + (100 - defenderScore)) / 2),
      classification: decision.classification || 'uncertain',
      explanation: decision.explanation || 'No explanation provided',
      evidence: decision.evidence || [],
      counterEvidence: decision.counterEvidence || [],
      recommendedAction: decision.recommendedAction || 'no_action',
    };
  } catch (error) {
    console.error('Arbiter agent error:', error);

    // Fallback decision
    const fallbackScore = Math.round((prosecutorScore + (100 - defenderScore)) / 2);
    return {
      finalScore: fallbackScore,
      classification: fallbackScore >= 60 ? 'scam' : 'uncertain',
      explanation: `Decision error occurred. Fallback: Averaging prosecutor (${prosecutorScore}) and inverse defender (${100 - defenderScore}) scores.`,
      evidence: ['Error in arbiter processing'],
      counterEvidence: [],
      recommendedAction: fallbackScore >= 60 ? 'flag' : 'no_action',
    };
  }
}
