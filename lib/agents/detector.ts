/**
 * Detector Agent - Fast first-pass scam detection
 * Uses grok-4-1-fast-reasoning for initial analysis
 */

import { grok } from '../grok/client';
import { DETECTOR_SYSTEM_PROMPT } from '../grok/prompts';
import type { XContent, DetectorOutput } from '../types';

export async function detectSuspiciousContent(content: XContent): Promise<DetectorOutput> {
  const contentDescription = formatContentForAnalysis(content);

  const prompt = `Analyze this X.com content for scam/impersonator/bait signals:

${contentDescription}

Remember: Output ONLY valid JSON matching the schema.`;

  try {
    const response = await grok.reason(prompt, DETECTOR_SYSTEM_PROMPT);

    // Parse JSON response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in detector response');
    }

    const result = JSON.parse(jsonMatch[0]);

    return {
      suspicionScore: result.suspicionScore || 0,
      signals: result.signals || [],
      shouldEscalate: result.shouldEscalate || result.suspicionScore > 30,
      reasoning: result.reasoning || 'No reasoning provided',
    };
  } catch (error) {
    console.error('Detector agent error:', error);
    // Fail safe: escalate on error
    return {
      suspicionScore: 50,
      signals: ['Error in detection - escalating for safety'],
      shouldEscalate: true,
      reasoning: `Detection error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

function formatContentForAnalysis(content: XContent): string {
  let description = `Type: ${content.type}\n`;

  if (content.text) {
    description += `Text: "${content.text}"\n`;
  }

  if (content.authorUsername) {
    description += `Author: @${content.authorUsername}\n`;
  }

  if (content.authorBio) {
    description += `Bio: "${content.authorBio}"\n`;
  }

  if (content.authorProfileImage) {
    description += `Profile Image URL: ${content.authorProfileImage}\n`;
  }

  if (content.metadata) {
    description += `Metadata: ${JSON.stringify(content.metadata, null, 2)}\n`;
  }

  return description;
}
