/**
 * Test GrokGuard with real X.com users
 * Simple version: Fetch specific users and analyze their profiles
 */

import * as dotenv from 'dotenv';
import { Client } from '@xdevplatform/xdk';
import { runAgentDebate } from './lib/agents/orchestrator';
import type { XContent } from './lib/types';

dotenv.config({ path: '.env.local' });

const xClient = new Client({
  bearerToken: process.env.X_API_BEARER_TOKEN!,
});

// Test with known accounts
const testUsernames = [
  'XDevelopers',     // Legitimate verified account
  'elonmusk',        // High-profile verified account
  'OpenAI',          // Legitimate AI company
];

async function testRealUsers() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  GROKGUARD - REAL X.COM USERS TEST');
  console.log('  Analyzing real profiles from X platform');
  console.log('═══════════════════════════════════════════════════════\n');

  for (const username of testUsernames) {
    try {
      console.log(`\n${'═'.repeat(60)}`);
      console.log(`Fetching @${username}...`);

      const user = await xClient.users.getByUsername(username, {
        'user.fields': ['description', 'profile_image_url', 'verified', 'public_metrics', 'created_at'],
      });

      if (!user.data) {
        console.log(`❌ User not found\n`);
        continue;
      }

      const userData = user.data;
      console.log(`\n✅ Found @${userData.username}`);
      console.log(`   Bio: "${userData.description?.substring(0, 100)}${userData.description && userData.description.length > 100 ? '...' : ''}"`);
      console.log(`   Verified: ${userData.verified ? 'YES ✓' : 'NO'}`);
      console.log(`   Followers: ${userData.public_metrics?.followers_count?.toLocaleString()}`);
      console.log(`   Following: ${userData.public_metrics?.following_count?.toLocaleString()}`);
      console.log(`   Account created: ${new Date(userData.created_at!).toLocaleDateString()}`);

      // Create XContent for analysis
      const content: XContent = {
        id: `profile_${userData.id}`,
        type: 'profile',
        text: '',
        authorId: userData.id!,
        authorUsername: userData.username!,
        authorBio: userData.description,
        authorProfileImage: userData.profile_image_url,
        metadata: {
          verified: userData.verified,
          followers: userData.public_metrics?.followers_count,
          following: userData.public_metrics?.following_count,
          accountAge: userData.created_at,
        },
      };

      console.log(`\n🤖 Running GrokGuard Analysis...`);

      const result = await runAgentDebate(content, {
        skipLowConfidence: false, // Run full debate even for low suspicion
      });

      console.log(`\n📊 AGENT DECISION:`);
      console.log(`   ├─ Confidence Score: ${result.confidenceScore}/100`);
      console.log(`   ├─ Classification: ${result.classification.toUpperCase()}`);
      console.log(`   ├─ Recommended Action: ${result.debateLog.arbiterDecision.recommendedAction}`);
      console.log(`   └─ Explanation:`);

      // Pretty print explanation with word wrap
      const explanation = result.debateLog.arbiterDecision.explanation;
      const words = explanation.split(' ');
      let line = '      ';
      for (const word of words) {
        if (line.length + word.length > 70) {
          console.log(line);
          line = '      ' + word + ' ';
        } else {
          line += word + ' ';
        }
      }
      if (line.trim()) console.log(line);

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

testRealUsers().catch(console.error);
