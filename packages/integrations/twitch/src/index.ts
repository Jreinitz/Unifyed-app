// Twitch Integration Adapter
// Twitch API OAuth and Helix API client

export interface TwitchOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface TwitchTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  scope: string[];
  tokenType: string;
}

export interface TwitchUser {
  id: string;
  login: string;
  displayName: string;
  type: string;
  broadcasterType: string;
  description: string;
  profileImageUrl: string;
  offlineImageUrl: string;
  viewCount: number;
  createdAt: string;
}

export interface TwitchStream {
  id: string;
  oderId: string;
  userName: string;
  userLogin: string;
  gameId: string;
  gameName: string;
  type: 'live' | '';
  title: string;
  viewerCount: number;
  startedAt: string;
  language: string;
  thumbnailUrl: string;
  tagIds: string[];
  tags: string[];
  isMature: boolean;
}

export interface TwitchVideo {
  id: string;
  streamId: string | null;
  userId: string;
  userLogin: string;
  userName: string;
  title: string;
  description: string;
  createdAt: string;
  publishedAt: string;
  url: string;
  thumbnailUrl: string;
  viewable: string;
  viewCount: number;
  language: string;
  type: 'archive' | 'highlight' | 'upload';
  duration: string;
  mutedSegments: Array<{ duration: number; offset: number }> | null;
}

/**
 * Generate Twitch OAuth authorization URL
 * Scopes:
 * - user:read:email: Read user email
 * - channel:read:stream_key: Read stream key
 * - user:read:broadcast: Read user broadcast config
 * - user:write:chat: Send chat messages via Helix API
 * - user:read:chat: Read chat messages
 * - moderator:read:chatters: Read chatters list
 */
export function generateAuthUrl(config: TwitchOAuthConfig, state: string): string {
  const scopes = [
    'user:read:email',
    'channel:read:stream_key',
    'user:read:broadcast',
    'user:write:chat',
    'user:read:chat',
    'moderator:read:chatters',
  ].join(' ');

  const params = new URLSearchParams({
    client_id: config.clientId,
    response_type: 'code',
    scope: scopes,
    redirect_uri: config.redirectUri,
    state,
    force_verify: 'true',
  });

  return `https://id.twitch.tv/oauth2/authorize?${params.toString()}`;
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(
  code: string,
  config: TwitchOAuthConfig
): Promise<TwitchTokens> {
  const response = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: config.redirectUri,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Twitch token exchange failed: ${response.status} - ${error}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    scope: string[];
    token_type: string;
  };

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    scope: data.scope,
    tokenType: data.token_type,
  };
}

/**
 * Refresh access token
 */
export async function refreshAccessToken(
  refreshToken: string,
  config: TwitchOAuthConfig
): Promise<TwitchTokens> {
  const response = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Twitch token refresh failed: ${response.status} - ${error}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    scope: string[];
    token_type: string;
  };

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    scope: data.scope,
    tokenType: data.token_type,
  };
}

/**
 * Get user info from Twitch Helix API
 */
export async function getUserInfo(
  accessToken: string,
  clientId: string
): Promise<TwitchUser | null> {
  const response = await fetch('https://api.twitch.tv/helix/users', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Client-Id': clientId,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Twitch user info failed: ${response.status} - ${error}`);
  }

  const data = (await response.json()) as {
    data: Array<{
      id: string;
      login: string;
      display_name: string;
      type: string;
      broadcaster_type: string;
      description: string;
      profile_image_url: string;
      offline_image_url: string;
      view_count: number;
      created_at: string;
    }>;
  };

  const user = data.data[0];
  if (!user) return null;

  return {
    id: user.id,
    login: user.login,
    displayName: user.display_name,
    type: user.type,
    broadcasterType: user.broadcaster_type,
    description: user.description,
    profileImageUrl: user.profile_image_url,
    offlineImageUrl: user.offline_image_url,
    viewCount: user.view_count,
    createdAt: user.created_at,
  };
}

/**
 * Check if user is currently live streaming
 */
export async function checkLiveStatus(
  accessToken: string,
  clientId: string,
  userId: string
): Promise<{ isLive: boolean; stream?: TwitchStream }> {
  const response = await fetch(
    `https://api.twitch.tv/helix/streams?user_id=${userId}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Client-Id': clientId,
      },
    }
  );

  if (!response.ok) {
    return { isLive: false };
  }

  const data = (await response.json()) as {
    data: Array<{
      id: string;
      user_id: string;
      user_name: string;
      user_login: string;
      game_id: string;
      game_name: string;
      type: 'live' | '';
      title: string;
      viewer_count: number;
      started_at: string;
      language: string;
      thumbnail_url: string;
      tag_ids: string[];
      tags: string[];
      is_mature: boolean;
    }>;
  };

  const stream = data.data[0];
  if (!stream || stream.type !== 'live') {
    return { isLive: false };
  }

  return {
    isLive: true,
    stream: {
      id: stream.id,
      oderId: stream.user_id,
      userName: stream.user_name,
      userLogin: stream.user_login,
      gameId: stream.game_id,
      gameName: stream.game_name,
      type: stream.type,
      title: stream.title,
      viewerCount: stream.viewer_count,
      startedAt: stream.started_at,
      language: stream.language,
      thumbnailUrl: stream.thumbnail_url,
      tagIds: stream.tag_ids,
      tags: stream.tags,
      isMature: stream.is_mature,
    },
  };
}

/**
 * Get user's VODs (archived streams) for replay import
 */
export async function getUserVideos(
  accessToken: string,
  clientId: string,
  userId: string,
  first: number = 20,
  after?: string
): Promise<{ videos: TwitchVideo[]; cursor?: string | undefined }> {
  const params = new URLSearchParams({
    user_id: userId,
    type: 'archive', // Get archived streams (VODs)
    first: String(Math.min(first, 100)),
  });

  if (after) {
    params.set('after', after);
  }

  const response = await fetch(
    `https://api.twitch.tv/helix/videos?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Client-Id': clientId,
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Twitch videos list failed: ${response.status} - ${error}`);
  }

  const data = (await response.json()) as {
    data: Array<{
      id: string;
      stream_id: string | null;
      user_id: string;
      user_login: string;
      user_name: string;
      title: string;
      description: string;
      created_at: string;
      published_at: string;
      url: string;
      thumbnail_url: string;
      viewable: string;
      view_count: number;
      language: string;
      type: 'archive' | 'highlight' | 'upload';
      duration: string;
      muted_segments: Array<{ duration: number; offset: number }> | null;
    }>;
    pagination: {
      cursor?: string;
    };
  };

  return {
    videos: data.data.map((v) => ({
      id: v.id,
      streamId: v.stream_id,
      userId: v.user_id,
      userLogin: v.user_login,
      userName: v.user_name,
      title: v.title,
      description: v.description,
      createdAt: v.created_at,
      publishedAt: v.published_at,
      url: v.url,
      thumbnailUrl: v.thumbnail_url,
      viewable: v.viewable,
      viewCount: v.view_count,
      language: v.language,
      type: v.type,
      duration: v.duration,
      mutedSegments: v.muted_segments,
    })),
    cursor: data.pagination.cursor,
  };
}

/**
 * Parse Twitch duration string (e.g., "3h21m45s") to seconds
 */
export function parseDuration(duration: string): number {
  const regex = /(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/;
  const match = duration.match(regex);
  
  if (!match) return 0;
  
  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);
  const seconds = parseInt(match[3] || '0', 10);
  
  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * Validate a Twitch access token
 */
export async function validateToken(accessToken: string): Promise<{
  valid: boolean;
  clientId?: string;
  login?: string;
  userId?: string;
  scopes?: string[];
  expiresIn?: number;
}> {
  const response = await fetch('https://id.twitch.tv/oauth2/validate', {
    headers: {
      Authorization: `OAuth ${accessToken}`,
    },
  });

  if (!response.ok) {
    return { valid: false };
  }

  const data = (await response.json()) as {
    client_id: string;
    login: string;
    user_id: string;
    scopes: string[];
    expires_in: number;
  };

  return {
    valid: true,
    clientId: data.client_id,
    login: data.login,
    userId: data.user_id,
    scopes: data.scopes,
    expiresIn: data.expires_in,
  };
}

/**
 * Revoke access token
 */
export async function revokeToken(
  accessToken: string,
  clientId: string
): Promise<void> {
  const response = await fetch('https://id.twitch.tv/oauth2/revoke', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: clientId,
      token: accessToken,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Twitch token revocation failed: ${response.status} - ${error}`);
  }
}
