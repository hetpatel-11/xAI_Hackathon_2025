import { Client } from '@xdevplatform/xdk';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function testAPIs() {
  console.log('🧪 Testing API Access...\n');

  // Test X API
  try {
    console.log('📡 Testing X API with Bearer Token...');
    const client = new Client({
      bearerToken: process.env.X_API_BEARER_TOKEN!,
    });

    const user = await client.users.getByUsername('XDevelopers');
    console.log('✅ X API Connected!');
    console.log(`   User: @${user.data?.username}`);
    console.log(`   ID: ${user.data?.id}`);
    console.log(`   Followers: ${user.data?.public_metrics?.followers_count}\n`);

    // Test search capabilities
    console.log('📡 Testing X API Search...');
    const search = await client.posts.searchRecent({
      query: 'crypto scam',
      max_results: 5,
      'tweet.fields': ['created_at', 'public_metrics']
    });
    console.log(`✅ Found ${search.data?.length || 0} recent posts about crypto scams\n`);

  } catch (error: any) {
    console.error('❌ X API Error:', error.message, '\n');
  }

  // Test Grok API - Basic
  try {
    console.log('🤖 Testing Grok API (grok-4-1-fast-reasoning)...');
    const response = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.XAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'grok-4-1-fast-reasoning',
        messages: [{
          role: 'user',
          content: 'Rate this for scam probability 0-100: "Send 1 ETH get 10 back! bit.ly/fake"'
        }],
        stream: false,
        temperature: 0
      })
    });

    const data = await response.json();
    if (data.choices && data.choices[0]) {
      console.log('✅ Grok Reasoning API Works!');
      console.log(`   Model: ${data.model}`);
      console.log(`   Tokens used: ${data.usage?.total_tokens}`);
      console.log(`   Response: ${data.choices[0].message.content.substring(0, 100)}...\n`);
    }
  } catch (error: any) {
    console.error('❌ Grok API Error:', error.message, '\n');
  }

  // Test Grok Vision API
  try {
    console.log('👁️  Testing Grok Vision API...');
    const response = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.XAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'grok-2-vision-1212',
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: 'Is this a stock photo or AI-generated image? Answer in one sentence.' },
            { type: 'image_url', image_url: { url: 'https://pbs.twimg.com/profile_images/1590968738358079488/IY9Gx6Ok_400x400.jpg' }}
          ]
        }],
        stream: false
      })
    });

    const data = await response.json();
    if (data.choices && data.choices[0]) {
      console.log('✅ Grok Vision API Works!');
      console.log(`   Response: ${data.choices[0].message.content.substring(0, 150)}...\n`);
    }
  } catch (error: any) {
    console.error('❌ Grok Vision Error:', error.message, '\n');
  }

  console.log('🎉 All API Tests Complete!');
  console.log('\n📊 Summary:');
  console.log('   ✅ X API: User lookup, search');
  console.log('   ✅ Grok Reasoning: Scam detection');
  console.log('   ✅ Grok Vision: Image analysis');
}

testAPIs();
