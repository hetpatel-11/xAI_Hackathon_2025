/**
 * Prosecutor Agent - Builds the case for flagging content as malicious
 * Uses grok-4-1-fast-reasoning
 */

import { grok } from '../grok/client';
import { PROSECUTOR_SYSTEM_PROMPT } from '../grok/prompts';
import type { XContent, EvidenceOutput } from '../types';

export async function buildProsecutionCase(
  content: XContent,
  evidence: EvidenceOutput
): Promise<{
  case: string;
  scamProbability: number;
}> {
  const prompt = `Build a case for why this X.com content should be flagged as malicious:

**ORIGINAL CONTENT:**
Type: ${content.type}
Text: "${content.text || 'N/A'}"
Author: @${content.authorUsername || 'Unknown'}
Bio: "${content.authorBio || 'N/A'}"

**EVIDENCE GATHERED:**
${formatEvidence(evidence)}

Now build your prosecution case following the format specified in your system prompt.`;

  try {
    const response = await grok.reason(prompt, PROSECUTOR_SYSTEM_PROMPT);

    // Extract scam probability from response
    const probabilityMatch = response.match(/SCAM PROBABILITY:\s*(\d+)/i);
    const scamProbability = probabilityMatch ? parseInt(probabilityMatch[1], 10) : 50;

    return {
      case: response,
      scamProbability,
    };
  } catch (error) {
    console.error('Prosecutor agent error:', error);
    return {
      case: `Error in prosecution: ${error instanceof Error ? error.message : 'Unknown error'}`,
      scamProbability: 50,
    };
  }
}

function formatEvidence(evidence: EvidenceOutput): string {
  let formatted = '';

  if (evidence.profileAnalysis) {
    formatted += `Profile Image Analysis:
- Stock Photo: ${evidence.profileAnalysis.isStockPhoto ? 'YES' : 'NO'} (${evidence.profileAnalysis.confidence}% confidence)
- AI Generated: ${evidence.profileAnalysis.isAIGenerated ? 'YES' : 'NO'}
- Explanation: ${evidence.profileAnalysis.explanation}

`;
  }

  formatted += `Content Analysis:
- Wallet Addresses: ${evidence.contentAnalysis.hasWalletAddresses ? 'DETECTED' : 'None'}
- Suspicious Links: ${evidence.contentAnalysis.hasSuspiciousLinks ? 'DETECTED' : 'None'}
- Urgency Language: ${evidence.contentAnalysis.hasUrgencyLanguage ? 'DETECTED' : 'None'}
- Impersonation Signals: ${evidence.contentAnalysis.hasImpersonationSignals ? 'DETECTED' : 'None'}

`;

  if (evidence.networkMetrics) {
    formatted += `Network Metrics:
- Followers: ${evidence.networkMetrics.followersCount}
- Following: ${evidence.networkMetrics.followingCount}
- Account Age: ${evidence.networkMetrics.accountAge}
- Verified: ${evidence.networkMetrics.verificationStatus ? 'YES' : 'NO'}

`;
  }

  if (evidence.postHistory) {
    formatted += `Post History:
- Total Posts: ${evidence.postHistory.totalPosts}
- Scam Patterns: ${evidence.postHistory.scamPatterns.join(', ') || 'None detected'}
- Legitimate Signals: ${evidence.postHistory.legitimateSignals.join(', ') || 'None detected'}
`;
  }

  return formatted;
}
