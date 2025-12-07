/**
 * Evidence Agent - Gathers context and analyzes with Grok Vision
 * Uses grok-2-vision-1212 for image analysis + grok-4-1-fast-reasoning for synthesis
 */

import { grok } from '../grok/client';
import { EVIDENCE_SYSTEM_PROMPT, IMAGE_ANALYSIS_PROMPT } from '../grok/prompts';
import type { XContent, EvidenceOutput } from '../types';

export async function gatherEvidence(
  content: XContent,
  additionalData?: {
    postHistory?: any[];
    networkMetrics?: any;
  }
): Promise<EvidenceOutput> {
  // Analyze profile image if available
  let profileAnalysis = undefined;
  if (content.authorProfileImage) {
    try {
      const imageAnalysisResponse = await grok.analyzeImage(
        content.authorProfileImage,
        IMAGE_ANALYSIS_PROMPT
      );

      const jsonMatch = imageAnalysisResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const analysis = JSON.parse(jsonMatch[0]);
        profileAnalysis = {
          isStockPhoto: analysis.isStockPhoto || false,
          isAIGenerated: analysis.isAIGenerated || false,
          confidence: Math.max(
            analysis.stockPhotoConfidence || 0,
            analysis.aiGeneratedConfidence || 0
          ),
          explanation: analysis.explanation || 'No explanation provided',
        };
      }
    } catch (error) {
      console.error('Image analysis error:', error);
    }
  }

  // Analyze content patterns
  const contentAnalysis = analyzeContentPatterns(content);

  // Synthesize evidence with Grok reasoning
  const evidenceSummary = await synthesizeEvidence({
    content,
    profileAnalysis,
    contentAnalysis,
    postHistory: additionalData?.postHistory,
    networkMetrics: additionalData?.networkMetrics,
  });

  return {
    profileAnalysis,
    postHistory: evidenceSummary.postHistory,
    networkMetrics: evidenceSummary.networkMetrics,
    contentAnalysis,
  };
}

function analyzeContentPatterns(content: XContent) {
  const text = content.text?.toLowerCase() || '';
  const bio = content.authorBio?.toLowerCase() || '';
  const combined = `${text} ${bio}`;

  return {
    hasWalletAddresses: /0x[a-f0-9]{40}|bc1[a-z0-9]{39,59}/i.test(combined),
    hasSuspiciousLinks: /bit\.ly|tinyurl|short\.link/i.test(combined),
    hasUrgencyLanguage: /(limited time|act now|hurry|expires soon|last chance)/i.test(combined),
    hasImpersonationSignals: /official|verify|support|team/i.test(combined) && !content.metadata?.verified,
  };
}

async function synthesizeEvidence(data: any): Promise<{
  postHistory?: EvidenceOutput['postHistory'];
  networkMetrics?: EvidenceOutput['networkMetrics'];
}> {
  const prompt = `Synthesize the following evidence about a potentially suspicious X.com account:

Profile Image Analysis: ${JSON.stringify(data.profileAnalysis, null, 2)}
Content Analysis: ${JSON.stringify(data.contentAnalysis, null, 2)}
Network Metrics: ${JSON.stringify(data.networkMetrics, null, 2)}

Provide a brief summary of:
1. Post history patterns (if available)
2. Network legitimacy signals
3. Overall account credibility

Be concise and factual.`;

  try {
    const response = await grok.reason(prompt, EVIDENCE_SYSTEM_PROMPT);

    // Extract structured data from response
    return {
      postHistory: {
        totalPosts: data.postHistory?.length || 0,
        scamPatterns: extractPatterns(response, 'scam'),
        legitimateSignals: extractPatterns(response, 'legitimate'),
      },
      networkMetrics: data.networkMetrics || {
        followersCount: 0,
        followingCount: 0,
        accountAge: 'Unknown',
        verificationStatus: false,
      },
    };
  } catch (error) {
    console.error('Evidence synthesis error:', error);
    return {};
  }
}

function extractPatterns(text: string, type: 'scam' | 'legitimate'): string[] {
  // Simple pattern extraction - in production, use more sophisticated NLP
  const patterns: string[] = [];
  const lines = text.split('\n');

  for (const line of lines) {
    const lower = line.toLowerCase();
    if (type === 'scam' && (lower.includes('scam') || lower.includes('suspicious'))) {
      patterns.push(line.trim());
    } else if (type === 'legitimate' && (lower.includes('legitimate') || lower.includes('authentic'))) {
      patterns.push(line.trim());
    }
  }

  return patterns.slice(0, 5); // Top 5 patterns
}
