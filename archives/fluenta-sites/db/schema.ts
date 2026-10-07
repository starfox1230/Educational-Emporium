import { sql } from "drizzle-orm";
import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
};

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  ...timestamps,
});

export const decks = sqliteTable("decks", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  language: text("language").notNull().default("es"),
  ...timestamps,
});

export const cards = sqliteTable("cards", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  deckId: text("deck_id").notNull().references(() => decks.id),
  english: text("english").notNull(),
  spanish: text("spanish").notNull(),
  notes: text("notes").notNull().default(""),
  tags: text("tags").notNull().default("[]"),
  state: text("state").notNull().default("new"),
  due: text("due").notNull(),
  interval: text("interval").notNull().default("new"),
  reviews: integer("reviews").notNull().default(0),
  lapses: integer("lapses").notNull().default(0),
  stability: real("stability").notNull().default(0),
  difficulty: real("difficulty").notNull().default(0),
  fsrs: text("fsrs").notNull().default("{}"),
  suspended: integer("suspended", { mode: "boolean" }).notNull().default(false),
  lastReviewed: text("last_reviewed"),
  ...timestamps,
});

export const reviewLogs = sqliteTable("review_logs", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  cardId: text("card_id").notNull().references(() => cards.id),
  reviewedAt: text("reviewed_at").notNull(),
  rating: text("rating").notNull(),
  duration: integer("duration").notNull().default(0),
  previousDue: text("previous_due").notNull(),
  resultingDue: text("resulting_due").notNull(),
});

export const studySettings = sqliteTable("study_settings", {
  userId: text("user_id").primaryKey().references(() => users.id),
  contentVersion: text("content_version").notNull().default("legacy"),
  lastStreakDate: text("last_streak_date"),
  reviewedDate: text("reviewed_date"),
  dailyDueDate: text("daily_due_date"),
  dailyDueIds: text("daily_due_ids").notNull().default("[]"),
  dailyReviewedIds: text("daily_reviewed_ids").notNull().default("[]"),
  retention: real("retention").notNull().default(0.9),
  timerEnabled: integer("timer_enabled", { mode: "boolean" }).notNull().default(true),
  questionSeconds: integer("question_seconds").notNull().default(20),
  answerSeconds: integer("answer_seconds").notNull().default(12),
  streakEnabled: integer("streak_enabled", { mode: "boolean" }).notNull().default(true),
  boostEnabled: integer("boost_enabled", { mode: "boolean" }).notNull().default(true),
  soundEnabled: integer("sound_enabled", { mode: "boolean" }).notNull().default(false),
  hapticsEnabled: integer("haptics_enabled", { mode: "boolean" }).notNull().default(true),
  reducedEffects: integer("reduced_effects", { mode: "boolean" }).notNull().default(false),
  streak: integer("streak").notNull().default(0),
  longestStreak: integer("longest_streak").notNull().default(0),
  boosts: integer("boosts").notNull().default(3),
  reviewedToday: integer("reviewed_today").notNull().default(0),
  ...timestamps,
});
