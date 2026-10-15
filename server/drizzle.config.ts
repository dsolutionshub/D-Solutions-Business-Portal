import { defineConfig } from 'drizzle-kit';

// `npm run db:generate -w server` writes SQL migrations that wrangler applies to D1.
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './migrations'
});
