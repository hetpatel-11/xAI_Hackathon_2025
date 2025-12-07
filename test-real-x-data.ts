/**
 * Test GrokGuard with REAL X.com data
 * Uses X API to fetch actual posts and profiles, then runs agent analysis
 */

import * as dotenv from 'dotenv';
import { Client } from '@xdevplatform/xdk';
import { runAgentDebate } from './lib/agents/orchestrator';
import type { XContent } from './lib/types';

dotenv.config({ path: '.env.local' });

const xClient = new Client({
  bearerToken: process.env.X_API_BEARER_TOKEN!,
});

async function testRealData() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  GROKGUARD - REAL X.COM DATA TEST');
  console.log('  Testing with actual posts from X platform');
  console.log('═══════════════════════════════════════════════════════\n');

  // Test 1: Search for crypto scam posts
  console.log('🔍 Searching for potential crypto scam posts...\n');

  try {
    const scamSearch = await xClient.posts.searchRecent({
      query: 'send ETH get crypto wallet',
      max_results: 5,
      'tweet.fields': ['created_at', 'author_id', 'public_metrics'],
      'user.fields': ['username', 'description', 'profile_image_url', 'verified'],
      expansions: ['author_id'],
    });

    if (scamSearch.data && scamSearch.data.length > 0) {
      console.log(`Found ${scamSearch.data.length} posts matching scam keywords\n`);

      // Get user data from includes
      const users = scamSearch.includes?.users || [];
      const userMap = new Map(users.map(u => [u.id!, u]));

      // Test first post
      const post = scamSearch.data[0];
      const author = userMap.get(post.author_id!);

      if (author && post.text) {
        const content: XContent = {
          id: post.id!,
          type: 'post',
          text: post.text,
          authorId: author.id!,
          authorUsername: author.username!,
          authorBio: author.description,
          authorProfileImage: author.profile_image_url,
          createdAt: new Date(post.created_at!),
          metadata: {
            verified: author.verified,
            likes: post.public_metrics?.like_count,
            retweets: post.public_metrics?.retweet_count,
          },
        };

        console.log(`\n${'═'.repeat(60)}`);
        console.log(`REAL POST ANALYSIS`);
        console.log(`Post ID: ${post.id}`);
        console.log(`Author: @${author.username}`);
        console.log(`Text: "${post.text?.substring(0, 100)}${post.text && post.text.length > 100 ? '...' : ''}"`);
        console.log(`${'═'.repeat(60)}\n`);

        const result = await runAgentDebate(content, {
          skipLowConfidence: false,
        });

        console.log(`\n📊 AGENT DECISION:`);
        console.log(`   Score: ${result.confidenceScore}/100`);
        console.log(`   Classification: ${result.classification.toUpperCase()}`);
        console.log(`   Action: ${result.debateLog.arbiterDecision.recommendedAction}`);
        console.log(`   Explanation: ${result.debateLog.arbiterDecision.explanation.substring(0, 200)}...`);
      }
    } else {
      console.log('⚠️  No posts found with scam keywords. Trying alternative search...\n');
    }

    // Test 2: Check a known legitimate account
    console.log(`\n\n${'═'.repeat(60)}`);
    console.log('🔍 Testing with known legitimate account (XDevelopers)...\n');

    const user = await xClient.users.getByUsername('XDevelopers', {
      'user.fields': ['description', 'profile_image_url', 'verified', 'public_metrics'],
    });

    if (user.data) {
      const content: XContent = {
        id: `profile_${user.data.id}`,
        type: 'profile',
        text: '',
        authorId: user.data.id!,
        authorUsername: user.data.username!,
        authorBio: user.data.description,
        authorProfileImage: user.data.profile_image_url,
        metadata: {
          verified: user.data.verified,
          followers: user.data.public_metrics?.followers_count,
        },
      };

      console.log(`Profile: @${user.data.username}`);
      console.log(`Bio: "${user.data.description?.substring(0, 100)}..."`);
      console.log(`Verified: ${user.data.verified ? 'YES' : 'NO'}`);
      console.log(`Followers: ${user.data.public_metrics?.followers_count}\n`);

      const result = await runAgentDebate(content, {
        skipLowConfidence: false,
      });

      console.log(`\n📊 AGENT DECISION:`);
      console.log(`   Score: ${result.confidenceScore}/100`);
      console.log(`   Classification: ${result.classification.toUpperCase()}`);
      console.log(`   Action: ${result.debateLog.arbiterDecision.recommendedAction}`);
      console.log(`   Explanation: ${result.debateLog.arbiterDecision.explanation}`);
    }

    // Test 3: Search for recent posts with high engagement
    console.log(`\n\n${'═'.repeat(60)}`);
    console.log('🔍 Analyzing trending posts...\n');

    const trending = await xClient.posts.searchRecent({
      query: 'lang:en -is:retweet',
      max_results: 3,
      'tweet.fields': ['created_at', 'author_id', 'public_metrics'],
      'user.fields': ['username', 'description', 'profile_image_url', 'verified'],
      expansions: ['author_id'],
    });

    if (trending.data && trending.data.length > 0) {
      const trendingUsers = trending.includes?.users || [];
      const trendingUserMap = new Map(trendingUsers.map(u => [u.id!, u]));

      for (let i = 0; i < Math.min(2, trending.data.length); i++) {
        const post = trending.data[i];
        const author = trendingUserMap.get(post.author_id!);

        if (author && post.text) {
          console.log(`\n--- Trending Post ${i + 1} ---`);
          console.log(`@${author.username}: "${post.text.substring(0, 80)}..."`);
          console.log(`Likes: ${post.public_metrics?.like_count}, Retweets: ${post.public_metrics?.retweet_count}`);

          const content: XContent = {
            id: post.id!,
            type: 'post',
            text: post.text,
            authorId: author.id!,
            authorUsername: author.username!,
            authorBio: author.description,
            authorProfileImage: author.profile_image_url,
            metadata: {
              verified: author.verified,
              likes: post.public_metrics?.like_count,
            },
          };

          const result = await runAgentDebate(content, {
            skipLowConfidence: true, // Use fast path for low suspicion
          });

          console.log(`Decision: ${result.classification.toUpperCase()} (${result.confidenceScore}/100)`);
        }

        // Rate limiting
        if (i < trending.data.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      }
    }

  } catch (error) {
    console.error('\n❌ Error testing with real X data:', error);
    if (error instanceof Error) {
      console.error('   Message:', error.message);
    }
  }

  console.log('\n\n✅ Real X.com data testing complete!\n');
}

testRealData().catch(console.error);
