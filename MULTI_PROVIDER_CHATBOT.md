# Multi-Provider Chatbot Usage

The Walter System chatbot now supports **OpenAI** and **Claude (Anthropic)** side by side.

## Selecting a provider and model

In the `AI Chatbot` view header on the right:

- The first dropdown selects the **provider**:
  - `OpenAI` – uses your configured OpenAI models and supports streaming + web search tools.
  - `Claude` – uses Anthropic's Claude models via `ANTHROPIC_API_KEY`.
- The second dropdown selects the **model**:
  - For OpenAI: GPT-5 / GPT-4o variants as before.
  - For Claude: `Claude 4.5 Sonnet` (primary Anthropic option).

## Streaming vs non-streaming

- **OpenAI** requests use the streaming endpoint (`/api/chat/stream`) so you see tokens as they arrive.
- **Claude** requests use the non-streaming endpoint (`/api/chat`) because the current streaming implementation is OpenAI-only.

This behavior is automatic: when the provider is `Claude`, the UI skips streaming and calls `/api/chat` directly.

## Web search behavior

- OpenAI models can call the Brave-based web search tool via function calling; this is enabled when `Web Search` is toggled on.
- Claude currently receives strong system instructions about using up-to-date information, but does not yet call the Brave tool directly.

## Configuration

Backend expects:

- `OPENAI_API_KEY` for OpenAI models.
- `ANTHROPIC_API_KEY` for Claude models.
- `BRAVE_SEARCH_API_KEY` for web search.

If a provider is selected without a configured key, the API returns a clear 500 error message indicating which key is missing.
