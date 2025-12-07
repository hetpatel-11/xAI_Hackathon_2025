/**
 * Comprehensive test of the GrokGuard agent system
 * Tests all 5 agents with various scenarios
 */

import * as dotenv from 'dotenv';
import { runAgentDebate } from './lib/agents/orchestrator';
import type { XContent } from './lib/types';

// Load environment variables
const result = dotenv.config({ path: '.env.local' });
if (result.error) {
  console.error('Error loading .env.local:', result.error);
  process.exit(1);
}

console.log('Environment loaded:', {
  hasXaiKey: !!process.env.XAI_API_KEY,
  hasXBearerToken: !!process.env.X_API_BEARER_TOKEN,
});

// Test scenarios
const testScenarios: XContent[] = [
  // Scenario 1: Obvious crypto scam
  {
    id: 'test_1',
    type: 'post',
    text: 'Send 0.5 ETH to wallet 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb now and get 5 ETH back! Limited time offer! Click here: bit.ly/scam123',
    authorId: '123456',
    authorUsername: 'crypto_giveaway_official',
    authorBio: 'Official crypto giveaway. Send ETH, get more back!',
    authorProfileImage: 'https://pbs.twimg.com/profile_images/1590968738358079488/IY9Gx6Ok_400x400.jpg',
    createdAt: new Date(),
    metadata: { verified: false },
  },

  // Scenario 2: Potential impersonator
  {
    id: 'test_2',
    type: 'profile',
    text: '',
    authorId: '789012',
    authorUsername: 'elonmusk_official',
    authorBio: 'CEO of Tesla and SpaceX. DM for partnership opportunities.',
    authorProfileImage: 'https://pbs.twimg.com/profile_images/1590968738358079488/IY9Gx6Ok_400x400.jpg',
    createdAt: new Date(),
    metadata: { verified: false },
  },

  // Scenario 3: Legitimate post (should pass)
  {
    id: 'test_3',
    type: 'post',
    text: 'Just published a new blog post about building AI agents with TypeScript. Check it out on my website!',
    authorId: '345678',
    authorUsername: 'dev_joe',
    authorBio: 'Software engineer building cool stuff with AI',
    authorProfileImage: 'https://pbs.twimg.com/profile_images/1590968738358079488/IY9Gx6Ok_400x400.jpg',
    createdAt: new Date(),
    metadata: { verified: false },
  },

  // Scenario 4: Edge case - crypto discussion (not scam)
  {
    id: 'test_4',
    type: 'post',
    text: 'Interesting analysis on Ethereum gas fees. The recent EIP-1559 update has significantly reduced transaction costs. What are your thoughts?',
    authorId: '901234',
    authorUsername: 'crypto_analyst',
    authorBio: 'Blockchain researcher. Sharing technical analysis and insights.',
    authorProfileImage: 'https://pbs.twimg.com/profile_images/1590968738358079488/IY9Gx6Ok_400x400.jpg',
    createdAt: new Date(),
    metadata: { verified: false },
  },

  // Scenario 5: Suspicious DM
  {
    id: 'test_5',
    type: 'dm',
    text: 'Hey! I saw your profile and thought you might be interested in this amazing opportunity. Send me your wallet address and I\'ll send you some free tokens!',
    authorId: '567890',
    authorUsername: 'hot_girl_2024',
    authorBio: '💎 Crypto enthusiast | 🌴 Travel lover | 📸 Model',
    authorProfileImage: 'https://pbs.twimg.com/profile_images/1590968738358079488/IY9Gx6Ok_400x400.jpg',
    createdAt: new Date(),
    metadata: { verified: false },
  },
];

async function runTests() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  GROKGUARD AGENT SYSTEM TEST SUITE');
  console.log('  Testing 5-Agent Debate System with Real Grok API');
  console.log('═══════════════════════════════════════════════════════\n');

  const results = [];

  for (let i = 0; i < testScenarios.length; i++) {
    const scenario = testScenarios[i];

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`TEST ${i + 1}/${testScenarios.length}: ${scenario.type.toUpperCase()} - @${scenario.authorUsername}`);
    console.log(`Content: "${scenario.text?.substring(0, 80)}${scenario.text && scenario.text.length > 80 ? '...' : ''}"`);
    console.log(`${'═'.repeat(60)}`);

    try {
      const result = await runAgentDebate(scenario, {
        skipLowConfidence: false, // Run full debate for all tests
        includeNetworkData: false,
        includePostHistory: false,
      });

      results.push({
        scenario: i + 1,
        username: scenario.authorUsername,
        finalScore: result.confidenceScore,
        classification: result.classification,
        action: result.debateLog.arbiterDecision.recommendedAction,
        duration: result.debateLog.durationMs,
      });

      console.log(`\n📊 FINAL RESULT:`);
      console.log(`   Confidence Score: ${result.confidenceScore}/100`);
      console.log(`   Classification: ${result.classification.toUpperCase()}`);
      console.log(`   Recommended Action: ${result.debateLog.arbiterDecision.recommendedAction}`);
      console.log(`   Explanation: ${result.debateLog.arbiterDecision.explanation}`);
      console.log(`   Duration: ${result.debateLog.durationMs}ms`);

    } catch (error) {
      console.error(`\n❌ TEST FAILED:`, error);
      results.push({
        scenario: i + 1,
        username: scenario.authorUsername,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    // Rate limiting - wait 2 seconds between tests
    if (i < testScenarios.length - 1) {
      console.log(`\n⏳ Waiting 2s before next test (API rate limiting)...`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  // Print summary
  console.log(`\n\n${'═'.repeat(60)}`);
  console.log('  TEST SUMMARY');
  console.log(`${'═'.repeat(60)}\n`);

  console.log('┌────────────────────────────────────────────────────────┐');
  console.log('│ Test | Username              | Score | Classification │');
  console.log('├────────────────────────────────────────────────────────┤');

  results.forEach((r) => {
    if ('error' in r) {
      console.log(`│ ${r.scenario.toString().padStart(4)} | ${(r.username || 'Unknown').padEnd(20)} | ERROR |                │`);
    } else {
      const scoreColor = r.finalScore >= 70 ? '🔴' : r.finalScore >= 40 ? '🟡' : '🟢';
      console.log(`│ ${r.scenario.toString().padStart(4)} | ${r.username.padEnd(20)} | ${scoreColor} ${r.finalScore.toString().padStart(2)}  | ${r.classification.padEnd(14)} │`);
    }
  });

  console.log('└────────────────────────────────────────────────────────┘\n');

  const successful = results.filter((r) => !('error' in r));
  const avgDuration = successful.length > 0
    ? Math.round(successful.reduce((sum, r) => sum + (r.duration || 0), 0) / successful.length)
    : 0;

  console.log(`📈 Statistics:`);
  console.log(`   Total Tests: ${results.length}`);
  console.log(`   Successful: ${successful.length}`);
  console.log(`   Failed: ${results.length - successful.length}`);
  console.log(`   Avg Duration: ${avgDuration}ms`);

  console.log(`\n✅ Agent system test complete!\n`);
}

runTests().catch(console.error);
