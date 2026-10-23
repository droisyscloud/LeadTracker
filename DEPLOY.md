# Lead Tracker: Setup Guide

This guide puts Lead Tracker online for your company in about 45 minutes. You don't need to know anything about programming or servers: every step tells you exactly where to click and what you should see. If something on your screen looks different from what's described, don't worry; the troubleshooting section near the end covers the usual reasons.

(The same guide is available as a formatted document from your supplier. IT teams who prefer their own server: see "For IT teams: your own server with Docker" at the end.)

## Before you start

**Start here:** Lead Tracker is published by Droisys at [github.com/droisyscloud/LeadTracker](https://github.com/droisyscloud/LeadTracker). Everything this guide asks you to set up starts from that page.

Lead Tracker is a website your team signs in to, for following up leads together: contacts, companies, follow-ups, tasks, deals, quotes, email sequences, events, reports and team dashboards. You'll get your own private copy. Your data is stored only in your copy, and only people you invite can sign in.

**What you'll end up with**

- A web address for your team, like `https://lead-tracker-ab12.onrender.com`. Anyone you invite opens it in their web browser (Chrome, Edge, Safari or Firefox) on a computer or phone. Later you can switch to your own address, like `leads.yourcompany.com`.
- Sign-in with an email address and password. Nobody needs a Google or Microsoft admin account. Google or Microsoft sign-in can be added later if you want it.
- Your company name and logo on the sign-in page, quotes, booking pages and emails.

**Words you'll see in this guide**

| Word | What it means in plain English |
| --- | --- |
| GitHub | A free website that stores a copy of the app's files online. Think of it as a shared folder in the cloud that Render can read from. |
| Repository (or "repo") | GitHub's name for one of those folders. Lead Tracker's files live in a repository called `LeadTracker`. |
| GitHub Desktop | A free program for your computer that uploads a folder to GitHub with a few clicks. You only need it if you received a zip file. |
| Render | A hosting company. It runs the Lead Tracker website for you around the clock, stores its data, and keeps it secure. You pay Render monthly. |
| Blueprint | Render's word for a ready-made setup recipe. Lead Tracker includes one (the file `render.yaml`), so Render can create everything in one go. |
| Database | Where Lead Tracker keeps your leads, deals, notes and users. Render creates it and backs it up for you. |
| Deploy | To build the app from its files and start it running on Render. You'll see this word on Render's buttons. |
| Environment / setting | A named value the app reads when it starts, such as your company name or a password. On Render these are under the **Environment** tab. Names are written in capitals with underscores, like `COMPANY_NAME`, and must be typed exactly. |
| Logs | A running list of what the app is doing, shown in Render. Useful if something goes wrong; you don't need to understand it, just copy it for support. |

**What it costs**

- **GitHub:** free.
- **Render:** a monthly fee for three pieces: the app itself (a small "web service"), its database, and a 1 GB storage disk for files people upload. Render shows the exact price of each piece, and the total, before you confirm anything. You'll need a payment card.
- **AI features (optional):** if you switch them on later, Anthropic or OpenAI bill you separately, based on how much you use them.

**Have these ready before you begin**

| What | Why you need it | Where to get it |
| --- | --- | --- |
| The Lead Tracker files | The app itself | [github.com/droisyscloud/LeadTracker](https://github.com/droisyscloud/LeadTracker) |
| A computer with a web browser | You'll do everything in a browser | Chrome, Edge, Safari or Firefox |
| An email address you can open now | To create your GitHub and Render accounts; both send a confirmation email | Your work email is best |
| A payment card | Render needs it before it creates anything | |
| A password for your first sign-in | You'll type it into Render, then use it once to sign in | At least 10 characters. A short sentence works well, like `Blue-river-ships-today` |
| Your company name and main time zone | Shown in the app and used for reports | For example `America/New_York` (full list in Part 2) |
| Your logo (optional) | Shown on sign-in, quotes and emails | A PNG or JPEG file, under 512 KB |

You don't need admin access to Google Workspace or Microsoft 365, and you don't need an email server: you can copy invitation links and send them yourself.

**Tips that make this easier**

- Open a blank note (Notepad on Windows, Notes or TextEdit on a Mac). As you go, paste in your GitHub username, your Render address and anything else you're asked to save. You'll need some of them later.
- When a step says to type something exactly, copy and paste it from this guide rather than retyping it. Capital letters, dashes and underscores matter.
- Do the parts in order. Each part ends with a **Check before you move on** line: if what you see matches, carry on.
- Keep this guide open in one browser tab and do the steps in another.

**How the parts fit together**

1. Part 1: put the app's files in your own GitHub account (5 to 15 minutes).
2. Part 2: create the app on Render (10 minutes, then about 10 minutes of waiting while Render builds it).
3. Part 3: sign in for the first time and change your password (2 minutes).
4. Part 4: add your company details, logo and products (10 minutes).
5. Part 5: invite your team (5 minutes).

Parts 6 to 8 are for later: everyday admin, optional extras, and keeping it running.

## Part 1: Put the app's files in your GitHub account

Render doesn't take files directly from your computer. It reads them from GitHub. So first you put a copy of the Lead Tracker files into your own GitHub account. This takes 5 to 15 minutes.

**Step 1.1: Create a GitHub account (skip if you have one)**

1. Open your web browser and go to [github.com](https://github.com).
2. Click **Sign up** (top right).
3. Enter your email address, choose a password, and choose a username. The username can be anything, for example your company name with no spaces, like `acme-ltd`. Write it in your note.
4. Follow the screens to the end. GitHub may show a small puzzle to check you're a person; just complete it.
5. GitHub emails you a code. Open your email, copy the code, and paste it into GitHub.
6. If GitHub asks questions about how you'll use it, you can click **Skip personalization** (or **Continue for free**). You don't need a paid plan.
7. You're done when you see your GitHub home page with your profile picture (a coloured pattern) at the top right.

**Step 1.2: Copy the files into your account**

Lead Tracker is published at [github.com/droisyscloud/LeadTracker](https://github.com/droisyscloud/LeadTracker). Choose **one** of the three options below. Most companies should use Option A.

**Option A (recommended): use the Deploy to Render button**

1. Make sure you're signed in to GitHub (Step 1.1).
2. Open [github.com/droisyscloud/LeadTracker](https://github.com/droisyscloud/LeadTracker), scroll down past the list of files to the description, and click the purple **Deploy to Render** button.
3. Render opens in your browser. Render makes the copy for you, so skip the rest of Part 1 and go to Part 2, Step 2.1 (create your Render account), then continue from Step 2.2, item 4.

**Option B: make your own copy with Fork (if you want to change the app, or get new versions with one click)**

1. Make sure you're signed in to GitHub (Step 1.1).
2. Open [github.com/droisyscloud/LeadTracker](https://github.com/droisyscloud/LeadTracker). You'll see a page with a list of files and folders (such as `public`, `src`, `README.md`), and some text about Lead Tracker underneath.
3. Near the top right of that page, click **Fork**. ("Fork" means "make my own copy".)
4. A page titled **Create a new fork** opens. Leave the **Repository name** as `LeadTracker`. Click the green **Create fork** button at the bottom.
5. After a few seconds you see the same list of files, but the top left now shows your username, like `acme-ltd / LeadTracker`. That's your copy. Go to the check at the end of this part.

**Option C: only if Droisys sent you a zip file instead of the link**

The GitHub website can't upload this many files at once, so you'll use GitHub Desktop, a free program, to upload the folder.

*Unzip the file*

1. Find the zip file (usually in your **Downloads** folder). It's called `lead-tracker.zip`.
2. **On Windows:** right-click it → **Extract All…** → **Extract**. **On a Mac:** double-click it.
3. A new folder appears. Open it. **On Windows** there is often a second `lead-tracker` folder inside the first one; open that one too. You're in the right folder when you can see files called `README.md`, `DEPLOY.md` and `render.yaml`, and folders called `public`, `scripts` and `src`.
4. Move that folder (the one with `README.md` inside) somewhere easy to find, such as your **Documents** folder. Remember where it is.

*Install GitHub Desktop*

5. Go to [desktop.github.com](https://desktop.github.com) and click the big **Download** button for your computer (Windows or macOS).
6. Open the downloaded file to install it. **On a Mac**, drag GitHub Desktop into your **Applications** folder, then open it from there.
7. When GitHub Desktop opens, click **Sign in to GitHub.com**. Your browser opens; sign in and click **Authorize desktop**, then allow the browser to open GitHub Desktop again.
8. If it asks to configure Git (your name and email), keep what it suggests and click **Finish** or **Continue**.

*Upload the folder*

9. In GitHub Desktop's top menu, click **File** → **Add local repository…**.
10. Click **Choose…**, find the `lead-tracker` folder from item 4 (the one with `README.md` inside), select it and click **Select Folder** (Windows) or **Add** (Mac).
11. A red message appears: *"This directory does not appear to be a Git repository. Would you like to create a repository here instead?"* Click the blue **create a repository** link in that message.
12. A **Create a new repository** box opens. Don't change anything. Check that **Name** says `lead-tracker`, then click **Create repository** at the bottom.
13. At the top of the window there's now a button called **Publish repository**. Click it.
14. In the box that appears, leave **Name** as `lead-tracker`. Leave **Keep this code private** ticked, so only you can see your copy. Click **Publish repository**.
15. Wait until the button at the top changes to **Fetch origin**. That means the upload is finished. With a slow connection it can take a few minutes.

**Check before you move on**

1. In your browser, go to [github.com](https://github.com) and click your profile picture (top right) → **Repositories** (or **Your repositories**).
2. You should see `LeadTracker` (or `lead-tracker`, if you uploaded a zip) in the list. Click it.
3. You should see the list of files, including `README.md`, `DEPLOY.md` and `render.yaml`.

If `render.yaml` isn't in the list (you see just one folder called `lead-tracker` instead), you uploaded the outer folder by mistake. In GitHub Desktop choose **Repository** → **Remove**, then repeat from item 9 and pick the inner folder.

## Part 2: Create the app on Render

In this part Render builds and starts your Lead Tracker website. It reads the setup recipe included with the files (`render.yaml`) and creates three things at once: the website, its database, and a storage disk. You only type four values. Everything else, including the security keys, is filled in for you. This takes about 10 minutes, plus 5 to 15 minutes of waiting.

**Step 2.1: Create a Render account**

1. Go to [render.com](https://render.com) and click **Get Started** (or **Sign up**).
2. Click **GitHub** to sign up with your GitHub account. This is the easiest way, because Render then already knows where your files are.
3. GitHub asks whether to let Render use your account. Click **Authorize Render**.
4. Render may ask a few questions (your name, what you'll use it for). Answer them however you like and continue.
5. You're done when you see the Render **Dashboard**, a mostly empty page with a **New** button at the top right.

**Step 2.2: Start the setup (the "Blueprint")**

1. On the Render Dashboard, click **New** (top right) and choose **Blueprint** from the list.
2. Render shows a page to connect a repository. If you don't see your `LeadTracker` copy listed:
    - Click **Connect GitHub** (or **Configure account** / **Configure GitHub App**). A GitHub page opens.
    - Choose your account, then **Only select repositories**, pick `LeadTracker` from the dropdown, and click **Install** (or **Save**).
    - You're sent back to Render, and `LeadTracker` now appears in the list.
3. Next to `LeadTracker`, click **Connect**.
4. Render shows **Blueprint Name**. Type `Lead Tracker`. Leave **Branch** as it is (`main`).
5. Render reads the recipe and lists what it will create. You should see:
    - a **Web Service** called `lead-tracker` (the website),
    - a **PostgreSQL** database called `lead-tracker-db`,
    - and a disk attached to the website.
6. Below that, Render asks you to fill in four values. These are the only things you type. Copy the names carefully; the boxes are labelled with them.

| Box name | What to type | Example |
| --- | --- | --- |
| `BOOTSTRAP_ADMIN_EMAILS` | **Your own email address.** The person with this email becomes the first admin (the person in charge). | `maria@acme.com` |
| `ADMIN_INITIAL_PASSWORD` | **A password you'll use to sign in the very first time.** At least 10 characters. Write it in your note. You'll replace it with a new one in Part 3. | `Blue-river-ships-today` |
| `COMPANY_NAME` | **Your company's name**, as you want people to see it. You can change it later inside the app. | `Acme Ltd` |
| `TEAM_TIMEZONE` | **Your team's main time zone**, copied exactly from the list below. Reports and daily summaries use it. | `America/New_York` |

Time zones, copy one exactly (capitals, `/` and `_` included):

- USA: `America/New_York` (Eastern), `America/Chicago` (Central), `America/Denver` (Mountain), `America/Phoenix` (Arizona), `America/Los_Angeles` (Pacific)
- Europe: `Europe/London`, `Europe/Paris`, `Europe/Berlin`
- Middle East and Asia: `Asia/Dubai`, `Asia/Kolkata` (India), `Asia/Singapore`, `Asia/Hong_Kong`, `Asia/Tokyo`
- Australia: `Australia/Sydney`

7. Click **Apply** (on some screens it says **Deploy Blueprint** or **Create New Resources**).
8. If Render asks for payment details, enter your card. Render shows the monthly price of each piece before charging.

**Step 2.3: Wait while Render builds the app**

Render now creates the database, then builds the website from the files, then starts it. The first time takes 5 to 15 minutes. You don't need to do anything; you can watch if you like:

1. On the Blueprint page you see the three pieces with a status next to each, such as **Creating** or **Deploying**.
2. Click **lead-tracker** (the web service), then the **Logs** tab. Lines of text scroll past. That's normal; you don't need to read them.
3. It's finished when **lead-tracker** shows a green **Live** label (or **Deploy live**). Near the end of the logs you may also see *"Your service is live"*.

If you see a red **Failed** label instead, don't change anything yet: go to Troubleshooting, first row.

**Step 2.4: Find and save your web address**

1. On the **lead-tracker** page, look just under the name at the top. There's a link ending in `.onrender.com`, like `https://lead-tracker-ab12.onrender.com`.
2. Copy it into your note. **This is your team's Lead Tracker address.** You'll send it to everyone you invite.

**Check before you move on**

Click that address (or paste it into a new browser tab). You should see a sign-in page showing your company name, with an **Email** box, a **Password** box and a blue **Sign in** button.

If the page says it can't be reached, or shows "Service unavailable", wait two minutes and refresh: the very first start can take a moment after **Live** appears.

## Part 3: Sign in for the first time

Now you sign in as the admin, using the email and password you typed into Render, and then change that password to a private one. This takes 2 minutes.

**Step 3.1: Sign in**

1. Open your Lead Tracker address (the `.onrender.com` one you saved in Step 2.4).
2. In **Email**, type the email you entered as `BOOTSTRAP_ADMIN_EMAILS`.
3. In **Password**, type the password you entered as `ADMIN_INITIAL_PASSWORD`, exactly, including capitals.
4. Click **Sign in**.
5. You land on the **Home** page. It says *Good morning* (or afternoon) with your name.

If you see *"That email and password don't match"*, check both against your note and try again. After 8 wrong tries the sign-in pauses for 15 minutes.

**Step 3.2: A quick look around**

- **The menu on the left** (on a phone, the bar at the bottom plus **More**) takes you to every page: Home, Follow-ups, Tasks, Contacts, Companies, Deals and so on. The admin pages, **Users & access** and **Settings**, are at the bottom of the menu.
- **The round button with your initial** (top right) opens your own menu: your account page, handy actions such as exporting everything, **Install the app on this device**, and **Sign out**.
- **The question mark** (top right) opens help, including a narrated tour of the app.
- **+ New** (top right) adds a lead, task, deal or note from anywhere.

**Step 3.3: Change your password**

The password you typed into Render can be seen by anyone with access to your Render account, so replace it with a private one now.

1. Click the round button with your initial (top right), then **Account, notifications and booking page**.
2. Find the box titled **Password**.
3. In **Current password**, type the password you just signed in with.
4. In **New password** and **New password again**, type your new private password. Use at least 10 characters; a short sentence you'll remember works well.
5. Click **Change password**. A small message, *Password changed*, appears at the bottom of the screen.

From now on you sign in with your new password. The one in Render is no longer used for anything.

**Tip: use it like an app on your phone.** Open your Lead Tracker address in your phone's browser and sign in. On an iPhone, tap the **Share** button → **Add to Home Screen**. On Android, tap the **⋮** menu → **Add to Home screen** (or **Install app**). An icon appears on your home screen that opens Lead Tracker directly.

**Check before you move on:** sign out (round button → **Sign out**) and sign back in with your new password. It should work.

## Part 4: Set up your company

Now you tell Lead Tracker about your company, so your name and logo appear everywhere and the app knows what you sell. This takes about 10 minutes. Every page mentioned here is in the menu on the left; admin pages are in the **Admin** group at the bottom.

**Step 4.1: Company profile**

1. In the left menu, click **Settings**. The first box at the top is **Company profile**.
2. **Company name:** check it's spelled the way you want customers to see it.
3. **What you sell:** type one sentence describing your business, for example *"Fleet tracking software for logistics companies"*. When the AI writes an email, summary or quote for you, it uses this sentence to describe your company correctly.
4. **Email**, **Phone**, **Website:** your company's general contact details. They're printed on quotes and booking pages.
5. **Note at the bottom of quotes:** a short line printed at the end of every quote. *"Thank you for your business."* is already filled in; change it if you like.
6. Click **Save company profile**. A message *Company profile saved* appears at the bottom of the screen.

**Step 4.2: Your logo**

You can upload two versions. If you only have one, upload it as the **Logo**.

- **Logo:** the wide version (your name and symbol side by side). Shown on the sign-in page, quotes, and at the top of the menu.
- **Icon:** a square version (just the symbol). Shown when the menu is folded and on booking pages.

1. Still in **Settings** → **Company profile**, find **Logo** on the right.
2. Click **Upload**. A window opens to pick a file from your computer.
3. Choose your logo file and click **Open**. It must be a **PNG** or **JPEG** file, smaller than 512 KB. A PNG with a transparent background looks best.
4. Your logo appears in the preview box, and *Logo saved* appears at the bottom.
5. Do the same under **Icon** for the square version.

Don't have a logo file handy? Skip this. Until you upload one, Lead Tracker shows a simple round mark with your company name. To undo an upload, click **Use default** under it.

**Step 4.3: Your postal address**

Anti-spam laws require a postal address at the bottom of automated marketing emails, so Lead Tracker adds it for you.

1. In **Settings**, scroll to the box **Email compliance**.
2. In **Company postal address**, type your full address on one line, for example *100 Main St, Suite 200, Austin, TX 78701*.
3. Click **Save address**.

**Step 4.4: Your products**

Products are what you sell: products, plans or services. You tag leads and deals with them, and reports group results by them.

1. In the left menu, click **Products**.
2. Click **+ New product**.
3. Type the **Product name** and, if you like, a short **Description**. Click **Add**.
4. Repeat for each product. You can rename or remove them later.

**Step 4.5: Teams (only if you have more than one sales group)**

Teams let a manager see everything their team is working on. If everyone works together as one group, skip this.

1. In the left menu, click **Teams**, then **+ New team**.
2. Give it a name, for example *East region* or *Enterprise accounts*, and choose the products that team sells.
3. Save it. You put people into teams when you invite them (Part 5), or later.

**Step 4.6: Events (only if you go to trade shows or events)**

1. In the left menu, click **Events**, then **+ New event**.
2. Fill in the event's name, place, dates and what it cost you. Save it.
3. When leads from that event are added, they're linked to it, and **Reports** show what each event brought in compared with its cost.

**Check before you move on:** sign out and look at the sign-in page. It should show your logo (or your company name) at the top.

Would you like to see the app filled with example data first? Ask your supplier for a separate test copy with fictional sample data. Never load sample data into the copy you use for real customers.

## Part 5: Invite your team

Nobody can sign in until an admin invites them. Each invitation is a personal link: the person opens it, chooses their own password, and they're in. You never need to know or send anyone's password. This takes about 5 minutes.

**Step 5.1: Decide each person's role**

The role decides what each person can see and do. Pick the smallest role that lets them do their job; you can change it any time.

| Role | Give it to | What they can do |
| --- | --- | --- |
| Admin | You, and at most one or two others | Sees and changes everything. Invites people, sets roles and teams, removes access. Sees the audit log. |
| Manager | Sales managers and team leads | Sees everything in their teams: the team's leads, deals and tasks. Hands out unassigned leads. Reassigns, merges, deletes and exports within their teams. |
| Sales rep | Salespeople | Sees only the leads they own, plus leads shared with them. Adds leads, scans badges, logs calls, emails and notes. |
| Viewer | Anyone who only needs to look | Sees only leads assigned or shared to them. Can comment when mentioned. Can't change anything. |

These limits are enforced by the server on every click, not just hidden on screen, so nobody can see more than their role allows.

**Step 5.2: Create the invitations**

1. In the left menu, click **Users & access**.
2. On the right is the box **Invite teammates**.
3. In **Email addresses**, type the person's work email. To invite several people with the same role at once, type their emails separated by commas, like `ana@acme.com, ben@acme.com`.
4. Under **Role**, choose their role. A one-line reminder of what that role can do appears below it.
5. If you created teams in Part 4, click the team (or teams) they belong to. A selected team is highlighted.
6. Click **Send invite**.
7. Under the button, each email now shows **invite created** and a **Copy invite link** link. (Lead Tracker can't email the invitations itself until you set up email in Part 7, so for now you send them.)

**Step 5.3: Send each person their link**

1. Click **Copy invite link** next to the first person. *Link copied* appears at the bottom of the screen.
2. Open your normal email (or Teams, Slack or WhatsApp) and start a message to that person.
3. Paste the link into the message (right-click → **Paste**, or Ctrl+V on Windows, ⌘+V on a Mac). You can use this text:

> Hi, I've set up Lead Tracker for our team. Please open this link, choose a password, and you're in: *(paste the link here)*. After today, sign in at *(your .onrender.com address)* with your email and the password you chose.

4. Send it, and repeat for each person. Each link is personal: send each one only to the person it's for.

Everyone you've invited who hasn't joined yet is listed in **Pending invites** on the same page. There you can **Copy link** again if someone loses it, or **Cancel** an invitation.

**What your teammate sees**

1. They open the link. A sign-in page says who invited them and with which role.
2. They click **Choose a password and join**.
3. They type their name, then a password twice (at least 10 characters), and click **Join**.
4. They land on their **Home** page, signed in. Next time, they go to your Lead Tracker address and sign in with their email and password.

**Check before you move on:** when someone has joined, they move from **Pending invites** to the **Team members** list at the top of **Users & access**, showing their name and role.

Need to change someone's role later? In **Team members**, pick the new role from the dropdown next to their name. It takes effect on their next click.

## Part 6: Everyday admin

All of this is in **Users & access**, and only admins can do it.

**Someone forgot their password**

1. Find them in **Team members** and click **Password link** next to their name.
2. The link is copied. Send it to them. It works once, within 24 hours.
3. They open it, choose a new password and are signed in. Their old password stops working.

If your app can send email (Part 7), people can also click **Forgot password?** on the sign-in page and get a link themselves.

**Someone changes role or team**

Pick the new role from the dropdown next to their name, or click **Change** under Teams. It takes effect on their next click.

**Someone leaves**

Click **Disable** next to their name. They're signed out on their next click and can't sign in again. Their leads, notes and history stay, still assigned to them. To hand their leads to someone else, open **Contacts**, switch to the **List** view (it has an **Owner** column), open each of their leads and pick a new **Owner**. **Restore** brings a disabled person back if needed; tick **Show disabled** to see them.

**Who changed what**

The **Audit log** on the same page lists role changes, deletions, merges, exports and password links, with who did it and when.

**Something was deleted by mistake**

Deleted leads, companies and notes go to **Trash**, where anyone except a Viewer can click **Restore** for 30 days. After that they're gone for good.

## Part 7: Optional extras

Lead Tracker is fully usable after Part 5. Each extra in this part switches on something more. Do only the ones you want, in any order, whenever you like. They're all turned on the same way: by adding one or more settings in Render. So first learn that one procedure.

**How to add a setting in Render (used by every extra below)**

1. Go to [dashboard.render.com](https://dashboard.render.com) and sign in.
2. Click **lead-tracker** (the web service, not `lead-tracker-db`).
3. In the menu on the left of that page, click **Environment**. You see a list of existing settings, with names on the left and values (mostly hidden as dots) on the right. Don't change or delete any of these.
4. Click **Edit** if there is such a button, then **+ Add** (it may say **Add Environment Variable**). Two new empty boxes appear.
5. In the left box (**Key**), type or paste the setting's name exactly as this guide shows it, in capitals with underscores, for example `SMTP_HOST`.
6. In the right box (**Value**), type or paste its value.
7. For an extra that needs several settings, click **+ Add** again for each one.
8. Click **Save, rebuild, and deploy** (it may say **Save Changes**). If you're offered a choice, pick the one that saves and deploys.
9. Render restarts Lead Tracker with the new settings. Wait about 2 minutes, until **lead-tracker** shows **Live** again, then refresh Lead Tracker in your browser.

To change a setting later, find it in the same list, click **Edit**, change the value and save the same way. A typing mistake in a name means the setting is simply ignored, so if an extra doesn't work, check the spelling first.

**Let Lead Tracker send emails itself**

*What you get:* invitations and "Forgot password?" links are emailed automatically, instead of you copying links. The daily summary email, task reminders and automated email sequences also start sending.

*What you need:* a mailbox for the app to send from, such as `leads@yourcompany.com`, and its sign-in details for outgoing mail (called "SMTP"). If someone manages your email, send them this section and ask for the five values. If you're doing it yourself:

| Setting name | What to put | If you use Microsoft 365 | If you use Google Workspace |
| --- | --- | --- | --- |
| `SMTP_HOST` | Your provider's outgoing mail server | `smtp.office365.com` | `smtp.gmail.com` |
| `SMTP_PORT` | The port number | `587` | `587` |
| `SMTP_USER` | The mailbox that sends | `leads@yourcompany.com` | `leads@yourcompany.com` |
| `SMTP_PASS` | That mailbox's password for outgoing mail | The mailbox password. Your Microsoft admin must allow "Authenticated SMTP" for that mailbox (Microsoft 365 admin center → Users → the mailbox → Mail → Manage email apps). | An **app password**, not the normal one. Sign in to that Google account, turn on 2-Step Verification, then go to [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords), create one named `Lead Tracker`, and copy the 16-letter code. |
| `MAIL_FROM_ADDRESS` | The address people see emails come from | Same as `SMTP_USER` | Same as `SMTP_USER` |

Add all five in Render (see the procedure above). To test: invite a colleague in **Users & access**; under the button it should now say **invite emailed**.

Email sending services such as SendGrid, Mailgun or Postmark work too: use the SMTP details from their website.

**Sign in with Google**

Adds a **Sign in with Google** button. People with company Google accounts then don't need a separate password. You need admin access to your Google Workspace.

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and sign in as a Google Workspace admin.
2. Click the project picker at the top → **New project**. Name it `Lead Tracker`, click **Create**, and make sure it's selected.
3. Open **APIs & Services** → **OAuth consent screen** (it may be called **Google Auth Platform**). Click **Get started**. App name: `Lead Tracker`. Support email: yours. Audience: **Internal**. Contact email: yours. Click **Create**.
4. Open **APIs & Services** → **Credentials** → **Create credentials** → **OAuth client ID**. Type: **Web application**. Name: `Lead Tracker`.
5. Under **Authorized redirect URIs**, click **Add URI** and enter your Lead Tracker address followed by `/api/auth/callback/google`, for example `https://lead-tracker-ab12.onrender.com/api/auth/callback/google`. Click **Create**.
6. Copy the **Client ID** and **Client secret** that appear.
7. In Render, add three settings: `AUTH_GOOGLE_ID` (the Client ID), `AUTH_GOOGLE_SECRET` (the Client secret) and `AUTH_GOOGLE_HOSTED_DOMAIN` (your email domain, for example `yourcompany.com`, so only company accounts can use it).
8. To also let people connect their Gmail and Calendar (below), open **APIs & Services** → **Library** and click **Enable** on each of: **Gmail API**, **Google Calendar API**, **Google Drive API**, **People API**.

**Sign in with Microsoft**

Adds a **Sign in with Microsoft** button for Microsoft 365 accounts. You need admin access to Microsoft Entra ID.

1. Go to [portal.azure.com](https://portal.azure.com) → **Microsoft Entra ID** → **App registrations** → **New registration**.
2. Name: `Lead Tracker`. Account types: **Accounts in this organizational directory only**. Redirect URI: choose **Web** and enter your Lead Tracker address followed by `/api/auth/callback/microsoft-entra-id`. Click **Register**.
3. Copy the **Application (client) ID** and the **Directory (tenant) ID**.
4. Open **Certificates & secrets** → **New client secret** → **Add**. Copy the **Value** straight away; it's shown only once. Note its expiry date in your calendar: sign-in stops working when it expires, until you make a new one.
5. In Render, add `AUTH_MICROSOFT_ENTRA_ID_ID` (client ID), `AUTH_MICROSOFT_ENTRA_ID_SECRET` (the secret Value) and `AUTH_MICROSOFT_ENTRA_ID_TENANT_ID` (tenant ID).
6. To also let people connect Outlook and their calendar (below), open **API permissions** → **Add a permission** → **Microsoft Graph** → **Delegated permissions**. Add `Mail.Read`, `Mail.Send`, `Calendars.ReadWrite` and `offline_access`, then click **Grant admin consent**.

People who already have a password can keep using it. A person signing in with Google or Microsoft must use the same email address they were invited with.

**Connect each person's mailbox and calendar**

Needs Google or Microsoft sign-in set up first (above, including its last step). Then each person opens **Account** → **Mailbox and calendar** and clicks **Connect Google Workspace** or **Connect Microsoft 365**, then approves the access Google or Microsoft asks for. After that, emails with their leads are logged automatically, they can send from their own address, and booking pages show their real free time.

**AI features (writing, summaries, scanning and voice)**

*What you get:* Lead Tracker can draft follow-up emails, rewrite text, summarise a lead or the whole pipeline, suggest the next best action, read business cards and event badges from a photo, prepare meeting briefs, and draft quotes. With an OpenAI key it can also turn voice notes and meeting recordings into text.

*What you need:* an account with an AI provider and a "key", a long secret code that lets Lead Tracker use your account. The provider bills you for what you use, separately from Render. You'll set a monthly limit so the cost never surprises you.

*Step 1: Choose a provider*

| If you want | Use | Setting to add in Render |
| --- | --- | --- |
| Writing, summaries and scanning only | Anthropic (Claude) **or** OpenAI; either works | `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` |
| Voice notes and meeting recordings too | OpenAI (only OpenAI does voice) | `OPENAI_API_KEY` |
| Everything, with Claude for writing | Both | Both settings |

If you add both keys, Lead Tracker uses Anthropic for writing and OpenAI for voice. To use OpenAI for writing as well, also add the setting `AI_PROVIDER` with the value `openai`.

*Step 2 (Anthropic): Get your key*

1. Go to [console.anthropic.com](https://console.anthropic.com) and click **Sign up** (or **Log in**). You can use your work email or Google account. Confirm your email if asked.
2. If it asks for an organization name, type your company name.
3. Add money to the account: open **Settings** → **Billing** (in the left menu), add a payment card, and buy credits. Anthropic works on prepaid credits; $10 to $20 is plenty to start. You can switch on automatic top-ups later.
4. Set a limit: open **Settings** → **Limits** and set a monthly spend limit you're comfortable with.
5. Create the key: open **API Keys** (in the left menu or under **Settings**) → **Create Key**. Name it `Lead Tracker` and click **Create** (or **Add**).
6. The key appears once, starting with `sk-ant-`. Click **Copy** and paste it into your note for a moment. You can't see it again after you close the box; if you lose it, just create a new one.

*Step 2 (OpenAI): Get your key*

1. Go to [platform.openai.com](https://platform.openai.com) and click **Sign up** (or **Log in**). Confirm your email and phone number if asked.
2. Add money to the account: click the **gear icon** (Settings) → **Billing** → **Add payment details**, add a card and buy credits. $10 to $20 is plenty to start.
3. Set a limit: under **Settings** → **Limits**, set a monthly budget and an email alert.
4. Create the key: in the left menu click **API keys** → **Create new secret key**. Name it `Lead Tracker`, leave the other options as they are, and click **Create secret key**.
5. The key appears once, starting with `sk-`. Click **Copy** and paste it into your note for a moment. If you lose it, create a new one.

*Step 3: Add the key in Render*

Follow "How to add a setting in Render" at the start of this part:

- Anthropic: **Key** `ANTHROPIC_API_KEY`, **Value** your `sk-ant-…` key.
- OpenAI: **Key** `OPENAI_API_KEY`, **Value** your `sk-…` key.

Paste the key exactly, with no spaces before or after it. Click **Save, rebuild, and deploy** and wait until **lead-tracker** shows **Live** again.

*Step 4: Check it works*

1. In Lead Tracker, open **Settings** and find the **Integrations** list.
2. The **AI** row should now say **On**, followed by **Anthropic Claude** or **OpenAI**.
3. Open **Home**. The **AI summary** box at the top no longer shows the setup message. (On a brand-new app it may say there is not enough activity to summarise yet; that also means AI is working.)

Once it works, delete the key from your note. It now lives only in Render.

*Keeping the key safe*

- Treat the key like a password. Never email it or put it anywhere except Render.
- If you think a key has leaked, or the person who created it leaves: in the provider's **API Keys** page, delete (revoke) the old key, create a new one, and replace the value in Render (Environment → **Edit** → paste → **Save, rebuild, and deploy**).
- If AI suddenly stops working, the account has usually run out of credits or hit its monthly limit. Top up or raise the limit in the provider's **Billing** or **Limits** page; nothing needs to change in Render.

**Your own web address** (for example `leads.yourcompany.com`)

1. In Render, open **lead-tracker** → **Settings** → **Custom Domains** → **Add Custom Domain**, and type the address.
2. Render shows a DNS record to add. Add it where your domain is managed (or send it to whoever manages it). Render confirms once it works, usually within an hour, and sets up the padlock (HTTPS) itself.
3. Add the setting `APP_URL` with the full new address, for example `https://leads.yourcompany.com`.
4. If you set up Google or Microsoft sign-in, add the new address's callback there too, in the same way as before.

**Other connections**

| To connect | Add these settings | Then |
| --- | --- | --- |
| HubSpot | `HUBSPOT_TOKEN` (a HubSpot private app token) | Leads and companies can be pushed to HubSpot |
| Your website's contact form | `INTAKE_KEYS` (any long random word) and `INTAKE_ALLOWED_ORIGINS` (your website's address) | Copy the ready-made form from **Settings** → **Website form** into your site |
| Slack or Microsoft Teams summary | `SLACK_WEBHOOK_URL` or `TEAMS_WEBHOOK_URL` | A daily team summary is posted to that channel |
| QuickBooks Online | `QBO_CLIENT_ID`, `QBO_CLIENT_SECRET`, `QBO_ENV` = `production` | An admin opens **Settings** → **Accounting** → **Connect QuickBooks**; that page also shows the redirect address to give Intuit |

Using Xero, Zoho Books or another system? No settings needed: in **Settings** → **Accounting**, click **Import invoices** and upload an export.

## Part 8: Keeping it running

Once it's live, Lead Tracker mostly looks after itself. Background work (mailbox sync, sequence emails, reminders, the daily digest) runs inside the app every few minutes; admins can see when each job last ran in **Settings** → **Background jobs**.

**Installing a new version**

When your supplier gives you a new version, installing it takes about 10 minutes. Your leads, users and settings are kept: an update never touches your data, and the app updates its own database when it starts. It's a good idea to do updates outside working hours, since the app restarts.

*If you made your copy with a GitHub link (Part 1, Option B):*

1. Go to [github.com](https://github.com) and open your `LeadTracker` repository.
2. Near the top, GitHub says something like *"This branch is 3 commits behind"*. Click **Sync fork**, then **Update branch**.
3. Done. Render notices the change and installs it (see "What happens next" below).

*If you made your copy from a zip file (Part 1, Option C):*

1. Unzip the new version the same way as in Part 1 (Windows: right-click → **Extract All…**; Mac: double-click). Open it until you see `README.md`, `DEPLOY.md` and `render.yaml`.
2. Select everything inside that folder: click inside it, then press Ctrl+A (Windows) or ⌘+A (Mac). Copy it with Ctrl+C or ⌘+C.
3. Open your existing `lead-tracker` folder, the one you uploaded in Part 1. Paste with Ctrl+V or ⌘+V.
4. Your computer asks what to do with files that already exist. Choose **Replace the files in the destination** (Windows) or **Replace** and tick **Apply to all** (Mac).
5. Open GitHub Desktop. On the left it lists the changed files. That's expected.
6. In the **Summary** box at the bottom left, type `New version`.
7. Click the blue **Commit to main** button.
8. Click **Push origin** at the top. Wait until it changes back to **Fetch origin**.

*If you used the Deploy to Render button (Part 1, Option A):* ask your supplier how they deliver updates to you.

*What happens next:* Render notices the new files and rebuilds and restarts Lead Tracker by itself, usually within 10 minutes. You can watch **lead-tracker** go from **Deploying** to **Live**. If nothing has happened after 15 minutes, open **lead-tracker** in Render and click **Manual Deploy** → **Deploy latest commit**.

**Backups**

- Render backs up paid databases automatically. You can see and restore them in Render → **lead-tracker-db** → **Recovery**.
- Lead Tracker can also save a weekly spreadsheet of everything to an admin's Google Drive: **Settings** → **Weekly backup to Google Drive**. This needs the Google mailbox connection from Part 7.
- Admins and managers can export everything to a spreadsheet at any time from the export option in the app.

**Costs and housekeeping**

- See what you're paying in Render → **Billing**. Upgrading the database or web service later is a dropdown in each one's **Settings**, if your team grows.
- If you set up Microsoft sign-in, put the client secret's expiry date in your calendar and make a new secret before then (Part 7).
- Keep the number of admins small, and **Disable** people as soon as they leave (Part 6).

## Troubleshooting

Find the message you see in the left column. Most problems are a value typed slightly wrong in Render.

| What you see | What to do |
| --- | --- |
| Render shows a red **Failed** label | Open **lead-tracker** → **Logs** and read the last red lines. Then click **Manual Deploy** → **Deploy latest commit** to retry. Still failing? Contact support (below) with those lines. |
| "No sign-in method is set up yet" | The `AUTH_EMAIL_PASSWORD` setting is missing or isn't `true`. Check it in Render → **Environment**. |
| "That email and password don't match" on your first sign-in | Check the email matches `BOOTSTRAP_ADMIN_EMAILS` exactly, and the password matches `ADMIN_INITIAL_PASSWORD` exactly (capitals count). Both are in Render → **Environment**. The setup password must be at least 10 characters. |
| "That email and password don't match" for a teammate | They may have mistyped it. An admin clicks **Password link** next to them in **Users & access** (Part 6). |
| "Too many tries. Wait 15 minutes…" | Wait 15 minutes and try again, or ask an admin for a **Password link**. |
| "Your account has not been invited yet" | That email address hasn't been invited. An admin invites it in **Users & access**. With Google or Microsoft sign-in, the person must use the same email they were invited with. |
| "Your access has been turned off" | An admin disabled this person. An admin can click **Restore** in **Users & access** (tick **Show disabled** to see them). |
| "This link has expired or has already been used" | Password links work once, within 24 hours (one hour for "Forgot password?" emails). Ask an admin for a new one. |
| Invitations or "Forgot password?" emails don't arrive | The app can't send email until Part 7 "Let the app send email" is done. Until then, copy invite and password links and send them yourself. Also check the spam folder. |
| Google: `Error 400: redirect_uri_mismatch` | The redirect address in Google Cloud doesn't exactly match your Lead Tracker address. Check `https://`, the spelling, and that it ends in `/api/auth/callback/google`. |
| Google: "Access blocked: this app is restricted to users within its organization" | The person used a personal Google account. They need their company account. |
| Microsoft: `AADSTS50011` | The redirect address in Microsoft Entra doesn't match. It must end in `/api/auth/callback/microsoft-entra-id`. |
| Microsoft sign-in suddenly stopped working | The client secret probably expired. Make a new one (Part 7) and update `AUTH_MICROSOFT_ENTRA_ID_SECRET` in Render. |
| The app shows "Service unavailable" or won't load for a few minutes | It's restarting after a settings change or an update. Wait two minutes and refresh. |
| A booking page says free times can't be loaded | That person hasn't connected their calendar (Part 7, "Connect each person's mailbox and calendar"). |
| AI buttons say AI isn't set up | Add an AI key (Part 7, "AI features"). |

## Getting help

Lead Tracker is published by Droisys. If you're stuck at any step, contact us:

- **Email:** sales@droisys.com
- **Phone:** +1 (408) 874-0184
- **Website:** [www.droisys.com](https://www.droisys.com)

To help us help you quickly, include:

1. Which part and step of this guide you're on.
2. A screenshot of what you see.
3. If Render is involved, the last 20 lines from **lead-tracker** → **Logs**.

Never send passwords, secret keys or your full Render settings. We'll never ask for them.

## Appendix: setup checklist

Tick each item as you go. The first ten get you live; the rest are optional.

- [ ] Option A: **Deploy to Render** clicked on github.com/droisyscloud/LeadTracker. Or, for Options B and C: your copy is in your GitHub repositories (Part 1)
- [ ] Render account created and payment card added (Part 2)
- [ ] Blueprint created with `BOOTSTRAP_ADMIN_EMAILS`, `ADMIN_INITIAL_PASSWORD`, `COMPANY_NAME` and `TEAM_TIMEZONE` (Part 2)
- [ ] **lead-tracker** shows **Live**, and its `.onrender.com` address is saved (Part 2)
- [ ] Signed in as admin and changed the setup password (Part 3)
- [ ] Company profile filled in: name, what you sell, contact details (Part 4)
- [ ] Logo and icon uploaded (Part 4)
- [ ] Postal address added in **Email compliance** (Part 4)
- [ ] Products added, plus teams and events if you use them (Part 4)
- [ ] Team invited, and each person has joined (Part 5)
- [ ] Optional: email sending set up (Part 7)
- [ ] Optional: Google or Microsoft sign-in, and mailboxes connected (Part 7)
- [ ] Optional: AI key added (Part 7)
- [ ] Optional: your own web address (Part 7)
- [ ] Optional: weekly backup to Google Drive switched on (Part 8)

## For IT teams: your own server with Docker

If you'd rather run Lead Tracker on your own Linux server instead of Render, you need Docker and a web address with HTTPS in front of it (Caddy, Nginx or your cloud's load balancer).

```bash
# 1. Get the files onto the server (unzip, or git clone your copy)
cd lead-tracker

# 2. Settings: copy the template and fill in every line marked REQUIRED
#    (APP_URL, AUTH_SECRET, BOOTSTRAP_ADMIN_EMAILS, AUTH_EMAIL_PASSWORD=true, ADMIN_INITIAL_PASSWORD)
cp .env.example .env
nano .env

# 3. Start it (a PostgreSQL database is included)
export POSTGRES_PASSWORD=$(openssl rand -hex 16)   # keep this value somewhere safe
docker compose up -d --build

# 4. Check it's up
curl http://localhost:3000/api/health
```

Then point your HTTPS proxy at port 3000 and continue from Part 3 of this guide, using your own address. Any setting in Part 7 goes in `.env` instead of Render; run `docker compose up -d` again after changing it.

To update later: replace the files, then run `docker compose up -d --build`. Your data stays in the Docker volumes `pgdata` and `uploads`; back those up.
