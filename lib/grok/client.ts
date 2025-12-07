/**
 * Grok API Client
 * Handles all interactions with xAI's Grok models
 */

export type GrokModel =
  | 'grok-4-1-fast-reasoning'      // Latest reasoning model (use for all agents)
  | 'grok-2-vision-1212'           // Vision model for image analysis
  | 'grok-3-mini';                 // Fast, lightweight alternative

export interface GrokMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<{
    type: 'text' | 'image_url';
    text?: string;
    image_url?: { url: string };
  }>;
}

export interface GrokResponse {
  id: string;
  model: string;
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class GrokClient {
  private apiKey: string;
  private baseURL = 'https://api.x.ai/v1';

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.XAI_API_KEY || '';
    if (!this.apiKey) {
      throw new Error('Grok API key is required. Set XAI_API_KEY environment variable.');
    }
  }

  /**
   * Call Grok API with specified model and messages
   */
  async chat(
    model: GrokModel,
    messages: GrokMessage[],
    options?: {
      temperature?: number;
      maxTokens?: number;
      stream?: boolean;
    }
  ): Promise<GrokResponse> {
    const response = await fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: options?.temperature ?? 0,
        max_tokens: options?.maxTokens,
        stream: options?.stream ?? false,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Grok API error: ${response.status} - ${error}`);
    }

    return response.json();
  }

  /**
   * Reasoning call - use grok-4-1-fast-reasoning for multi-step thinking
   */
  async reason(prompt: string, systemPrompt?: string): Promise<string> {
    const messages: GrokMessage[] = systemPrompt
      ? [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ]
      : [{ role: 'user', content: prompt }];

    const response = await this.chat('grok-4-1-fast-reasoning', messages);
    return response.choices[0].message.content;
  }

  /**
   * Vision call - analyze images with grok-2-vision-1212
   */
  async analyzeImage(imageUrl: string, question: string): Promise<string> {
    const response = await this.chat('grok-2-vision-1212', [
      {
        role: 'user',
        content: [
          { type: 'text', text: question },
          { type: 'image_url', image_url: { url: imageUrl } },
        ],
      },
    ]);

    return response.choices[0].message.content;
  }

  /**
   * Fast classification - use grok-3-mini for simple tasks
   */
  async quickClassify(prompt: string): Promise<string> {
    const response = await this.chat('grok-3-mini', [
      { role: 'user', content: prompt },
    ]);

    return response.choices[0].message.content;
  }

  /**
   * Multi-turn conversation for agent debates
   */
  async conversation(
    messages: GrokMessage[],
    model: GrokModel = 'grok-4-1-fast-reasoning'
  ): Promise<{
    response: string;
    usage: GrokResponse['usage'];
  }> {
    const result = await this.chat(model, messages);
    return {
      response: result.choices[0].message.content,
      usage: result.usage,
    };
  }
}

// Export lazy-initialized singleton instance
let _grokInstance: GrokClient | null = null;

export const grok = new Proxy({} as GrokClient, {
  get(target, prop) {
    if (!_grokInstance) {
      _grokInstance = new GrokClient();
    }
    return (_grokInstance as any)[prop];
  },
});
