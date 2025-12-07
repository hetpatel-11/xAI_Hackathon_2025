/**
 * Agent Orchestrator - Coordinates the 5-agent debate system
 * Runs agents in sequence and tracks performance
 */

import { detectSuspiciousContent } from './detector';
import { gatherEvidence } from './evidence';
import { buildProsecutionCase } from './prosecutor';
import { buildDefenseCase } from './defender';
import { makeArbiterDecision } from './arbiter';
import type { XContent, DetectionResult, AgentDebate } from '../types';

export interface OrchestrationOptions {
  skipLowConfidence?: boolean; // Skip full debate if detector score < 30
  includeNetworkData?: boolean; // Fetch network metrics from X API
  includePostHistory?: boolean; // Fetch user's post history
}

export async function runAgentDebate(
  content: XContent,
  options: OrchestrationOptions = {}
): Promise<DetectionResult> {
  const startTime = Date.now();
  let totalTokens = 0;

  console.log(`\n🚀 Starting agent debate for ${content.type} from @${content.authorUsername || 'Unknown'}`);

  // PHASE 1: Detector (fast first-pass)
  console.log('📡 Phase 1: Running Detector Agent...');
  const detectorOutput = await detectSuspiciousContent(content);
  console.log(`   Suspicion Score: ${detectorOutput.suspicionScore}/100`);
  console.log(`   Signals: ${detectorOutput.signals.join(', ')}`);
  console.log(`   Escalate: ${detectorOutput.shouldEscalate ? 'YES' : 'NO'}\n`);

  // Early exit if low suspicion and option enabled
  if (options.skipLowConfidence && !detectorOutput.shouldEscalate) {
    console.log('✅ Low suspicion - skipping full debate\n');
    return createQuickDecision(content, detectorOutput, startTime);
  }

  // PHASE 2: Evidence gathering
  console.log('🔍 Phase 2: Running Evidence Agent...');
  const evidenceOutput = await gatherEvidence(content, {
    // In production, fetch from X API
    postHistory: options.includePostHistory ? [] : undefined,
    networkMetrics: options.includeNetworkData ? {} : undefined,
  });
  console.log(`   Profile Analysis: ${evidenceOutput.profileAnalysis ? 'Complete' : 'Skipped'}`);
  console.log(`   Content Flags: ${Object.values(evidenceOutput.contentAnalysis).filter(Boolean).length} detected\n`);

  // PHASE 3: Prosecutor builds case
  console.log('⚖️  Phase 3: Running Prosecutor Agent...');
  const { case: prosecutorCase, scamProbability } = await buildProsecutionCase(content, evidenceOutput);
  console.log(`   Scam Probability: ${scamProbability}/100`);
  console.log(`   Case Summary: ${prosecutorCase.substring(0, 150)}...\n`);

  // PHASE 4: Defender counters
  console.log('🛡️  Phase 4: Running Defender Agent...');
  const { defense: defenderCase, legitimacyProbability } = await buildDefenseCase(
    content,
    evidenceOutput,
    prosecutorCase
  );
  console.log(`   Legitimacy Probability: ${legitimacyProbability}/100`);
  console.log(`   Defense Summary: ${defenderCase.substring(0, 150)}...\n`);

  // PHASE 5: Arbiter makes final decision
  console.log('👨‍⚖️ Phase 5: Running Arbiter Agent...');
  const arbiterDecision = await makeArbiterDecision(
    content,
    prosecutorCase,
    scamProbability,
    defenderCase,
    legitimacyProbability
  );
  console.log(`   Final Score: ${arbiterDecision.finalScore}/100`);
  console.log(`   Classification: ${arbiterDecision.classification.toUpperCase()}`);
  console.log(`   Recommended Action: ${arbiterDecision.recommendedAction}\n`);

  const durationMs = Date.now() - startTime;
  console.log(`✅ Debate complete in ${durationMs}ms\n`);

  // Construct full debate log
  const debate: AgentDebate = {
    detectorOutput,
    evidenceOutput,
    prosecutorCase,
    defenderCase,
    arbiterDecision,
    totalTokens, // TODO: Track from Grok responses
    durationMs,
  };

  return {
    id: generateId(),
    contentId: content.id,
    contentType: content.type,
    confidenceScore: arbiterDecision.finalScore,
    classification: arbiterDecision.classification,
    debateLog: debate,
    createdAt: new Date(),
    status: 'pending',
  };
}

function createQuickDecision(
  content: XContent,
  detectorOutput: any,
  startTime: number
): DetectionResult {
  return {
    id: generateId(),
    contentId: content.id,
    contentType: content.type,
    confidenceScore: detectorOutput.suspicionScore,
    classification: 'legitimate',
    debateLog: {
      detectorOutput,
      evidenceOutput: {
        contentAnalysis: {
          hasWalletAddresses: false,
          hasSuspiciousLinks: false,
          hasUrgencyLanguage: false,
          hasImpersonationSignals: false,
        },
      },
      prosecutorCase: 'Skipped - low suspicion',
      defenderCase: 'Skipped - low suspicion',
      arbiterDecision: {
        finalScore: detectorOutput.suspicionScore,
        classification: 'legitimate',
        explanation: 'Low suspicion score - no full debate required',
        evidence: [],
        counterEvidence: [],
        recommendedAction: 'no_action',
      },
      totalTokens: 0,
      durationMs: Date.now() - startTime,
    },
    createdAt: new Date(),
    status: 'approved',
  };
}

function generateId(): string {
  return `det_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
