// YouTube Integration Adapter
// This package will contain YouTube-specific OAuth, API client, and live stream handling

export interface YouTubeOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface YouTubeTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface YouTubeChannel {
  id: string;
  title: string;
  thumbnailUrl: string;
  subscriberCount: number;
}

/**
 * Generate YouTube OAuth authorization URL
 */
export function generateAuthUrl(config: YouTubeOAuthConfig, state: string): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/youtube https://www.googleapis.com/auth/youtube.force-ssl',
    redirect_uri: config.redirectUri,
    state,
    access_type: 'offline',
    prompt: 'consent',
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/**
 * Exchange authorization code for tokens
 * @todo Implement actual Google OAuth token exchange
 */
export async function exchangeCodeForTokens(
  code: string,
  config: YouTubeOAuthConfig
): Promise<YouTubeTokens> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`YouTube token exchange failed: ${response.status} - ${error}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
  };
}

/**
 * Refresh access token
 */
export async function refreshAccessToken(
  refreshToken: string,
  config: YouTubeOAuthConfig
): Promise<{ accessToken: string; expiresIn: number }> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`YouTube token refresh failed: ${response.status} - ${error}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    expires_in: number;
  };

  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in,
  };
}

/**
 * Get channel info
 */
export async function getChannelInfo(accessToken: string): Promise<YouTubeChannel | null> {
  const response = await fetch(
    'https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true',
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as {
    items?: Array<{
      id: string;
      snippet: { title: string; thumbnails: { default: { url: string } } };
      statistics: { subscriberCount: string };
    }>;
  };

  const channel = data.items?.[0];
  if (!channel) return null;

  return {
    id: channel.id,
    title: channel.snippet.title,
    thumbnailUrl: channel.snippet.thumbnails.default.url,
    subscriberCount: parseInt(channel.statistics.subscriberCount, 10),
  };
}

/**
 * Check if channel is currently live streaming
 */
export async function checkLiveStatus(
  accessToken: string,
  channelId: string
): Promise<{ isLive: boolean; streamId?: string; title?: string }> {
  const response = await fetch(
    `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&type=video&eventType=live`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    return { isLive: false };
  }

  const data = (await response.json()) as {
    items?: Array<{
      id: { videoId: string };
      snippet: { title: string };
    }>;
  };

  const liveStream = data.items?.[0];
  if (!liveStream) {
    return { isLive: false };
  }

  return {
    isLive: true,
    streamId: liveStream.id.videoId,
    title: liveStream.snippet.title,
  };
}

/**
 * Get channel's recent videos (for replay import)
 */
export async function getChannelVideos(
  accessToken: string,
  channelId: string,
  maxResults = 10
): Promise<Array<{ id: string; title: string; thumbnailUrl: string; publishedAt: string }>> {
  const response = await fetch(
    `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&type=video&order=date&maxResults=${maxResults}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    return [];
  }

  const data = (await response.json()) as {
    items?: Array<{
      id: { videoId: string };
      snippet: {
        title: string;
        thumbnails: { high: { url: string } };
        publishedAt: string;
      };
    }>;
  };

  return (data.items ?? []).map((item) => ({
    id: item.id.videoId,
    title: item.snippet.title,
    thumbnailUrl: item.snippet.thumbnails.high.url,
    publishedAt: item.snippet.publishedAt,
  }));
}
