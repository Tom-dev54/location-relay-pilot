// Intentionally empty by default.
// Add Drizzle tables here when the site actually needs a database.
// See examples/d1/db/schema.ts for an opt-in example.
import { sqliteTable, text, integer, real, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
export const invitations = sqliteTable('invitations', {
 id: text('id').primaryKey(), ownerId: text('owner_id').notNull(), label: text('label').notNull(), tokenHash: text('token_hash').notNull(), createdAt: integer('created_at').notNull(), expiresAt: integer('expires_at').notNull(),
}, t => [index('idx_invitation_owner_created').on(t.ownerId,t.createdAt),uniqueIndex('idx_invitation_token').on(t.tokenHash)]);
export const positions = sqliteTable('positions', {
 requestId: text('request_id').primaryKey().references(()=>invitations.id,{onDelete:'cascade'}), submissionId:text('submission_id').notNull(), lat:real('lat').notNull(), lon:real('lon').notNull(), accuracy:real('accuracy').notNull(), crs:text('crs').notNull(), capturedAt:integer('captured_at').notNull(), receivedAt:integer('received_at').notNull(),
});

// Separate reports keep existing invitations and legacy reports intact.
export const reports = sqliteTable('reports', {
 id:text('id').primaryKey(), requestId:text('request_id').notNull().references(()=>invitations.id,{onDelete:'cascade'}), submissionId:text('submission_id').notNull(), lat:real('lat').notNull(), lon:real('lon').notNull(), accuracy:real('accuracy').notNull(), crs:text('crs').notNull(), capturedAt:integer('captured_at').notNull(), receivedAt:integer('received_at').notNull(),
},t=>[uniqueIndex('idx_report_submission').on(t.requestId,t.submissionId),index('idx_report_received').on(t.receivedAt)]);

// Public test reports are explicitly separate from private legacy invitations.
export const publicPositions=sqliteTable('public_positions',{
 id:text('id').primaryKey(),label:text('label').notNull(),lat:real('lat').notNull(),lon:real('lon').notNull(),accuracy:real('accuracy').notNull(),crs:text('crs').notNull(),capturedAt:integer('captured_at').notNull(),receivedAt:integer('received_at').notNull(),mode:text('mode').notNull(),
 initialSnapshot:text('initial_snapshot'),updateTokenHash:text('update_token_hash'),revision:integer('revision').notNull().default(0),updatedAt:integer('updated_at'),
},t=>[index('idx_public_received').on(t.receivedAt)]);

// Shared, short-lived provider results. Never contains Key/security code.
export const mapCache=sqliteTable('map_cache',{
 cacheKey:text('cache_key').primaryKey(),body:text('body').notNull(),expiresAt:integer('expires_at').notNull(),
},t=>[index('idx_map_cache_expiry').on(t.expiresAt)]);
export const mapUsage=sqliteTable('map_usage',{
 bucket:text('bucket').primaryKey(),day:text('day').notNull(),dailyCount:integer('daily_count').notNull(),monthlyCount:integer('monthly_count').notNull(),
});
