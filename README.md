# Little Days

A tiny personal countdown ritual.

## Stack

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS
- Supabase Auth + Postgres
- PWA

The current first screen is intentionally usable without a Supabase key: countdowns and today's check-in persist locally. The Supabase migration is included in `supabase/migrations/` so cloud persistence can be enabled without changing the product model.

## Local development

```bash
npm install
cp .env.example .env.local
npm run dev
```

## Supabase

Run `supabase/migrations/001_little_days.sql` in the Supabase SQL Editor, then add the project's publishable key to `.env.local`.

Do not commit `.env.local`.

## Product direction

Little Days treats time as a garden: days that have passed become flowers, today is a bud, and future days remain quiet seeds. The interface should stay calm, tactile, and personal rather than becoming a generic productivity dashboard.