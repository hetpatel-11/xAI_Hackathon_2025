/**
 * Test the instant analyzer with sample posts
 */

import { instantAnalyze } from './lib/agents/instant-analyzer';

async function testInstantAnalyzer() {
  console.log('\n⚡ Testing Instant Analyzer\n');
  console.log('═'.repeat(60));

  // Test 1: Obvious scam
  console.log('\n📝 Test 1: Crypto Giveaway Scam');
  console.log('─'.repeat(60));
  const scamPost = 'FREE CRYPTO GIVEAWAY! Send me 1 ETH and I will send you 2 ETH back! Limited time only! Claim now at bit.ly/freecrypto';
  console.time('⏱️  Analysis Time');
  const scamResult = await instantAnalyze('cryptoscammer123', scamPost);
  console.timeEnd('⏱️  Analysis Time');
  console.log('\nResult:', JSON.stringify(scamResult, null, 2));

  // Test 2: Suspicious but not obvious scam
  console.log('\n\n📝 Test 2: Suspicious Urgency Tactics');
  console.log('─'.repeat(60));
  const suspiciousPost = 'HURRY! Limited time offer to make $10k daily! Click here now to get started! Don\'t miss out!';
  console.time('⏱️  Analysis Time');
  const suspiciousResult = await instantAnalyze('makemoneyfast', suspiciousPost);
  console.timeEnd('⏱️  Analysis Time');
  console.log('\nResult:', JSON.stringify(suspiciousResult, null, 2));

  // Test 3: Clean post
  console.log('\n\n📝 Test 3: Legitimate Post');
  console.log('─'.repeat(60));
  const cleanPost = 'Just finished reading a great book on AI ethics. Really makes you think about the future of technology.';
  console.time('⏱️  Analysis Time');
  const cleanResult = await instantAnalyze('normaluser', cleanPost);
  console.timeEnd('⏱️  Analysis Time');
  console.log('\nResult:', JSON.stringify(cleanResult, null, 2));

  console.log('\n' + '═'.repeat(60));
  console.log('✅ Instant Analyzer Test Complete\n');
}

testInstantAnalyzer().catch(console.error);
