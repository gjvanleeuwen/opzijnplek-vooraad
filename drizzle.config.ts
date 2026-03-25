import { defineConfig } from 'drizzle-kit';

export default defineConfig({
	schema: './src/lib/server/db/schema.ts',
	dialect: 'sqlite',
	dbCredentials: { url: process.env.DATABASE_PATH || './data/opzijnplek.db' },
	verbose: true,
	strict: true
});
