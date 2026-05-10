import OpenAI from 'openai';
import { COACH_SYSTEM_PROMPT } from './coach-prompt';

// Use DeepSeek V4 Pro API directly
// Model: deepseek-v4-pro (powerful reasoning, 128K context)
export const openai = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: process.env.DEEPSEEK_BASEURL || 'https://api.deepseek.com',
});

// Model selection based on configuration
export const getModel = () => {
  return process.env.DEEPSEEK_MODEL || 'deepseek-v4-pro';
};
