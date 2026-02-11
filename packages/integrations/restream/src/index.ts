// Restream Integration Adapter
// Restream API OAuth and broadcast management

export interface RestreamOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface RestreamTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
  scope: string;
}

export interface RestreamUser {
  id: number;
  username: string;
  email: string;
  avatar?: string | undefined;
  createdAt: string;
}

export interface RestreamChannel {
  id: number;
  name: string;
  platform: string;
  enabled: boolean;
  active: boolean; // Currently streaming
  displayName?: string | undefined;
  embedUrl?: string | undefined;
}

export interface RestreamBroadcast {
  id: string;
  title: string;
  status: 'live' | 'offline' | 'starting' | 'stopping';
  startedAt?: string | undefined;
  endedAt?: string | undefined;
  channels: RestreamChannel[];
  viewerCount?: number | undefined;
}

export interface RestreamDestination {
  id: number;
  platform: string;
  platformId: string;
  displayName: string;
  enabled: boolean;
  connected: boolean;
}

/**
 * Generate Restream OAuth authorization URL
 */
export function generateAuthUrl(config: RestreamOAuthConfig, state: string): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    response_type: 'code',
    redirect_uri: config.redirectUri,
    state,
  });

  return `https://api.restream.io/login?${params.toString()}`;
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(
  code: string,
  config: RestreamOAuthConfig
): Promise<RestreamTokens> {
  const response = await fetch('https://api.restream.io/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`,
    },
    body: new URLSearchParams({
      code,
      grant_type: 'authorization_code',
      redirect_uri: config.redirectUri,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Restream token exchange failed: ${response.status} - ${error}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    token_type: string;
    scope: string;
  };

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    tokenType: data.token_type,
    scope: data.scope,
  };
}

/**
 * Refresh access token
 */
export async function refreshAccessToken(
  refreshToken: string,
  config: RestreamOAuthConfig
): Promise<RestreamTokens> {
  const response = await fetch('https://api.restream.io/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`,
    },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Restream token refresh failed: ${response.status} - ${error}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    token_type: string;
    scope: string;
  };

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    tokenType: data.token_type,
    scope: data.scope,
  };
}

/**
 * Get user profile
 */
export async function getUserProfile(accessToken: string): Promise<RestreamUser> {
  const response = await fetch('https://api.restream.io/v2/user/profile', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Restream user profile failed: ${response.status} - ${error}`);
  }

  const data = (await response.json()) as {
    id: number;
    username: string;
    email: string;
    avatar?: string;
    created_at: string;
  };

  return {
    id: data.id,
    username: data.username,
    email: data.email,
    avatar: data.avatar,
    createdAt: data.created_at,
  };
}

/**
 * Get user's connected streaming channels/destinations
 */
export async function getChannels(accessToken: string): Promise<RestreamDestination[]> {
  const response = await fetch('https://api.restream.io/v2/user/channel/all', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Restream channels failed: ${response.status} - ${error}`);
  }

  const rawData = (await response.json()) as 
    | Array<{
        id: number;
        platform: string;
        platform_id: string;
        display_name: string;
        enabled: boolean;
        connected: boolean;
      }>
    | {
        channels?: Array<{
          id: number;
          platform: string;
          platform_id: string;
          display_name: string;
          enabled: boolean;
          connected: boolean;
        }>;
        data?: Array<{
          id: number;
          platform: string;
          platform_id: string;
          display_name: string;
          enabled: boolean;
          connected: boolean;
        }>;
      };
  
  // Handle both array response and object with channels property
  const data = Array.isArray(rawData) 
    ? rawData 
    : (rawData.channels ?? rawData.data ?? []);

  return data.map((ch) => ({
    id: ch.id,
    platform: ch.platform,
    platformId: ch.platform_id,
    displayName: ch.display_name,
    enabled: ch.enabled,
    connected: ch.connected,
  }));
}

/**
 * Check if user is currently live streaming via Restream
 */
export async function checkLiveStatus(
  accessToken: string
): Promise<{ isLive: boolean; broadcast?: RestreamBroadcast }> {
  // Use the events/in-progress endpoint to check for active streams
  const response = await fetch('https://api.restream.io/v2/user/events/in-progress', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    console.log(`Restream checkLiveStatus API returned ${response.status}`);
    return { isLive: false };
  }

  const events = (await response.json()) as Array<{
    id: string;
    status: string;
    title: string;
    description?: string;
    startedAt?: number;
    finishedAt?: number;
    isRecordOnly?: boolean;
    destinations?: Array<{
      channelId: number;
      externalUrl?: string;
      streamingPlatformId: number;
    }>;
  }>;

  console.log(`Restream in-progress events: ${events.length}`);

  // Filter out record-only events
  const liveEvents = Array.isArray(events) 
    ? events.filter(e => e.status === 'in-progress' && !e.isRecordOnly)
    : [];

  if (liveEvents.length === 0) {
    return { isLive: false };
  }

  const activeEvent = liveEvents[0]!;
  
  // Map destinations to channels
  const channels: RestreamChannel[] = (activeEvent.destinations ?? []).map((dest) => ({
    id: dest.channelId,
    name: `Channel ${dest.channelId}`,
    platform: String(dest.streamingPlatformId),
    enabled: true,
    active: true,
    displayName: dest.externalUrl ?? undefined,
    embedUrl: dest.externalUrl ?? undefined,
  }));

  return {
    isLive: true,
    broadcast: {
      id: activeEvent.id,
      title: activeEvent.title ?? 'Live Stream',
      status: 'live',
      startedAt: activeEvent.startedAt ? new Date(activeEvent.startedAt * 1000).toISOString() : undefined,
      channels,
    },
  };
}

/**
 * Get the ingest (RTMP) settings for OBS/streaming software
 */
export async function getIngestSettings(accessToken: string): Promise<{
  rtmpUrl: string;
  streamKey: string;
}> {
  const response = await fetch('https://api.restream.io/v2/user/channel-set', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Restream ingest settings failed: ${response.status} - ${error}`);
  }

  const data = (await response.json()) as {
    streaming_servers?: Array<{
      url: string;
      key: string;
    }>;
  };

  const server = data.streaming_servers?.[0];
  if (!server) {
    throw new Error('No streaming server configured');
  }

  return {
    rtmpUrl: server.url,
    streamKey: server.key,
  };
}

/**
 * Get platforms that user is configured to stream to
 */
export async function getConfiguredPlatforms(accessToken: string): Promise<string[]> {
  const channels = await getChannels(accessToken);
  
  return channels
    .filter((ch) => ch.enabled && ch.connected)
    .map((ch) => ch.platform.toLowerCase());
}

/**
 * Map Restream platform names to our platform enum
 */
export function mapRestreamPlatform(restreamPlatform: string): string | null {
  const mapping: Record<string, string> = {
    youtube: 'youtube',
    twitch: 'twitch',
    'youtube-live': 'youtube',
    'youtube-hls': 'youtube',
    tiktok: 'tiktok',
    'tiktok-live': 'tiktok',
    facebook: 'facebook',
    'facebook-live': 'facebook',
    instagram: 'instagram',
    twitter: 'twitter',
    linkedin: 'linkedin',
  };

  return mapping[restreamPlatform.toLowerCase()] ?? null;
}

/**
 * Revoke access token
 */
export async function revokeToken(
  accessToken: string,
  config: RestreamOAuthConfig
): Promise<void> {
  const response = await fetch('https://api.restream.io/oauth/revoke', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`,
    },
    body: new URLSearchParams({
      token: accessToken,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Restream token revocation failed: ${response.status} - ${error}`);
  }
}
