/**
 * Test GrokGuard with real X.com users - FIXED VERSION
 * Uses enriched X API data with legitimacy scoring
 */

import * as dotenv from 'dotenv';
import { XAPIClient } from './lib/x-api/client';
import { runAgentDebate } from './lib/agents/orchestrator';
import type { XContent } from './lib/types';

dotenv.config({ path: '.env.local' });

const xClient = new XAPIClient(process.env.X_API_BEARER_TOKEN!);

// Test with known accounts
const testUsernames = [
  'XDevelopers',     // Legitimate verified account
  'elonmusk',        // High-profile account
  'OpenAI',          // Legitimate company account
];

async function testRealUsersFixed() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  GROKGUARD - REAL X.COM USERS TEST (FIXED)');
  console.log('  Using enriched API data with legitimacy scoring');
  console.log('═══════════════════════════════════════════════════════\n');

  for (const username of testUsernames) {
    try {
      console.log(`\n${'═'.repeat(60)}`);
      console.log(`Fetching enriched data for @${username}...`);

      const enrichedUser = await xClient.getEnrichedUser(username);

      if (!enrichedUser) {
        console.log(`❌ User not found\n`);
        continue;
      }

      const { enrichedData } = enrichedUser;

      console.log(`\n✅ Found @${enrichedUser.username}`);
      console.log(`   Bio: "${enrichedUser.description?.substring(0, 80)}${enrichedUser.description && enrichedUser.description.length > 80 ? '...' : ''}"`);
      console.log(`   Verified: ${enrichedUser.verified ? 'YES ✓' : 'NO'} ${enrichedUser.verified_type ? `(${enrichedUser.verified_type})` : ''}`);
      console.log(`   Followers: ${enrichedUser.public_metrics?.followers_count?.toLocaleString()}`);
      console.log(`   Following: ${enrichedUser.public_metrics?.following_count?.toLocaleString()}`);
      console.log(`   Account Age: ${enrichedData.accountAgeYears} years`);
      console.log(`   Follower Ratio: ${enrichedData.followerRatio.toFixed(1)}`);

      console.log(`\n📊 Legitimacy Assessment:`);
      console.log(`   Score: ${enrichedData.isLikelyLegitimate.score}/100`);
      console.log(`   Signals:`);
      enrichedData.isLikelyLegitimate.signals.forEach(signal => {
        console.log(`     - ${signal}`);
      });

      if (enrichedData.verificationInfo.apiLimitation) {
        console.log(`\n⚠️  API Limitation Detected:`);
        console.log(`   ${enrichedData.verificationInfo.apiLimitation}`);
        console.log(`   This account is likely legitimate but verification data is incomplete.`);
      }

      // Create XContent with enriched metadata
      const content: XContent = {
        id: `profile_${enrichedUser.id}`,
        type: 'profile',
        text: '',
        authorId: enrichedUser.id!,
        authorUsername: enrichedUser.username!,
        authorBio: enrichedUser.description,
        authorProfileImage: enrichedUser.profile_image_url,
        metadata: {
          verified: enrichedUser.verified,
          verifiedType: enrichedUser.verified_type,
          followers: enrichedUser.public_metrics?.followers_count,
          following: enrichedUser.public_metrics?.following_count,
          accountAge: enrichedUser.created_at,
          accountAgeYears: enrichedData.accountAgeYears,
          followerRatio: enrichedData.followerRatio,
          legitimacyScore: enrichedData.isLikelyLegitimate.score,
          legitimacySignals: enrichedData.isLikelyLegitimate.signals,
          apiLimitation: enrichedData.verificationInfo.apiLimitation,
        },
      };

      // Skip analysis if legitimacy score is very high (>80) and no API limitations
      if (enrichedData.isLikelyLegitimate.score > 80 && !enrichedData.verificationInfo.apiLimitation) {
        console.log(`\n✅ SKIPPING FULL ANALYSIS - High Legitimacy Score (${enrichedData.isLikelyLegitimate.score}/100)`);
        console.log(`   This account shows strong signs of authenticity.`);
        console.log(`   Recommended Action: NO_ACTION\n`);
        continue;
      }

      console.log(`\n🤖 Running GrokGuard Analysis...`);
      console.log(`   (Legitimacy pre-score: ${enrichedData.isLikelyLegitimate.score}/100)`);

      const result = await runAgentDebate(content, {
        skipLowConfidence: false,
      });

      console.log(`\n📊 AGENT DECISION:`);
      console.log(`   ├─ Pre-Analysis Legitimacy: ${enrichedData.isLikelyLegitimate.score}/100`);
      console.log(`   ├─ Agent Confidence Score: ${result.confidenceScore}/100`);
      console.log(`   ├─ Classification: ${result.classification.toUpperCase()}`);
      console.log(`   ├─ Recommended Action: ${result.debateLog.arbiterDecision.recommendedAction}`);
      console.log(`   └─ Explanation (first 200 chars):`);
      console.log(`      ${result.debateLog.arbiterDecision.explanation.substring(0, 200)}...`);
      console.log(`\n   Processing Time: ${result.debateLog.durationMs}ms`);

      // Rate limiting
      if (testUsernames.indexOf(username) < testUsernames.length - 1) {
        console.log(`\n⏳ Waiting 3s before next analysis...`);
        await new Promise(resolve => setTimeout(resolve, 3000));
      }

    } catch (error) {
      console.error(`\n❌ Error analyzing @${username}:`, error instanceof Error ? error.message : error);
    }
  }

  console.log(`\n\n${'═'.repeat(60)}`);
  console.log('✅ Real X.com user analysis complete!');
  console.log(`${'═'.repeat(60)}\n`);
}

testRealUsersFixed().catch(console.error);
