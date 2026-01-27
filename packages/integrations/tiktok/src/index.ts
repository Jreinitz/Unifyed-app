// TikTok Integration Adapter
// TikTok API v2 OAuth and API client

export interface TikTokOAuthConfig {
  clientKey: string;
  clientSecret: string;
  redirectUri: string;
}

export interface TikTokTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  openId: string;
  scope: string;
  tokenType: string;
}

export interface TikTokUserInfo {
  openId: string;
  unionId?: string | undefined;
  avatarUrl?: string | undefined;
  avatarUrl100?: string | undefined;
  displayName: string;
  bioDescription?: string | undefined;
  followerCount?: number | undefined;
  followingCount?: number | undefined;
  likesCount?: number | undefined;
  videoCount?: number | undefined;
}

export interface TikTokVideo {
  id: string;
  createTime: number;
  coverImageUrl: string;
  shareUrl: string;
  title: string;
  duration: number;
  embedHtml?: string | undefined;
  embedLink?: string | undefined;
  likeCount?: number | undefined;
  commentCount?: number | undefined;
  shareCount?: number | undefined;
  viewCount?: number | undefined;
}

/**
 * Generate TikTok OAuth authorization URL
 */
export function generateAuthUrl(config: TikTokOAuthConfig, state: string): string {
  // TikTok OAuth 2.0 scopes:
  // - user.info.basic: basic user profile
  // - user.info.profile: extended profile info
  // - user.info.stats: follower/following stats
  // - video.list: list user's videos
  const scopes = 'user.info.basic,user.info.profile,video.list';
  
  const params = new URLSearchParams({
    client_key: config.clientKey,
    response_type: 'code',
    scope: scopes,
    redirect_uri: config.redirectUri,
    state,
  });

  return `https://www.tiktok.com/v2/auth/authorize?${params.toString()}`;
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(
  code: string,
  config: TikTokOAuthConfig
): Promise<TikTokTokens> {
  const response = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_key: config.clientKey,
      client_secret: config.clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: config.redirectUri,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`TikTok token exchange failed: ${response.status} - ${error}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    open_id: string;
    scope: string;
    token_type: string;
  };

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    openId: data.open_id,
    scope: data.scope,
    tokenType: data.token_type,
  };
}

/**
 * Refresh access token
 */
export async function refreshAccessToken(
  refreshToken: string,
  config: TikTokOAuthConfig
): Promise<TikTokTokens> {
  const response = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_key: config.clientKey,
      client_secret: config.clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`TikTok token refresh failed: ${response.status} - ${error}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    open_id: string;
    scope: string;
    token_type: string;
  };

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    openId: data.open_id,
    scope: data.scope,
    tokenType: data.token_type,
  };
}

/**
 * Get user info
 */
export async function getUserInfo(
  accessToken: string
): Promise<TikTokUserInfo> {
  const fields = 'open_id,union_id,avatar_url,avatar_url_100,display_name,bio_description,follower_count,following_count,likes_count,video_count';
  
  const response = await fetch(
    `https://open.tiktokapis.com/v2/user/info/?fields=${fields}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`TikTok user info failed: ${response.status} - ${error}`);
  }

  const data = (await response.json()) as {
    data: {
      user: {
        open_id: string;
        union_id?: string;
        avatar_url?: string;
        avatar_url_100?: string;
        display_name: string;
        bio_description?: string;
        follower_count?: number;
        following_count?: number;
        likes_count?: number;
        video_count?: number;
      };
    };
  };

  const user = data.data.user;
  return {
    openId: user.open_id,
    unionId: user.union_id,
    avatarUrl: user.avatar_url,
    avatarUrl100: user.avatar_url_100,
    displayName: user.display_name,
    bioDescription: user.bio_description,
    followerCount: user.follower_count,
    followingCount: user.following_count,
    likesCount: user.likes_count,
    videoCount: user.video_count,
  };
}

/**
 * Check if user is currently live streaming
 * Note: TikTok's public API may not support live status checking directly.
 * This would require TikTok LIVE API access which needs partnership approval.
 */
export async function checkLiveStatus(
  _accessToken: string,
  _openId: string
): Promise<{ isLive: boolean; streamId?: string; title?: string }> {
  // TikTok LIVE API is currently limited to approved partners
  // For now, return not live - full implementation requires TikTok partnership
  return { isLive: false };
}

/**
 * Get user's videos (for replay import)
 */
export async function getUserVideos(
  accessToken: string,
  maxCount: number = 20,
  cursor?: string
): Promise<{ videos: TikTokVideo[]; cursor?: string | undefined; hasMore: boolean }> {
  const fields = 'id,create_time,cover_image_url,share_url,title,duration,embed_html,embed_link,like_count,comment_count,share_count,view_count';
  
  const params = new URLSearchParams({
    fields,
    max_count: String(Math.min(maxCount, 20)), // TikTok max is 20
  });
  
  if (cursor) {
    params.set('cursor', cursor);
  }
  
  const response = await fetch(
    `https://open.tiktokapis.com/v2/video/list/?${params.toString()}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`TikTok video list failed: ${response.status} - ${error}`);
  }

  const data = (await response.json()) as {
    data: {
      videos: Array<{
        id: string;
        create_time: number;
        cover_image_url: string;
        share_url: string;
        title: string;
        duration: number;
        embed_html?: string;
        embed_link?: string;
        like_count?: number;
        comment_count?: number;
        share_count?: number;
        view_count?: number;
      }>;
      cursor?: string;
      has_more: boolean;
    };
  };

  return {
    videos: data.data.videos.map((v) => ({
      id: v.id,
      createTime: v.create_time,
      coverImageUrl: v.cover_image_url,
      shareUrl: v.share_url,
      title: v.title,
      duration: v.duration,
      embedHtml: v.embed_html,
      embedLink: v.embed_link,
      likeCount: v.like_count,
      commentCount: v.comment_count,
      shareCount: v.share_count,
      viewCount: v.view_count,
    })),
    cursor: data.data.cursor,
    hasMore: data.data.has_more,
  };
}

/**
 * Revoke access token
 */
export async function revokeToken(
  accessToken: string,
  config: TikTokOAuthConfig
): Promise<void> {
  const response = await fetch('https://open.tiktokapis.com/v2/oauth/revoke/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_key: config.clientKey,
      client_secret: config.clientSecret,
      token: accessToken,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`TikTok token revocation failed: ${response.status} - ${error}`);
  }
}
