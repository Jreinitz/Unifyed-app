import { Job } from 'bullmq';
import { eq, lt, and } from 'drizzle-orm';
import type { Database } from '@unifyed/db';
import { reservations, checkoutSessions } from '@unifyed/db/schema';

interface ReservationExpiryJob {
  // Can be empty for periodic cleanup, or specific reservation ID
  reservationId?: string;
}

export async function reservationExpiryProcessor(
  _job: Job<ReservationExpiryJob>,
  db: Database
): Promise<void> {
  console.log('🕐 Processing reservation expiry');
  
  // Find all expired pending reservations
  const expiredReservations = await db
    .select()
    .from(reservations)
    .where(
      and(
        eq(reservations.status, 'pending'),
        lt(reservations.expiresAt, new Date())
      )
    )
    .limit(100);
  
  console.log(`Found ${expiredReservations.length} expired reservations`);
  
  for (const reservation of expiredReservations) {
    await db.transaction(async (tx) => {
      // Mark reservation as expired
      await tx
        .update(reservations)
        .set({
          status: 'expired',
          releasedAt: new Date(),
          releaseReason: 'expired',
          updatedAt: new Date(),
        })
        .where(eq(reservations.id, reservation.id));
      
      // Note: We don't need to restore inventory because reservations
      // are tracked separately from actual inventory. The inventory
      // was never deducted - it's just reserved.
      
      // Mark checkout session as abandoned if exists
      await tx
        .update(checkoutSessions)
        .set({
          status: 'abandoned',
          updatedAt: new Date(),
        })
        .where(eq(checkoutSessions.id, reservation.checkoutSessionId));
    });
    
    console.log(`✅ Released reservation ${reservation.id}`);
  }
  
  console.log(`✅ Processed ${expiredReservations.length} expired reservations`);
}
