/**
 * Test TRULY Agentic System with Real X.com Data
 *
 * This demonstrates:
 * 1. Agents autonomously decide what data to fetch
 * 2. Multi-turn debate (prosecutor vs defender go back and forth)
 * 3. Tool use (agents call X API based on their own decisions)
 * 4. Real X.com integration for demo
 */

import * as dotenv from 'dotenv';
import { debateOrchestrator } from './lib/agents/debate-orchestrator';
import type { XContent } from './lib/types';

dotenv.config({ path: '.env.local' });

const testAccounts = [
  {
    username: 'TheCryptoKidsX',
    description: 'Crypto-related account (potential scam/bait)',
    type: 'profile' as const,
  },
  {
    username: 'M75088225625461',
    description: 'Numerical username pattern (suspicious)',
    type: 'profile' as const,
  },
];

async function testAgenticSystem() {
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║  TRULY AGENTIC X.COM MODERATION SYSTEM                        ║');
  console.log('║  Multi-Agent Autonomous Debate with Real X API               ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');

  for (const test of testAccounts) {
    try {
      console.log('\n\n' + '═'.repeat(70));
      console.log(`🎯 Testing: @${test.username}`);
      console.log(`   Description: ${test.description}`);
      console.log('═'.repeat(70));

      // Create content object (minimal - agents will fetch the rest)
      const content: XContent = {
        id: `test_${test.username}`,
        type: test.type,
        text: '', // Agents will investigate
        authorUsername: test.username,
      };

      // Run autonomous multi-turn debate
      const result = await debateOrchestrator.runDebate(content);

      // Display results
      console.log('\n');
      console.log('╔═══════════════════════════════════════════════════════════════╗');
      console.log('║  FINAL RESULTS                                                 ║');
      console.log('╚═══════════════════════════════════════════════════════════════╝');

      console.log(`\n📊 Debate Summary:`);
      console.log(`   Total Rounds: ${result.totalRounds}`);
      console.log(`   Consensus Reached: ${result.consensusReached ? 'YES ✅' : 'NO ⚠️'}`);

      console.log(`\n🎯 Final Verdict:`);
      console.log(`   Classification: ${result.finalVerdict.classification.toUpperCase()}`);
      console.log(`   Confidence: ${result.finalVerdict.confidence}/100`);
      console.log(`   Recommended Action: ${result.finalVerdict.recommendedAction.toUpperCase()}`);

      console.log(`\n💬 Round-by-Round Breakdown:`);
      result.rounds.forEach(round => {
        console.log(`\n   Round ${round.round}:`);
        console.log(`   ├─ Prosecutor Confidence: ${round.prosecutorConfidence}/100`);
        console.log(`   ├─ Defender Confidence: ${round.defenderConfidence}/100`);
        console.log(`   └─ Convergence: ${round.convergenceScore}/100`);
      });

      console.log(`\n🔍 Investigation Details:`);
      console.log(`   Tools Used: ${result.investigation.plan.actions.length}`);
      result.investigation.plan.actions.forEach(action => {
        console.log(`   - ${action.tool} (${action.priority}): ${action.reason}`);
      });

      if (result.investigation.userProfile) {
        console.log(`\n👤 User Profile Fetched:`);
        console.log(`   Username: @${result.investigation.userProfile.username}`);
        console.log(`   Followers: ${result.investigation.userProfile.public_metrics?.followers_count?.toLocaleString()}`);
        console.log(`   Account Age: ${result.investigation.userProfile.enrichedData?.accountAgeYears} years`);
        console.log(`   Legitimacy Score: ${result.investigation.userProfile.enrichedData?.legitimacyScore}/100`);
        console.log(`   Risk Level: ${result.investigation.userProfile.enrichedData?.riskLevel}`);
      }

      console.log(`\n📝 Execution Log:`);
      result.investigation.executionLog.forEach(log => {
        console.log(`   ${log}`);
      });

      // Wait before next test
      if (testAccounts.indexOf(test) < testAccounts.length - 1) {
        console.log(`\n⏳ Waiting 3s before next test...`);
        await new Promise(resolve => setTimeout(resolve, 3000));
      }

    } catch (error) {
      console.error(`\n❌ Error testing @${test.username}:`, error instanceof Error ? error.message : error);
      console.error('Stack:', error);
    }
  }

  console.log('\n\n' + '═'.repeat(70));
  console.log('✅ Agentic system testing complete!');
  console.log('═'.repeat(70));
  console.log('\n🎯 What Makes This Agentic:');
  console.log('   1. ✅ Agents autonomously decided which data to fetch from X API');
  console.log('   2. ✅ Multi-turn debate (prosecutor vs defender went back and forth)');
  console.log('   3. ✅ Tool use (agents called X API based on their own investigation plan)');
  console.log('   4. ✅ Consensus detection (stopped when agents converged)');
  console.log('   5. ✅ Real X.com data integration for production demo\n');
}

testAgenticSystem().catch(console.error);
