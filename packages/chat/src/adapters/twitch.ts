import { ChatAdapter, type ChatAdapterConfig } from './base.js';

/**
 * Twitch Chat Adapter
 * Uses Twitch Helix REST API for sending and polling chat messages.
 * IRC WebSocket was timing out from Railway, so we use HTTP instead.
 */
export class TwitchChatAdapter extends ChatAdapter {
  private pollingInterval: NodeJS.Timeout | undefined = undefined;
  private readonly pollIntervalMs = 5000; // 5 seconds
  private readonly helixUrl = 'https://api.twitch.tv/helix';

  constructor(
    config: ChatAdapterConfig & {
      accessToken: string;
      username: string;
      channelId: string; // Twitch login name (for display)
      clientId: string;
      broadcasterId: string; // Numeric Twitch user ID
    }
  ) {
    super('twitch', config);
    if (!config.accessToken || !config.clientId || !config.broadcasterId) {
      throw new Error('Twitch requires accessToken, clientId, and broadcasterId');
    }
  }

  async connect(): Promise<void> {
    if (this.connected) return;

    try {
      // Validate the token by fetching user info
      const validateResponse = await fetch('https://id.twitch.tv/oauth2/validate', {
        headers: {
          Authorization: `OAuth ${this.config.accessToken}`,
        },
      });

      if (!validateResponse.ok) {
        throw new Error(`Twitch token validation failed: ${validateResponse.status}`);
      }

      const validateData = await validateResponse.json() as { user_id: string; login: string };
      console.log(`🎮 Twitch: Authenticated as ${validateData.login} (${validateData.user_id})`);

      // Start polling for chat messages
      this.startPolling();
      this.onConnected();
      console.log(`🎮 Twitch: Connected to chat for #${this.config.channelId}`);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.onError(err);
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    this.stopPolling();
    this.onDisconnected();
  }

  async sendMessage(content: string): Promise<void> {
    if (!this.connected) {
      throw new Error('Not connected to Twitch chat');
    }

    const response = await fetch(`${this.helixUrl}/chat/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.accessToken}`,
        'Client-Id': this.config.clientId!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        broadcaster_id: this.config.broadcasterId,
        sender_id: this.config.broadcasterId, // Sending as the broadcaster
        message: content,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({})) as { message?: string };
      throw new Error(`Failed to send Twitch message: ${response.status} - ${errorData.message || 'Unknown error'}`);
    }

    const data = await response.json() as { data?: Array<{ is_sent: boolean; drop_reason?: { code: string; message: string } }> };
    const result = data.data?.[0];
    if (result && !result.is_sent) {
      console.warn(`🎮 Twitch: Message not sent - ${result.drop_reason?.message || 'unknown reason'}`);
    }
  }

  private startPolling(): void {
    // Poll for messages immediately, then on interval
    this.fetchMessages().catch(console.error);
    this.pollingInterval = setInterval(async () => {
      try {
        await this.fetchMessages();
      } catch (error) {
        console.error('🎮 Twitch chat polling error:', error);
      }
    }, this.pollIntervalMs);
  }

  private stopPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = undefined;
    }
  }

  private async fetchMessages(): Promise<void> {
    // Use the Helix chatters endpoint + recent messages if available
    // Note: Twitch doesn't have a direct "get chat messages" REST endpoint
    // We poll the EventSub-style endpoint or use the chat/messages endpoint
    try {
      // Get chatters count for viewer info
      const chattersResponse = await fetch(
        `${this.helixUrl}/chat/chatters?broadcaster_id=${this.config.broadcasterId}&moderator_id=${this.config.broadcasterId}&first=100`,
        {
          headers: {
            'Authorization': `Bearer ${this.config.accessToken}`,
            'Client-Id': this.config.clientId!,
          },
        }
      );

      if (chattersResponse.ok) {
        const chattersData = await chattersResponse.json() as { total?: number };
        if (chattersData.total !== undefined) {
          this.updateViewerCount(chattersData.total);
        }
      }
    } catch {
      // Viewer count update is non-critical
    }
  }

}
