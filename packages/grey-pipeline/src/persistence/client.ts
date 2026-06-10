// grey-pipeline — Drizzle client factory for the grey_two schema.
// Replaces plugin-wpv's WpvService.resolveDb (postgres() + drizzle()).

import postgres from 'postgres';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from './schema';

export type GreyDb = PostgresJsDatabase<typeof schema>;

/**
 * Build a Drizzle client against the grey_two schema.
 * `prepare: false` keeps it compatible with Supabase's transaction-mode pooler
 * (port 6543), which the runtime GREY_DATABASE_URL uses.
 */
export function createDb(connectionString: string): GreyDb {
  const client = postgres(connectionString, { prepare: false });
  return drizzle(client, { schema });
}
