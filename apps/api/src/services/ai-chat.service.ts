import type { ChatMessage } from '@unifyed/types';

/**
 * AI Chat Intelligence Service
 * Analyzes chat messages to detect buying signals and suggest actions
 */

// Buying intent keywords and phrases
const BUYING_INTENT_PATTERNS = [
  // Direct intent
  /\b(want|need|buy|purchase|order|get)\s+(this|that|it|one|some)\b/i,
  /\b(how\s+much|what'?s?\s+the\s+price|price|cost)\s*\??/i,
  /\b(where|how)\s+(can|do)\s+i\s+(buy|get|order|purchase)\b/i,
  /\b(i'?ll?\s+take|give\s+me|i'?m?\s+(getting|buying|ordering))\b/i,
  /\b(shut\s+up\s+and\s+take\s+my\s+money|take\s+my\s+money)\b/i,
  /\b(add\s+to\s+cart|in\s+my\s+cart)\b/i,
  /\b(link|url)\s*\??/i,
  /\b(available|in\s+stock|still\s+have)\s*\??/i,
  
  // Questions about buying
  /\b(can|could)\s+i\s+(get|have|buy)\b/i,
  /\b(do\s+you|are\s+you)\s+(ship|deliver|sell)\b/i,
  /\b(is\s+there|any)\s+(discount|deal|coupon|code)\b/i,
  /\b(free\s+shipping)\s*\??/i,
];

// Product question patterns
const PRODUCT_QUESTION_PATTERNS = [
  /\b(what|which)\s+(size|color|colour|variant|option)/i,
  /\b(does|do)\s+(it|this|that)\s+(come|have|fit)/i,
  /\b(is\s+(it|this|that))\s+(true\s+to\s+size|big|small|large|medium)/i,
  /\b(how)\s+(does|do)\s+(it|this|that)\s+(fit|work|feel)/i,
  /\b(can\s+you)\s+(show|tell|explain)/i,
  /\b(what'?s?\s+(the|this))\s+(material|fabric|quality)/i,
  /\b(how\s+long)\s+(does|will|is)/i,
  /\b(return|refund|exchange)\s+(policy)?\s*\??/i,
];

// Negative sentiment patterns
const NEGATIVE_PATTERNS = [
  /\b(scam|fake|rip\s*off|too\s+expensive|overpriced)\b/i,
  /\b(don'?t|never)\s+(buy|trust|like)\b/i,
  /\b(waste\s+of\s+money|not\s+worth)\b/i,
  /\b(disappointed|terrible|awful|worst)\b/i,
];

// Positive sentiment patterns
const POSITIVE_PATTERNS = [
  /\b(love|amazing|awesome|great|fantastic|excellent|perfect)\b/i,
  /\b(best|fire|sick|dope|lit)\b/i,
  /\b(need|must\s+have|gotta\s+have)\b/i,
  /\b(thank|thanks|ty|tysm)\b/i,
  /\b(just\s+bought|ordered|got\s+mine)\b/i,
];

export interface ChatSignals {
  hasBuyingIntent: boolean;
  isQuestion: boolean;
  sentiment: 'positive' | 'neutral' | 'negative';
  suggestedAction?: string | undefined;
  confidence: number;
  keywords: string[];
}

export interface AIAnalysisResult {
  message: ChatMessage;
  signals: ChatSignals;
  priority: 'high' | 'medium' | 'low';
}

export interface SuggestedAction {
  type: 'drop_link' | 'answer_question' | 'pin_offer' | 'flash_sale' | 'acknowledge';
  message: string;
  offerId?: string | undefined;
  urgency: 'immediate' | 'soon' | 'optional';
}

/**
 * Analyze a single chat message for buying signals
 */
export function analyzeMessage(message: ChatMessage): ChatSignals {
  const content = message.content.toLowerCase();
  const keywords: string[] = [];
  
  // Check for buying intent
  let hasBuyingIntent = false;
  for (const pattern of BUYING_INTENT_PATTERNS) {
    const match = content.match(pattern);
    if (match) {
      hasBuyingIntent = true;
      keywords.push(match[0]);
    }
  }
  
  // Check if it's a question
  const isQuestion = content.includes('?') ||
    PRODUCT_QUESTION_PATTERNS.some(p => p.test(content));
  
  if (isQuestion) {
    for (const pattern of PRODUCT_QUESTION_PATTERNS) {
      const match = content.match(pattern);
      if (match) {
        keywords.push(match[0]);
      }
    }
  }
  
  // Determine sentiment
  let sentiment: 'positive' | 'neutral' | 'negative' = 'neutral';
  let positiveScore = 0;
  let negativeScore = 0;
  
  for (const pattern of POSITIVE_PATTERNS) {
    if (pattern.test(content)) {
      positiveScore++;
    }
  }
  
  for (const pattern of NEGATIVE_PATTERNS) {
    if (pattern.test(content)) {
      negativeScore++;
    }
  }
  
  if (positiveScore > negativeScore) {
    sentiment = 'positive';
  } else if (negativeScore > positiveScore) {
    sentiment = 'negative';
  }
  
  // Calculate confidence based on matches
  const confidence = Math.min(
    1,
    (keywords.length * 0.3) + 
    (hasBuyingIntent ? 0.4 : 0) + 
    (isQuestion ? 0.2 : 0)
  );
  
  // Suggest action
  let suggestedAction: string | undefined;
  
  if (hasBuyingIntent && !isQuestion) {
    suggestedAction = 'Drop a link now! This viewer is ready to buy.';
  } else if (hasBuyingIntent && isQuestion) {
    suggestedAction = 'Answer this question and include a link.';
  } else if (isQuestion) {
    suggestedAction = 'This viewer has a question about the product.';
  } else if (sentiment === 'positive' && message.type === 'gift') {
    suggestedAction = 'Thank this viewer and mention your deal!';
  }
  
  return {
    hasBuyingIntent,
    isQuestion,
    sentiment,
    suggestedAction,
    confidence,
    keywords: [...new Set(keywords)],
  };
}

/**
 * Batch analyze multiple messages and prioritize
 */
export function analyzeMessages(messages: ChatMessage[]): AIAnalysisResult[] {
  const results: AIAnalysisResult[] = [];
  
  for (const message of messages) {
    const signals = analyzeMessage(message);
    
    // Determine priority
    let priority: 'high' | 'medium' | 'low' = 'low';
    
    if (signals.hasBuyingIntent && signals.confidence > 0.5) {
      priority = 'high';
    } else if (signals.hasBuyingIntent || (signals.isQuestion && signals.confidence > 0.3)) {
      priority = 'medium';
    }
    
    // Also boost priority for gifts and subscribers
    if (message.type === 'gift' || message.type === 'subscription') {
      priority = 'high';
    }
    
    results.push({
      message,
      signals,
      priority,
    });
  }
  
  // Sort by priority and confidence
  results.sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (priorityDiff !== 0) return priorityDiff;
    return b.signals.confidence - a.signals.confidence;
  });
  
  return results;
}

/**
 * Get suggested actions based on current chat state
 */
export function getSuggestedActions(
  recentMessages: ChatMessage[],
  activeOfferIds: string[]
): SuggestedAction[] {
  const actions: SuggestedAction[] = [];
  const analyzed = analyzeMessages(recentMessages.slice(-50));
  
  // Count high-priority buying signals
  const highPriorityBuyers = analyzed.filter(
    r => r.priority === 'high' && r.signals.hasBuyingIntent
  );
  
  // Count questions
  const unansweredQuestions = analyzed.filter(
    r => r.signals.isQuestion && r.priority !== 'low'
  );
  
  // Suggest actions based on patterns
  if (highPriorityBuyers.length >= 3) {
    actions.push({
      type: 'drop_link',
      message: `${highPriorityBuyers.length} viewers are asking to buy! Drop a link now!`,
      urgency: 'immediate',
    });
  } else if (highPriorityBuyers.length >= 1) {
    actions.push({
      type: 'drop_link',
      message: 'A viewer is ready to buy. Consider dropping a link.',
      urgency: 'soon',
    });
  }
  
  if (unansweredQuestions.length >= 5) {
    actions.push({
      type: 'answer_question',
      message: `${unansweredQuestions.length} viewers have questions. Consider addressing them!`,
      urgency: 'soon',
    });
  }
  
  // Check for "where's the link" spam
  const linkRequests = analyzed.filter(
    r => r.message.content.toLowerCase().includes('link')
  );
  if (linkRequests.length >= 5 && activeOfferIds.length > 0) {
    actions.push({
      type: 'drop_link',
      message: 'Multiple viewers are asking for the link!',
      offerId: activeOfferIds[0],
      urgency: 'immediate',
    });
  }
  
  // Sort by urgency
  const urgencyOrder = { immediate: 0, soon: 1, optional: 2 };
  actions.sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency]);
  
  return actions;
}

/**
 * Real-time message processor for the chat stream
 * Returns enriched messages with signals
 */
export function processMessage(message: ChatMessage): ChatMessage {
  const signals = analyzeMessage(message);
  
  return {
    ...message,
    signals: {
      hasBuyingIntent: signals.hasBuyingIntent,
      isQuestion: signals.isQuestion,
      sentiment: signals.sentiment,
      suggestedAction: signals.suggestedAction,
    },
  };
}

/**
 * AI Chat Service class for integration with chat aggregator
 */
export class AIChatService {
  private messageBuffer: ChatMessage[] = [];
  private readonly maxBufferSize = 200;
  private actionCallbacks: Set<(actions: SuggestedAction[]) => void> = new Set();
  private checkInterval: NodeJS.Timeout | undefined;
  
  constructor(private activeOfferIds: string[] = []) {}
  
  /**
   * Start the AI service
   */
  start(): void {
    // Check for suggested actions every 10 seconds
    this.checkInterval = setInterval(() => {
      this.emitActions();
    }, 10000);
  }
  
  /**
   * Stop the AI service
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = undefined;
    }
  }
  
  /**
   * Process a new message
   */
  processMessage(message: ChatMessage): ChatMessage {
    const enriched = processMessage(message);
    
    // Add to buffer
    this.messageBuffer.push(enriched);
    if (this.messageBuffer.length > this.maxBufferSize) {
      this.messageBuffer = this.messageBuffer.slice(-this.maxBufferSize);
    }
    
    // Check for immediate actions on high-priority signals
    if (enriched.signals?.hasBuyingIntent) {
      this.emitActions();
    }
    
    return enriched;
  }
  
  /**
   * Update active offer IDs
   */
  setActiveOffers(offerIds: string[]): void {
    this.activeOfferIds = offerIds;
  }
  
  /**
   * Subscribe to suggested actions
   */
  onActions(callback: (actions: SuggestedAction[]) => void): () => void {
    this.actionCallbacks.add(callback);
    return () => this.actionCallbacks.delete(callback);
  }
  
  /**
   * Emit actions to all subscribers
   */
  private emitActions(): void {
    const actions = getSuggestedActions(this.messageBuffer, this.activeOfferIds);
    if (actions.length > 0) {
      this.actionCallbacks.forEach(cb => cb(actions));
    }
  }
  
  /**
   * Get current analysis
   */
  getAnalysis(): {
    recentSignals: AIAnalysisResult[];
    suggestedActions: SuggestedAction[];
    stats: {
      totalMessages: number;
      buyingIntents: number;
      questions: number;
      positiveMessages: number;
    };
  } {
    const analyzed = analyzeMessages(this.messageBuffer);
    const actions = getSuggestedActions(this.messageBuffer, this.activeOfferIds);
    
    return {
      recentSignals: analyzed.slice(0, 20), // Top 20 signals
      suggestedActions: actions,
      stats: {
        totalMessages: this.messageBuffer.length,
        buyingIntents: analyzed.filter(r => r.signals.hasBuyingIntent).length,
        questions: analyzed.filter(r => r.signals.isQuestion).length,
        positiveMessages: analyzed.filter(r => r.signals.sentiment === 'positive').length,
      },
    };
  }
}

/**
 * Create an AI chat service instance
 */
export function createAIChatService(activeOfferIds: string[] = []): AIChatService {
  return new AIChatService(activeOfferIds);
}
