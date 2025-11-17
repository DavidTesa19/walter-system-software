import React, { useState, useRef, useEffect } from 'react';
import './ChatbotView.css';
import MarkdownMessage from '../components/MarkdownMessage';

type AIProvider = 'openai' | 'claude';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
  model?: string;
  tokens?: {
    prompt: number;
    completion: number;
    total: number;
  };
}

interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
}

type OpenAIModel = 
  | 'gpt-5-2025-08-07'
  | 'gpt-5-mini-2025-08-07'
  | 'gpt-4o-mini' 
  | 'gpt-4o';

type ClaudeModel = 'claude-sonnet-4-5';

type AIModel = OpenAIModel | ClaudeModel;

const DEFAULT_OPENAI_MODEL: OpenAIModel = 'gpt-4o-mini';
const DEFAULT_CLAUDE_MODEL: ClaudeModel = 'claude-sonnet-4-5';

const OPENAI_MODELS: { id: OpenAIModel; label: string }[] = [
  { id: 'gpt-5-2025-08-07', label: 'GPT-5 (Nejlepší)' },
  { id: 'gpt-5-mini-2025-08-07', label: 'GPT-5 Mini (Rychlý)' },
  { id: 'gpt-4o', label: 'GPT-4o (Výkonný)' },
  { id: 'gpt-4o-mini', label: 'GPT-4o Mini (Ekonomický)' },
];

const CLAUDE_MODELS: { id: ClaudeModel; label: string }[] = [
  {
    id: 'claude-sonnet-4-5',
    label: 'Claude 4.5 Sonnet (Výkonný)',
  },
];

// Model-specific max token limits (as per API documentation)
const MODEL_MAX_TOKENS: Record<string, number> = {
  'claude-sonnet-4-5': 64000,
  'claude-3-5-sonnet-20241022': 8192,
  'claude-3-haiku-20240307': 4096,
  'gpt-5-2025-08-07': 16384,
  'gpt-5-mini-2025-08-07': 16384,
  'gpt-4o': 16384,
  'gpt-4o-mini': 16384,
};

const ChatbotView: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [showConversations, setShowConversations] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<AIProvider>('openai');
  const [selectedModel, setSelectedModel] = useState<AIModel>(DEFAULT_OPENAI_MODEL);
  const [activeServerModel, setActiveServerModel] = useState<string | null>(null);
  const [responseStyle, setResponseStyle] = useState<'concise' | 'detailed'>('concise');
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [useStreaming] = useState(true);
  const [useWebSearch, setUseWebSearch] = useState(true); // Default to enabled
  const [maxTokens, setMaxTokens] = useState<number>(8000);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const suggestedPrompts = [
    "Explain quantum computing in simple terms",
    "Write a Python function to sort an array",
    "What are the best practices for React development?",
    "Help me debug this error message",
  ];

  // Get max tokens limit for current model
  const getCurrentModelMaxTokens = (): number => {
    return MODEL_MAX_TOKENS[selectedModel] || 8000;
  };

  // Update maxTokens when model changes to ensure it doesn't exceed limit
  useEffect(() => {
    const modelMax = getCurrentModelMaxTokens();
    if (maxTokens > modelMax) {
      setMaxTokens(modelMax);
    }
  }, [selectedModel]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Load conversations on mount
  useEffect(() => {
    loadConversations();
  }, []);

  // Auto-save current conversation
  useEffect(() => {
    if (messages.length > 0 && !currentConversationId) {
      saveConversation();
    } else if (messages.length > 0 && currentConversationId) {
      updateConversation(currentConversationId);
    }
  }, [messages]);

  const loadConversations = async () => {
    try {
      const response = await fetch('http://localhost:3004/api/conversations');
      if (response.ok) {
        const data = await response.json();
        setConversations(data);
      }
    } catch (error) {
      console.error('Failed to load conversations:', error);
    }
  };

  const saveConversation = async () => {
    if (messages.length === 0) return;

    const title = messages[0]?.content.slice(0, 50) || 'New Conversation';
    try {
      const response = await fetch('http://localhost:3004/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, messages }),
      });
      if (response.ok) {
        const conversation = await response.json();
        setCurrentConversationId(conversation.id);
        setConversations((prev) => [conversation, ...prev]);
      }
    } catch (error) {
      console.error('Failed to save conversation:', error);
    }
  };

  const updateConversation = async (id: string) => {
    try {
      await fetch(`http://localhost:3004/api/conversations/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages }),
      });
    } catch (error) {
      console.error('Failed to update conversation:', error);
    }
  };

  const loadConversation = async (id: string) => {
    try {
      const response = await fetch(`http://localhost:3004/api/conversations/${id}`);
      if (response.ok) {
        const conversation = await response.json();
        setMessages(conversation.messages.map((msg: any) => ({
          ...msg,
          timestamp: new Date(msg.timestamp),
        })));
        setCurrentConversationId(id);
        setShowConversations(false);
      }
    } catch (error) {
      console.error('Failed to load conversation:', error);
    }
  };

  const deleteConversation = async (id: string) => {
    try {
      const response = await fetch(`http://localhost:3004/api/conversations/${id}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        setConversations((prev) => prev.filter((c) => c.id !== id));
        if (currentConversationId === id) {
          setMessages([]);
          setCurrentConversationId(null);
        }
      }
    } catch (error) {
      console.error('Failed to delete conversation:', error);
    }
  };

  const startNewConversation = () => {
    setMessages([]);
    setCurrentConversationId(null);
    setShowConversations(false);
  };

  const handleSendMessageStreaming = async () => {
    if (!inputValue.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputValue.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    // Create a placeholder message for streaming
    const assistantMessageId = (Date.now() + 1).toString();
    const assistantMessage: Message = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isStreaming: true,
    };

    setMessages((prev) => [...prev, assistantMessage]);

    try {
      const response = await fetch('http://localhost:3004/api/chat/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [
            ...messages.map((msg) => ({
              role: msg.role,
              content: msg.content,
            })),
            {
              role: 'user',
              content: userMessage.content,
            },
          ],
          provider: selectedProvider,
          model: selectedModel,
          responseStyle: responseStyle,
          useWebSearch: useWebSearch,
          maxTokens: maxTokens,
        }),
      });

      if (!response.ok) {
        throw new Error('Stream request failed');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No reader available');
      }

      let buffer = '';
      let fullContent = '';
      let usage: { prompt: number; completion: number; total: number } | undefined = undefined;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(6));

            if (data.type === 'content') {
              fullContent += data.content;
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantMessageId
                    ? { ...msg, content: fullContent }
                    : msg
                )
              );
            } else if (data.type === 'done') {
              setActiveServerModel(data.model);
              usage = data.usage;
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantMessageId
                    ? { ...msg, isStreaming: false, tokens: usage }
                    : msg
                )
              );
            } else if (data.type === 'error') {
              throw new Error(data.error);
            }
          }
        }
      }

      if (fullContent.trim().length === 0) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId
              ? { ...msg, content: 'The model returned an empty response.', isStreaming: false }
              : msg
          )
        );
      }

    } catch (error) {
      console.error('Streaming error:', error);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMessageId
            ? {
                ...msg,
                content: `Error: ${error instanceof Error ? error.message : 'Failed to stream response'}`,
                isStreaming: false,
              }
            : msg
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendMessage = async () => {
    if (useStreaming && selectedProvider === 'openai') {
      return handleSendMessageStreaming();
    }

    // Non-streaming fallback
    if (!inputValue.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputValue.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    try {
      // Call the backend API
      const response = await fetch('http://localhost:3004/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [
            ...messages.map((msg) => ({
              role: msg.role,
              content: msg.content,
            })),
            {
              role: 'user',
              content: userMessage.content,
            },
          ],
          provider: selectedProvider,
          model: selectedModel,
          responseStyle: responseStyle,
          useWebSearch: useWebSearch,
          maxTokens: maxTokens,
        }),
      });

      if (!response.ok) {
        let serverError = 'Failed to get response from AI';
        try {
          const errJson = await response.json();
          serverError = errJson.details || errJson.message || errJson.error || serverError;
        } catch (_) {
          try {
            const errText = await response.text();
            if (errText) serverError = errText;
          } catch {}
        }
        throw new Error(serverError);
      }

      const data = await response.json();
      if (data?.model) {
        setActiveServerModel(data.model);
      }
      
      // Ensure message content is a string and not empty
      let messageContent = data.message;
      if (typeof messageContent !== 'string') {
        messageContent = JSON.stringify(messageContent);
      }
      
      // Check for empty responses
      if (!messageContent || messageContent.trim().length === 0) {
        messageContent = "The model returned an empty response. This can happen with complex requests. Please try again or simplify your question.";
      }
      
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: messageContent,
        timestamp: new Date(),
        tokens: data.usage ? {
          prompt: data.usage.prompt_tokens || 0,
          completion: data.usage.completion_tokens || 0,
          total: data.usage.total_tokens || 0,
        } : undefined,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Error sending message:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `Sorry, there was an error processing your request. ${error instanceof Error ? error.message : ''}`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleClearChat = () => {
    if (window.confirm('Opravdu chcete smazat celou konverzaci?')) {
      setMessages([]);
    }
  };

  const handleCopyMessage = async (content: string, messageId: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedMessageId(messageId);
      setTimeout(() => setCopiedMessageId(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleRegenerateMessage = async (messageIndex: number) => {
    // Remove the assistant message and retry with the previous user message
    const userMessage = messages[messageIndex - 1];
    if (!userMessage || userMessage.role !== 'user') return;
    
    // Remove messages from this point forward
    setMessages((prev) => prev.slice(0, messageIndex));
    
    // Resend the user message
    setIsLoading(true);
    try {
      const response = await fetch('http://localhost:3004/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: messages.slice(0, messageIndex - 1).map((msg) => ({
            role: msg.role,
            content: msg.content,
          })).concat([{
            role: 'user',
            content: userMessage.content,
          }]),
          model: selectedModel,
          responseStyle: responseStyle,
          useWebSearch: useWebSearch,
          maxTokens: maxTokens,
        }),
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const data = await response.json();
      let messageContent = data.message;
      if (typeof messageContent !== 'string') {
        messageContent = JSON.stringify(messageContent);
      }
      
      if (!messageContent || messageContent.trim().length === 0) {
        messageContent = "The model returned an empty response. Please try again.";
      }
      
      const assistantMessage: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: messageContent,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Error regenerating:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSuggestedPrompt = (prompt: string) => {
    setInputValue(prompt);
  };

  return (
    <div className="chatbot-view">
      {showConversations && (
        <div className="conversations-sidebar">
          <div className="conversations-header">
            <h2>Konverzace</h2>
            <button className="close-sidebar-button" onClick={() => setShowConversations(false)}>
              ✕
            </button>
          </div>
          <button className="new-conversation-button" onClick={startNewConversation}>
            + Nová konverzace
          </button>
          <div className="conversations-list">
            {conversations.map((conv) => (
              <div
                key={conv.id}
                className={`conversation-item ${currentConversationId === conv.id ? 'active' : ''}`}
                onClick={() => loadConversation(conv.id)}
              >
                <div className="conversation-title">{conv.title}</div>
                <div className="conversation-date">
                  {new Date(conv.updatedAt).toLocaleDateString('cs-CZ')}
                </div>
                <button
                  className="delete-conversation-button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm('Smazat tuto konverzaci?')) {
                      deleteConversation(conv.id);
                    }
                  }}
                >
                  🗑️
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="chatbot-header">
        <div className="chatbot-header-left">
          <button className="history-button" onClick={() => setShowConversations(!showConversations)} title="Historie">
            📚
          </button>
          <div>
            <h1>AI Chatbot</h1>
            <span className="chatbot-subtitle">Asistent pro vaše dotazy</span>
          </div>
        </div>
        <div className="chatbot-header-right">
          <select
            className="model-selector"
            value={selectedProvider}
            onChange={(e) => {
              const provider = e.target.value as AIProvider;
              setSelectedProvider(provider);
              if (provider === 'openai') {
                setSelectedModel(DEFAULT_OPENAI_MODEL);
              } else {
                setSelectedModel(DEFAULT_CLAUDE_MODEL);
              }
            }}
            title="Poskytovatel AI"
          >
            <option value="openai">OpenAI</option>
            <option value="claude">Claude</option>
          </select>
          <select
            className="model-selector"
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value as AIModel)}
            title="Model"
          >
            {selectedProvider === 'openai' && (
              <>
                {OPENAI_MODELS.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.label}
                  </option>
                ))}
              </>
            )}
            {selectedProvider === 'claude' && (
              <>
                {CLAUDE_MODELS.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.label}
                  </option>
                ))}
              </>
            )}
          </select>
          <select
            className="model-selector"
            value={responseStyle}
            onChange={(e) => setResponseStyle(e.target.value as 'concise' | 'detailed')}
            title="Styl odpovědí"
          >
            <option value="concise">📝 Stručné</option>
            <option value="detailed">📚 Podrobné</option>
          </select>
          <label className="web-search-toggle" title="Povolit vyhledávání na webu">
            <input
              type="checkbox"
              checked={useWebSearch}
              onChange={(e) => setUseWebSearch(e.target.checked)}
            />
            <span>🌐 Web Search</span>
          </label>
          <div className="token-limit-control" title="Maximální počet tokenů v odpovědi">
            <label htmlFor="max-tokens-slider">
              📏 Max Tokens: <strong>{maxTokens.toLocaleString()}</strong>
            </label>
            <input
              id="max-tokens-slider"
              type="range"
              min="1000"
              max={getCurrentModelMaxTokens()}
              step="500"
              value={maxTokens}
              onChange={(e) => setMaxTokens(Number(e.target.value))}
              className="token-slider"
            />
            <div className="token-limits">
              <span>1k</span>
              <span>{(getCurrentModelMaxTokens() / 1000).toFixed(0)}k</span>
            </div>
          </div>
          {messages.length > 0 && (
            <button className="clear-button" onClick={handleClearChat}>
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
              Smazat
            </button>
          )}
        </div>
      </div>

      <div className="chatbot-messages">
        {messages.length === 0 ? (
          <div className="chatbot-empty-state">
            <svg
              width="64"
              height="64"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
            <h2>Začněte konverzaci</h2>
            <p>Zeptejte se na cokoliv, co vás zajímá</p>
            
            <div className="suggested-prompts">
              <h3>Návrhy dotazů:</h3>
              <div className="prompt-buttons">
                {suggestedPrompts.map((prompt, index) => (
                  <button
                    key={index}
                    className="prompt-button"
                    onClick={() => handleSuggestedPrompt(prompt)}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <>
            {messages.map((message, index) => (
              <div
                key={message.id}
                className={`message ${message.role === 'user' ? 'message-user' : 'message-assistant'}`}
              >
                <div className="message-avatar">
                  {message.role === 'user' ? (
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                      <circle cx="12" cy="7" r="4"></circle>
                    </svg>
                  ) : (
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M12 8V4H8"></path>
                      <rect x="4" y="4" width="16" height="16" rx="2"></rect>
                      <path d="M4 12h16"></path>
                      <path d="M12 4v16"></path>
                    </svg>
                  )}
                </div>
                <div className="message-content">
                  <div className="message-text">
                    {message.role === 'assistant' ? (
                      <MarkdownMessage content={message.content} />
                    ) : (
                      message.content
                    )}
                  </div>
                  <div className="message-footer">
                    <span className="message-timestamp">
                      {message.timestamp.toLocaleTimeString('cs-CZ', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                      {message.tokens && (
                        <span className="token-count" title={`Prompt: ${message.tokens.prompt} | Completion: ${message.tokens.completion}`}>
                          {' '}• {message.tokens.total} tokens
                        </span>
                      )}
                    </span>
                    <div className="message-actions">
                      <button
                        className="action-button"
                        onClick={() => handleCopyMessage(message.content, message.id)}
                        title="Kopírovat"
                      >
                        {copiedMessageId === message.id ? '✓' : '📋'}
                      </button>
                      {message.role === 'assistant' && index === messages.length - 1 && (
                        <button
                          className="action-button"
                          onClick={() => handleRegenerateMessage(index)}
                          title="Regenerovat"
                          disabled={isLoading}
                        >
                          🔄
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="message message-assistant">
                <div className="message-avatar">
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 8V4H8"></path>
                    <rect x="4" y="4" width="16" height="16" rx="2"></rect>
                    <path d="M4 12h16"></path>
                    <path d="M12 4v16"></path>
                  </svg>
                </div>
                <div className="message-content">
                  <div className="typing-indicator">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      <div className="chatbot-input-container">
        <div className="chatbot-input-wrapper">
          <textarea
            className="chatbot-input"
            placeholder="Napište zprávu... (Enter pro odeslání, Shift+Enter pro nový řádek)"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            rows={1}
            disabled={isLoading}
          />
          <button
            className="chatbot-send-button"
            onClick={handleSendMessage}
            disabled={!inputValue.trim() || isLoading}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="22" y1="2" x2="11" y2="13"></line>
              <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
            </svg>
          </button>
        </div>
        <div className="chatbot-input-info">
          Model: <strong>{activeServerModel ?? selectedModel}</strong> • Shift+Enter pro nový řádek
        </div>
      </div>
    </div>
  );
};

export default ChatbotView;
