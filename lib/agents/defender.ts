/**
 * Defender Agent - Advocates for free speech and legitimate content
 * Uses grok-4-1-fast-reasoning
 */

import { grok } from '../grok/client';
import { DEFENDER_SYSTEM_PROMPT } from '../grok/prompts';
import type { XContent, EvidenceOutput } from '../types';

export async function buildDefenseCase(
  content: XContent,
  evidence: EvidenceOutput,
  prosecutorCase: string
): Promise<{
  defense: string;
  legitimacyProbability: number;
}> {
  const prompt = `Review the prosecutor's case and build a DEFENSE for why this content might be legitimate:

**ORIGINAL CONTENT:**
Type: ${content.type}
Text: "${content.text || 'N/A'}"
Author: @${content.authorUsername || 'Unknown'}
Bio: "${content.authorBio || 'N/A'}"

**EVIDENCE:**
${formatEvidenceForDefense(evidence)}

**PROSECUTOR'S CASE:**
${prosecutorCase}

Now build your defense case following the format specified in your system prompt. Challenge the prosecutor's assumptions and advocate for free speech.`;

  try {
    const response = await grok.reason(prompt, DEFENDER_SYSTEM_PROMPT);

    // Extract legitimacy probability from response
    const probabilityMatch = response.match(/LEGITIMACY PROBABILITY:\s*(\d+)/i);
    const legitimacyProbability = probabilityMatch ? parseInt(probabilityMatch[1], 10) : 50;

    return {
      defense: response,
      legitimacyProbability,
    };
  } catch (error) {
    console.error('Defender agent error:', error);
    return {
      defense: `Error in defense: ${error instanceof Error ? error.message : 'Unknown error'}`,
      legitimacyProbability: 50,
    };
  }
}

function formatEvidenceForDefense(evidence: EvidenceOutput): string {
  // Format evidence to highlight potentially legitimate signals
  let formatted = '';

  if (evidence.profileAnalysis) {
    const notScam = !evidence.profileAnalysis.isStockPhoto && !evidence.profileAnalysis.isAIGenerated;
    formatted += `Profile Image:
${notScam ? '✓ Appears to be authentic personal photo' : '✗ Potentially problematic image'}
Confidence: ${evidence.profileAnalysis.confidence}%

`;
  }

  formatted += `Content Flags:
- Wallet Addresses: ${evidence.contentAnalysis.hasWalletAddresses ? '⚠️ Present' : '✓ None'}
- Suspicious Links: ${evidence.contentAnalysis.hasSuspiciousLinks ? '⚠️ Present' : '✓ None'}
- Urgency Language: ${evidence.contentAnalysis.hasUrgencyLanguage ? '⚠️ Detected' : '✓ None'}
- Impersonation: ${evidence.contentAnalysis.hasImpersonationSignals ? '⚠️ Possible' : '✓ No signals'}

`;

  if (evidence.networkMetrics) {
    const hasFollowers = evidence.networkMetrics.followersCount > 100;
    const isVerified = evidence.networkMetrics.verificationStatus;

    formatted += `Legitimacy Signals:
${hasFollowers ? '✓ Established follower base' : '✗ Low follower count'}
${isVerified ? '✓ Verified account' : '✗ Not verified'}
Account Age: ${evidence.networkMetrics.accountAge}

`;
  }

  if (evidence.postHistory?.legitimateSignals.length) {
    formatted += `Positive Signals:
${evidence.postHistory.legitimateSignals.map((s) => `- ${s}`).join('\n')}
`;
  }

  return formatted;
}
