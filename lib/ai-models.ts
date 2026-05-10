/**
 * ObiChess AI Model Tiering
 * 
 * All tiers use deepseek-v4-flash (DeepSeek V4 Flash) — fast, capable, cheap.
 * Pricing is negligible (~$0.27/$1.10 per MTok).
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
    model: 'deepseek-v4-pro',
    maxTokens: 500,
    temperature: 0.5,
    description: 'DeepSeek V4 Pro — powerful reasoning',
  },
  pro: {
    model: 'deepseek-v4-pro',
    maxTokens: 800,
    temperature: 0.4,
    description: 'DeepSeek V4 Pro — full capability',
  },
  family: {
    model: 'deepseek-v4-pro',
    maxTokens: 800,
    temperature: 0.4,
    description: 'DeepSeek V4 Pro — full capability',
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
