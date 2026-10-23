# Lead Tracker

<!--
  PUBLISHER: after you put this folder in a PUBLIC GitHub repository, replace droisyscloud/LeadTracker
  below with your repository's name (for example droisys/lead-tracker). The button only works for public repositories.
-->
[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/droisyscloud/LeadTracker)

**New here? Start with [DEPLOY.md](DEPLOY.md).** It walks you through putting Lead Tracker online for your company, step by step, in about 45 minutes. No programming needed. The button above starts Part 1 of that guide in one click.

**Need help?** See [Getting help](#getting-help) at the end of this page.

Lead Tracker is a web app for following up event leads as a team: capture leads, group them by company, tag the products they care about, send and log follow-ups, and see pipeline and team metrics on one dashboard. People sign in with an email and password or through your company's single sign-on (SSO), and every action is checked against the person's role on the server.

## What's inside

| Area | What it does |
| --- | --- |
| **Home** | All metrics in one place: leads, open pipeline (total and weighted), % contacted, emails, calls, due today, reply-rate ring, 14-day team activity, today's follow-ups, my tasks, leaderboard, open requests, pipeline stages, interest by product, top companies, recent activity |
| **Follow-ups** | Today's queue (overdue, due today, never contacted), scheduled follow-ups, and leads going cold |
| **Tasks** | To-dos with due dates and owners, linked to a lead, company or deal; overdue, due today and upcoming views |
| **Contacts** | Filter by stage, owner, product and event. Each lead has stage, owner, next follow-up, rating, tags, products, source, "introduced by", event, deals, tasks, sequence status and a full timeline |
| **Follow-up actions** | Send email (with open tracking), open in your mail app, AI drafts, templates, log calls, replies, requests, meetings, notes and files, book a meeting from your real calendar, add to a sequence, push to HubSpot |
| **Mailbox sync** | Each person can connect Microsoft 365 or Google Workspace. Replies from leads, and emails sent to them from Outlook or Gmail, are logged automatically |
| **Calendar booking** | Shows your free 15 to 60 minute slots for the next 10 working days, sends the invite with a Teams or Meet link, and logs the meeting |
| **Deals** | Opportunities with value, currency, product, stage, probability and expected close date; board by stage; won and lost reasons |
| **Sequences** | Multi-step automatic emails (for example day 0, 4 and 10). They stop as soon as the person replies or the lead is closed |
| **Events** | every trade show or event, with leads, contacts, meetings, pipeline, won value, cost and cost per lead side by side |
| **Reports** | Forecast by close month, lead sources and conversion, top introducers, why we win, why we lose, team performance |
| **Companies** | Automatic grouping and merge, website, industry, location, size, description. "Fill from website" reads their homepage. Each company shows its deals, tasks, people and products |
| **Products** | Add, rename and delete products; interested leads grouped by company (add your own products and plans) |
| **Teams** | Create teams (for example East region, Enterprise accounts) with a lead, members, the products they sell and a revenue target. Move leads into teams one by one or in bulk, and see each team's leads, contact rate, emails, reply rate, calls, meetings, pipeline, weighted forecast, won value, win rate, target progress and per-member performance. Home, Reports, Contacts and Deals can all be filtered to one team, and a comparison table ranks every team |
| **Users** | Invites with roles, role changes, disable access, audit log |
| **Settings** | Integration status, background jobs (with "Run now"), website form code, and duplicate people with one-click merge |
| **Account** | Who you are signed in as, mailbox connection, daily digest and time zone, sign out |
| **Digests** | A weekday morning email per person with their follow-ups, tasks due and leads going cold, plus an optional daily team summary in Slack or Teams |
| **Intake and integrations** | Website form intake, HubSpot push, an outbound webhook for Salesforce or anything else, badge and business card scan (including the phone camera), CSV export |

## Teams

Managers create teams on the **Teams** page and set each one's lead, members, products and revenue target. A team lead can add or remove members, products and leads for their own team.

New leads and deals are filed under the creator's team automatically when that person belongs to exactly one team. Leads can also be moved with **Add leads**, which can filter by product interest, or from the Team field on any lead.

Every dashboard has a **Showing: All teams / one team** switch, so the same metrics are available per team.

## Trying it with sample data

`npm run db:demo` loads fictional sample teammates, companies, leads, two teams, eight deals, tasks and two weeks of activity (every address uses the reserved `.example` domain, so nothing can reach a real person), so you can see the dashboards filled in. Use it only on a test database. It refuses to run when `NODE_ENV=production` unless `ALLOW_DEMO=true` is set.

## Who sees what

Access is enforced by the server on every request (see `src/lib/access.ts`); anything a person can't see answers "not found".

| Role | Sees | Can change |
| --- | --- | --- |
| Admin | Everything | Everything, plus users, roles, teams and the audit log |
| Manager | Everything in the teams they belong to or lead (the team's leads, and leads, deals and tasks of its members), unassigned leads, and anything shared with them | What they can see; reassigns, merges, deletes and exports within their teams |
| Sales rep | Leads they own, plus leads shared with them (a task about the lead assigned or tagged to them, or an @mention in its discussion) | Their own leads; shared leads are read and comment only. No team pages |
| Viewer | Leads assigned to them, plus anything shared with them | Nothing; can reply when mentioned |

Teams are chosen when inviting someone (Users page) and can be changed there at any time. A manager sees a team's work only while they are in that team.

## Roles

Roles are enforced in the API on every request. Hiding buttons in the screen is a convenience, not the protection.

| Role | Can |
| --- | --- |
| Admin | Everything a manager can, plus invite people, change roles, disable access and see the audit log |
| Manager | See and edit every lead, reassign owners, merge and delete companies, manage products, delete records, export CSV |
| Sales rep | Add leads and import badges, send and log follow-ups, attach files, tag products, claim unassigned leads. Can only delete what they added and entries they logged |
| Viewer | Read-only access to everything |

Safeguards: you cannot remove your own admin access, and the last active admin cannot be demoted or disabled. A disabled person loses access on their very next request, even if their session has not expired.

## How sign-in works

1. A person clicks **Sign in with Microsoft** (or Google, Okta, or your OIDC provider) and authenticates with your company identity provider. The app never sees passwords.
2. The app reads their email from the identity provider and lets them in only if one of these is true:
   - they are already an active member;
   - they have a pending invite, in which case they join with the invite's role;
   - their email is listed in `BOOTSTRAP_ADMIN_EMAILS`, in which case they become an admin;
   - their domain is in `AUTO_JOIN_DOMAINS`, in which case they join as `AUTO_JOIN_ROLE`. This is optional and off by default.
3. Anyone else sees "not invited yet" and stays out.

Sessions are signed, HTTP-only cookies that expire after `SESSION_MAX_AGE_HOURS`. **Sign out** is in the avatar menu (top right) and on the Account page.

## Requirements

- Node.js 20.9 or newer (22 recommended), or Docker
- PostgreSQL 14 or newer
- An app registration in your identity provider (see below)
- Optional: an SMTP mailbox (needed for invites, sending, sequences and digests), an S3 bucket for files, an Anthropic API key for AI features, a HubSpot private app token, and Slack or Teams webhooks

## Quick start with Docker

```bash
cp .env.example .env      # fill in the lines marked REQUIRED
export POSTGRES_PASSWORD=$(openssl rand -hex 16)
docker compose up -d --build
```

The container sets up and updates the database on every start. Put HTTPS in front of port 3000 with your load balancer, Nginx or Caddy, because SSO providers require HTTPS redirect URLs in production.

## Running without Docker

```bash
npm ci
cp .env.example .env      # fill it in
npm run setup             # creates the tables and the starter email sequence
npm run build
npm start                 # serves on port 3000
```

To run it under a process manager, for example systemd or pm2, use `npm start` with `NODE_ENV=production`.

## Email and password sign-in

The simplest way to sign in, and the default on Render: no Google Workspace or Microsoft 365 admin access needed. Turn it on with `AUTH_EMAIL_PASSWORD=true`. It can be used alone or alongside single sign-on.

- **The first admin** signs in with the email in `BOOTSTRAP_ADMIN_EMAILS` and the password in `ADMIN_INITIAL_PASSWORD` (at least 10 characters). At that first sign-in it's saved as their own password, so the setting is no longer used. Change it any time on the **Account** page.
- **Teammates** open their invite link, choose a password, and they're in. If email isn't set up, the admin copies the link from **Users & access** and sends it themselves.
- **Forgotten passwords:** an admin clicks **Password link** next to the person in **Users & access** and sends them the link (it works once, for 24 hours). If the app can send email (`SMTP_*`), people can also use **Forgot password?** on the sign-in page.
- **Security:** passwords are stored only as salted scrypt hashes, in a table that is never exported, backed up or sent to a browser. After 8 wrong tries for one email (or 30 from one network address) in 15 minutes, sign-in pauses for that email. Passwords need at least 10 characters. Disabling someone in **Users & access** signs them out on their next click.

To use only Google or Microsoft sign-in, set `AUTH_EMAIL_PASSWORD=false`.

## Setting up single sign-on

Set `APP_URL` and `AUTH_URL` to the public address first. Each provider needs one **redirect URI**:

| Provider | Redirect URI |
| --- | --- |
| Microsoft Entra ID | `https://YOUR-HOST/api/auth/callback/microsoft-entra-id` |
| Google Workspace | `https://YOUR-HOST/api/auth/callback/google` |
| Okta | `https://YOUR-HOST/api/auth/callback/okta` |
| Other OIDC | `https://YOUR-HOST/api/auth/callback/oidc` |

### Microsoft Entra ID (Microsoft 365 / Azure AD)

1. Go to Azure portal → **Microsoft Entra ID** → **App registrations** → **New registration**.
2. Fill in the registration:
   - Name: `Lead Tracker`.
   - Supported account types: **Accounts in this organizational directory only**.
   - Redirect URI: platform **Web**, using the URI from the table above.
3. Copy the **Application (client) ID** into `AUTH_MICROSOFT_ENTRA_ID_ID`, and the **Directory (tenant) ID** into `AUTH_MICROSOFT_ENTRA_ID_TENANT_ID`.
4. Go to **Certificates & secrets** → **New client secret** and copy its **Value** into `AUTH_MICROSOFT_ENTRA_ID_SECRET`. Note the expiry date, because the secret must be renewed before then.
5. Go to **API permissions** and confirm that Microsoft Graph `openid`, `profile`, `email` and `User.Read` are present. Grant admin consent if your tenant requires it.
6. Optional: under **Enterprise applications** → the app → **Properties**, set **Assignment required** to Yes. Then only the users or groups you assign can even reach the login.

### Google Workspace

1. Go to Google Cloud Console → **APIs & Services** → **OAuth consent screen**, choose **Internal**, and fill in the app name.
2. Go to **Credentials** → **Create credentials** → **OAuth client ID** → **Web application**, and add the redirect URI.
3. Put the client ID and secret in `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`. Set `AUTH_GOOGLE_HOSTED_DOMAIN=yourcompany.com`.

### Okta

Create an **OIDC Web Application** with the redirect URI, and assign the people or groups who should have access. Set `AUTH_OKTA_ID`, `AUTH_OKTA_SECRET` and `AUTH_OKTA_ISSUER`, for example `https://yourcompany.okta.com`.

### Any other OIDC provider

Set `AUTH_OIDC_ISSUER` (the URL that serves `/.well-known/openid-configuration`), `AUTH_OIDC_ID`, `AUTH_OIDC_SECRET` and a button label in `AUTH_OIDC_NAME`.

## First login and inviting the team

1. Put your own work email in `BOOTSTRAP_ADMIN_EMAILS` and sign in. You are now an admin.
2. Open **Settings → Company profile** and add your company name, what you sell and your logo.
3. Open **Users & access**, then enter colleagues' emails and pick a role.
   - **If email is configured,** they receive an invite with a link.
   - **If email is not configured,** copy each invite link and send it yourself.
4. When they sign in with SSO using that email, they join with that role. You can change roles or disable people at any time from the Team page.

## Email

Email is used to send invites and to send follow-ups from the app ("Send now").

- **Microsoft 365:** use `SMTP_HOST=smtp.office365.com`, port 587, and a licensed or shared mailbox with SMTP AUTH enabled.
- **Other providers:** SendGrid, Amazon SES, Mailgun and Google Workspace SMTP relay all work too.
- **From address:** follow-ups go out from `MAIL_FROM_ADDRESS` with the salesperson's name, and replies go to the salesperson. Set `MAIL_SEND_AS_USER=true` only if your mail server allows sending as each user.
- **Open tracking:** a 1-pixel image records when an email is opened. Some mail apps block images, so treat opens as a lower bound. Set `EMAIL_OPEN_TRACKING=false` to turn it off.
- **Replies:** these are logged by the salesperson with **Log reply**. The app does not read anyone's inbox.

When `SMTP_HOST` is empty, "Send now" is hidden. People use "Open in my email app and log" instead, and invites show a copy-link button.

## File storage

Files are stored in `UPLOAD_DIR` on the server by default, so back that folder up. For multiple servers or containers, set `S3_BUCKET` and the S3 credentials. Any S3-compatible service works, such as AWS S3, Cloudflare R2 or MinIO; for those, use `S3_ENDPOINT` and `S3_FORCE_PATH_STYLE=true`.

Uploads are limited to `MAX_UPLOAD_MB` each and to these types: images, PDF, Word, Excel, PowerPoint, CSV, text and MP4. Files are only served to signed-in users.

## Background worker

Mailbox sync, sequence sends, digests and automatic HubSpot pushes run on their own inside the app, every few minutes. Nothing extra to set up.

- **If you'd rather run them separately:** set `DISABLE_SCHEDULER=1` on the app and run `npm run worker` next to it, using the same `.env`.
- **Serverless or no long-running process:** have any scheduler call this every 5 minutes:
  `curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://YOUR-HOST/api/cron`
  To run a single job, add `?job=sync`, `sequences`, `digests` or `crm`.

Admins can also run each job from **Settings**, which shows when each one last ran.

## Mailbox and calendar sync

Each person connects their own mailbox on the **Account** page. They grant access once, and can disconnect at any time. Tokens are encrypted in the database with AES-256-GCM, using `TOKEN_ENCRYPTION_KEY` (or `AUTH_SECRET` if that is not set).

The worker checks connected mailboxes every `SYNC_INTERVAL_MIN` minutes. It logs only messages to or from people who are already leads, and only a short preview of each.

**Microsoft 365:** in the same Entra app registration you created for sign-in, add these **delegated** Microsoft Graph permissions:

- `Mail.Read`
- `Calendars.ReadWrite`
- `offline_access`

Then grant admin consent so people are not asked one by one.

**Google Workspace:** in the same OAuth client, add these scopes to the consent screen:

- `gmail.readonly`
- `calendar.events`
- `calendar.freebusy`

Keep the app **Internal** to your Workspace. External apps that read Gmail need Google verification.

Booking uses the connected calendar. It sends the invite to the lead, adds a Teams or Google Meet link if ticked, and logs the meeting on the lead's timeline.

## Sequences, digests and chat summaries

These all need email (SMTP) to be configured.

- **Sequences:** managers create them on the **Sequences** page, and reps add leads to them from a lead's page.
  - Each email is sent from Lead Tracker with replies going to the rep who enrolled the lead.
  - A sequence stops automatically when a reply is logged (manually or by mailbox sync), when the lead is marked Won or Not now, or when it is paused.
- **Digests:** sent on weekdays after `DIGEST_HOUR`, in each person's own time zone. People can turn their digest off on the Account page.
- **Chat summary:** set `SLACK_WEBHOOK_URL` and/or `TEAMS_WEBHOOK_URL` to post a daily team summary to a channel.

## Website form intake

1. Set `INTAKE_KEYS` to one or more random strings.
2. Copy the ready-made form from **Settings** into any page on yourcompany.com.
3. Each submission becomes a lead tagged **Immediate follow-up**, with the message as a request on its timeline. If the email already exists, the request is added to that lead instead of creating a duplicate.

The form has a hidden spam trap and is rate-limited by IP. For JavaScript submissions from your site, list your domains in `INTAKE_ALLOWED_ORIGINS`.

## HubSpot, Salesforce and other systems

**HubSpot:**

1. Create a **private app** with these scopes: `crm.objects.contacts.read/write` and `crm.objects.companies.read/write`.
2. Put its token in `HUBSPOT_TOKEN`.

Leads then get a **Push to HubSpot** button. Contacts are matched by email and companies by website domain, and the two are linked. Set `CRM_AUTO_PUSH_STAGE`, for example `engaged`, to push automatically once a lead reaches that stage.

**Salesforce or anything else:** set `WEBHOOK_URL`, and optionally `WEBHOOK_SECRET`. The app then POSTs JSON for these events:

- `lead.created`
- `contact.stage_changed`
- `deal.created`
- `deal.stage_changed`
- `deal.won`
- `deal.lost`

With a secret set, each request carries an `X-LeadTracker-Signature: sha256=<HMAC of the body>` header. Point it at a Salesforce Flow, MuleSoft, Zapier, Make or Power Automate to create or update records there.

## Tasks

Tasks are a small, complete workflow for getting things done as a team.

- **Create a task:** give it a title, details, an assignee, a due date, a priority (Urgent, High, Normal, Low) and a status (To do, In progress, Waiting on someone, Done). Tag any colleagues who should be kept in the loop. Tasks can be linked to a lead, company or deal.
- **Notifications:** the assignee and tagged people get a notification in the bell at the top of every page, and an email when email sending is on.
- **Reply thread:** each task has its own conversation. Anyone on the task can reply, mention people with @ (which notifies them and adds them to the task), and attach any number of files: images, voice notes recorded in the browser, audio, video, PDF, Word, Excel, PowerPoint and more, up to `TASK_MAX_UPLOAD_MB` each. Files can be dropped or pasted into the reply box.
- **Change log:** every status change, reassignment and re-tag is logged in the thread.
- **Tasks page:** tabs for Assigned to me, Tagged, Created by me and Everyone, with a list view grouped by due date and a board view with drag and drop between statuses.

Who can do what: the creator, the assignee and managers can edit a task. Tagged people can reply and move it between statuses. Viewers can reply only when tagged.

## Reminders and repeating tasks

The assignee gets a bell notification and an email the day before a task is due, and the assignee and creator are alerted once it is overdue. Reminders go out once per due date, from 8am in each person's time zone (`REMINDER_HOUR` to change). Tasks can repeat every day, week, 2 weeks, month or 3 months; finishing one creates the next with the same people and links.

## Sending from your own mailbox and shared templates

When a person connects their Google (or Microsoft) account on the Account page and approves sending, "Send now" and sequences go out from their own mailbox, so emails sit in their Sent folder and replies come back to their inbox. Without a connection, the shared SMTP mailbox is used. Email templates are a shared library anyone can edit from "Manage templates" in the email box.

## Full emails from mailbox sync

Emails exchanged with people already in Lead Tracker are saved in full on the lead: sender, recipients and cc, the complete text, the original formatting (shown in a sandbox with outside images off until requested), and the list of attachments. An attachment is fetched from the mailbox it came from the first time someone opens it, then kept. Replies show the new message first, with earlier messages in the thread folded away. "Re-sync last 30 days in full" on the Account page fills in emails that were saved as short previews before this version.

## Booking meetings and writing emails with AI

"Book meeting" on a lead starts with a month calendar: pick a date, and that day's times appear, with busy times from your calendar crossed out. Choose length and working hours, pick a free time (or type any time), and the invite goes out with a Google Meet or Teams link.

In the email box, "Write with AI" takes instructions typed or spoken (spoken instructions use OpenAI speech-to-text when `OPENAI_API_KEY` is set, otherwise the browser's own dictation). It can write a fresh email or improve the current draft. "Open in Gmail and log" opens a filled-in Gmail draft in a new tab; "Open in mail app and log" hands the email to the computer's mail program.

## Booking page, calendar, saved views and phone app

- **Booking page:** each person can switch on a public page (`/book/<name>`, set up on the Account page) where leads pick a free time from their calendar. The meeting and video link are created, the lead is added or matched, and the owner is notified. Use "Insert my booking link" or `{booking_link}` in emails.
- **Calendar:** tasks, follow-ups, meetings, events and deal close dates by month or week. Drag tasks and follow-ups to another day to move them.
- **Saved views:** save any filters on Contacts or Deals as a named view, personal or shared with the team.
- **Phone app:** install from the account menu (Android) or Safari's Share > Add to Home Screen (iPhone). Quick add (`/quick`) works offline: leads and badge photos wait on the device and are sent when it's back online, without duplicates.

## Team discussion and AI meeting notes

Leads, deals and companies have an internal Team discussion thread with @mentions and attachments. "AI meeting notes" on a lead turns pasted notes or a recording (recordings need `OPENAI_API_KEY`) into a summary, key points and suggested follow-up tasks you review before saving.

## AI summaries

With `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` set, an **AI summary** card appears in four places:

- **Home:** the whole pipeline, or one team when the dashboard is filtered.
- **Each team page.**
- **Each lead.**
- **Each company.**

Each summary gives one headline, what we know, what to watch out for, and what to do next, naming the leads, people, amounts and dates involved. It is written only from Lead Tracker's own data, and the card says so.

Summaries are generated when someone clicks **Summarise** or **Refresh**, never on page load, to keep costs predictable. They are saved for everyone to see. A saved summary shows its age and says when the data has changed since it was written.

Set `DIGEST_AI=true` to add a short "Today's focus" paragraph to each person's daily digest email.

## Company enrichment

**Fill from website** on a company reads that company's public homepage and fills in its description, industry and location. If AI is configured, it writes a short factual summary from the page itself.

Private network addresses are refused. LinkedIn is deliberately not scraped, because its terms forbid it. Add LinkedIn details by hand, or connect a licensed data provider through the webhook.

## AI features (optional)

Set `ANTHROPIC_API_KEY` to turn on **Scan badges** (import leads from screenshots) and **Draft with AI** (personalised follow-up drafts). `ANTHROPIC_MODEL` picks the model. Without a key, these buttons are hidden and everything else works.

## Operations

- **Health check:** `GET /api/health` returns `{"ok":true}` when the app can reach the database.
- **Backups:** back up PostgreSQL daily, for example with `pg_dump`, and back up the upload folder or bucket.
- **Audit log:** role changes, invites, deletes, merges, reassignments and exports are recorded and shown to admins on the Team page.
- **Upgrades:** pull the new code and run `npm ci && npm run build`, then restart. Migrations run with `npm run db:migrate`; the Docker image runs them automatically.
- **Security headers:** the app sends headers that prevent framing and sniffing. Serve it only over HTTPS.

## Local development

```bash
cp .env.example .env
# set DATABASE_URL, AUTH_SECRET, BOOTSTRAP_ADMIN_EMAILS=you@yourcompany.com and AUTH_DEV_LOGIN=true
npm ci && npm run setup && npm run dev
```

`AUTH_DEV_LOGIN=true` adds an email-only login so you can test roles without SSO. It is ignored when `NODE_ENV=production`.

## Project layout

```
src/app/(app)/        signed-in pages: home, followups, contacts, companies, deals, billing, products, team, settings, account
src/app/login/        SSO sign-in page
src/app/api/          REST API (every route checks the role)
src/auth.ts           SSO providers and sign-in rules
src/lib/admission.ts  who may join (invites, bootstrap admins, auto-join domains)
src/lib/jobs.ts       background jobs: mailsync.ts, sequencer.ts, digest.ts, hubspot.ts
scripts/worker.ts     the background worker process
src/db/schema.ts      database tables
drizzle/              SQL migrations
scripts/              migrate, seed (starter sequence) and demo (fictional sample data)
src/lib/brand.ts      app name, company profile and logo
```

## Email compliance, phone notifications, Google Chat and backups

- **Unsubscribe (CAN-SPAM):** every sequence email ends with the company postal address (Settings, "Email compliance") and a personal unsubscribe link, and carries `List-Unsubscribe` and `List-Unsubscribe-Post` headers so Gmail shows its own one-click Unsubscribe. Opening the link shows a confirmation page (link scanners can't unsubscribe anyone); unsubscribing stops all sequences, blocks "Send now", notes it on the timeline and tells the owner. If the person later asks to hear from you again, use "They asked to hear from us again" on the lead (recorded and audited).
- **Phone notifications (Web Push):** Account page, "Turn on for this device". On iPhone/iPad add the app to the home screen first (iOS 16.4+). Alerts for: a lead replied, a booking, a task given or tagged, mentions, replies, due and overdue tasks. Keys are created automatically and stored in the database; set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` only if you want to manage them yourself.
- **Google Chat alerts:** Settings, "Google Chat alerts". In Google Chat open the space, then Apps & integrations, Webhooks, Add webhook, copy the link and paste it. Choose events: deal won, booking, hot lead replied, new website lead, daily summary.
- **Weekly backup to Google Drive:** Settings, "Weekly backup to Google Drive". Uses the `drive.file` permission, which only reaches files the app creates. One-time Google Cloud setup: enable the **Google Drive API** in the project, and add the `.../auth/drive.file` scope to the OAuth consent screen. The admin then reconnects Google on the Account page and turns backups on.

## Your company name and logo

Everything that names your company (the sign-in page, quotes, booking pages, emails and the AI's drafts) comes from **Settings → Company profile**. Admins can change the name, the one-sentence description of what you sell, contact details, and upload a logo (wide) and icon (square), PNG or JPEG under 512 KB. Until a logo is uploaded, a simple mark with your company name is shown.

`APP_NAME` (default "Lead Tracker") sets the product name in the browser tab, the menu and emails. `COMPANY_NAME` and the other `COMPANY_*` settings are only the starting values; whatever an admin saves in Settings wins.

## Getting help

Lead Tracker is published by **Droisys**. If you get stuck setting it up, or something isn't working:

- **Email:** sales@droisys.com
- **Phone:** +1 (408) 874-0184
- **Website:** [www.droisys.com](https://www.droisys.com)

It helps us help you quickly if you include: which step of DEPLOY.md you're on, a screenshot of what you see, and (if you use Render) the last 20 lines from your service's **Logs** tab. Please never send passwords or secret keys.
