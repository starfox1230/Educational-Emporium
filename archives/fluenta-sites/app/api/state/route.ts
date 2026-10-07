import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { getChatGPTUser } from "../../chatgpt-auth";
import { cards, decks, reviewLogs, studySettings, users } from "../../../db/schema";

type IncomingCard = {
  id: string; english: string; spanish: string; notes: string; tags: string[];
  state: string; due: string; interval: string; reviews: number; lapses: number;
  stability: number; difficulty: number; suspended?: boolean; lastReviewed?: string; fsrs?: Record<string, unknown>;
};
type IncomingLog = { id: string; cardId: string; reviewedAt: string; rating: string; duration: number; previousDue: string; resultingDue: string };
type IncomingState = {
  contentVersion?: string;
  lastStreakDate?: string;
  reviewedDate?: string;
  dailyDueDate?: string;
  dailyDueIds?: string[];
  dailyReviewedIds?: string[];
  cards: IncomingCard[];
  logs: IncomingLog[];
  streak: number;
  longestStreak: number;
  boosts: number;
  reviewedToday: number;
  settings: { retention: number; timerEnabled: boolean; questionSeconds: number; answerSeconds: number; streakEnabled: boolean; boostEnabled: boolean; soundEnabled: boolean; hapticsEnabled: boolean; reducedEffects: boolean };
};

function parseIdList(value: string | null | undefined) {
  try {
    const parsed = JSON.parse(value ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string").slice(0, 5000) : [];
  } catch {
    return [];
  }
}

const defaultSettings = {
  retention: 0.9, timerEnabled: true, questionSeconds: 20, answerSeconds: 12,
  streakEnabled: true, boostEnabled: true, soundEnabled: false, hapticsEnabled: true,
  reducedEffects: false,
};

async function currentUser() {
  const user = await getChatGPTUser();
  if (!user) return null;
  const db = getDb();
  const deckId = `deck-${user.userId}`;
  await db.batch([
    db.insert(users).values({ id: user.userId, email: user.email, displayName: user.displayName }).onConflictDoUpdate({ target: users.id, set: { email: user.email, displayName: user.displayName, updatedAt: new Date().toISOString() } }),
    db.insert(decks).values({ id: deckId, userId: user.userId, name: "Spanish", description: "Personal Spanish study deck", language: "es" }).onConflictDoNothing(),
    db.insert(studySettings).values({ userId: user.userId }).onConflictDoNothing(),
  ]);
  return { user, db, deckId };
}

function serializeCard(card: typeof cards.$inferSelect): IncomingCard {
  let tags: string[] = [];
  let fsrs: Record<string, unknown> | undefined;
  try { tags = JSON.parse(card.tags) as string[]; } catch { tags = []; }
  try { fsrs = JSON.parse(card.fsrs) as Record<string, unknown>; } catch { fsrs = undefined; }
  return { id: card.id, english: card.english, spanish: card.spanish, notes: card.notes, tags, state: card.state, due: card.due, interval: card.interval, reviews: card.reviews, lapses: card.lapses, stability: card.stability, difficulty: card.difficulty, suspended: card.suspended, lastReviewed: card.lastReviewed ?? undefined, fsrs };
}

export async function GET() {
  try {
    const session = await currentUser();
    if (!session) return Response.json({ error: "Sign-in required" }, { status: 401 });
    const [cardRows, logRows, settingRows] = await Promise.all([
      session.db.select().from(cards).where(eq(cards.userId, session.user.userId)),
      session.db.select().from(reviewLogs).where(eq(reviewLogs.userId, session.user.userId)),
      session.db.select().from(studySettings).where(eq(studySettings.userId, session.user.userId)),
    ]);
    const stored = settingRows[0];
    return Response.json({
      cards: cardRows.map(serializeCard),
      logs: logRows.map((log) => ({ id: log.id, cardId: log.cardId, reviewedAt: log.reviewedAt, rating: log.rating, duration: log.duration, previousDue: log.previousDue, resultingDue: log.resultingDue })),
      contentVersion: stored?.contentVersion ?? "legacy",
      lastStreakDate: stored?.lastStreakDate ?? undefined,
      reviewedDate: stored?.reviewedDate ?? undefined,
      dailyDueDate: stored?.dailyDueDate ?? undefined,
      dailyDueIds: parseIdList(stored?.dailyDueIds),
      dailyReviewedIds: parseIdList(stored?.dailyReviewedIds),
      streak: stored?.streak ?? 0,
      longestStreak: stored?.longestStreak ?? 0,
      boosts: stored?.boosts ?? 3,
      reviewedToday: stored?.reviewedToday ?? 0,
      settings: stored ? { retention: stored.retention, timerEnabled: stored.timerEnabled, questionSeconds: stored.questionSeconds, answerSeconds: stored.answerSeconds, streakEnabled: stored.streakEnabled, boostEnabled: stored.boostEnabled, soundEnabled: stored.soundEnabled, hapticsEnabled: stored.hapticsEnabled, reducedEffects: stored.reducedEffects } : defaultSettings,
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to load study data" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await currentUser();
    if (!session) return Response.json({ error: "Sign-in required" }, { status: 401 });
    const payload = await request.json() as Partial<IncomingState>;
    const settings = { ...defaultSettings, ...(payload.settings ?? {}) };
    const contentVersion = payload.contentVersion ?? "restaurant-v1";
    const incomingCards = Array.isArray(payload.cards) ? payload.cards.slice(0, 5000) : [];
    const incomingLogs = Array.isArray(payload.logs) ? payload.logs.slice(0, 25000) : [];
    const existingSettings = await session.db.select({ contentVersion: studySettings.contentVersion }).from(studySettings).where(eq(studySettings.userId, session.user.userId));
    const statements = existingSettings[0]?.contentVersion && existingSettings[0].contentVersion !== contentVersion
      ? [session.db.delete(reviewLogs).where(eq(reviewLogs.userId, session.user.userId)), session.db.delete(cards).where(eq(cards.userId, session.user.userId))]
      : [];
    statements.push(session.db.insert(studySettings).values({ userId: session.user.userId, contentVersion, lastStreakDate: payload.lastStreakDate ?? null, reviewedDate: payload.reviewedDate ?? null, dailyDueDate: payload.dailyDueDate ?? null, dailyDueIds: JSON.stringify((payload.dailyDueIds ?? []).slice(0, 5000)), dailyReviewedIds: JSON.stringify((payload.dailyReviewedIds ?? []).slice(0, 5000)), ...settings, streak: payload.streak ?? 0, longestStreak: payload.longestStreak ?? 0, boosts: payload.boosts ?? 0, reviewedToday: payload.reviewedToday ?? 0, updatedAt: new Date().toISOString() }).onConflictDoUpdate({ target: studySettings.userId, set: { contentVersion, lastStreakDate: payload.lastStreakDate ?? null, reviewedDate: payload.reviewedDate ?? null, dailyDueDate: payload.dailyDueDate ?? null, dailyDueIds: JSON.stringify((payload.dailyDueIds ?? []).slice(0, 5000)), dailyReviewedIds: JSON.stringify((payload.dailyReviewedIds ?? []).slice(0, 5000)), ...settings, streak: payload.streak ?? 0, longestStreak: payload.longestStreak ?? 0, boosts: payload.boosts ?? 0, reviewedToday: payload.reviewedToday ?? 0, updatedAt: new Date().toISOString() } }));
    for (const card of incomingCards) {
      statements.push(session.db.insert(cards).values({ id: card.id, userId: session.user.userId, deckId: session.deckId, english: card.english.slice(0, 1000), spanish: card.spanish.slice(0, 1000), notes: card.notes.slice(0, 4000), tags: JSON.stringify(card.tags.slice(0, 30)), state: card.state, due: card.due, interval: card.interval, reviews: card.reviews, lapses: card.lapses, stability: card.stability, difficulty: card.difficulty, fsrs: JSON.stringify(card.fsrs ?? {}), suspended: Boolean(card.suspended), lastReviewed: card.lastReviewed ?? null, updatedAt: new Date().toISOString() }).onConflictDoUpdate({ target: cards.id, set: { english: card.english.slice(0, 1000), spanish: card.spanish.slice(0, 1000), notes: card.notes.slice(0, 4000), tags: JSON.stringify(card.tags.slice(0, 30)), state: card.state, due: card.due, interval: card.interval, reviews: card.reviews, lapses: card.lapses, stability: card.stability, difficulty: card.difficulty, fsrs: JSON.stringify(card.fsrs ?? {}), suspended: Boolean(card.suspended), lastReviewed: card.lastReviewed ?? null, updatedAt: new Date().toISOString() } }));
    }
    for (const log of incomingLogs) {
      statements.push(session.db.insert(reviewLogs).values({ id: log.id, userId: session.user.userId, cardId: log.cardId, reviewedAt: log.reviewedAt, rating: log.rating, duration: log.duration, previousDue: log.previousDue, resultingDue: log.resultingDue }).onConflictDoNothing());
    }
    await session.db.batch(statements);
    return Response.json({ ok: true, syncedAt: new Date().toISOString() });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to sync study data" }, { status: 500 });
  }
}
