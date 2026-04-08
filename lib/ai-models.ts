/**
 * ObiChess AI Model Tiering
 * 
 * Free users  → GPT-4o Mini  (fast, cost-efficient)
 * Pro users   → GPT-4o       (full capability, premium analysis)
 * Family plan → GPT-4o       (same as Pro)
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
    model: 'gpt-4o-mini',
    maxTokens: 300,
    temperature: 0.5,
    description: 'GPT-4o Mini — fast, cost-efficient for free users',
  },
  pro: {
    model: 'gpt-4o',
    maxTokens: 500,
    temperature: 0.4,
    description: 'GPT-4o — full capability, premium analysis',
  },
  family: {
    model: 'gpt-4o',
    maxTokens: 500,
    temperature: 0.4,
    description: 'GPT-4o — full capability, premium analysis',
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
