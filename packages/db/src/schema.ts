import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const systemHealth = pgTable("system_health", {
  id: text("id").primaryKey(),
  status: text("status").notNull(),
  checkedAt: timestamp("checked_at", { withTimezone: true }).defaultNow().notNull(),
});
