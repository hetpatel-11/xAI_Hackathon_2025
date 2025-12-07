import { grok } from '../grok/client';

const INSTANT_ANALYSIS_PROMPT = `You are GrokGuard, a CONSERVATIVE scam detection AI for X.com posts.

Analyze the post and respond with ONLY this JSON format (no extra text):

{
  "verdict": "scam" | "suspicious" | "clean",
  "confidence": 0-100,
  "reason": "brief 1-sentence explanation"
}

ONLY flag as SCAM if you see CLEAR evidence of:
- Crypto giveaway scams ("send X get Y back", fake airdrops)
- Phishing links asking for wallet/credentials
- Impersonation with malicious intent
- "Verify your account" scams

ONLY flag as SUSPICIOUS if:
- Unverified financial claims with urgency
- Suspicious shortened URLs with promises
- Too-good-to-be-true offers

Mark as CLEAN (default) for:
- Normal tweets, opinions, news, jokes
- Legitimate promotions from real brands
- Crypto discussions without scam tactics
- Any post without clear malicious intent

BE CONSERVATIVE - only flag OBVIOUS scams. When in doubt, mark CLEAN.
Most posts are legitimate. False positives hurt user experience.`;

export async function instantAnalyze(username: string, text: string): Promise<{
  classification: string;
  confidence: number;
  recommendedAction: string;
  reasoning: string;
} | null> {
  try {
    const userPrompt = `POST from @${username}: "${text}"

Analyze NOW and return ONLY JSON:`;

    console.log(`[InstantAnalyzer] Calling Grok API with grok-3-mini...`);
    
    // Use Grok's fastest model (grok-3-mini) with correct signature: chat(model, messages, options)
    const response = await grok.chat('grok-3-mini', [
      { role: 'system', content: INSTANT_ANALYSIS_PROMPT },
      { role: 'user', content: userPrompt }
    ], {
      temperature: 0.1,
      maxTokens: 100
    });

    console.log(`[InstantAnalyzer] Got Grok response:`, JSON.stringify(response).substring(0, 200));
    const content = response.choices[0].message.content;

    // Parse JSON response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      const msg = `Failed to parse Grok response: ${content}`;
      console.error(msg);
      throw new Error(msg);
    }

    const result = JSON.parse(jsonMatch[0]);

    // Map to our format
    return {
      classification: result.verdict === 'clean' ? 'legitimate' : result.verdict,
      confidence: result.confidence,
      recommendedAction: result.verdict === 'scam' ? 'quarantine'
                         : result.verdict === 'suspicious' ? 'flag'
                         : 'no_action',
      reasoning: result.reason
    };

  } catch (error) {
    console.error('Instant analysis error:', error);
    const err = error instanceof Error ? error : new Error(String(error));
    // Propagate with message to API so caller sees the Grok failure
    throw err;
  }
}
