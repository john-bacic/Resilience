# Unshaken (Resilience App)

Next.js app for daily resilience training with a 30-day flow:

- Morning scenario + reflection
- Real-life event logging with trigger analysis
- Diary and progress tracking

## Stack

- Next.js App Router
- React
- Tailwind CSS
- Vercel Postgres (`@vercel/postgres`)

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Add env vars in `.env.local` from your Vercel Postgres project:

   - `POSTGRES_URL`
   - `POSTGRES_PRISMA_URL`
   - `POSTGRES_URL_NON_POOLING`
   - `POSTGRES_USER`
   - `POSTGRES_HOST`
   - `POSTGRES_PASSWORD`
   - `POSTGRES_DATABASE`

3. Run:

   ```bash
   npm run dev
   ```

Open [http://localhost:3000](http://localhost:3000).

## Deploy on Vercel

1. Push this repo to GitHub.
2. Import the repo in Vercel.
3. Add a Postgres database in Vercel Storage.
4. Attach the Postgres integration to this project (env vars are auto-injected).
5. Deploy.

The API route `app/api/state/route.js` auto-creates the `app_state` table on first request.
