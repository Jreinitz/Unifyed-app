import { Job } from 'bullmq';
import type { Database } from '@unifyed/db';
import { liveSessions, streams } from '@unifyed/db';
import { eq, and, inArray } from 'drizzle-orm';
import * as restreamIntegration from '@unifyed/integrations-restream';
import * as youtubeIntegration from '@unifyed/integrations-youtube';
import * as twitchIntegration from '@unifyed/integrations-twitch';
import { env } from '../config.js';

// Types for stream detection jobs
interface StreamDetectionJob {
  type: 'check_all_creators' | 'check_creator' | 'check_restream' | 'check_platform';
  creatorId?: string;
  connectionId?: string;
  platform?: 'youtube' | 'twitch' | 'tiktok';
  toolConnectionId?: string;
}

interface StreamDetectionResult {
  checked: number;
  newLiveSessions: number;
  endedSessions: number;
  errors: string[];
}

// Decrypt credentials helper (simplified - in production use proper encryption)
function decryptCredentials(encrypted: string): Record<string, unknown> {
  try {
    // In production, this would use proper AES-256 decryption with env.CREDENTIALS_ENCRYPTION_KEY
    // For now, assume credentials are base64 encoded JSON
    return JSON.parse(Buffer.from(encrypted, 'base64').toString('utf-8'));
  } catch {
    // Fall back to plain JSON for development
    return JSON.parse(encrypted);
  }
}

/**
 * Main stream detection processor
 * Polls platforms to detect when creators go live
 */
export async function streamDetectionProcessor(
  job: Job<StreamDetectionJob>,
  db: Database
): Promise<StreamDetectionResult> {
  const { type, creatorId, connectionId, platform, toolConnectionId } = job.data;
  
  const result: StreamDetectionResult = {
    checked: 0,
    newLiveSessions: 0,
    endedSessions: 0,
    errors: [],
  };

  try {
    switch (type) {
      case 'check_all_creators':
        return await checkAllCreators(db, result);
      
      case 'check_creator':
        if (!creatorId) throw new Error('creatorId required for check_creator');
        return await checkCreator(db, creatorId, result);
      
      case 'check_restream':
        if (!toolConnectionId) throw new Error('toolConnectionId required for check_restream');
        return await checkRestreamConnection(db, toolConnectionId, result);
      
      case 'check_platform':
        if (!connectionId || !platform) {
          throw new Error('connectionId and platform required for check_platform');
        }
        return await checkPlatformConnection(db, connectionId, platform, result);
      
      default:
        throw new Error(`Unknown job type: ${type}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    result.errors.push(message);
    console.error(`❌ Stream detection error:`, message);
    return result;
  }
}

/**
 * Check all creators with active connections
 */
async function checkAllCreators(
  db: Database,
  result: StreamDetectionResult
): Promise<StreamDetectionResult> {
  console.log('🔍 Checking all creators for live streams...');
  
  // Get all healthy streaming tool connections (Restream, StreamYard)
  const toolConnections = await db.query.streamingToolConnections.findMany({
    where: (t, { eq }) => eq(t.status, 'connected'),
    with: {
      profile: true,
    },
  });
  
  // Check Restream connections first (most efficient - gets all platforms at once)
  for (const conn of toolConnections) {
    if (conn.tool === 'restream') {
      try {
        await checkRestreamConnection(db, conn.id, result);
        result.checked++;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        result.errors.push(`Restream ${conn.id}: ${message}`);
      }
    }
  }
  
  // Get creators who don't have Restream but have direct platform connections
  const creatorsWithRestream = toolConnections
    .filter((t) => t.tool === 'restream')
    .map((t) => t.creatorId);
  
  // Get all healthy platform connections not covered by Restream
  const platformConns = await db.query.platformConnections.findMany({
    where: (p, { eq, and }) => and(
      eq(p.status, 'healthy'),
      inArray(p.platform, ['youtube', 'twitch', 'tiktok'])
    ),
  });
  
  // Filter out creators who have Restream
  const filteredPlatformConns = creatorsWithRestream.length > 0
    ? platformConns.filter((p) => !creatorsWithRestream.includes(p.creatorId))
    : platformConns;
  
  // Check each direct platform connection
  for (const conn of filteredPlatformConns) {
    try {
      const platform = conn.platform as 'youtube' | 'twitch' | 'tiktok';
      await checkPlatformConnection(db, conn.id, platform, result);
      result.checked++;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      result.errors.push(`${conn.platform} ${conn.id}: ${message}`);
    }
  }
  
  console.log(`✅ Checked ${result.checked} connections, ${result.newLiveSessions} new sessions, ${result.endedSessions} ended`);
  return result;
}

/**
 * Check a specific creator's connections
 */
async function checkCreator(
  db: Database,
  creatorId: string,
  result: StreamDetectionResult
): Promise<StreamDetectionResult> {
  console.log(`🔍 Checking creator ${creatorId} for live streams...`);
  
  // Check if creator has Restream connected
  const restreamConn = await db.query.streamingToolConnections.findFirst({
    where: (t, { eq, and }) => and(
      eq(t.creatorId, creatorId),
      eq(t.tool, 'restream'),
      eq(t.status, 'connected')
    ),
  });
  
  if (restreamConn) {
    // Use Restream for this creator (covers all platforms)
    await checkRestreamConnection(db, restreamConn.id, result);
    result.checked++;
    return result;
  }
  
  // No Restream - check direct platform connections
  const platformConnections = await db.query.platformConnections.findMany({
    where: (p, { eq, and }) => and(
      eq(p.creatorId, creatorId),
      eq(p.status, 'healthy'),
      inArray(p.platform, ['youtube', 'twitch', 'tiktok'])
    ),
  });
  
  for (const conn of platformConnections) {
    try {
      const platform = conn.platform as 'youtube' | 'twitch' | 'tiktok';
      await checkPlatformConnection(db, conn.id, platform, result);
      result.checked++;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      result.errors.push(`${conn.platform}: ${message}`);
    }
  }
  
  return result;
}

/**
 * Check Restream connection for live status
 * This is the most efficient path - Restream aggregates all platforms
 */
async function checkRestreamConnection(
  db: Database,
  toolConnectionId: string,
  result: StreamDetectionResult
): Promise<StreamDetectionResult> {
  const connection = await db.query.streamingToolConnections.findFirst({
    where: (t, { eq }) => eq(t.id, toolConnectionId),
  });
  
  if (!connection) {
    throw new Error(`Streaming tool connection ${toolConnectionId} not found`);
  }
  
  const credentials = decryptCredentials(connection.credentials) as {
    accessToken: string;
    refreshToken: string;
  };
  
  // Check live status via Restream API
  const { isLive, broadcast } = await restreamIntegration.checkLiveStatus(
    credentials.accessToken
  );
  
  console.log(`📡 Restream ${connection.displayName}: ${isLive ? 'LIVE' : 'offline'}`);
  
  // Get current live session for this creator (if any)
  const currentSession = await db.query.liveSessions.findFirst({
    where: (ls, { eq, and }) => and(
      eq(ls.creatorId, connection.creatorId),
      eq(ls.status, 'live')
    ),
  });
  
  if (isLive && broadcast) {
    if (!currentSession) {
      // Creator just went live - create new session
      await createLiveSession(db, connection.creatorId, broadcast, toolConnectionId);
      result.newLiveSessions++;
    } else {
      // Already live - update stats
      await updateLiveSessionStats(db, currentSession.id, broadcast);
    }
  } else if (currentSession && !isLive) {
    // Creator stopped streaming - end session
    await endLiveSession(db, currentSession.id);
    result.endedSessions++;
  }
  
  return result;
}

/**
 * Check a direct platform connection for live status
 */
async function checkPlatformConnection(
  db: Database,
  connectionId: string,
  platform: 'youtube' | 'twitch' | 'tiktok',
  result: StreamDetectionResult
): Promise<StreamDetectionResult> {
  const connection = await db.query.platformConnections.findFirst({
    where: (p, { eq }) => eq(p.id, connectionId),
  });
  
  if (!connection) {
    throw new Error(`Platform connection ${connectionId} not found`);
  }
  
  const credentials = decryptCredentials(connection.credentials) as {
    accessToken: string;
    refreshToken?: string;
    channelId?: string;
    userId?: string;
  };
  
  let isLive = false;
  let streamInfo: { id?: string | undefined; title?: string | undefined; viewerCount?: number | undefined } = {};
  
  switch (platform) {
    case 'youtube': {
      const ytResult = await youtubeIntegration.checkLiveStatus(
        credentials.accessToken,
        credentials.channelId || connection.externalId || ''
      );
      isLive = ytResult.isLive;
      if (ytResult.streamId) {
        streamInfo.id = ytResult.streamId;
      }
      if (ytResult.title) {
        streamInfo.title = ytResult.title;
      }
      break;
    }
      
    case 'twitch': {
      if (!env.TWITCH_CLIENT_ID) {
        throw new Error('TWITCH_CLIENT_ID not configured');
      }
      const twitchResult = await twitchIntegration.checkLiveStatus(
        credentials.accessToken,
        env.TWITCH_CLIENT_ID,
        credentials.userId || connection.externalId || ''
      );
      isLive = twitchResult.isLive;
      if (twitchResult.stream) {
        streamInfo.id = twitchResult.stream.id;
        streamInfo.title = twitchResult.stream.title;
        streamInfo.viewerCount = twitchResult.stream.viewerCount;
      }
      break;
    }
      
    case 'tiktok':
      // TikTok official API doesn't support live status
      // We'll handle this separately with tiktok-live-connector in the scheduler
      // For now, mark as not live via API
      isLive = false;
      break;
  }
  
  console.log(`📡 ${platform} ${connection.displayName || connection.externalId}: ${isLive ? 'LIVE' : 'offline'}`);
  
  // Get current stream for this connection
  const currentStream = await db.query.streams.findFirst({
    where: (s, { eq, and }) => and(
      eq(s.platformConnectionId, connectionId),
      eq(s.status, 'live')
    ),
  });
  
  if (isLive && streamInfo.id) {
    if (!currentStream) {
      // Just went live - create stream record
      await createDirectStream(
        db,
        connection.creatorId,
        connectionId,
        platform,
        streamInfo
      );
      result.newLiveSessions++;
    } else {
      // Already live - update stats
      await db
        .update(streams)
        .set({
          title: streamInfo.title || currentStream.title,
          peakViewers: streamInfo.viewerCount && currentStream.peakViewers
            ? Math.max(streamInfo.viewerCount, currentStream.peakViewers)
            : streamInfo.viewerCount || currentStream.peakViewers,
          updatedAt: new Date(),
        })
        .where(eq(streams.id, currentStream.id));
    }
  } else if (currentStream && !isLive) {
    // Stream ended
    await endDirectStream(db, currentStream.id);
    result.endedSessions++;
  }
  
  return result;
}

/**
 * Create a new LiveSession from Restream broadcast
 */
async function createLiveSession(
  db: Database,
  creatorId: string,
  broadcast: restreamIntegration.RestreamBroadcast,
  toolConnectionId: string
): Promise<void> {
  console.log(`🎬 Creating live session for creator ${creatorId}: ${broadcast.title}`);
  
  // Create the LiveSession
  const result = await db
    .insert(liveSessions)
    .values({
      creatorId,
      title: broadcast.title,
      status: 'live',
      startedAt: broadcast.startedAt ? new Date(broadcast.startedAt) : new Date(),
      totalPeakViewers: broadcast.viewerCount || 0,
      streamingToolConnectionId: toolConnectionId,
      metadata: {
        restreamBroadcastId: broadcast.id,
      },
    })
    .returning();
  
  const session = result[0];
  if (!session) {
    throw new Error('Failed to create live session');
  }
  
  // Create individual Stream records for each active platform channel
  const activeChannels = broadcast.channels.filter((ch) => ch.active && ch.enabled);
  
  for (const channel of activeChannels) {
    const platform = restreamIntegration.mapRestreamPlatform(channel.platform);
    
    if (platform && ['youtube', 'twitch', 'tiktok'].includes(platform)) {
      await db.insert(streams).values({
        creatorId,
        liveSessionId: session.id,
        platform: platform as 'youtube' | 'twitch' | 'tiktok',
        platformStreamId: String(channel.id),
        source: 'auto_detected',
        title: broadcast.title,
        status: 'live',
        actualStartAt: broadcast.startedAt ? new Date(broadcast.startedAt) : new Date(),
        metadata: {
          restreamChannelId: channel.id,
          embedUrl: channel.embedUrl,
        },
      });
    }
  }
  
  console.log(`✅ Created live session ${session.id} with ${activeChannels.length} streams`);
}

/**
 * Update LiveSession stats during broadcast
 */
async function updateLiveSessionStats(
  db: Database,
  sessionId: string,
  broadcast: restreamIntegration.RestreamBroadcast
): Promise<void> {
  const session = await db.query.liveSessions.findFirst({
    where: (ls, { eq }) => eq(ls.id, sessionId),
  });
  
  if (!session) return;
  
  await db
    .update(liveSessions)
    .set({
      totalPeakViewers: broadcast.viewerCount && session.totalPeakViewers
        ? Math.max(broadcast.viewerCount, session.totalPeakViewers)
        : broadcast.viewerCount || session.totalPeakViewers,
      updatedAt: new Date(),
    })
    .where(eq(liveSessions.id, sessionId));
}

/**
 * End a LiveSession when broadcast stops
 */
async function endLiveSession(db: Database, sessionId: string): Promise<void> {
  console.log(`🛑 Ending live session ${sessionId}`);
  
  // End the session
  await db
    .update(liveSessions)
    .set({
      status: 'ended',
      endedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(liveSessions.id, sessionId));
  
  // End all associated streams
  await db
    .update(streams)
    .set({
      status: 'ended',
      endedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(streams.liveSessionId, sessionId),
        eq(streams.status, 'live')
      )
    );
  
  // TODO: Create replays from ended streams (import VODs from platforms)
  console.log(`✅ Live session ${sessionId} ended`);
}

/**
 * Create a stream record for direct platform connection (non-Restream)
 */
async function createDirectStream(
  db: Database,
  creatorId: string,
  connectionId: string,
  platform: 'youtube' | 'twitch' | 'tiktok',
  streamInfo: { id?: string | undefined; title?: string | undefined; viewerCount?: number | undefined }
): Promise<void> {
  console.log(`🎬 Creating stream for ${platform}: ${streamInfo.title}`);
  
  // Check if there's an existing LiveSession for this creator that's still live
  let liveSession = await db.query.liveSessions.findFirst({
    where: (ls, { eq, and }) => and(
      eq(ls.creatorId, creatorId),
      eq(ls.status, 'live')
    ),
  });
  
  // If no live session, create one
  if (!liveSession) {
    const result = await db
      .insert(liveSessions)
      .values({
        creatorId,
        title: streamInfo.title || 'Live Stream',
        status: 'live',
        startedAt: new Date(),
        totalPeakViewers: streamInfo.viewerCount || 0,
      })
      .returning();
    
    const newSession = result[0];
    if (!newSession) {
      throw new Error('Failed to create live session');
    }
    liveSession = newSession;
  }
  
  // Create the stream
  await db.insert(streams).values({
    creatorId,
    liveSessionId: liveSession.id,
    platform,
    platformConnectionId: connectionId,
    platformStreamId: streamInfo.id,
    source: 'auto_detected',
    title: streamInfo.title || 'Live Stream',
    status: 'live',
    actualStartAt: new Date(),
    peakViewers: streamInfo.viewerCount,
  });
  
  console.log(`✅ Created stream for ${platform} in session ${liveSession.id}`);
}

/**
 * End a direct platform stream
 */
async function endDirectStream(db: Database, streamId: string): Promise<void> {
  console.log(`🛑 Ending stream ${streamId}`);
  
  const stream = await db.query.streams.findFirst({
    where: (s, { eq }) => eq(s.id, streamId),
  });
  
  if (!stream) return;
  
  // End the stream
  await db
    .update(streams)
    .set({
      status: 'ended',
      endedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(streams.id, streamId));
  
  // Check if this was the last active stream in the session
  if (stream.liveSessionId) {
    const otherActiveStreams = await db.query.streams.findFirst({
      where: (s, { eq, and, ne }) => and(
        eq(s.liveSessionId, stream.liveSessionId!),
        eq(s.status, 'live'),
        ne(s.id, streamId)
      ),
    });
    
    // If no other active streams, end the session
    if (!otherActiveStreams) {
      await db
        .update(liveSessions)
        .set({
          status: 'ended',
          endedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(liveSessions.id, stream.liveSessionId));
    }
  }
  
  // TODO: Import VOD to create Replay
  console.log(`✅ Stream ${streamId} ended`);
}
