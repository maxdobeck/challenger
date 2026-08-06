import { pgTable, serial, integer, text, timestamp } from 'drizzle-orm/pg-core';
import { user } from './auth.schema';

export const task = pgTable('task', {
	id: serial('id').primaryKey(),
	title: text('title').notNull(),
	priority: integer('priority').notNull().default(1)
});

export const team = pgTable('team', {
	id: serial('id').primaryKey(),
	name: text('name').notNull().unique()
});

export const match = pgTable('match', {
	id: serial('id').primaryKey(),
	player1Id: text('player1_id')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
	player2Id: text('player2_id')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
	player1TeamId: integer('player1_team_id')
		.notNull()
		.references(() => team.id),
	player2TeamId: integer('player2_team_id')
		.notNull()
		.references(() => team.id),
	tournament: text('tournament'),
	player1Crit: integer('player1_crit').notNull().default(0),
	player1Tac: integer('player1_tac').notNull().default(0),
	player1Kill: integer('player1_kill').notNull().default(0),
	player1Primary: integer('player1_primary').notNull().default(0),
	player2Crit: integer('player2_crit').notNull().default(0),
	player2Tac: integer('player2_tac').notNull().default(0),
	player2Kill: integer('player2_kill').notNull().default(0),
	player2Primary: integer('player2_primary').notNull().default(0),
	playedAt: timestamp('played_at', { withTimezone: true }).notNull().defaultNow(),
	notes: text('notes')
});

export * from './auth.schema';
