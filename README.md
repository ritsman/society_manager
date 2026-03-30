This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Docker Deployment

This repo now includes:

- [`Dockerfile`](/Users/riteshmangwani/Documents/software/society_manager/Dockerfile)
- [`docker-compose.yml`](/Users/riteshmangwani/Documents/software/society_manager/docker-compose.yml)
- [`.env.docker.example`](/Users/riteshmangwani/Documents/software/society_manager/.env.docker.example)

### 1. Prepare environment

Copy the example environment file and update it for your VPS/domain:

```bash
cp .env.docker.example .env.docker
```

Set at least:

```env
DATABASE_URL="postgresql://society_user:society_password@db:5432/society_db?schema=public"
NEXTAUTH_URL="https://your-domain.com"
NEXTAUTH_SECRET="your-long-random-secret"
```

The app container is configured to run on port `4000`.

### 2. Start the stack

```bash
docker compose up --build -d
```

The setup includes:

- `app`: Next.js application
- `db`: PostgreSQL 16
- `postgres_data` Docker volume for persistent database storage

The app will be available internally on:

```text
http://127.0.0.1:4000
```

### 3. Seed default users and ledger heads

Run these after the containers are up:

```bash
docker compose exec app npx tsx prisma/seed.ts
docker compose exec app npx tsx prisma/seed-ledger.ts
```

Default users created by the seed:

- `superadmin@societymanager.com`
- `admin@societymanager.com`

Default password for both:

- `admin@123`

### 4. Apache reverse proxy

If Apache is already running on your VPS, proxy your domain to the app container:

```apache
ProxyPreserveHost On
ProxyPass / http://127.0.0.1:4000/
ProxyPassReverse / http://127.0.0.1:4000/
```

Then attach SSL with Let’s Encrypt as usual on Apache.

### 5. Updating later

When app code changes:

```bash
docker compose up --build -d
```

If the Prisma schema changes:

```bash
docker compose exec app npx prisma db push
```

Database data remains safe as long as the `postgres_data` volume is kept and backed up.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!
