// @ts-nocheck — baseline: schema/dep mismatches tracked in GH issue
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { createXai } from '@ai-sdk/xai';

export function buildModel(modelId: string) {
  // xAI / Grok
  if (modelId.startsWith('grok-')) {
    const xai = createXai({ apiKey: process.env.XAI_API_KEY });
    return xai(modelId);
  }
  // Gemini
  if (modelId.startsWith('gemini-')) {
    const google = createGoogleGenerativeAI({
      apiKey: process.env.GEMINI_API_KEY,
    });
    return google(modelId);
  }
  // OpenRouter (model format: "openrouter/meta-llama/llama-3.1-8b-instruct")
  if (modelId.startsWith('openrouter/')) {
    const openrouter = createOpenAI({
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: 'https://openrouter.ai/api/v1',
    });
    return openrouter(modelId.replace('openrouter/', ''));
  }
  // Default: Anthropic
  const anthropic = createAnthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });
  return anthropic(modelId);
}
