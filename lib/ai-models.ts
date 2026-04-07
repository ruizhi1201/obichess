/**
 * ObiChess AI Model Tiering
 * 
 * Free users  → GPT-5.4 Mini  ($0.75/$4.50 per 1M tokens, ~$0.014/session)
 * Pro users   → GPT-5.4       ($2.50/$15 per 1M tokens,   ~$0.050/session)
 * Family plan → GPT-5.4       (same as Pro)
 * 
 * Both models support reasoning — critical for quality chess analysis.
 */

export type SubscriptionTier = 'free' | 'pro' | 'family';

export interface ModelConfig {
  model: string;
  maxTokens: number;
  temperature: number;
  description: string;
}

const MODEL_TIERS: Record<SubscriptionTier, ModelConfig> = {
  free: {
    model: 'gpt-5.4-mini',
    maxTokens: 300,
    temperature: 0.5,
    description: 'GPT-5.4 Mini — reasoning-capable, great for free users',
  },
  pro: {
    model: 'gpt-5.4',
    maxTokens: 500,
    temperature: 0.4,
    description: 'GPT-5.4 — full reasoning model, premium analysis',
  },
  family: {
    model: 'gpt-5.4',
    maxTokens: 500,
    temperature: 0.4,
    description: 'GPT-5.4 — full reasoning model, premium analysis',
  },
};

/**
 * Get model config based on subscription tier.
 * Defaults to free tier if tier is unknown.
 */
export function getModelConfig(tier?: SubscriptionTier | string | null): ModelConfig {
  if (tier === 'pro' || tier === 'family') {
    return MODEL_TIERS[tier];
  }
  return MODEL_TIERS.free;
}

/**
 * Get model name only — convenience helper
 */
export function getModel(tier?: SubscriptionTier | string | null): string {
  return getModelConfig(tier).model;
}
