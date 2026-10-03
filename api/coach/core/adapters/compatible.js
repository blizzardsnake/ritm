/* Any OpenAI-compatible endpoint: Ollama, LM Studio, vLLM, OpenRouter, a gateway of your own.
 * Same wire shape as openai.js; the base URL comes from configuration and the key is optional.
 * `max_tokens` rather than `max_completion_tokens` because that is the field every one of
 * those servers understands. */
import { httpAdapter } from './http.js';
import { chatCompletionsSpec } from './openai.js';
import { baseUrlFor, isOpenRouterFreeModel, OPENROUTER_FREE_SETTINGS } from '../providers.js';

// temperature 0: a plan diff wants determinism, and greedy decoding is also what grammar-
// constrained sampling on a local server handles fastest.
const plain = chatCompletionsSpec('compatible', { maxTokensField: 'max_tokens', temperature: 0 });
const freeOnly = cfg => cfg?.providerOptions?.compatible?.freeOnly === true;
const zero = value => (typeof value === 'number' || typeof value === 'string' && value.trim() !== '') && Number.isFinite(Number(value)) && Number(value) === 0;
export const compatibleSpec = {
  ...plain,
  validateConfig: ({ cfg, key, model }) => {
    if (!freeOnly(cfg)) return null;
    if (baseUrlFor('compatible', cfg) !== OPENROUTER_FREE_SETTINGS.baseUrl) return 'Free-only mode requires the fixed OpenRouter endpoint';
    if (!key) return 'no API key configured for OpenRouter';
    if (model != null && !isOpenRouterFreeModel(model)) return 'Free-only mode refuses paid models';
    return null;
  },
  body: opts => ({ ...plain.body(opts), ...(freeOnly(opts.cfg) ? {
    provider: { data_collection: 'deny', max_price: { prompt: 0, completion: 0, request: 0, image: 0 } },
  } : {}) }),
  readModels: (data, { cfg } = {}) => !freeOnly(cfg) ? plain.readModels(data)
    : (data.data || []).filter(model => isOpenRouterFreeModel(model.id) && zero(model.pricing?.prompt) && zero(model.pricing?.completion)
      && Object.values(model.pricing).every(zero)).map(model => model.id),
};
export default httpAdapter(compatibleSpec);
