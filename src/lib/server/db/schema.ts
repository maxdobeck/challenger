import {
	pgTable,
	serial,
	integer,
	text,
	timestamp,
	date,
	boolean,
	primaryKey
} from 'drizzle-orm/pg-core';
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

export const tournament = pgTable('tournament', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	startDate: date('start_date').notNull(),
	endDate: date('end_date').notNull(),
	location: text('location').notNull(),
	address: text('address'),
	details: text('details'),
	createdById: text('created_by_id').references(() => user.id, { onDelete: 'set null' }),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const tournamentAttendee = pgTable(
	'tournament_attendee',
	{
		tournamentId: integer('tournament_id')
			.notNull()
			.references(() => tournament.id, { onDelete: 'cascade' }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		registeredAt: timestamp('registered_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => [primaryKey({ columns: [table.tournamentId, table.userId] })]
);

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
	tournamentId: integer('tournament_id').references(() => tournament.id, {
		onDelete: 'set null'
	}),
	player1Crit: integer('player1_crit').notNull().default(0),
	player1Tac: integer('player1_tac').notNull().default(0),
	player1Kill: integer('player1_kill').notNull().default(0),
	player1Primary: integer('player1_primary').notNull().default(0),
	player1PrimaryOpChoice: text('player1_primary_op_choice', { enum: ['crit', 'kill', 'tac'] }),
	player2Crit: integer('player2_crit').notNull().default(0),
	player2Tac: integer('player2_tac').notNull().default(0),
	player2Kill: integer('player2_kill').notNull().default(0),
	player2Primary: integer('player2_primary').notNull().default(0),
	player2PrimaryOpChoice: text('player2_primary_op_choice', { enum: ['crit', 'kill', 'tac'] }),
	playedAt: timestamp('played_at', { withTimezone: true }).notNull().defaultNow(),
	notes: text('notes')
});

// One row per photo/text scan attempt, used to enforce a 20-scans-per-24h cap in real-DB mode
// (demo mode enforces the same cap via a cookie instead, since it has no durable per-user store).
export const scanEvent = pgTable('scan_event', {
	id: serial('id').primaryKey(),
	userId: text('user_id')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
	// LD AI Config tracker resumption token for the completion this scan produced --
	// lets a later feedback request reconstruct the same tracker (same runId) so
	// trackFeedback() correlates with the original generation instead of a new one.
	resumptionToken: text('resumption_token'),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

// One row per thumbs up/down on a score reading. scanEventId is nullable because demo
// mode has no scan_event row to reference (see scanEvent's comment above); the feedback
// signal still reaches LaunchDarkly in that case, it just isn't durably attributable here.
export const scanFeedback = pgTable('scan_feedback', {
	id: serial('id').primaryKey(),
	scanEventId: integer('scan_event_id').references(() => scanEvent.id, { onDelete: 'set null' }),
	userId: text('user_id')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
	aiConfigKey: text('ai_config_key').notNull(),
	kind: text('kind', { enum: ['positive', 'negative'] }).notNull(),
	comment: text('comment'),
	correctedCrit: integer('corrected_crit'),
	correctedKill: integer('corrected_kill'),
	correctedTac: integer('corrected_tac'),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const userProfile = pgTable('user_profile', {
	userId: text('user_id')
		.primaryKey()
		.references(() => user.id, { onDelete: 'cascade' }),
	hasPlayedTournament: boolean('has_played_tournament').notNull().default(false),
	totalMatches: integer('total_matches').notNull().default(0),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export * from './auth.schema';
