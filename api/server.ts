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

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'GrokGuard API is running' });
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
    const { username, text } = req.body;

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
    const { username, text } = req.body;

    if (!username || !text) {
      return res.status(400).json({ error: 'Username and text are required' });
    }

    console.log(`\n🔍 FACT-CHECK: Post from @${username}`);
    console.log(`   Content: "${text.substring(0, 100)}..."`);

    const result = await fullFactCheck(username, text);

    if (result.hasClaim) {
      console.log(`   Claims detected: ${result.claims?.join(', ')}`);
      console.log(`   Verdict: ${result.verdict} (${result.confidence}%)`);
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
  console.log(`💚 Health: GET /health\n`);
  console.log(`⚡ Feed posts use instant Grok analysis for real-time filtering`);
  console.log(`🔍 Fact-check uses Grok reasoning for claim verification`);
  console.log(`🎯 Profile analysis uses full agentic debate system\n`);
});
