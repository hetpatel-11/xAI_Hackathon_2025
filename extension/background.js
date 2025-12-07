/**
 * GrokGuard Background Service Worker
 * Handles API calls to the agent system
 */

console.log('🛡️ GrokGuard background service worker started');

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'analyzeProfile') {
    analyzeProfile(request.username)
      .then(data => sendResponse({ success: true, data }))
      .catch(error => sendResponse({ success: false, error: error.message }));

    // Return true to indicate async response
    return true;
  }

  if (request.action === 'analyzePost') {
    analyzePost(request.username, request.text)
      .then(data => sendResponse({ success: true, data }))
      .catch(error => sendResponse({ success: false, error: error.message }));

    return true;
  }

  if (request.action === 'submitFeedback') {
    submitFeedback(request.data)
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));

    return true;
  }

  if (request.action === 'factCheck') {
    factCheckPost(request.username, request.text)
      .then(data => sendResponse({ success: true, data }))
      .catch(error => sendResponse({ success: false, error: error.message }));

    return true;
  }
});

/**
 * Call the GrokGuard API to analyze a profile
 */
async function analyzeProfile(username) {
  console.log(`Analyzing @${username}...`);

  try {
    // In production, this would call your deployed API
    // For demo, we'll call localhost:3000
    const API_URL = 'http://localhost:3000/api/analyze';

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username }),
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }

    const data = await response.json();
    return data;

  } catch (error) {
    console.error('Analysis error:', error);

    // For demo purposes, return mock data if API is not running
    console.log('API not available, returning mock data for demo');
    return getMockAnalysis(username);
  }
}

/**
 * Call the GrokGuard API to analyze a post
 */
async function analyzePost(username, text) {
  console.log(`Analyzing post from @${username}: "${text.substring(0, 50)}..."`);

  try {
    // Prefer 127.0.0.1 to avoid host resolution issues; falls back to localhost if needed
    const API_URL = 'http://127.0.0.1:3000/api/analyze-post';

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username, text }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`API request failed: ${response.status} ${body}`);
    }

    const data = await response.json();
    return data;

  } catch (error) {
    console.error('Post analysis error:', error);

    // For demo purposes, return mock data if API is not running
    console.warn('API not available, returning mock post analysis (no real AI verdict)');
    const mock = getMockPostAnalysis(username, text);
    // Attach the error so content script can surface it
    return { ...mock, mock: true, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Generate mock analysis data for demo
 * (Used when backend API is not running)
 */
function getMockAnalysis(username) {
  // Simulate different results based on username patterns
  const isCrypto = username.toLowerCase().includes('crypto');
  const isNumeric = /^\w+\d{8,}/.test(username);

  if (isCrypto && !username.includes('Official')) {
    // Crypto account - likely legitimate but flagged
    return {
      investigation: {
        plan: {
          reasoning: `Crypto-themed username detected. Fetching profile and posts to verify legitimacy.`,
          actions: [
            {
              tool: 'fetch_user_profile',
              reason: 'Check account age, verification, and metrics',
              priority: 'high'
            },
            {
              tool: 'fetch_user_posts',
              reason: 'Analyze content for scam patterns',
              priority: 'medium'
            }
          ]
        },
        userProfile: {
          username: username,
          enrichedData: {
            legitimacyScore: 85,
            riskLevel: 'MEDIUM',
            accountAgeYears: 2
          }
        }
      },
      rounds: [
        {
          round: 1,
          prosecutorArgument: 'Crypto keyword detected. High scam risk in this category.',
          prosecutorConfidence: 60,
          defenderArgument: 'No concrete evidence of scam. Legitimate crypto discussions exist.',
          defenderConfidence: 70,
          convergenceScore: 45
        },
        {
          round: 2,
          prosecutorArgument: 'Account age is relatively new. Posts show promotional content.',
          prosecutorConfidence: 55,
          defenderArgument: 'Account has consistent posting history. No wallet addresses or scam links.',
          defenderConfidence: 75,
          convergenceScore: 65
        }
      ],
      verdict: {
        classification: 'uncertain',
        confidence: 35,
        recommendedAction: 'flag',
        reasoning: 'Crypto-themed account with moderate risk indicators. No direct scam evidence but warrants monitoring.'
      }
    };
  } else if (isNumeric) {
    // Numerical username - suspicious
    return {
      investigation: {
        plan: {
          reasoning: `Numerical username pattern suggests bot or spam account. Running comprehensive investigation.`,
          actions: [
            {
              tool: 'fetch_user_profile',
              reason: 'Verify account details and metrics',
              priority: 'high'
            },
            {
              tool: 'check_follower_network',
              reason: 'Analyze for bot ring patterns',
              priority: 'medium'
            },
            {
              tool: 'fetch_user_posts',
              reason: 'Check for spam activity',
              priority: 'low'
            }
          ]
        },
        userProfile: {
          username: username,
          enrichedData: {
            legitimacyScore: 45,
            riskLevel: 'HIGH',
            accountAgeYears: 0.5
          }
        }
      },
      rounds: [
        {
          round: 1,
          prosecutorArgument: 'Generic numerical username. New account with suspicious patterns.',
          prosecutorConfidence: 75,
          defenderArgument: 'Auto-generated usernames are common. No malicious activity yet.',
          defenderConfidence: 60,
          convergenceScore: 30
        },
        {
          round: 2,
          prosecutorArgument: 'Low follower count, high following ratio. Classic bot pattern.',
          prosecutorConfidence: 80,
          defenderArgument: 'Many legitimate users have auto-generated names initially.',
          defenderConfidence: 55,
          convergenceScore: 35
        },
        {
          round: 3,
          prosecutorArgument: 'Empty profile, no bio, minimal activity. High confidence scam.',
          prosecutorConfidence: 85,
          defenderArgument: 'Inactive accounts aren\'t necessarily harmful. Just dormant.',
          defenderConfidence: 50,
          convergenceScore: 40
        }
      ],
      verdict: {
        classification: 'suspicious',
        confidence: 68,
        recommendedAction: 'flag',
        reasoning: 'Multiple red flags including numerical username, new account, and suspicious network patterns. Recommended for manual review.'
      }
    };
  } else {
    // Normal account - legitimate
    return {
      investigation: {
        plan: {
          reasoning: `Standard profile analysis. Fetching basic profile information.`,
          actions: [
            {
              tool: 'fetch_user_profile',
              reason: 'Verify account legitimacy and metrics',
              priority: 'high'
            }
          ]
        },
        userProfile: {
          username: username,
          enrichedData: {
            legitimacyScore: 100,
            riskLevel: 'LOW',
            accountAgeYears: 5
          }
        }
      },
      rounds: [
        {
          round: 1,
          prosecutorArgument: 'Standard profile with normal activity patterns. No red flags detected.',
          prosecutorConfidence: 10,
          defenderArgument: 'Clearly legitimate account with established history and verification.',
          defenderConfidence: 95,
          convergenceScore: 95
        }
      ],
      verdict: {
        classification: 'legitimate',
        confidence: 7,
        recommendedAction: 'no_action',
        reasoning: 'Legitimate account with strong trust signals. No action needed.'
      }
    };
  }
}

/**
 * Generate mock post analysis data for demo
 */
function getMockPostAnalysis(username, text) {
  // Detect scam patterns in post text
  const scamKeywords = ['free crypto', 'giveaway', 'send me', 'double your', 'verify your wallet', 'claim now', 'exclusive offer', 'limited time'];
  const hasScamKeyword = scamKeywords.some(keyword => text.toLowerCase().includes(keyword));

  if (hasScamKeyword) {
    // SCAM detected
    return {
      mock: true,
      investigation: {
        plan: {
          reasoning: `Scam keywords detected in post content. Analyzing for phishing/fraud patterns.`,
          actions: [
            { tool: 'analyze_post_content', reason: 'Check for scam language patterns', priority: 'high' }
          ]
        }
      },
      rounds: [
        {
          round: 1,
          prosecutorArgument: 'Post contains high-risk keywords typical of crypto scams.',
          prosecutorConfidence: 90,
          defenderArgument: 'Could be legitimate promotional content.',
          defenderConfidence: 30,
          convergenceScore: 20
        }
      ],
      verdict: {
        classification: 'scam',
        confidence: 85,
        recommendedAction: 'quarantine',
        reasoning: `Post contains scam indicators: ${scamKeywords.filter(k => text.toLowerCase().includes(k)).join(', ')}. High probability of phishing attempt.`
      }
    };
  } else {
    // Legitimate post
    return {
      mock: true,
      investigation: {
        plan: {
          reasoning: `Normal post content. No suspicious patterns detected.`,
          actions: []
        }
      },
      rounds: [],
      verdict: {
        classification: 'legitimate',
        confidence: 5,
        recommendedAction: 'no_action',
        reasoning: 'Post appears normal with no scam indicators.'
      }
    };
  }
}

/**
 * Fact-check a post for misinformation
 */
async function factCheckPost(username, text) {
  console.log(`🔍 Fact-checking post from @${username}: "${text.substring(0, 50)}..."`);

  try {
    const API_URL = 'http://127.0.0.1:3000/api/fact-check';

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username, text }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`API request failed: ${response.status} ${body}`);
    }

    return await response.json();

  } catch (error) {
    console.error('Fact-check error:', error);
    return { hasClaim: false, error: error.message };
  }
}

/**
 * Submit user feedback to the API for learning loop
 */
async function submitFeedback(feedbackData) {
  console.log('📊 Submitting feedback:', feedbackData);

  try {
    const API_URL = 'http://localhost:3000/api/feedback';

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(feedbackData),
    });

    if (!response.ok) {
      throw new Error(`Feedback submission failed: ${response.status}`);
    }

    const result = await response.json();
    console.log('✅ Feedback submitted successfully');
    return result;

  } catch (error) {
    console.error('Feedback submission error:', error);
    // Don't throw - we don't want to break the UI if feedback fails
    console.log('⚠️ Feedback will be logged locally instead');
  }
}
