import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";

export const accountsTable = pgTable(
  "accounts",
  {
    id: serial("id").primaryKey(),
    username: text("username").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    bank: integer("bank").notNull().default(0),
    inventory: jsonb("inventory")
      .$type<string[]>()
      .notNull()
      .default([]),
    equipped: jsonb("equipped")
      .$type<{ cardBack?: string; nameColor?: string; title?: string }>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);

export const sessionsTable = pgTable(
  "sessions",
  {
    token: text("token").primaryKey(),
    accountId: integer("account_id")
      .notNull()
      .references(() => accountsTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("sessions_account_idx").on(t.accountId)],
);

export type Account = typeof accountsTable.$inferSelect;
export type Session = typeof sessionsTable.$inferSelect;
