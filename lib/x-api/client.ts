/**
 * X API Client - Enhanced data fetching with proper context
 */

import { Client } from '@xdevplatform/xdk';

export class XAPIClient {
  private client: Client;

  constructor(bearerToken: string) {
    this.client = new Client({ bearerToken });
  }

  /**
   * Get enriched user data with all available fields
   */
  async getEnrichedUser(username: string) {
    try {
      const response = await this.client.users.getByUsername(username, {
        'user.fields': [
          'created_at',
          'description',
          'entities',
          'id',
          'location',
          'name',
          'pinned_tweet_id',
          'profile_image_url',
          'protected',
          'public_metrics',
          'url',
          'username',
          'verified',
          'verified_type',
          'withheld',
        ],
      });

      if (!response.data) {
        return null;
      }

      const user = response.data;

      // Calculate account age
      const accountAge = user.created_at
        ? Math.floor((Date.now() - new Date(user.created_at).getTime()) / (1000 * 60 * 60 * 24 * 365))
        : 0;

      // Calculate follower/following ratio
      const followerRatio = user.public_metrics?.followers_count && user.public_metrics?.following_count
        ? user.public_metrics.followers_count / user.public_metrics.following_count
        : 0;

      // Determine if account seems legitimate based on metrics
      const isLikelyLegitimate = this.assessLegitimacy(user, accountAge, followerRatio);

      return {
        ...user,
        enrichedData: {
          accountAgeYears: accountAge,
          followerRatio,
          isLikelyLegitimate,
          hasHighFollowerCount: (user.public_metrics?.followers_count || 0) > 10000,
          hasLowFollowingCount: (user.public_metrics?.following_count || 0) < 1000,
          isOldAccount: accountAge > 5,
          verificationInfo: {
            isVerified: user.verified || false,
            verifiedType: user.verified_type || 'none',
            // Note: X API may not return full verification data with Bearer token
            apiLimitation: !user.verified && (user.public_metrics?.followers_count || 0) > 100000
              ? 'HIGH_FOLLOWER_COUNT_BUT_UNVERIFIED_MAY_BE_API_LIMITATION'
              : null,
          },
        },
      };
    } catch (error) {
      console.error('Error fetching user:', error);
      return null;
    }
  }

  /**
   * Assess if an account is likely legitimate based on metrics
   */
  private assessLegitimacy(
    user: any,
    accountAgeYears: number,
    followerRatio: number
  ): {
    score: number;
    signals: string[];
  } {
    const signals: string[] = [];
    let score = 50; // Start neutral

    // Positive signals
    if (user.verified) {
      score += 30;
      signals.push('Verified account');
    }

    if (accountAgeYears > 5) {
      score += 15;
      signals.push(`Account ${accountAgeYears} years old`);
    }

    if ((user.public_metrics?.followers_count || 0) > 100000) {
      score += 10;
      signals.push('High follower count (100K+)');
    }

    if (followerRatio > 10 && (user.public_metrics?.followers_count || 0) > 1000) {
      score += 10;
      signals.push('Healthy follower ratio');
    }

    if (user.description && user.description.length > 50) {
      score += 5;
      signals.push('Detailed bio');
    }

    // Negative signals
    if (!user.verified && (user.public_metrics?.followers_count || 0) < 100) {
      score -= 20;
      signals.push('Very low followers');
    }

    if (accountAgeYears < 1) {
      score -= 10;
      signals.push('New account (<1 year)');
    }

    if (followerRatio < 0.1 && (user.public_metrics?.following_count || 0) > 100) {
      score -= 15;
      signals.push('Suspicious follow pattern (following many, few followers)');
    }

    // Special case: High followers but API shows unverified
    // This is likely an API limitation, not a real issue
    if (
      !user.verified &&
      (user.public_metrics?.followers_count || 0) > 100000 &&
      accountAgeYears > 3
    ) {
      score += 25; // Boost score - likely API data limitation
      signals.push('⚠️ API may have incomplete verification data for high-follower account');
    }

    return {
      score: Math.max(0, Math.min(100, score)),
      signals,
    };
  }

  /**
   * Get user's recent posts (if available)
   */
  async getUserPosts(userId: string, maxResults: number = 10) {
    try {
      const response = await this.client.posts.getUserPosts(userId, {
        max_results: maxResults,
        'tweet.fields': ['created_at', 'public_metrics', 'entities'],
      });

      return response.data || [];
    } catch (error) {
      // May fail with Bearer token - that's okay
      console.warn('Could not fetch user posts (may require OAuth):', error instanceof Error ? error.message : error);
      return [];
    }
  }
}

export const xApiClient = new XAPIClient(process.env.X_API_BEARER_TOKEN || '');
