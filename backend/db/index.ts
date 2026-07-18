import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { getDatabaseUrl } from '../config';
import * as schema from './schema';

// Create a postgres client for queries
const queryClient = postgres(getDatabaseUrl());

// Create Drizzle ORM instance with schema
export const db = drizzle(queryClient, { schema });

// Export the query client for advanced usage
export { queryClient };

// Export schema for convenience
export * from './schema';
