/**
 * Enhanced X API Client - Advanced legitimacy analysis
 * Accounts for comprehensive factors beyond basic metrics
 */

import { Client } from '@xdevplatform/xdk';

export interface EnrichedUserData {
  // Basic info
  id: string;
  username: string;
  name?: string;
  description?: string;
  created_at?: string;
  verified?: boolean;
  verified_type?: string;
  profile_image_url?: string;
  public_metrics?: {
    followers_count?: number;
    following_count?: number;
    tweet_count?: number;
    listed_count?: number;
  };

  // Enhanced analysis
  enrichedData: {
    // Temporal factors
    accountAgeYears: number;
    accountAgeDays: number;
    isNewAccount: boolean; // < 30 days
    isEstablishedAccount: boolean; // > 2 years

    // Network factors
    followerRatio: number;
    hasHealthyFollowerRatio: boolean;
    hasHighFollowerCount: boolean; // > 10K
    hasVeryHighFollowerCount: boolean; // > 100K
    hasLowFollowingCount: boolean; // < 1K
    listedCount: number; // How many lists account is on

    // Activity factors
    tweetCount: number;
    averageTweetsPerDay: number;
    isActiveAccount: boolean; // > 1 tweet/week average
    isDormantAccount: boolean; // < 1 tweet/month average

    // Profile quality factors
    hasProfileImage: boolean;
    hasDefaultProfileImage: boolean;
    hasBio: boolean;
    bioLength: number;
    hasDetailedBio: boolean; // > 50 chars
    hasURL: boolean;
    hasLocation: boolean;

    // Verification & credibility
    verificationInfo: {
      isVerified: boolean;
      verifiedType?: string;
      isBusinessVerified: boolean;
      isGovernmentVerified: boolean;
      isBlueVerified: boolean;
    };

    // Scam indicators
    scamRiskFactors: {
      suspiciousFollowPattern: boolean; // Following many, few followers
      newAccountHighFollowing: boolean; // New + following 1000+
      noActivityHighFollowers: boolean; // High followers but no tweets
      genericUsername: boolean; // Contains numbers, underscores in suspicious ways
      emptyProfile: boolean; // No bio, no image, no tweets
      rapidFollowing: boolean; // Following/age ratio > 100/day
    };

    // Overall assessment
    legitimacyScore: number; // 0-100
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    legitimacyFactors: {
      positive: string[];
      negative: string[];
      neutral: string[];
    };

    // API limitations
    apiLimitation?: string;
    dataCompleteness: number; // 0-100% how complete our data is
  };
}

export class EnhancedXAPIClient {
  private client: Client;

  constructor(bearerToken: string) {
    this.client = new Client({ bearerToken });
  }

  /**
   * Get comprehensive enriched user data with advanced analysis
   */
  async getEnrichedUser(username: string): Promise<EnrichedUserData | null> {
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
        ],
      });

      if (!response.data) {
        return null;
      }

      const user = response.data;

      // Calculate temporal factors
      const createdDate = user.created_at ? new Date(user.created_at) : new Date();
      const accountAgeDays = Math.floor((Date.now() - createdDate.getTime()) / (1000 * 60 * 60 * 24));
      const accountAgeYears = Math.floor(accountAgeDays / 365);

      // Calculate network factors
      const followersCount = user.public_metrics?.followers_count || 0;
      const followingCount = user.public_metrics?.following_count || 0;
      const tweetCount = user.public_metrics?.tweet_count || 0;
      const listedCount = user.public_metrics?.listed_count || 0;

      const followerRatio = followingCount > 0 ? followersCount / followingCount : followersCount;

      // Calculate activity factors
      const averageTweetsPerDay = accountAgeDays > 0 ? tweetCount / accountAgeDays : 0;

      // Profile quality factors
      const bioLength = user.description?.length || 0;
      const hasDefaultProfileImage = user.profile_image_url?.includes('default_profile') || false;

      // Analyze username for scam patterns
      const genericUsernamePattern = /^[a-zA-Z]+[0-9]{4,}$|^[a-zA-Z]+_[a-zA-Z]+[0-9]+$/;
      const genericUsername = genericUsernamePattern.test(user.username || '');

      // Scam risk factors
      const suspiciousFollowPattern = followingCount > 100 && followerRatio < 0.1;
      const newAccountHighFollowing = accountAgeDays < 90 && followingCount > 500;
      const noActivityHighFollowers = tweetCount < 10 && followersCount > 1000;
      const rapidFollowing = accountAgeDays > 0 && (followingCount / accountAgeDays) > 100;
      const emptyProfile = !user.description && !user.profile_image_url && tweetCount === 0;

      // Verification info
      const verificationInfo = {
        isVerified: user.verified || false,
        verifiedType: user.verified_type,
        isBusinessVerified: user.verified_type === 'business',
        isGovernmentVerified: user.verified_type === 'government',
        isBlueVerified: user.verified_type === 'blue',
      };

      // Calculate comprehensive legitimacy score
      const legitimacyAnalysis = this.calculateLegitimacyScore({
        accountAgeDays,
        accountAgeYears,
        followersCount,
        followingCount,
        followerRatio,
        tweetCount,
        listedCount,
        averageTweetsPerDay,
        bioLength,
        verificationInfo,
        hasDefaultProfileImage,
        genericUsername,
        suspiciousFollowPattern,
        newAccountHighFollowing,
        noActivityHighFollowers,
        rapidFollowing,
        emptyProfile,
        hasURL: !!user.url,
        hasLocation: !!user.location,
      });

      return {
        ...user,
        enrichedData: {
          // Temporal
          accountAgeYears,
          accountAgeDays,
          isNewAccount: accountAgeDays < 30,
          isEstablishedAccount: accountAgeYears >= 2,

          // Network
          followerRatio,
          hasHealthyFollowerRatio: followerRatio > 0.5 && followerRatio < 10000,
          hasHighFollowerCount: followersCount > 10000,
          hasVeryHighFollowerCount: followersCount > 100000,
          hasLowFollowingCount: followingCount < 1000,
          listedCount,

          // Activity
          tweetCount,
          averageTweetsPerDay,
          isActiveAccount: averageTweetsPerDay > 0.14, // > 1 tweet/week
          isDormantAccount: averageTweetsPerDay < 0.03, // < 1 tweet/month

          // Profile quality
          hasProfileImage: !!user.profile_image_url,
          hasDefaultProfileImage,
          hasBio: !!user.description,
          bioLength,
          hasDetailedBio: bioLength > 50,
          hasURL: !!user.url,
          hasLocation: !!user.location,

          // Verification
          verificationInfo,

          // Scam indicators
          scamRiskFactors: {
            suspiciousFollowPattern,
            newAccountHighFollowing,
            noActivityHighFollowers,
            genericUsername,
            emptyProfile,
            rapidFollowing,
          },

          // Overall assessment
          ...legitimacyAnalysis,

          // Data completeness
          dataCompleteness: this.calculateDataCompleteness(user),
        },
      };
    } catch (error) {
      console.error('Error fetching user:', error);
      return null;
    }
  }

  /**
   * Calculate comprehensive legitimacy score based on multiple factors
   */
  private calculateLegitimacyScore(factors: any): {
    legitimacyScore: number;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    legitimacyFactors: {
      positive: string[];
      negative: string[];
      neutral: string[];
    };
    apiLimitation?: string;
  } {
    const positive: string[] = [];
    const negative: string[] = [];
    const neutral: string[] = [];
    let score = 50; // Start neutral

    // STRONG POSITIVE SIGNALS (+30-40)
    if (factors.verificationInfo.isVerified) {
      score += 35;
      positive.push(`✓ Verified (${factors.verificationInfo.verifiedType || 'yes'})`);
    }

    if (factors.verificationInfo.isGovernmentVerified) {
      score += 5; // Extra boost for government
      positive.push('✓ Government verified');
    }

    // TEMPORAL FACTORS (+15-25)
    if (factors.accountAgeYears > 10) {
      score += 20;
      positive.push(`✓ Very old account (${factors.accountAgeYears} years)`);
    } else if (factors.accountAgeYears > 5) {
      score += 15;
      positive.push(`✓ Established account (${factors.accountAgeYears} years)`);
    } else if (factors.accountAgeYears > 2) {
      score += 10;
      positive.push(`✓ Mature account (${factors.accountAgeYears} years)`);
    }

    // NETWORK FACTORS (+10-20)
    if (factors.followersCount > 1000000) {
      score += 15;
      positive.push('✓ Very high follower count (1M+)');
    } else if (factors.followersCount > 100000) {
      score += 12;
      positive.push('✓ High follower count (100K+)');
    } else if (factors.followersCount > 10000) {
      score += 8;
      positive.push('✓ Significant follower count (10K+)');
    }

    if (factors.followerRatio > 10 && factors.followersCount > 1000) {
      score += 10;
      positive.push('✓ Healthy follower ratio (more followers than following)');
    }

    if (factors.listedCount > 1000) {
      score += 10;
      positive.push('✓ Listed on many accounts (credible source)');
    } else if (factors.listedCount > 100) {
      score += 5;
      positive.push('✓ Listed on multiple accounts');
    }

    // ACTIVITY FACTORS (+5-15)
    if (factors.tweetCount > 10000) {
      score += 10;
      positive.push('✓ Very active account (10K+ tweets)');
    } else if (factors.tweetCount > 1000) {
      score += 7;
      positive.push('✓ Active account (1K+ tweets)');
    } else if (factors.tweetCount > 100) {
      score += 5;
      positive.push('✓ Some activity (100+ tweets)');
    }

    if (factors.averageTweetsPerDay > 1) {
      score += 5;
      positive.push('✓ Regularly active (1+ tweet/day)');
    }

    // PROFILE QUALITY (+5-15)
    if (factors.bioLength > 100) {
      score += 8;
      positive.push('✓ Detailed bio');
    } else if (factors.bioLength > 50) {
      score += 5;
      positive.push('✓ Complete bio');
    }

    if (factors.hasURL) {
      score += 5;
      positive.push('✓ Has website');
    }

    if (factors.hasLocation) {
      score += 3;
      positive.push('✓ Has location');
    }

    if (!factors.hasDefaultProfileImage) {
      score += 5;
      positive.push('✓ Custom profile image');
    }

    // NEGATIVE SIGNALS (-10 to -30)

    // Critical scam indicators
    if (factors.emptyProfile) {
      score -= 25;
      negative.push('⚠ Empty profile (no bio, no image, no tweets)');
    }

    if (factors.suspiciousFollowPattern) {
      score -= 20;
      negative.push('⚠ Suspicious follow pattern (following many, few followers)');
    }

    if (factors.newAccountHighFollowing) {
      score -= 15;
      negative.push('⚠ New account following many (potential bot)');
    }

    if (factors.rapidFollowing) {
      score -= 15;
      negative.push('⚠ Rapid following pattern (100+ per day)');
    }

    if (factors.noActivityHighFollowers) {
      score -= 12;
      negative.push('⚠ High followers but no activity (dormant/fake)');
    }

    if (factors.genericUsername) {
      score -= 10;
      negative.push('⚠ Generic username pattern');
    }

    // Moderate concerns
    if (factors.accountAgeDays < 30) {
      score -= 10;
      negative.push('⚠ Very new account (<30 days)');
    } else if (factors.accountAgeDays < 90) {
      score -= 5;
      negative.push('⚠ New account (<3 months)');
    }

    if (!factors.verificationInfo.isVerified && factors.followersCount < 100) {
      score -= 8;
      negative.push('⚠ Very low followers');
    }

    if (factors.tweetCount === 0) {
      score -= 10;
      negative.push('⚠ No tweets');
    }

    if (factors.hasDefaultProfileImage) {
      score -= 8;
      negative.push('⚠ Default profile image');
    }

    if (!factors.hasBio || factors.bioLength === 0) {
      score -= 5;
      negative.push('⚠ No bio');
    }

    // NEUTRAL OBSERVATIONS
    if (factors.followerRatio < 0.5 && factors.followersCount < 1000) {
      neutral.push('→ More following than followers (common for new users)');
    }

    if (factors.averageTweetsPerDay < 0.1) {
      neutral.push('→ Low activity account');
    }

    // SPECIAL CASE: API Limitation Detection
    let apiLimitation;
    if (
      !factors.verificationInfo.isVerified &&
      factors.followersCount > 100000 &&
      factors.accountAgeYears > 3 &&
      factors.tweetCount > 100
    ) {
      score += 20; // Strong boost - likely API data issue
      apiLimitation = 'HIGH_FOLLOWER_UNVERIFIED_LIKELY_API_LIMITATION';
      positive.push('⚡ API may have incomplete verification data');
    }

    // Clamp score to 0-100
    score = Math.max(0, Math.min(100, score));

    // Determine risk level
    let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    if (score >= 80) {
      riskLevel = 'LOW';
    } else if (score >= 50) {
      riskLevel = 'MEDIUM';
    } else if (score >= 30) {
      riskLevel = 'HIGH';
    } else {
      riskLevel = 'CRITICAL';
    }

    return {
      legitimacyScore: score,
      riskLevel,
      legitimacyFactors: { positive, negative, neutral },
      apiLimitation,
    };
  }

  /**
   * Calculate how complete our data is (accounting for API limitations)
   */
  private calculateDataCompleteness(user: any): number {
    let completeness = 0;
    const maxPoints = 10;

    if (user.created_at) completeness++;
    if (user.description) completeness++;
    if (user.profile_image_url) completeness++;
    if (user.verified !== undefined) completeness++;
    if (user.public_metrics?.followers_count !== undefined) completeness++;
    if (user.public_metrics?.following_count !== undefined) completeness++;
    if (user.public_metrics?.tweet_count !== undefined) completeness++;
    if (user.public_metrics?.listed_count !== undefined) completeness++;
    if (user.url) completeness++;
    if (user.location) completeness++;

    return Math.round((completeness / maxPoints) * 100);
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
      console.warn('Could not fetch user posts:', error instanceof Error ? error.message : 'Unknown error');
      return [];
    }
  }
}

// Export lazy-initialized singleton instance
let _enhancedClientInstance: EnhancedXAPIClient | null = null;

export const enhancedXApiClient = new Proxy({} as EnhancedXAPIClient, {
  get(target, prop) {
    if (!_enhancedClientInstance) {
      const token = process.env.X_API_BEARER_TOKEN;
      if (!token) {
        throw new Error('X_API_BEARER_TOKEN environment variable is required');
      }
      _enhancedClientInstance = new EnhancedXAPIClient(token);
    }
    return (_enhancedClientInstance as any)[prop];
  },
});
