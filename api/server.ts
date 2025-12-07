/**
 * Simple API server for browser extension
 * Connects extension to the agentic debate system
 */

import express from 'express';
import cors from 'cors';
import * as dotenv from 'dotenv';
import { debateOrchestrator } from '../lib/agents/debate-orchestrator';
import { instantAnalyze } from '../lib/agents/instant-analyzer';
import { fullFactCheck } from '../lib/agents/fact-checker';
import type { XContent } from '../lib/types';

dotenv.config({ path: '.env.local' });

const app = express();
const PORT = 3000;

// In-memory storage for dashboard
const dashboardData = {
  stats: {
    totalScanned: 0,
    scamsBlocked: 0,
    suspicious: 0,
    factChecked: 0,
    misinformation: 0,
  },
  recentPosts: [] as Array<{
    id: string;
    username: string;
    text: string;
    classification: string;
    confidence: number;
    reasoning: string;
    timestamp: string;
    tweetUrl?: string;
    factCheck?: any;
  }>,
  activityLog: [] as Array<{
    time: string;
    text: string;
    type: string;
  }>,
};

// Add to activity log
function logActivity(text: string, type: string = 'info') {
  dashboardData.activityLog.unshift({
    time: new Date().toLocaleTimeString(),
    text,
    type,
  });
  // Keep only last 50 activities
  if (dashboardData.activityLog.length > 50) {
    dashboardData.activityLog.pop();
  }
}


// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'GrokGuard API is running' });
});

// Dashboard stats endpoint
app.get('/api/stats', (req, res) => {
  // Return all posts (not just last 50) so dashboard can filter properly
  const posts = dashboardData.recentPosts.slice(0, 100); // Return up to 100 posts
  
  // Log for debugging
  const counts = {
    all: posts.length,
    blocked: posts.filter(p => p.classification === 'scam').length,
    flagged: posts.filter(p => p.classification === 'suspicious' || p.classification === 'uncertain').length,
    factchecked: posts.filter(p => p.factCheck?.hasClaim).length,
    misinfo: posts.filter(p => p.factCheck?.hasClaim && (p.factCheck.verdict === 'false' || p.factCheck.verdict === 'mostly_false')).length,
  };
  console.log(`📊 Dashboard stats request:`, counts);
  
  res.json({
    stats: dashboardData.stats,
    recentPosts: posts,
    activityLog: dashboardData.activityLog.slice(0, 20), // Last 20 activities
  });
});

// Reset stats endpoint
app.post('/api/stats/reset', (req, res) => {
  dashboardData.stats = {
    totalScanned: 0,
    scamsBlocked: 0,
    suspicious: 0,
    factChecked: 0,
    misinformation: 0,
  };
  dashboardData.recentPosts = [];
  dashboardData.activityLog = [];
  logActivity('Stats reset', 'info');
  res.json({ success: true });
});

// Analyze profile endpoint
app.post('/api/analyze', async (req, res) => {
  try {
    const { username } = req.body;

    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }

    console.log(`\n🔍 API Request: Analyzing @${username}`);

    // Create content object for agent system
    const content: XContent = {
      id: `api_${username}_${Date.now()}`,
      type: 'profile',
      text: '',
      authorUsername: username,
    };

    // Run the full agentic debate system
    const result = await debateOrchestrator.runDebate(content);

    console.log(`✅ Analysis complete for @${username}`);

    // Format response for extension
    const response = {
      investigation: result.investigation,
      rounds: result.rounds,
      verdict: result.finalVerdict,
    };

    res.json(response);

  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).json({
      error: 'Analysis failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Analyze post endpoint - INSTANT AI ANALYSIS for feed monitoring
console.log('Registering POST /api/analyze-post');
app.post('/api/analyze-post', async (req, res) => {
  try {
    const { username, text, tweetUrl } = req.body;

    if (!username || !text) {
      return res.status(400).json({ error: 'Username and text are required' });
    }

    console.log(`\n⚡ INSTANT Analysis: Post from @${username}`);
    console.log(`   Content: "${text.substring(0, 100)}..."`);

    // Use INSTANT GROK ANALYZER for lightning-fast results
    let verdict;
    try {
      verdict = await instantAnalyze(username, text);
      console.log(`   Grok returned:`, verdict);
    } catch (analyzerError) {
      console.error(`   Grok failed:`, analyzerError);
      return res.status(500).json({
        error: 'Grok analysis failed',
        message: analyzerError instanceof Error ? analyzerError.message : String(analyzerError)
      });
    }

    if (!verdict) {
      console.error(`   Grok returned null/undefined`);
      return res.status(500).json({
        error: 'Instant analysis failed',
        message: 'Grok returned no verdict'
      });
    }

    console.log(`✅ Instant verdict: ${verdict.classification} (${verdict.confidence}%)`);

    // Update dashboard stats
    dashboardData.stats.totalScanned++;
    if (verdict.classification === 'scam') {
      dashboardData.stats.scamsBlocked++;
      logActivity(`Blocked scam from @${username}`, 'error');
    } else if (verdict.classification === 'suspicious' || verdict.classification === 'uncertain') {
      dashboardData.stats.suspicious++;
      logActivity(`Flagged ${verdict.classification} post from @${username}`, 'warning');
    } else {
      logActivity(`Post analyzed: ${verdict.classification}`, 'success');
    }

    // Store post for dashboard (store full text, not truncated)
    // Use text hash to prevent duplicates
    const textHash = text.substring(0, 100);
    const existingPostIndex = dashboardData.recentPosts.findIndex(p => 
      p.username === username && p.text && p.text.substring(0, 100) === textHash
    );

    if (existingPostIndex >= 0) {
      // Update existing post
      dashboardData.recentPosts[existingPostIndex].classification = verdict.classification;
      dashboardData.recentPosts[existingPostIndex].confidence = verdict.confidence;
      dashboardData.recentPosts[existingPostIndex].reasoning = verdict.reasoning;
      if (tweetUrl) {
        dashboardData.recentPosts[existingPostIndex].tweetUrl = tweetUrl;
      }
    } else {
      // Create new post entry
      dashboardData.recentPosts.unshift({
        id: `${username}_${Date.now()}`,
        username,
        text: text, // Store full text for dashboard
        classification: verdict.classification,
        confidence: verdict.confidence,
        reasoning: verdict.reasoning,
        timestamp: new Date().toLocaleTimeString(),
        tweetUrl: tweetUrl,
      });
    }

    // Keep only last 100 posts
    if (dashboardData.recentPosts.length > 100) {
      dashboardData.recentPosts.pop();
    }

    // Format response for extension (compatible with existing format)
    const response = {
      investigation: {
        plan: {
          reasoning: 'Instant AI analysis using Grok',
          actions: []
        }
      },
      rounds: [], // No debate rounds for instant analysis
      verdict: verdict,
    };

    res.json(response);

  } catch (error) {
    console.error('Post analysis error:', error);
    res.status(500).json({
      error: 'Post analysis failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      detail: error instanceof Error && (error as any).stack ? (error as any).stack : undefined
    });
  }
});

// Fact-check endpoint - Misinformation detection
app.post('/api/fact-check', async (req, res) => {
  try {
    const { username, text, tweetUrl } = req.body;

    if (!username || !text) {
      return res.status(400).json({ error: 'Username and text are required' });
    }

    console.log(`\n🔍 FACT-CHECK: Post from @${username}`);
    console.log(`   Content: "${text.substring(0, 100)}..."`);

    const result = await fullFactCheck(username, text);

    if (result.hasClaim) {
      console.log(`   Claims detected: ${result.claims?.join(', ')}`);
      console.log(`   Verdict: ${result.verdict} (${result.confidence}%)`);
      
      // Update dashboard stats
      dashboardData.stats.factChecked++;
      if (result.verdict === 'false' || result.verdict === 'mostly_false') {
        dashboardData.stats.misinformation++;
        logActivity(`Misinformation detected from @${username}`, 'error');
      } else {
        logActivity(`Fact-checked: ${result.verdict}`, 'info');
      }

      // Try to find existing post by matching text content (more reliable than username)
      const textHash = text.substring(0, 100); // Use first 100 chars as identifier
      const existingPost = dashboardData.recentPosts.find(p => 
        p.username === username && p.text && p.text.substring(0, 100) === textHash
      );

      if (existingPost) {
        // Update existing post with fact-check data
        existingPost.factCheck = {
          hasClaim: true,
          verdict: result.verdict,
          claims: result.claims,
          explanation: result.explanation,
          sources: result.sources,
          communityNote: result.communityNote,
        };
        // Update reasoning if needed
        if (result.explanation && !existingPost.reasoning) {
          existingPost.reasoning = result.explanation;
        }
        if (tweetUrl && !existingPost.tweetUrl) {
          existingPost.tweetUrl = tweetUrl;
        }
      } else {
        // Create new post entry for fact-checked post (even if not previously analyzed)
        // This ensures all fact-checked posts appear in dashboard
        dashboardData.recentPosts.unshift({
          id: `factcheck_${username}_${Date.now()}`,
          username,
          text: text, // Store full text
          classification: 'legitimate', // Fact-checked posts are typically legitimate content with claims
          confidence: result.confidence || 0,
          reasoning: result.explanation || result.communityNote || 'Post contains verifiable claims',
          timestamp: new Date().toLocaleTimeString(),
          tweetUrl: tweetUrl,
          factCheck: {
            hasClaim: true,
            verdict: result.verdict,
            claims: result.claims,
            explanation: result.explanation,
            sources: result.sources,
            communityNote: result.communityNote,
          },
        });

        // Keep only last 100 posts
        if (dashboardData.recentPosts.length > 100) {
          dashboardData.recentPosts.pop();
        }
      }
    } else {
      console.log(`   No verifiable claims detected`);
    }

    res.json(result);

  } catch (error) {
    console.error('Fact-check error:', error);
    res.status(500).json({
      error: 'Fact-check failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Feedback endpoint for human-in-the-loop learning
app.post('/api/feedback', async (req, res) => {
  try {
    const { username, classification, confidence, wasCorrect, timestamp } = req.body;

    if (!username || classification === undefined || wasCorrect === undefined) {
      return res.status(400).json({ error: 'Missing required feedback fields' });
    }

    console.log(`\n📊 Feedback Received:`);
    console.log(`   User: @${username}`);
    console.log(`   Classification: ${classification}`);
    console.log(`   Confidence: ${confidence}%`);
    console.log(`   Human says: ${wasCorrect ? '✅ CORRECT' : '❌ INCORRECT'}`);
    console.log(`   Timestamp: ${new Date(timestamp).toISOString()}\n`);

    // In production: Store feedback in Supabase for agent learning
    // This allows the system to improve over time by learning from human corrections

    res.json({
      success: true,
      message: 'Feedback recorded successfully'
    });

  } catch (error) {
    console.error('Feedback error:', error);
    res.status(500).json({
      error: 'Feedback recording failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`\n╔═══════════════════════════════════════════════════════════════╗`);
  console.log(`║  🛡️  GrokGuard API Server Running                             ║`);
  console.log(`╚═══════════════════════════════════════════════════════════════╝`);
  console.log(`\n🌐 Server: http://localhost:${PORT}`);
  console.log(`📡 Endpoints:`);
  console.log(`   POST /api/analyze (profile analysis - full debate system)`);
  console.log(`   POST /api/analyze-post (⚡ INSTANT post analysis - Grok AI)`);
  console.log(`   POST /api/fact-check (🔍 Misinformation detection & fact-checking)`);
  console.log(`   POST /api/feedback (user feedback)`);
  console.log(`   GET  /api/stats (📊 Dashboard stats)`);
  console.log(`💚 Health: GET /health\n`);
  console.log(`⚡ Feed posts use instant Grok analysis for real-time filtering`);
  console.log(`🔍 Fact-check uses Grok reasoning for claim verification`);
  console.log(`🎯 Profile analysis uses full agentic debate system`);
  console.log(`\n📊 Dashboard: Run 'npm run dashboard' to start the dashboard\n`);
  logActivity('Server started', 'info');
});
