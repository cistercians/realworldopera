# Supabase Setup Guide

This guide will walk you through setting up Supabase for Real World Opera.

## Step 1: Create Supabase Project

1. Go to [https://app.supabase.com](https://app.supabase.com)
2. Sign in or create an account
3. Click "New Project"
4. Fill in:
   - **Name**: realworldopera (or your preferred name)
   - **Database Password**: Choose a strong password (save this!)
   - **Region**: Choose closest to your users
5. Click "Create new project" and wait ~2 minutes for setup

## Step 2: Get Your API Keys

1. In your project dashboard, go to **Settings** → **API**
2. Copy these values:
   - **Project URL**: `https://xxxxx.supabase.co`
   - **anon public**: This is your `SUPABASE_ANON_KEY`
   - **service_role secret**: This is your `SUPABASE_SERVICE_KEY` ⚠️ Keep this secret!

3. Update your `.env` file:
```bash
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_KEY=your_service_role_key_here
```

## Step 3: Set Up Database Schema

1. In your Supabase dashboard, go to **SQL Editor**
2. Click "New query"
3. Copy and paste the SQL from `database/schema.sql` (see below)
4. Click "Run" to execute

## Step 4: Configure Auth

1. Go to **Authentication** → **Providers**
2. **Email** provider is enabled by default - you're good!
3. Optional: Enable other providers (Google, GitHub, etc.)

### Auth Settings (Optional but Recommended)

1. Go to **Authentication** → **URL Configuration**
2. Set your **Site URL**: `http://localhost:3000` (dev) or your production URL
3. Add **Redirect URLs**: `http://localhost:3000/*`

## Step 5: Set Up Row Level Security (RLS)

RLS is PostgreSQL's built-in security feature. Our schema includes RLS policies.

**What RLS does:**
- Users can only see their own data
- Users can only modify projects they're part of
- Prevents unauthorized access at the database level

The policies are already in the schema.sql file.

## Step 6: Test Connection

Run your application:
```bash
npm start
```

If you see:
```
Supabase: Client initialized
```

You're connected! 🎉

---

## Database Schema

### Tables Created

1. **profiles** - Extended user data (linked to Supabase Auth)
   - `id` (UUID, references auth.users)
   - `username` (unique)
   - `gematria_value` (for fun!)
   - `last_login`
   - `created_at`, `updated_at`

2. **projects** - Research projects
   - `id` (UUID)
   - `key` (unique project identifier)
   - `locked` (private project)
   - `user_list` (array of user IDs with access)
   - `created_by`
   - `created_at`, `updated_at`

3. **locations** - Geospatial data
   - `id` (UUID)
   - `project_id` (foreign key)
   - `name`, `description`
   - `coords` (POINT geometry for points)
   - `bbox` (POLYGON geometry for areas)
   - `address`, `city`, `country`, etc.
   - `links`, `notes` (arrays)
   - `added_by`
   - `created_at`, `updated_at`

4. **project_logs** - Activity history
   - `id` (UUID)
   - `project_id` (foreign key)
   - `username`
   - `action`, `body`
   - `location` (JSONB)
   - `created_at`

### Indexes

- Geospatial index on `locations.coords` for fast spatial queries
- Index on `projects.key` for fast lookups
- Index on `profiles.username`

---

## Troubleshooting

### "Missing or invalid environment variables"

**Solution**: Make sure you've copied your Supabase URL and keys to `.env`

### "supabase is not defined"

**Solution**: Run `npm install` to install dependencies

### Connection timeouts

**Solution**: Check your Supabase project is active. Free tier projects pause after 1 week of inactivity.

### RLS errors "new row violates row-level security policy"

**Solution**: Make sure users are authenticated before inserting data

---

## Next Steps

After setup:
1. ✅ Test user registration
2. ✅ Create a project
3. ✅ Add a location
4. ✅ View in Supabase dashboard → Table Editor

## Useful Supabase Features

### Real-time Subscriptions

Supabase can notify your app of database changes in real-time:

```javascript
// Subscribe to project changes
supabase
  .channel('projects')
  .on('postgres_changes', 
    { event: '*', schema: 'public', table: 'projects' },
    (payload) => console.log('Project changed:', payload)
  )
  .subscribe();
```

### Automatic API

Supabase generates a REST API for all tables:
```javascript
// Get all projects
const { data } = await supabase
  .from('projects')
  .select('*');

// Get project with locations
const { data } = await supabase
  .from('projects')
  .select(`
    *,
    locations (*)
  `)
  .eq('key', 'myproject');
```

### Storage (for future use)

Upload files/images:
```javascript
const { data, error } = await supabase
  .storage
  .from('project-media')
  .upload('path/to/file.jpg', file);
```

---

## Cost & Limits (Free Tier)

- ✅ 500MB database
- ✅ 1GB file storage
- ✅ 2GB bandwidth/month
- ✅ 50,000 monthly active users
- ✅ Unlimited API requests

**Upgrade if you need:**
- More storage
- Automatic backups
- No project pausing
- Custom domain

---

## Security Best Practices

1. **Never commit `.env`** - It's in `.gitignore`
2. **Keep service_role key secret** - Only use server-side
3. **Use anon key in client** - It's safe to expose
4. **Enable RLS on all tables** - Already done in schema
5. **Validate all inputs** - We use Joi for this
6. **Use HTTPS in production** - Required for Supabase

---

## Support

- **Supabase Docs**: https://supabase.com/docs
- **Supabase Discord**: https://discord.supabase.com
- **Project Issues**: (your GitHub repo)

