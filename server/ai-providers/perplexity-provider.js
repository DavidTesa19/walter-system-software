import OpenAI from 'openai';
import { BaseAIProvider } from './base-provider.js';

/**
 * Perplexity AI Provider
 * Search-optimized AI with built-in web search and citations
 * Uses OpenAI-compatible API format
 */
export class PerplexityProvider extends BaseAIProvider {
  constructor(apiKey, options = {}) {
    super(apiKey, options);
    this.client = new OpenAI({
      apiKey: this.apiKey,
      baseURL: 'https://api.perplexity.ai'
    });
  }

  getProviderName() {
    return 'Perplexity';
  }

  getSupportedModels() {
    return [
      {
        id: 'sonar-pro',
        name: 'Sonar Pro',
        description: 'Most capable Perplexity model with real-time web search & citations'
      },
      {
        id: 'sonar-reasoning',
        name: 'Sonar Reasoning',
        description: 'Advanced reasoning engine that always cites its sources'
      }
    ];
  }

  async chatCompletion({ messages, model, options = {} }) {
    const params = {
      model,
      messages: this.formatMessages(messages),
      temperature: options.temperature ?? 0.2, // Lower temp for factual accuracy
      max_tokens: options.maxTokens ?? 2000,
      // Perplexity automatically includes web search
      ...options
    };

    const completion = await this.client.chat.completions.create(params);

    return {
      content: completion.choices[0]?.message?.content || '',
      usage: this.parseUsage(completion),
      model: completion.model,
      finishReason: completion.choices[0]?.finish_reason,
      citations: completion.citations || [] // Perplexity provides citations
    };
  }

  async *streamChatCompletion({ messages, model, options = {} }) {
    const params = {
      model,
      messages: this.formatMessages(messages),
      temperature: options.temperature ?? 0.2,
      max_tokens: options.maxTokens ?? 2000,
      stream: true,
      ...options
    };

    const stream = await this.client.chat.completions.create(params);

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      
      if (delta?.content) {
        yield {
          type: 'content',
          content: delta.content
        };
      }

      // Perplexity may include citations in stream
      if (chunk.citations) {
        yield {
          type: 'citations',
          citations: chunk.citations
        };
      }

      if (chunk.choices[0]?.finish_reason) {
        yield {
          type: 'done',
          finishReason: chunk.choices[0].finish_reason,
          usage: chunk.usage
        };
      }
    }
  }

  formatMessages(messages) {
    // Perplexity uses OpenAI-compatible format
    return messages;
  }
}
