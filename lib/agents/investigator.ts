/**
 * Investigator Agent - Autonomously decides what data to fetch
 * Uses grok-4-1-fast-reasoning to plan investigation and execute tools
 */

import { grok } from '../grok/client';
import { enhancedXApiClient } from '../x-api/enhanced-client';
import type { XContent } from '../types';

export interface InvestigationPlan {
  reasoning: string;
  actions: Array<{
    tool: 'fetch_user_profile' | 'fetch_user_posts' | 'search_similar_bios' | 'check_follower_network';
    reason: string;
    priority: 'high' | 'medium' | 'low';
  }>;
}

export interface InvestigationResult {
  plan: InvestigationPlan;
  userProfile?: any;
  userPosts?: any[];
  followerNetwork?: any;
  similarAccounts?: any[];
  executionLog: string[];
}

const INVESTIGATOR_SYSTEM_PROMPT = `You are an autonomous investigator agent for X.com content moderation.

Your job is to PLAN an investigation strategy based on the content provided.

You have access to these TOOLS:
1. fetch_user_profile - Get detailed user profile (age, verification, metrics)
2. fetch_user_posts - Get user's recent posts (up to 100)
3. search_similar_bios - Find accounts with similar bios (impersonator detection)
4. check_follower_network - Analyze follower/following patterns

Based on the content, decide which tools to use and in what order.

Output your plan as JSON:
{
  "reasoning": "Why these tools are needed",
  "actions": [
    {
      "tool": "fetch_user_profile",
      "reason": "Need to check account age and verification",
      "priority": "high"
    },
    ...
  ]
}

IMPORTANT:
- Prioritize tools that give most signal for least cost
- Always fetch user profile first (it's fast and essential)
- Only fetch posts if content is suspicious (it's slow)
- Search similar bios only for potential impersonators
- Check network only for suspected bot/scam rings

Output ONLY valid JSON.`;

export class InvestigatorAgent {
  private executionLog: string[] = [];

  /**
   * Autonomously plan and execute investigation
   */
  async investigate(content: XContent): Promise<InvestigationResult> {
    this.executionLog = [];
    this.log('🔍 Starting autonomous investigation...');

    // Phase 1: Plan the investigation
    const plan = await this.planInvestigation(content);
    this.log(`📋 Investigation plan created with ${plan.actions.length} actions`);

    // Phase 2: Execute tools based on plan
    const results: InvestigationResult = {
      plan,
      executionLog: [],
    };

    for (const action of plan.actions) {
      this.log(`⚙️  Executing: ${action.tool} (${action.priority} priority)`);

      try {
        switch (action.tool) {
          case 'fetch_user_profile':
            results.userProfile = await this.fetchUserProfile(content.authorUsername!);
            break;

          case 'fetch_user_posts':
            results.userPosts = await this.fetchUserPosts(
              content.authorId || results.userProfile?.id
            );
            break;

          case 'search_similar_bios':
            results.similarAccounts = await this.searchSimilarBios(
              content.authorBio || results.userProfile?.description
            );
            break;

          case 'check_follower_network':
            results.followerNetwork = await this.analyzeNetwork(
              results.userProfile
            );
            break;
        }

        this.log(`✅ ${action.tool} completed`);
      } catch (error) {
        this.log(`❌ ${action.tool} failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    results.executionLog = this.executionLog;
    return results;
  }

  /**
   * Use Grok to plan investigation strategy
   */
  private async planInvestigation(content: XContent): Promise<InvestigationPlan> {
    const prompt = `Plan an investigation for this X.com content:

**CONTENT:**
Type: ${content.type}
Text: "${content.text || 'N/A'}"
Author: @${content.authorUsername || 'Unknown'}
Bio: "${content.authorBio || 'N/A'}"

**METADATA:**
${content.metadata ? JSON.stringify(content.metadata, null, 2) : 'None available'}

Based on this content, which tools should I use to investigate? Output your plan as JSON.`;

    try {
      const response = await grok.reason(prompt, INVESTIGATOR_SYSTEM_PROMPT);

      // Parse JSON response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in investigator response');
      }

      const plan = JSON.parse(jsonMatch[0]);

      // Sort actions by priority
      plan.actions.sort((a: any, b: any) => {
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        return priorityOrder[a.priority as keyof typeof priorityOrder] -
               priorityOrder[b.priority as keyof typeof priorityOrder];
      });

      return plan;
    } catch (error) {
      console.error('Investigation planning error:', error);

      // Fallback: Always fetch user profile at minimum
      return {
        reasoning: 'Error in planning - using fallback (fetch profile only)',
        actions: [
          {
            tool: 'fetch_user_profile',
            reason: 'Essential baseline data',
            priority: 'high',
          },
        ],
      };
    }
  }

  /**
   * TOOL: Fetch user profile from X API
   */
  private async fetchUserProfile(username: string) {
    this.log(`  → Fetching profile for @${username}`);
    const profile = await enhancedXApiClient.getEnrichedUser(username);

    if (profile) {
      this.log(`  ✓ Found: ${profile.followers_count} followers, ${profile.enrichedData.accountAgeYears}y old`);
    } else {
      this.log(`  ✗ Profile not found`);
    }

    return profile;
  }

  /**
   * TOOL: Fetch user's recent posts
   */
  private async fetchUserPosts(userId?: string) {
    if (!userId) {
      this.log(`  ✗ Cannot fetch posts - no user ID`);
      return [];
    }

    this.log(`  → Fetching recent posts for user ${userId}`);
    const posts = await enhancedXApiClient.getUserPosts(userId, 20);
    this.log(`  ✓ Retrieved ${posts.length} posts`);

    return posts;
  }

  /**
   * TOOL: Search for accounts with similar bios (impersonator detection)
   */
  private async searchSimilarBios(bio?: string) {
    if (!bio || bio.length < 20) {
      this.log(`  ✗ Bio too short to search`);
      return [];
    }

    // Extract key terms from bio
    const keywords = this.extractKeywords(bio);
    this.log(`  → Searching for accounts with keywords: ${keywords.join(', ')}`);

    // In production, would search X API
    // For now, return empty (would need search API endpoint)
    this.log(`  ⚠ Search similar bios not implemented (requires X API search)`);
    return [];
  }

  /**
   * TOOL: Analyze follower/following network patterns
   */
  private async analyzeNetwork(userProfile?: any) {
    if (!userProfile) {
      this.log(`  ✗ No profile to analyze`);
      return null;
    }

    const followers = userProfile.public_metrics?.followers_count || 0;
    const following = userProfile.public_metrics?.following_count || 0;
    const ratio = following > 0 ? followers / following : 0;

    this.log(`  → Analyzing network: ${followers} followers / ${following} following`);

    const analysis = {
      followersCount: followers,
      followingCount: following,
      ratio,
      pattern: this.classifyNetworkPattern(followers, following, ratio),
    };

    this.log(`  ✓ Network pattern: ${analysis.pattern}`);
    return analysis;
  }

  /**
   * Helper: Extract keywords from bio
   */
  private extractKeywords(bio: string): string[] {
    // Simple keyword extraction (in production, use NLP)
    const words = bio.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 4)
      .slice(0, 5);

    return words;
  }

  /**
   * Helper: Classify network patterns
   */
  private classifyNetworkPattern(
    followers: number,
    following: number,
    ratio: number
  ): string {
    if (following > 1000 && followers < 100) {
      return 'aggressive_follower (bot pattern)';
    }
    if (ratio > 100 && followers > 10000) {
      return 'influencer';
    }
    if (ratio < 0.1 && following > 500) {
      return 'follower_chaser (potential spam)';
    }
    if (followers < 50 && following < 50) {
      return 'new_account';
    }
    return 'normal';
  }

  /**
   * Helper: Log execution steps
   */
  private log(message: string) {
    this.executionLog.push(`[${new Date().toISOString()}] ${message}`);
  }
}

export const investigator = new InvestigatorAgent();
