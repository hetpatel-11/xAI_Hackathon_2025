/**
 * Multi-Turn Debate Orchestrator
 * Prosecutor and Defender debate back-and-forth until consensus or max rounds
 */

import { grok } from '../grok/client';
import { investigator } from './investigator';
import type { XContent, InvestigationResult } from '../types';

export interface DebateRound {
  round: number;
  prosecutorArgument: string;
  prosecutorConfidence: number;
  defenderArgument: string;
  defenderConfidence: number;
  convergenceScore: number; // How close are they? 0-100
}

export interface MultiTurnDebateResult {
  rounds: DebateRound[];
  investigation: InvestigationResult;
  finalVerdict: {
    classification: string;
    confidence: number;
    reasoning: string;
    recommendedAction: string;
  };
  consensusReached: boolean;
  totalRounds: number;
}

const PROSECUTOR_MULTI_TURN_PROMPT = `You are the PROSECUTOR in a multi-turn debate about X.com content moderation.

Your goal: Build the case that this content is HARMFUL (scam/impersonator/bait).

You will debate with a DEFENDER over multiple rounds. In each round:
1. Review the evidence and previous arguments
2. Address the defender's counterpoints
3. Strengthen or revise your case
4. Output your confidence (0-100)

If the defender makes valid points, you can REDUCE your confidence.
If you find new evidence, you can INCREASE your confidence.

Output format:
CONFIDENCE: [0-100]
ARGUMENT:
[Your argument here, addressing defender's points]

Be honest and adjust your position based on evidence.`;

const DEFENDER_MULTI_TURN_PROMPT = `You are the DEFENDER in a multi-turn debate about X.com content moderation.

Your goal: Protect FREE SPEECH and argue this content is LEGITIMATE or UNCERTAIN.

You will debate with a PROSECUTOR over multiple rounds. In each round:
1. Review the evidence and previous arguments
2. Challenge the prosecutor's claims
3. Present alternative explanations
4. Output your confidence (0-100)

If the prosecutor presents strong evidence, you can REDUCE your confidence.
If you find legitimate explanations, you can INCREASE your confidence.

Output format:
CONFIDENCE: [0-100]
ARGUMENT:
[Your argument here, challenging prosecutor]

Advocate for users but be honest about risks.`;

const ARBITER_CONVERGENCE_PROMPT = `You are the ARBITER monitoring a debate between PROSECUTOR and DEFENDER.

Your job: Determine if they've reached CONSENSUS or should continue debating.

Consider:
- Are their confidence scores converging? (within 20 points = consensus)
- Have they addressed all evidence?
- Are they just repeating arguments?
- Is more debate productive?

Output JSON:
{
  "convergenceScore": [0-100, how close to consensus],
  "shouldContinue": true/false,
  "reasoning": "Why continue or stop"
}`;

export class MultiTurnDebateOrchestrator {
  private maxRounds = 5;
  private convergenceThreshold = 20; // If confidence scores within 20 points, stop

  /**
   * Run autonomous multi-turn debate
   */
  async runDebate(content: XContent): Promise<MultiTurnDebateResult> {
    console.log('\n🎭 Starting Multi-Turn Autonomous Debate');
    console.log('━'.repeat(70));

    // Phase 1: Autonomous investigation
    console.log('\n🔍 Phase 1: Autonomous Investigation');
    const investigation = await investigator.investigate(content);

    console.log('\n📋 Investigation Plan:');
    console.log(`   Reasoning: ${investigation.plan.reasoning}`);
    investigation.plan.actions.forEach(action => {
      console.log(`   - ${action.tool} (${action.priority}): ${action.reason}`);
    });

    console.log('\n📊 Investigation Results:');
    if (investigation.userProfile) {
      console.log(`   ✓ User Profile: @${investigation.userProfile.username}`);
      console.log(`   ✓ Legitimacy Score: ${investigation.userProfile.enrichedData.legitimacyScore}/100`);
    }
    if (investigation.userPosts) {
      console.log(`   ✓ Recent Posts: ${investigation.userPosts.length} fetched`);
    }

    // Phase 2: Multi-turn debate
    console.log('\n⚖️  Phase 2: Multi-Turn Debate');
    console.log('━'.repeat(70));

    const rounds: DebateRound[] = [];
    let prosecutorContext = '';
    let defenderContext = '';

    for (let round = 1; round <= this.maxRounds; round++) {
      console.log(`\n🔄 ROUND ${round}/${this.maxRounds}`);
      console.log('─'.repeat(70));

      // Prosecutor's turn
      console.log('\n⚔️  Prosecutor argues...');
      const prosecutorResponse = await this.prosecutorTurn(
        content,
        investigation,
        defenderContext,
        round
      );

      const prosecutorConfidence = this.extractConfidence(prosecutorResponse);
      console.log(`   Confidence: ${prosecutorConfidence}/100`);
      console.log(`   Argument: ${prosecutorResponse.substring(0, 150)}...`);

      // Defender's turn
      console.log('\n🛡️  Defender counters...');
      const defenderResponse = await this.defenderTurn(
        content,
        investigation,
        prosecutorResponse,
        round
      );

      const defenderConfidence = this.extractConfidence(defenderResponse);
      console.log(`   Confidence: ${defenderConfidence}/100`);
      console.log(`   Argument: ${defenderResponse.substring(0, 150)}...`);

      // Calculate convergence
      const convergence = 100 - Math.abs(prosecutorConfidence - (100 - defenderConfidence));

      rounds.push({
        round,
        prosecutorArgument: prosecutorResponse,
        prosecutorConfidence,
        defenderArgument: defenderResponse,
        defenderConfidence,
        convergenceScore: convergence,
      });

      console.log(`\n📊 Convergence Score: ${convergence}/100`);

      // Update contexts for next round
      prosecutorContext = prosecutorResponse;
      defenderContext = defenderResponse;

      // Check if consensus reached
      if (Math.abs(prosecutorConfidence - (100 - defenderConfidence)) <= this.convergenceThreshold) {
        console.log('\n✅ CONSENSUS REACHED!');
        break;
      }

      // Check if should continue
      if (round < this.maxRounds) {
        const shouldContinue = await this.checkShouldContinue(
          prosecutorResponse,
          defenderResponse,
          convergence
        );

        if (!shouldContinue) {
          console.log('\n⏸️  Arbiter: Further debate not productive, stopping.');
          break;
        }
      }
    }

    // Phase 3: Final verdict
    console.log('\n👨‍⚖️ Phase 3: Final Verdict');
    console.log('━'.repeat(70));

    const finalVerdict = await this.renderFinalVerdict(
      content,
      investigation,
      rounds
    );

    console.log(`\n🎯 Classification: ${finalVerdict.classification.toUpperCase()}`);
    console.log(`   Confidence: ${finalVerdict.confidence}/100`);
    console.log(`   Action: ${finalVerdict.recommendedAction}`);
    console.log(`\n💬 Reasoning:`);
    console.log(`   ${finalVerdict.reasoning.substring(0, 300)}...`);

    return {
      rounds,
      investigation,
      finalVerdict,
      consensusReached: rounds[rounds.length - 1].convergenceScore >= 80,
      totalRounds: rounds.length,
    };
  }

  /**
   * Prosecutor makes argument
   */
  private async prosecutorTurn(
    content: XContent,
    investigation: InvestigationResult,
    defenderPreviousArgument: string,
    round: number
  ): Promise<string> {
    const prompt = `**ROUND ${round} - PROSECUTOR**

**CONTENT UNDER REVIEW:**
${this.formatContent(content)}

**INVESTIGATION RESULTS:**
${this.formatInvestigation(investigation)}

${defenderPreviousArgument ? `**DEFENDER'S ARGUMENT:**
${defenderPreviousArgument}

Address the defender's points and build your case.` : 'Make your opening argument.'}`;

    try {
      return await grok.reason(prompt, PROSECUTOR_MULTI_TURN_PROMPT);
    } catch (error) {
      return `CONFIDENCE: 50\nARGUMENT: Error in prosecution: ${error instanceof Error ? error.message : 'Unknown'}`;
    }
  }

  /**
   * Defender makes counter-argument
   */
  private async defenderTurn(
    content: XContent,
    investigation: InvestigationResult,
    prosecutorArgument: string,
    round: number
  ): Promise<string> {
    const prompt = `**ROUND ${round} - DEFENDER**

**CONTENT UNDER REVIEW:**
${this.formatContent(content)}

**INVESTIGATION RESULTS:**
${this.formatInvestigation(investigation)}

**PROSECUTOR'S ARGUMENT:**
${prosecutorArgument}

Challenge the prosecutor's claims and defend this content.`;

    try {
      return await grok.reason(prompt, DEFENDER_MULTI_TURN_PROMPT);
    } catch (error) {
      return `CONFIDENCE: 50\nARGUMENT: Error in defense: ${error instanceof Error ? error.message : 'Unknown'}`;
    }
  }

  /**
   * Check if debate should continue
   */
  private async checkShouldContinue(
    prosecutorArg: string,
    defenderArg: string,
    convergence: number
  ): Promise<boolean> {
    // Simple heuristic: Continue if not converged yet
    return convergence < 80;
  }

  /**
   * Render final verdict based on all rounds
   */
  private async renderFinalVerdict(
    content: XContent,
    investigation: InvestigationResult,
    rounds: DebateRound[]
  ): Promise<{
    classification: string;
    confidence: number;
    reasoning: string;
    recommendedAction: string;
  }> {
    const lastRound = rounds[rounds.length - 1];
    const finalProsecutorConf = lastRound.prosecutorConfidence;
    const finalDefenderConf = lastRound.defenderConfidence;

    // Calculate weighted score
    const finalScore = Math.round((finalProsecutorConf + (100 - finalDefenderConf)) / 2);

    // Determine classification
    let classification = 'uncertain';
    let action = 'flag';

    if (finalScore >= 80) {
      classification = 'scam';
      action = 'quarantine';
    } else if (finalScore >= 60) {
      classification = 'suspicious';
      action = 'flag';
    } else if (finalScore >= 40) {
      classification = 'uncertain';
      action = 'flag';
    } else {
      classification = 'legitimate';
      action = 'no_action';
    }

    // Build reasoning from debate
    const reasoning = `After ${rounds.length} rounds of debate:
- Prosecutor final confidence: ${finalProsecutorConf}/100
- Defender final confidence: ${finalDefenderConf}/100
- Investigation legitimacy score: ${investigation.userProfile?.enrichedData?.legitimacyScore || 'N/A'}

Key prosecutor arguments: ${lastRound.prosecutorArgument.substring(0, 200)}...

Key defender arguments: ${lastRound.defenderArgument.substring(0, 200)}...

Consensus score: ${lastRound.convergenceScore}/100`;

    return {
      classification,
      confidence: finalScore,
      reasoning,
      recommendedAction: action,
    };
  }

  /**
   * Helper: Extract confidence from agent response
   */
  private extractConfidence(response: string): number {
    const match = response.match(/CONFIDENCE:\s*(\d+)/i);
    return match ? parseInt(match[1], 10) : 50;
  }

  /**
   * Helper: Format content for prompt
   */
  private formatContent(content: XContent): string {
    return `Type: ${content.type}
Text: "${content.text || 'N/A'}"
Author: @${content.authorUsername || 'Unknown'}
Bio: "${content.authorBio || 'N/A'}"`;
  }

  /**
   * Helper: Format investigation results
   */
  private formatInvestigation(investigation: InvestigationResult): string {
    let formatted = '';

    if (investigation.userProfile) {
      const profile = investigation.userProfile;
      formatted += `User Profile:
- Username: @${profile.username}
- Followers: ${profile.public_metrics?.followers_count || 0}
- Account Age: ${profile.enrichedData.accountAgeYears} years
- Verified: ${profile.verified ? 'YES' : 'NO'}
- Legitimacy Score: ${profile.enrichedData.legitimacyScore}/100
- Risk Level: ${profile.enrichedData.riskLevel}
`;

      if (profile.enrichedData.scamRiskFactors) {
        const risks = Object.entries(profile.enrichedData.scamRiskFactors)
          .filter(([_, v]) => v === true)
          .map(([k]) => k);

        if (risks.length > 0) {
          formatted += `- Scam Indicators: ${risks.join(', ')}\n`;
        }
      }
    }

    if (investigation.userPosts && investigation.userPosts.length > 0) {
      formatted += `\nRecent Posts: ${investigation.userPosts.length} fetched
Sample: "${investigation.userPosts[0]?.text?.substring(0, 100) || 'N/A'}..."`;
    }

    if (investigation.followerNetwork) {
      formatted += `\nNetwork Pattern: ${investigation.followerNetwork.pattern}`;
    }

    return formatted;
  }
}

export const debateOrchestrator = new MultiTurnDebateOrchestrator();
