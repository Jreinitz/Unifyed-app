'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { ChatMessage as ChatMessageType, ChatState, ChatPlatform } from '@unifyed/types';
import { ChatMessage } from './ChatMessage';

interface ChatPanelProps {
  messages: ChatMessageType[];
  chatState: ChatState | null;
  onSendMessage?: (content: string, platforms?: ChatPlatform[]) => void;
  onPinProduct?: (message: ChatMessageType) => void;
}

export function ChatPanel({ messages, chatState, onSendMessage, onPinProduct }: ChatPanelProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [messageInput, setMessageInput] = useState('');
  const [filterPlatform, setFilterPlatform] = useState<ChatPlatform | 'all'>('all');
  const [autoScroll, setAutoScroll] = useState(true);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (autoScroll) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, autoScroll]);

  // Detect manual scroll to disable auto-scroll
  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 100;
    setAutoScroll(isAtBottom);
  }, []);

  // Filter messages by platform
  const filteredMessages = filterPlatform === 'all'
    ? messages
    : messages.filter((m) => m.platform === filterPlatform);

  // Handle send message
  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageInput.trim() || !onSendMessage) return;
    onSendMessage(messageInput.trim());
    setMessageInput('');
  };

  // Get viewer counts by platform
  const viewersByPlatform = chatState?.connections.reduce((acc, conn) => {
    if (conn.connected && conn.viewerCount) {
      acc[conn.platform] = (acc[conn.platform] || 0) + conn.viewerCount;
    }
    return acc;
  }, {} as Record<string, number>) || {};

  const totalViewers = Object.values(viewersByPlatform).reduce((a, b) => a + b, 0);

  return (
    <div className="flex flex-col h-full bg-gray-900 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="font-semibold text-white">Live Chat</h3>
          {chatState?.isLive && (
            <span className="flex items-center gap-1.5 text-sm">
              <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              <span className="text-gray-400">{totalViewers.toLocaleString()} viewers</span>
            </span>
          )}
        </div>

        {/* Platform filter */}
        <select
          value={filterPlatform}
          onChange={(e) => setFilterPlatform(e.target.value as ChatPlatform | 'all')}
          className="bg-gray-800 text-gray-300 text-sm rounded px-2 py-1 border border-gray-700"
        >
          <option value="all">All platforms</option>
          <option value="tiktok">TikTok</option>
          <option value="youtube">YouTube</option>
          <option value="twitch">Twitch</option>
        </select>
      </div>

      {/* Platform status bar */}
      {chatState && chatState.connections.length > 0 && (
        <div className="px-4 py-2 border-b border-gray-800 flex items-center gap-4 flex-wrap">
          {chatState.connections.map((conn) => (
            <div
              key={conn.platform}
              className={`flex items-center gap-1.5 text-xs ${
                conn.connected ? 'text-green-400' : 'text-gray-500'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  conn.connected ? 'bg-green-500' : 'bg-gray-600'
                }`}
              />
              <span className="capitalize">{conn.platform}</span>
              {conn.connected && conn.viewerCount !== undefined && (
                <span className="text-gray-400">({conn.viewerCount})</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Messages */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto overflow-x-hidden"
      >
        {filteredMessages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500 text-sm">
            {chatState?.isLive
              ? 'Waiting for messages...'
              : 'Chat will appear when you go live'}
          </div>
        ) : (
          <div className="py-2">
            {filteredMessages.map((message) => (
              <ChatMessage
                key={message.id}
                message={message}
                onPin={onPinProduct}
              />
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Auto-scroll indicator */}
      {!autoScroll && messages.length > 0 && (
        <button
          onClick={() => {
            setAutoScroll(true);
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
          }}
          className="absolute bottom-16 left-1/2 transform -translate-x-1/2 bg-blue-600 text-white px-3 py-1.5 rounded-full text-sm shadow-lg hover:bg-blue-700 transition-colors"
        >
          ↓ New messages
        </button>
      )}

      {/* Message input */}
      {onSendMessage && (
        <form onSubmit={handleSend} className="p-3 border-t border-gray-800">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              placeholder="Send a message to all platforms..."
              className="flex-1 bg-gray-800 text-white px-4 py-2 rounded-lg border border-gray-700 focus:outline-none focus:border-blue-500 text-sm"
              maxLength={500}
            />
            <button
              type="submit"
              disabled={!messageInput.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors"
            >
              Send
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Messages will be sent to all connected platforms that support chat relay
          </p>
        </form>
      )}
    </div>
  );
}
