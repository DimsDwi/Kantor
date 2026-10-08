import { sqliteTable, text, integer, index, primaryKey, check } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
const created = () => text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`);
const updated = () => text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`);
export const profiles = sqliteTable('profiles', {
 id: text('id').primaryKey(), full_name: text('full_name').notNull(), email: text('email').notNull().unique(),
 employee_id: text('employee_id').notNull().unique(), department: text('department').notNull(), position: text('position').notNull(),
 phone: text('phone').notNull().default(''), role: text('role').notNull().default('employee'), status: text('status').notNull().default('active'),
 avatar_url: text('avatar_url'), password_hash: text('password_hash').notNull(), created_at: created(), updated_at: updated(),
}, t => [check('profile_role',sql`${t.role} IN ('admin','employee')`),check('profile_status',sql`${t.status} IN ('active','inactive')`)]);
export const rooms = sqliteTable('rooms', {
 id:text('id').primaryKey(),room_name:text('room_name').notNull(),building:text('building').notNull(),floor:text('floor').notNull(),room_number:text('room_number').notNull(),
 capacity:integer('capacity').notNull(),description:text('description').notNull(),image_url:text('image_url').notNull().default(''),status:text('status').notNull().default('available'),
 operating_start:text('operating_start').notNull().default('08:00'),operating_end:text('operating_end').notNull().default('18:00'),created_at:created(),updated_at:updated(),
}, t=>[check('room_capacity',sql`${t.capacity}>0`),check('room_status',sql`${t.status} IN ('available','maintenance','unavailable')`),check('room_hours',sql`${t.operating_end}>${t.operating_start}`)]);
export const facilities=sqliteTable('facilities',{id:text('id').primaryKey(),name:text('name').notNull().unique(),icon:text('icon').notNull().default('check'),created_at:created()});
export const roomFacilities=sqliteTable('room_facilities',{room_id:text('room_id').notNull().references(()=>rooms.id,{onDelete:'cascade'}),facility_id:text('facility_id').notNull().references(()=>facilities.id,{onDelete:'cascade'})},t=>[primaryKey({columns:[t.room_id,t.facility_id]})]);
export const bookings=sqliteTable('bookings',{
 id:text('id').primaryKey(),user_id:text('user_id').notNull().references(()=>profiles.id),room_id:text('room_id').notNull().references(()=>rooms.id),
 booking_date:text('booking_date').notNull(),start_time:text('start_time').notNull(),end_time:text('end_time').notNull(),purpose:text('purpose').notNull(),participant_count:integer('participant_count').notNull(),
 contact_number:text('contact_number').notNull(),notes:text('notes').notNull().default(''),status:text('status').notNull().default('pending'),rejection_reason:text('rejection_reason'),
 approved_by:text('approved_by').references(()=>profiles.id),approved_at:text('approved_at'),actor_id:text('actor_id').notNull().references(()=>profiles.id),
 request_key:text('request_key').notNull().unique(),created_at:created(),updated_at:updated(),
}, t=>[index('idx_bookings_room_date').on(t.room_id,t.booking_date,t.status),index('idx_bookings_user_date').on(t.user_id,t.booking_date),check('booking_time',sql`${t.end_time}>${t.start_time}`),check('booking_count',sql`${t.participant_count}>0`),check('booking_status',sql`${t.status} IN ('pending','approved','rejected','cancelled','completed')`),check('reject_reason',sql`${t.status}!='rejected' OR length(trim(${t.rejection_reason}))>0`)]);
export const notifications=sqliteTable('notifications',{id:text('id').primaryKey(),user_id:text('user_id').notNull().references(()=>profiles.id),title:text('title').notNull(),message:text('message').notNull(),type:text('type').notNull(),reference_id:text('reference_id'),is_read:integer('is_read').notNull().default(0),dedupe_key:text('dedupe_key').unique(),created_at:created()},t=>[index('idx_notifications_user').on(t.user_id,t.is_read)]);
export const activityLogs=sqliteTable('activity_logs',{id:text('id').primaryKey(),user_id:text('user_id').references(()=>profiles.id),action:text('action').notNull(),entity_type:text('entity_type').notNull(),entity_id:text('entity_id'),description:text('description').notNull(),created_at:created()},t=>[index('idx_logs_created').on(t.created_at)]);
export const sessions=sqliteTable('sessions',{id:text('id').primaryKey(),user_id:text('user_id').notNull().references(()=>profiles.id,{onDelete:'cascade'}),expires_at:integer('expires_at').notNull(),created_at:created()},t=>[index('idx_sessions_user').on(t.user_id)]);
export const loginAttempts=sqliteTable('login_attempts',{key:text('key').primaryKey(),count:integer('count').notNull().default(0),reset_at:integer('reset_at').notNull()});
export const resetRequests=sqliteTable('reset_requests',{id:text('id').primaryKey(),user_id:text('user_id').notNull().references(()=>profiles.id),status:text('status').notNull().default('pending'),created_at:created()});
export const documents=sqliteTable('documents',{id:text('id').primaryKey(),user_id:text('user_id').notNull().references(()=>profiles.id),booking_id:text('booking_id').references(()=>bookings.id),object_key:text('object_key').notNull().unique(),filename:text('filename').notNull(),content_type:text('content_type').notNull(),size:integer('size').notNull(),created_at:created()});
