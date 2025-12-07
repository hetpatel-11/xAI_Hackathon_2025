/**
 * Misinformation Detection & Fact-Checking Agent
 * Uses Grok to identify claims and search for verification
 */

import { grok } from '../grok/client';

const CLAIM_DETECTION_PROMPT = `You are a misinformation detection AI. Analyze posts for factual claims that can be verified.

Respond with ONLY JSON:
{
  "hasClaim": true/false,
  "claimType": "statistic" | "news" | "scientific" | "political" | "none",
  "claims": ["list of specific factual claims made"],
  "searchQueries": ["optimized search queries to verify these claims"]
}

ONLY flag posts with VERIFIABLE factual claims like:
- Statistics or numbers ("X% of people...")
- News events ("X happened yesterday...")
- Scientific claims ("Studies show...")
- Political statements ("X voted for...")

DO NOT flag:
- Opinions or jokes
- Personal experiences
- Clearly labeled satire
- Vague statements`;

const FACT_CHECK_PROMPT = `You are a fact-checking AI with web search capabilities. Given a claim and search context, determine its accuracy.

Respond with ONLY JSON:
{
  "verdict": "true" | "mostly_true" | "mixed" | "mostly_false" | "false" | "unverifiable",
  "confidence": 0-100,
  "explanation": "Brief explanation of the verdict",
  "sources": ["List of source descriptions"],
  "context": "Additional context that helps understand this claim",
  "communityNote": "A helpful community note explaining the full picture"
}

Be fair and balanced. Consider:
- Multiple perspectives
- Partial truths
- Missing context
- Source reliability`;

export interface FactCheckResult {
  hasClaim: boolean;
  claimType: string;
  claims: string[];
  verdict?: string;
  confidence?: number;
  explanation?: string;
  sources?: string[];
  context?: string;
  communityNote?: string;
}

/**
 * Detect if a post contains verifiable claims
 */
export async function detectClaims(username: string, text: string): Promise<{
  hasClaim: boolean;
  claimType: string;
  claims: string[];
  searchQueries: string[];
}> {
  try {
    const prompt = `POST from @${username}:
"${text}"

Analyze for factual claims:`;

    const response = await grok.chat('grok-3-mini', [
      { role: 'system', content: CLAIM_DETECTION_PROMPT },
      { role: 'user', content: prompt }
    ], {
      temperature: 0.1,
      maxTokens: 200
    });

    const content = response.choices[0].message.content;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    
    if (!jsonMatch) {
      return { hasClaim: false, claimType: 'none', claims: [], searchQueries: [] };
    }

    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    console.error('Claim detection error:', error);
    return { hasClaim: false, claimType: 'none', claims: [], searchQueries: [] };
  }
}

/**
 * Fact-check a claim using Grok's knowledge and reasoning
 */
export async function factCheckClaim(
  claim: string,
  searchQueries: string[],
  originalPost: string
): Promise<{
  verdict: string;
  confidence: number;
  explanation: string;
  sources: string[];
  context: string;
  communityNote: string;
}> {
  try {
    // Use Grok's reasoning model for fact-checking (it has web knowledge)
    const prompt = `CLAIM TO VERIFY:
"${claim}"

ORIGINAL POST:
"${originalPost}"

SEARCH QUERIES TO CONSIDER:
${searchQueries.join('\n')}

Using your knowledge and reasoning, fact-check this claim. Provide sources and context.`;

    const response = await grok.chat('grok-4-1-fast-reasoning', [
      { role: 'system', content: FACT_CHECK_PROMPT },
      { role: 'user', content: prompt }
    ], {
      temperature: 0.2,
      maxTokens: 500
    });

    const content = response.choices[0].message.content;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    
    if (!jsonMatch) {
      return {
        verdict: 'unverifiable',
        confidence: 0,
        explanation: 'Could not verify this claim',
        sources: [],
        context: '',
        communityNote: ''
      };
    }

    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    console.error('Fact-check error:', error);
    return {
      verdict: 'unverifiable',
      confidence: 0,
      explanation: 'Error during fact-checking',
      sources: [],
      context: '',
      communityNote: ''
    };
  }
}

/**
 * Full fact-check pipeline: detect claims and verify them
 */
export async function fullFactCheck(username: string, text: string): Promise<FactCheckResult> {
  // Step 1: Detect if there are claims to verify
  const detection = await detectClaims(username, text);
  
  if (!detection.hasClaim || detection.claims.length === 0) {
    return {
      hasClaim: false,
      claimType: 'none',
      claims: []
    };
  }

  // Step 2: Fact-check the main claim
  const mainClaim = detection.claims[0];
  const factCheck = await factCheckClaim(mainClaim, detection.searchQueries, text);

  return {
    hasClaim: true,
    claimType: detection.claimType,
    claims: detection.claims,
    verdict: factCheck.verdict,
    confidence: factCheck.confidence,
    explanation: factCheck.explanation,
    sources: factCheck.sources,
    context: factCheck.context,
    communityNote: factCheck.communityNote
  };
}

