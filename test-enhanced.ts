/**
 * Test with Enhanced Legitimacy Analysis
 * Comprehensive multi-factor scoring system
 */

import * as dotenv from 'dotenv';
import { enhancedXApiClient } from './lib/x-api/enhanced-client';

dotenv.config({ path: '.env.local' });

const testAccounts = [
  // Legitimate accounts
  { username: 'XDevelopers', expected: 'LEGITIMATE' },
  { username: 'elonmusk', expected: 'LEGITIMATE' },
  { username: 'OpenAI', expected: 'LEGITIMATE' },

  // Add your own test accounts here
  // { username: 'some_suspicious_account', expected: 'SUSPICIOUS' },
];

async function testEnhancedAnalysis() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  ENHANCED LEGITIMACY ANALYSIS TEST');
  console.log('  Multi-factor comprehensive scoring');
  console.log('═══════════════════════════════════════════════════════\n');

  for (const test of testAccounts) {
    try {
      console.log(`\n${'═'.repeat(70)}`);
      console.log(`Analyzing @${test.username}`);
      console.log(`Expected: ${test.expected}`);
      console.log(`${'═'.repeat(70)}`);

      const enriched = await enhancedXApiClient.getEnrichedUser(test.username);

      if (!enriched) {
        console.log(`❌ Account not found\n`);
        continue;
      }

      const { enrichedData } = enriched;

      // Basic Info
      console.log(`\n📋 BASIC INFO:`);
      console.log(`   Username: @${enriched.username}`);
      console.log(`   Name: ${enriched.name || 'N/A'}`);
      console.log(`   Bio: "${enriched.description?.substring(0, 60)}${enriched.description && enriched.description.length > 60 ? '...' : ''}"`);

      // Temporal Factors
      console.log(`\n⏰ TEMPORAL FACTORS:`);
      console.log(`   Account Age: ${enrichedData.accountAgeYears} years (${enrichedData.accountAgeDays} days)`);
      console.log(`   Status: ${enrichedData.isNewAccount ? '🆕 NEW (<30 days)' : enrichedData.isEstablishedAccount ? '✓ ESTABLISHED (2+ years)' : '→ GROWING'}`);

      // Network Factors
      console.log(`\n🌐 NETWORK FACTORS:`);
      console.log(`   Followers: ${enriched.public_metrics?.followers_count?.toLocaleString() || 0}`);
      console.log(`   Following: ${enriched.public_metrics?.following_count?.toLocaleString() || 0}`);
      console.log(`   Listed Count: ${enrichedData.listedCount.toLocaleString()}`);
      console.log(`   Follower Ratio: ${enrichedData.followerRatio.toFixed(2)}`);
      console.log(`   ${enrichedData.hasHealthyFollowerRatio ? '✓' : '⚠'} ${enrichedData.hasHealthyFollowerRatio ? 'Healthy' : 'Unhealthy'} follower ratio`);

      // Activity Factors
      console.log(`\n📊 ACTIVITY FACTORS:`);
      console.log(`   Total Tweets: ${enrichedData.tweetCount.toLocaleString()}`);
      console.log(`   Avg Tweets/Day: ${enrichedData.averageTweetsPerDay.toFixed(2)}`);
      console.log(`   ${enrichedData.isActiveAccount ? '✓ ACTIVE' : enrichedData.isDormantAccount ? '⚠ DORMANT' : '→ MODERATE'} account`);

      // Profile Quality
      console.log(`\n🖼️  PROFILE QUALITY:`);
      console.log(`   ${enrichedData.hasProfileImage ? '✓' : '✗'} Profile Image ${enrichedData.hasDefaultProfileImage ? '(DEFAULT)' : '(CUSTOM)'}`);
      console.log(`   ${enrichedData.hasBio ? '✓' : '✗'} Bio ${enrichedData.hasDetailedBio ? `(${enrichedData.bioLength} chars - DETAILED)` : enrichedData.hasBio ? `(${enrichedData.bioLength} chars)` : ''}`);
      console.log(`   ${enrichedData.hasURL ? '✓' : '✗'} Website`);
      console.log(`   ${enrichedData.hasLocation ? '✓' : '✗'} Location`);

      // Verification
      console.log(`\n✓ VERIFICATION:`);
      console.log(`   ${enrichedData.verificationInfo.isVerified ? '✅ VERIFIED' : '❌ NOT VERIFIED'}`);
      if (enrichedData.verificationInfo.isVerified) {
        console.log(`   Type: ${enrichedData.verificationInfo.verifiedType?.toUpperCase() || 'UNKNOWN'}`);
        if (enrichedData.verificationInfo.isGovernmentVerified) {
          console.log(`   🏛️  GOVERNMENT VERIFIED`);
        } else if (enrichedData.verificationInfo.isBusinessVerified) {
          console.log(`   🏢 BUSINESS VERIFIED`);
        } else if (enrichedData.verificationInfo.isBlueVerified) {
          console.log(`   🔵 BLUE VERIFIED`);
        }
      }

      // Scam Risk Factors
      console.log(`\n🚨 SCAM RISK INDICATORS:`);
      const risks = enrichedData.scamRiskFactors;
      const hasAnyRisk = Object.values(risks).some(v => v === true);

      if (!hasAnyRisk) {
        console.log(`   ✅ No scam indicators detected`);
      } else {
        if (risks.suspiciousFollowPattern) console.log(`   ⚠️  Suspicious follow pattern`);
        if (risks.newAccountHighFollowing) console.log(`   ⚠️  New account with high following`);
        if (risks.noActivityHighFollowers) console.log(`   ⚠️  High followers but no activity`);
        if (risks.genericUsername) console.log(`   ⚠️  Generic username pattern`);
        if (risks.emptyProfile) console.log(`   ⚠️  Empty profile`);
        if (risks.rapidFollowing) console.log(`   ⚠️  Rapid following pattern`);
      }

      // Legitimacy Score
      console.log(`\n📈 LEGITIMACY ASSESSMENT:`);
      console.log(`   Score: ${enrichedData.legitimacyScore}/100`);
      console.log(`   Risk Level: ${
        enrichedData.riskLevel === 'LOW' ? '🟢 LOW' :
        enrichedData.riskLevel === 'MEDIUM' ? '🟡 MEDIUM' :
        enrichedData.riskLevel === 'HIGH' ? '🟠 HIGH' :
        '🔴 CRITICAL'
      }`);
      console.log(`   Data Completeness: ${enrichedData.dataCompleteness}%`);

      // Positive Factors
      if (enrichedData.legitimacyFactors.positive.length > 0) {
        console.log(`\n   ✅ POSITIVE SIGNALS:`);
        enrichedData.legitimacyFactors.positive.forEach(factor => {
          console.log(`      ${factor}`);
        });
      }

      // Negative Factors
      if (enrichedData.legitimacyFactors.negative.length > 0) {
        console.log(`\n   ⚠️  NEGATIVE SIGNALS:`);
        enrichedData.legitimacyFactors.negative.forEach(factor => {
          console.log(`      ${factor}`);
        });
      }

      // Neutral Factors
      if (enrichedData.legitimacyFactors.neutral.length > 0) {
        console.log(`\n   → OBSERVATIONS:`);
        enrichedData.legitimacyFactors.neutral.forEach(factor => {
          console.log(`      ${factor}`);
        });
      }

      // API Limitations
      if (enrichedData.apiLimitation) {
        console.log(`\n   ⚡ API LIMITATION:`);
        console.log(`      ${enrichedData.apiLimitation}`);
      }

      // Final Decision
      console.log(`\n🎯 RECOMMENDATION:`);
      if (enrichedData.legitimacyScore >= 80) {
        console.log(`   ✅ SKIP AGENT ANALYSIS - Clearly Legitimate`);
        console.log(`   Action: NO_ACTION`);
      } else if (enrichedData.legitimacyScore >= 50) {
        console.log(`   ⚠️  RUN AGENT ANALYSIS - Uncertain`);
        console.log(`   Action: FULL_DEBATE`);
      } else {
        console.log(`   🚨 HIGH PRIORITY ANALYSIS - Suspicious`);
        console.log(`   Action: IMMEDIATE_REVIEW`);
      }

      // Wait before next test
      if (testAccounts.indexOf(test) < testAccounts.length - 1) {
        console.log(`\n⏳ Waiting 2s before next analysis...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

    } catch (error) {
      console.error(`\n❌ Error analyzing @${test.username}:`, error instanceof Error ? error.message : error);
    }
  }

  console.log(`\n\n${'═'.repeat(70)}`);
  console.log('✅ Enhanced analysis complete!');
  console.log(`${'═'.repeat(70)}\n`);
}

testEnhancedAnalysis().catch(console.error);
