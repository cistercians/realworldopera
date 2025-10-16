# Quick Start Guide

Get Real World Opera running in 5 minutes!

## Prerequisites

- Node.js 22.11.0+ installed
- A Supabase account (free tier is fine)

## Step 1: Install Dependencies

```bash
npm install
```

## Step 2: Set Up Supabase

### Create Project
1. Go to [https://app.supabase.com](https://app.supabase.com)
2. Click "New Project"
3. Name it "realworldopera" (or anything you like)
4. Wait ~2 minutes for setup

### Get API Keys
1. Go to **Settings** → **API** in your Supabase project
2. Copy:
   - Project URL
   - anon public key
   - service_role key (keep this secret!)

### Update Environment Variables
Edit `.env` file:
```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJhbGc...your_anon_key
SUPABASE_SERVICE_KEY=eyJhbGc...your_service_key
```

## Step 3: Create Database Schema

1. In Supabase dashboard, go to **SQL Editor**
2. Click "New query"
3. Copy entire contents of `database/schema.sql`
4. Paste and click "Run"
5. You should see success messages!

## Step 4: Start the Server

```bash
npm start
```

You should see:
```
Supabase: Client initialized
Server is listening on port 3000
```

## Step 5: Open the App

Open your browser to:
```
http://localhost:3000
```

## Step 6: Create an Account

In the browser, you'll use Supabase Auth to create an account:

1. Click "ENTER" (desktop) or start directly (mobile)
2. Type: `/register username password`
3. Or type: `/login username password` if you already have an account

## Next Steps

- Read [SUPABASE_SETUP.md](./SUPABASE_SETUP.md) for detailed Supabase configuration
- Read [README.md](./README.md) for full command reference
- Read [ROADMAP.md](./ROADMAP.md) for development plans

## Troubleshooting

### "Missing or invalid environment variables"
➜ Make sure you've updated `.env` with your Supabase keys

### "npm install" takes forever
➜ Try: `rm -rf node_modules package-lock.json && npm install`

### Port 3000 already in use
➜ Change `PORT=3001` in `.env`

### Can't connect to Supabase
➜ Double-check your SUPABASE_URL and keys in `.env`

### Schema SQL fails to run
➜ Make sure you're running it in the Supabase SQL Editor, not your local terminal

## Development Mode

For development with auto-restart on file changes:

```bash
npm run dev
```

## Available Commands (in app)

Once logged in, try these:

- `/login username password` - Login
- `/loc` - Request your location
- `#projectname` - Create/open a project
- `+loc Times Square, New York` - Add a location
- `/orbit` - Toggle map rotation
- `/center` - Center view on project

## Need Help?

- Check the logs in your terminal
- Check Supabase logs in dashboard → **Logs** → **API**
- Open an issue on GitHub

---

**You're all set!** 🎉 Start exploring your geospatial data.

