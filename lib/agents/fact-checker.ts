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

CRITICAL RULES FOR CREDIBLE SOURCES:
- If the source is a verified account, major news organization (Forbes, BBC, CNN, Reuters, NYT, etc.), or established institution, you MUST be EXTREMELY CONSERVATIVE
- For credible sources: Only flag as "false" if you have 95%+ confidence with MULTIPLE independent, authoritative sources that directly contradict the claim
- If you find conflicting information but the source is credible, prefer "unverifiable" or "mostly_true" over "false"
- Credible sources have editorial standards and fact-checking - they rarely publish completely false information
- When uncertain with credible sources, default to "unverifiable" rather than "false"

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
- Source reliability and credibility
- For credible sources: Require 95%+ confidence with multiple authoritative sources before flagging as false
- When in doubt, especially with credible sources, mark as "unverifiable" rather than "false"`;

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
 * Check if username is from a credible source
 */
function isCredibleSource(username: string): boolean {
  const credibleSources = [
    'forbes', 'bbc', 'cnn', 'reuters', 'ap', 'associatedpress', 'nytimes', 'washingtonpost',
    'wsj', 'bloomberg', 'theguardian', 'economist', 'ft', 'financialtimes', 'time',
    'newsweek', 'usatoday', 'abc', 'nbc', 'cbs', 'pbs', 'npr', 'axios', 'politico',
    'thehill', 'cnbc', 'marketwatch', 'techcrunch', 'wired', 'verge', 'ars',
    'scientificamerican', 'nature', 'science', 'nejm', 'lancet', 'who', 'cdc',
    'nasa', 'nsa', 'fbi', 'cia', 'whitehouse', 'state', 'defense', 'treasury',
    'sec', 'fda', 'nih', 'nsf', 'doe', 'epa', 'usda', 'ed', 'hhs', 'dhs',
    'elonmusk', 'xdevelopers', 'openai', 'anthropic', 'google', 'microsoft',
    'apple', 'meta', 'amazon', 'netflix', 'disney', 'tesla', 'spacex'
  ];
  
  const usernameLower = username.toLowerCase().replace('@', '');
  return credibleSources.some(source => usernameLower.includes(source) || source.includes(usernameLower));
}

/**
 * Fact-check a claim using Grok's knowledge and reasoning
 */
export async function factCheckClaim(
  claim: string,
  searchQueries: string[],
  originalPost: string,
  username?: string
): Promise<{
  verdict: string;
  confidence: number;
  explanation: string;
  sources: string[];
  context: string;
  communityNote: string;
}> {
  try {
    const isCredible = username ? isCredibleSource(username) : false;
    const credibilityNote = isCredible 
      ? `\n\n⚠️ CREDIBILITY WARNING: This post is from @${username}, a verified/credible source. Be EXTREMELY conservative - only flag as false if you have 95%+ confidence with multiple independent sources contradicting the claim. When uncertain, mark as "unverifiable" rather than "false".`
      : '';

    // Use Grok's reasoning model for fact-checking (it has web knowledge)
    const prompt = `CLAIM TO VERIFY:
"${claim}"

ORIGINAL POST:
"${originalPost}"

SOURCE: @${username || 'unknown'}${isCredible ? ' (VERIFIED/CREDIBLE SOURCE)' : ''}

SEARCH QUERIES TO CONSIDER:
${searchQueries.join('\n')}
${credibilityNote}

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
  // Skip fact-checking for credible sources unless explicitly requested
  // This prevents false positives on established news organizations
  const isCredible = isCredibleSource(username);
  
  if (isCredible) {
    console.log(`⚠️ Skipping fact-check for credible source: @${username}`);
    // Still detect claims but don't fact-check them aggressively
    // Only fact-check if there are obvious red flags
    const detection = await detectClaims(username, text);
    
    if (!detection.hasClaim || detection.claims.length === 0) {
      return {
        hasClaim: false,
        claimType: 'none',
        claims: []
      };
    }
    
    // For credible sources, only fact-check if claim seems extremely suspicious
    // Otherwise, mark as unverifiable to avoid false positives
    const mainClaim = detection.claims[0];
    const factCheck = await factCheckClaim(mainClaim, detection.searchQueries, text, username);
    
    // If verdict is false/mostly_false but confidence is low (< 90%), mark as unverifiable
    if ((factCheck.verdict === 'false' || factCheck.verdict === 'mostly_false') && factCheck.confidence < 90) {
      return {
        hasClaim: true,
        claimType: detection.claimType,
        claims: detection.claims,
        verdict: 'unverifiable',
        confidence: 50,
        explanation: `Post from verified source @${username}. Unable to verify claim with high confidence.`,
        sources: [],
        context: 'Credible source - requires additional verification',
        communityNote: factCheck.communityNote || ''
      };
    }
    
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
  
  // Step 1: Detect if there are claims to verify (for non-credible sources)
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
  const factCheck = await factCheckClaim(mainClaim, detection.searchQueries, text, username);

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

