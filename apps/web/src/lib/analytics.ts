/**
 * Client-side analytics module for tracking user events
 */

type TrackEventType =
  | 'offer.viewed'
  | 'offer.clicked'
  | 'replay.viewed'
  | 'replay.clicked'
  | 'link.clicked'
  | 'checkout.started';

interface TrackEventOptions {
  visitorId?: string;
  sessionId?: string;
  properties?: Record<string, unknown>;
}

// Generate or retrieve visitor ID
function getVisitorId(): string {
  if (typeof window === 'undefined') return '';
  
  let visitorId = localStorage.getItem('unifyed_visitor_id');
  if (!visitorId) {
    visitorId = `v_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    localStorage.setItem('unifyed_visitor_id', visitorId);
  }
  return visitorId;
}

// Generate or retrieve session ID (expires after 30 min of inactivity)
function getSessionId(): string {
  if (typeof window === 'undefined') return '';
  
  const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes
  const now = Date.now();
  
  const storedSession = sessionStorage.getItem('unifyed_session');
  if (storedSession) {
    const { id, lastActivity } = JSON.parse(storedSession);
    if (now - lastActivity < SESSION_TIMEOUT) {
      // Update last activity
      sessionStorage.setItem('unifyed_session', JSON.stringify({ id, lastActivity: now }));
      return id;
    }
  }
  
  // Create new session
  const sessionId = `s_${now}_${Math.random().toString(36).substring(2, 9)}`;
  sessionStorage.setItem('unifyed_session', JSON.stringify({ id: sessionId, lastActivity: now }));
  return sessionId;
}

/**
 * Track an event to the analytics endpoint
 */
export async function trackEvent(
  type: TrackEventType,
  options: TrackEventOptions = {}
): Promise<void> {
  try {
    const visitorId = options.visitorId ?? getVisitorId();
    const sessionId = options.sessionId ?? getSessionId();

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    
    await fetch(`${apiUrl}/metrics/track`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type,
        visitorId,
        sessionId,
        properties: options.properties,
      }),
    });
  } catch (error) {
    // Silently fail - analytics should not break the app
    console.warn('[Analytics] Failed to track event:', error);
  }
}

/**
 * Track a page view
 */
export function trackPageView(pageName: string, properties?: Record<string, unknown>): void {
  // For now, we'll use the replay.viewed/offer.viewed events
  // In the future, we could add a dedicated page view event
  console.log(`[Analytics] Page view: ${pageName}`, properties);
}

/**
 * Hook for tracking events in React components
 */
export function useAnalytics() {
  return {
    track: trackEvent,
    trackPageView,
    getVisitorId,
    getSessionId,
  };
}

// Export for direct use
export const analytics = {
  track: trackEvent,
  trackPageView,
  getVisitorId,
  getSessionId,
};
