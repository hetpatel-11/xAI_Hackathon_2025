/**
 * Core Type Definitions for GrokGuard
 */

export interface XContent {
  id: string;
  type: 'post' | 'profile' | 'dm';
  text?: string;
  authorId?: string;
  authorUsername?: string;
  authorBio?: string;
  authorProfileImage?: string;
  createdAt?: Date;
  metadata?: Record<string, any>;
}

export interface DetectionResult {
  id: string;
  contentId: string;
  contentType: XContent['type'];
  confidenceScore: number; // 0-100
  classification: 'scam' | 'impersonator' | 'bait' | 'legitimate' | 'uncertain';
  debateLog: AgentDebate;
  createdAt: Date;
  status: 'pending' | 'approved' | 'overridden' | 'false_positive';
}

export interface AgentDebate {
  detectorOutput: DetectorOutput;
  evidenceOutput: EvidenceOutput;
  prosecutorCase: string;
  defenderCase: string;
  arbiterDecision: ArbiterDecision;
  totalTokens: number;
  durationMs: number;
}

export interface DetectorOutput {
  suspicionScore: number; // 0-100
  signals: string[];
  shouldEscalate: boolean;
  reasoning: string;
}

export interface EvidenceOutput {
  profileAnalysis?: {
    isStockPhoto: boolean;
    isAIGenerated: boolean;
    confidence: number;
    explanation: string;
  };
  postHistory?: {
    totalPosts: number;
    scamPatterns: string[];
    legitimateSignals: string[];
  };
  networkMetrics?: {
    followersCount: number;
    followingCount: number;
    accountAge: string;
    verificationStatus: boolean;
  };
  contentAnalysis: {
    hasWalletAddresses: boolean;
    hasSuspiciousLinks: boolean;
    hasUrgencyLanguage: boolean;
    hasImpersonationSignals: boolean;
  };
}

export interface ArbiterDecision {
  finalScore: number; // 0-100
  classification: DetectionResult['classification'];
  explanation: string;
  evidence: string[];
  counterEvidence: string[];
  recommendedAction: 'quarantine' | 'flag' | 'boost_alternative' | 'no_action';
}

export interface LearningFeedback {
  detectionId: string;
  staffUserId: string;
  wasCorrect: boolean;
  actualClassification: string;
  notes: string;
  createdAt: Date;
}

export interface AgentAction {
  id: string;
  detectionId: string;
  actionType: 'quarantine' | 'boost' | 'suggest_alternative' | 'generate_reply';
  targetId?: string;
  result: Record<string, any>;
  createdAt: Date;
}

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
