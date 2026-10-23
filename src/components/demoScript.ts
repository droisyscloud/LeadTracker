/**
 * The narrated demo: chapters of steps covering every page, menu and button. Each step goes to a page,
 * may open something to show it (a menu, a form; never saves), highlights a part (a CSS selector, optionally
 * the one whose text includes `btn`) and speaks. {lead}, {deal} and {company} come from the viewer's own data.
 * role: who can see the step (others skip it). Steps whose part isn't on this person's screen are skipped.
 */
/** ui: the menu or window this step shows (it's opened if needed, and closed before a step that doesn't use it). */
export type DemoStep = { id: string; path: string; sel: string; btn?: string; open?: string; click?: string; clickText?: string; event?: string; close?: boolean;
  ui?: "jump" | "new" | "bell" | "profile" | "email" | "call" | "deal"; role?: "manager" | "admin"; billing?: boolean; say: string };
export type DemoChapter = { title: string; steps: DemoStep[] };

export const DEMO: DemoChapter[] = [
  { title: "Getting around", steps: [
    { id: "g1", path: "/home", sel: ".side .nav", say: "Welcome. This demo walks you through every page, menu and button, one at a time. You can pause, skip ahead or jump to any chapter. Let's start with getting around. On the left is the menu, grouped by what you're doing: Today, Pipeline, Outreach, Insights and Admin. On a phone it becomes a bar at the bottom, with More for the rest." },
    { id: "g2", path: "/home", sel: ".rail-toggle", say: "This small button collapses the menu to a slim strip of icons, to give your work more room. Click it again to bring the full menu back. The app remembers your choice." },
    { id: "g3", path: "/home", sel: ".topbar .search", say: "Search finds any lead, company or deal as you type. Press the slash key to jump straight into it." },
    { id: "g4", ui: "jump", path: "/home", sel: ".jump-box", event: "lt:jump", close: true, say: "This is the Jump bar. Press Command K on a Mac or Control K on Windows from anywhere, and type a name, a page or an action like new deal or book a meeting. Use the arrow keys and Enter to go." },
    { id: "g5", ui: "new", path: "/home", sel: ".new-menu", click: ".topbar button", clickText: "New", close: true, say: "The New menu adds anything from anywhere: a contact, company, deal, task, meeting, event, product or team, and you can import a spreadsheet of contacts from here too." },
    { id: "g6", path: "/home", sel: ".topbar button", btn: "Add note", say: "Add note captures an event as it happens: pick the event, then add photos with people, business cards, voice notes or text, and save. AI reads it in the background and asks before adding anyone as a contact. Your notes are on the Notes page, grouped by event." },
    { id: "g7", path: "/home", sel: ".topbar .help-btn", say: "The question mark opens help for the page you're on, the keyboard shortcuts, a quick tour of the page, and this demo." },
  ] },
  { title: "Notifications", steps: [
    { id: "n1", ui: "bell", path: "/home", sel: ".menu.notif", click: ".topbar .bell > button, .topbar button[aria-label*='otification']", close: true, say: "The bell shows your notifications: a task given to you, being tagged or mentioned, a lead replying, a booking, a document being opened, meeting prep being ready, and reminders when things are due or overdue. Each has a coloured marker for its kind. Click one to go straight to it. The same alerts can arrive on your phone." },
  ] },
  { title: "Your profile menu", steps: [
    { id: "u1", ui: "profile", path: "/home", sel: ".profile-card", click: ".acct", say: "Click your picture to open your profile menu. At the top are your name, email and role." },
    { id: "u2", ui: "profile", path: "/home", sel: ".profile-card .pc-theme", click: ".acct", say: "Here you choose light, dark, or automatic, which follows your computer or phone." },
    { id: "u3", ui: "profile", path: "/home", sel: ".profile-card", click: ".acct", say: "Below that: your account settings, users and access for admins, jump to anything, quick add, import contacts, export everything to a spreadsheet if your role allows, install the app on this device, and sign out." },
  ] },
  { title: "Home", steps: [
    { id: "h1", path: "/home", sel: ".cockpit", say: "Home is your day at a glance: a greeting, how much of today's follow-up work is done, and your agenda of meetings and tasks. When your calendar has meetings with contacts, a note here points you to the tasks it suggests." },
    { id: "h2", path: "/home", sel: ".ck-next", say: "Next best actions lists the most important step for each of your leads, with the reason, like replying to someone who wrote yesterday or sending a price list they asked for. Click one to open that lead." },
    { id: "h3", path: "/home", sel: ".kpis", say: "These tiles are the numbers that matter: new leads, open pipeline, how many were contacted, emails and calls, and who's due today." },
    { id: "h4", path: "/home", sel: ".panel", btn: "AI summary", say: "The AI summary reads the whole pipeline and tells you, in a few lines, what matters, what's slipping and what to do next. Minimize it if you don't need it." },
  ] },
  { title: "Follow-ups", steps: [
    { id: "f1", path: "/followups", sel: ".panel", btn: "due today", say: "Follow-ups lists everyone who's due for contact today, with why: their follow-up date has come, they've never been contacted, or they've gone quiet." },
    { id: "f2", path: "/followups", sel: ".fr-act", say: "Each row has quick actions to email or call, so you can work down the list without opening every lead. The cross removes a follow-up, scheduled ones too. Set a new follow-up date any time to bring someone back." },
    { id: "f3", path: "/followups", sel: ".panel", btn: "Scheduled", say: "Scheduled shows follow-ups coming up later, and Going cold shows leads that haven't been touched for a while, before they slip away." },
    { id: "f4", path: "/followups", sel: ".bulkbar button", btn: "Select", say: "Select lets you tick several people, or all of them, and remove their follow-ups in one go." },
  ] },
  { title: "Tasks", steps: [
    { id: "k1", path: "/tasks", sel: ".seg", say: "Tasks shows what's assigned to you. Switch to tasks you're tagged on, tasks you created, or, for managers, everyone's." },
    { id: "k2", path: "/tasks", sel: ".main button", btn: "New task", say: "New task creates one with a due date, priority, who it's for and who to tag. Tasks can repeat, and reminders go out the day before and when overdue." },
    { id: "k3", path: "/tasks", sel: ".panel", btn: "Overdue and today", say: "Tasks are grouped into overdue and today, coming up, and done. Open one to discuss it with the team, attach files, or mark it done." },
    { id: "k4", path: "/tasks", sel: ".bulkbar button", btn: "Select", say: "Select lets you tick several tasks and mark them done or delete them at once. And when your calendar has upcoming meetings with contacts, Suggested from your calendar appears above, with a prep task and a follow-up task for each. Nothing is added until you tick what you want and press Add, or Dismiss." },
  ] },
  { title: "Calendar", steps: [
    { id: "c1", path: "/calendar", sel: ".calv", say: "The calendar puts everything with a date in one place: tasks, follow-ups, meetings, events, deal close dates and invoices." },
    { id: "c2", path: "/calendar", sel: ".s12.chips, .chips", say: "These coloured chips show or hide each kind: tasks, follow-ups, meetings, events, deal close dates and invoices." },
    { id: "c2b", path: "/calendar", sel: ".main .s12.inline > .inline", btn: "Month", say: "Here you switch between just your own items and everyone's, and between a month view and a week view." },
    { id: "c3", path: "/calendar", sel: ".main button", btn: "+ Meeting", say: "Plus meeting books a meeting straight from the calendar." },
    { id: "c4", path: "/calendar", sel: ".main .panel", btn: "Drag tasks", say: "Click any day to see everything on it here. To move a task or follow-up, drag it onto another day." },
  ] },
  { title: "Contacts and the lead page", steps: [
    { id: "l1", path: "/contacts", sel: ".quick", say: "Contacts shows all your leads. Quick views narrow the list in one tap: hot leads, new ones, meetings set, yours, unassigned, and not now." },
    { id: "l2", path: "/contacts", sel: ".dir-tools", say: "Search, change the order, open Filters for stage, owner, product, event, team, rating and tag, and switch between cards and a list. Saved views keep a set of filters to reuse." },
    { id: "l3", path: "/contacts", sel: ".cards", say: "Each card shows the person, their company, stage and rating, products of interest, when they were last contacted and when they're next due, with one-tap email and call." },
    { id: "l4", path: "/contacts?id={lead}", sel: ".lead-nav", say: "A lead opens on its own page. Back to all contacts is on the left, and these arrows step to the previous or next lead in your list." },
    { id: "l5", path: "/contacts?id={lead}", sel: ".nba-wrap", say: "Next best action suggests what to do now and why. Do it, make it a task, or snooze it. More suggestions and ask AI are underneath." },
    { id: "l6", path: "/contacts?id={lead}", sel: ".hbtns", say: "Edit changes their name, title, company, email, phone, other emails and phone numbers, website and LinkedIn, or deletes the lead to the recycle bin." },
    { id: "l7", path: "/contacts?id={lead}", sel: ".stage-track", say: "The stage track shows how far they've got. Click a step to move them there, or mark them not now." },
    { id: "l8", path: "/contacts?id={lead}", sel: ".lead-full .fields", say: "Their key details: stage, owner, next follow-up date and rating. Change any of them right here." },
    { id: "l8b", path: "/contacts?id={lead}", sel: ".lead-full .fields", btn: "Source", say: "Below that: where they came from, who introduced them, the event you met them at, and their team." },
    { id: "l8c", path: "/contacts?id={lead}", sel: ".lead-full .section-h", btn: "Products of interest", say: "Products of interest shows what they want to hear about, which feeds the product reports." },
    { id: "l9", path: "/contacts?id={lead}", sel: ".actions.dock", say: "The action buttons: write an email, book a meeting, log a call, log a reply they sent, log a request like pricing, log a meeting, add a note, attach a file, and record a voice note. They stay in reach as you scroll." },
    { id: "l10", path: "/contacts?id={lead}", sel: ".actions", btn: "Add task", say: "Under those: AI meeting notes turns your notes or a recording into a summary and next steps. Save now puts it on the timeline straight away and AI writes it up in the background, or write it up first to review it and pick tasks. Then Add task, Add deal, and meeting prep before a meeting." },
    { id: "l11", path: "/contacts?id={lead}", sel: ".lead-page section.panel:not(.lead-full)", btn: "AI summary", say: "The AI summary of this lead sums up the relationship and suggests next steps. Refresh it any time." },
    { id: "l12", path: "/contacts?id={lead}", sel: ".disc-wrap", say: "Team discussion is for internal chat about the lead: mention a colleague with the at sign, attach files or record a voice note. Customers never see it." },
    { id: "l13", path: "/contacts?id={lead}", sel: ".tl-filter", say: "Everything that happened is on the timeline, newest first, each kind in its own colour: blue for emails sent, cyan for replies, green for calls, violet for meetings, amber for notes. Tap a chip to show one kind." },
    { id: "l14", path: "/contacts?id={lead}", sel: ".timeline .ti", say: "Long entries fold up: show more, or full view to read the whole thing with its attachments. Your own notes and calls can be edited, and every change is recorded. Your emails are private to you: Share lets you keep one to yourself, share it with the team, or with specific people by email." },
  ] },
  { title: "Emails and AI", steps: [
    { id: "e1", ui: "email", path: "/contacts?id={lead}", sel: ".compose", open: "Write email", say: "Write email opens here. Choose a template, or let the AI writer draft it from a few words, or by speaking. Every text box has an AI button to polish your writing." },
    { id: "e2", ui: "email", path: "/contacts?id={lead}", sel: ".compose .ins-link", open: "Write email", say: "Insert tracked link adds a brochure or deck from the content library, so you'll see when they open it and what they read." },
    { id: "e3", ui: "email", path: "/contacts?id={lead}", sel: ".compose button", btn: "Send now", open: "Write email", say: "Send now sends it from your own Gmail, after a quick check for left-over placeholders, the wrong name, a missing attachment, another customer's name, or not answering what they asked. Replies come back onto the timeline by themselves." },
  ] },
  { title: "Calls, notes, voice notes and meetings", steps: [
    { id: "m1", ui: "call", path: "/contacts?id={lead}", sel: ".compose", open: "Log call", say: "Log call records the outcome, a note, and the next follow-up date in a few seconds. Notes, requests and meetings work the same way." },
    { id: "m2", path: "/contacts?id={lead}", sel: ".voice-btn", say: "Voice note is made for booths. Tap it, talk, stop, and press Save now. It goes on the timeline at once with the recording, and AI writes it up in the background and tells you when it's done, so you never wait." },
    { id: "m3", path: "/contacts?id={lead}", sel: ".actions.dock button", btn: "Book meeting", say: "Book meeting shows your free times, lets you add colleagues and see when they're busy, and sends one invite with a Meet link to everyone." },
    { id: "m4", path: "/contacts?id={lead}", sel: ".actions button", btn: "Meeting prep", say: "Meeting prep gives you a brief before you meet them: who they are, the history, what they asked for, open questions and talking points. It arrives by itself about an hour before a booked meeting." },
  ] },
  { title: "Notes from events", steps: [
    { id: "nt1", path: "/notes", sel: ".dir-head", say: "Notes holds everything you captured with Add note: photos with people, business cards, voice notes and text, grouped by event. Open an event to see its notes, then open a note to work on it. A note is yours until you share it with the team or with specific people." },
    { id: "nt2", path: "/notes", sel: ".dir", say: "Inside a note, AI lists the people it found on cards and badges and in what you said. For each one: add the contact and their company, the contact only, the company only, or set them aside to decide later. Nothing becomes a contact until you choose." },
    { id: "nt3", path: "/notes", sel: ".dir", say: "Summarize writes a short summary, key points, next steps and the next best action. Turn any step into a task linked to the contact, add your own follow-up task, or dismiss a step you don't need." },
  ] },
  { title: "Companies", steps: [
    { id: "o1", path: "/companies", sel: ".quick", say: "Companies shows every organisation. Quick views show all, those with open deals, customers, or those that have gone quiet." },
    { id: "o2", path: "/companies", sel: ".dir-tools", say: "Search, sort, filter by product, team, owner, event, industry or how far anyone has got, switch to a list, or add a new company." },
    { id: "o3", path: "/companies", sel: ".cards", say: "Each card shows the people there, a bar of how far they've each got, the open pipeline, money won, and when there was last activity." },
    { id: "o4", path: "/companies?id={company}", sel: ".prof-hero", say: "A company's page starts with its key numbers. Edit details, book a meeting, add a deal, or add a person here." },
    { id: "o5", path: "/companies?id={company}", sel: ".mini-cards", say: "People lists everyone at the company, with their stage. Click one to open them." },
    { id: "o6", path: "/companies?id={company}", sel: ".panel", btn: "Everything that happened", say: "Everything that happened combines the timelines of everyone there, so you see the whole relationship in one place." },
    { id: "o7", path: "/companies?id={company}", sel: ".prof-side", say: "On the right: the AI summary of the account, its deals, open tasks, products of interest, notes, and the team discussion." },
  ] },
  { title: "Deals and money", steps: [
    { id: "d1", path: "/deals", sel: ".periods", say: "Deals shows your pipeline. Pick a period by close date, such as this quarter or year to date, and the board and totals follow it." },
    { id: "d2", path: "/deals", sel: ".kpis", say: "These tiles show open pipeline, the weighted forecast, money collected and still outstanding, what was won in the period compared with last year, and your win rate." },
    { id: "d3", path: "/deals", sel: ".pipe", say: "Each column is a stage. Drag a deal to move it. Winning or losing asks why, so the reasons show up in reports." },
    { id: "d4", path: "/deals", sel: ".dperiods", say: "Closed by month, quarter or year shows won value, losses, win rate, what's still open, and money received." },
    { id: "d5", ui: "deal", path: "/deals?id={deal}", sel: "dialog .pay", billing: true, say: "Open a deal to edit it. Payments shows what's been received and what's pending. Add a payment received, or one expected later." },
    { id: "d6", ui: "deal", path: "/deals?id={deal}", sel: "dialog .dlg", btn: "Contracts & billing", billing: true, say: "Contracts and billing shows the SOWs and invoices for this deal. Attach an SOW here, or open it in Billing and contracts." },
    { id: "d7", ui: "deal", path: "/deals?id={deal}", sel: "dialog .dlg", btn: "Team discussion", say: "Team discussion is internal chat about the deal, with mentions and attachments." },
    { id: "d8", ui: "deal", path: "/deals?id={deal}", sel: "dialog .dhist", say: "History lists every change to the deal, from what to what, by whom and when." },
  ] },
  { title: "Billing and contracts", steps: [
    { id: "b1", path: "/billing", billing: true, sel: ".bill-kpis", say: "Billing and contracts brings every invoice together: due this month, overdue, requested, awaiting payment, and paid." },
    { id: "b2", path: "/billing", billing: true, sel: ".main button", btn: "Attach SOW", say: "Attach SOW reads a signed statement of work with AI and turns its payment terms into invoice dates. You check each one, mark it pending or already paid, choose who looks after it, and save." },
    { id: "b3", path: "/billing", billing: true, sel: ".main button", btn: "Billing item", say: "Billing item adds an invoice by hand, for anything not in an SOW." },
    { id: "b4", path: "/billing", billing: true, sel: ".quick", say: "These chips show what's due this month, overdue, upcoming, requested, awaiting payment, paid, or renewals coming up." },
    { id: "b4b", path: "/billing", billing: true, sel: ".bill-filters", say: "Filter by customer, by the person looking after the invoice, or by period." },
    { id: "b5", path: "/billing", billing: true, sel: ".bi.requested .bi-act, .bi.scheduled .bi-act", say: "On an unpaid invoice: ask accounts to invoice, which emails them with the SOW attached, then mark it invoiced, and paid when the money arrives. Details shows its whole history." },
    { id: "b6", path: "/billing?tab=contracts", billing: true, sel: ".sow-list", say: "The contracts tab lists every SOW: value, term, payment terms, what's been invoiced and paid, when it was last paid and the next invoice. Edit or remove any of them." },
  ] },
  { title: "Outreach: sequences, events, products and content", steps: [
    { id: "s1", path: "/sequences", sel: ".main .grid", say: "Sequences send a series of follow-up emails automatically, stopping as soon as someone replies. Managers create and pause them; everyone can enrol leads and see who's enrolled." },
    { id: "s2", path: "/events", sel: ".main .grid", say: "Events are the trade shows you attend, added by managers. Events compared shows the leads, meetings, pipeline and wins each one produced, so you know which shows pay off." },
    { id: "s3", path: "/products", sel: ".cards, .dir", say: "Products shows what you sell. Each card has how many leads are interested, the pipeline, money won, and a small funnel of how far interested leads have got." },
    { id: "s4", path: "/content", sel: ".dir-head", say: "Content holds anything you share with customers: brochures, decks, case studies, videos, images, spreadsheets, or a link to a web page or video. Share them through tracked links and see who opened them, and for PDFs, which pages they read and for how long." },
  ] },
  { title: "Reports and dashboards", steps: [
    { id: "r1", path: "/reports", sel: ".rep-tabs", say: "Reports has three tabs: an overview of the main numbers, a report builder for your own reports, and dashboards to share." },
    { id: "r2", path: "/reports?tab=builder", sel: ".rb-controls", say: "In the report builder, choose what to count, how to group it, the period, filters for person, team, product or event, and a chart." },
    { id: "r3", path: "/reports?tab=builder", sel: ".rb-out", say: "The result appears straight away, with the total." },
    { id: "r4", path: "/reports?tab=builder", sel: ".rb-save", say: "Name it and save it, and choose whether to share it with the team." },
    { id: "r4b", path: "/reports?tab=builder", sel: ".rep-saved", say: "Saved reports are listed here. Edit them, share them, or schedule them to be emailed every week or month with a spreadsheet attached." },
    { id: "r5", path: "/reports?tab=dashboards", sel: ".dash-wrap", say: "Dashboards put saved reports together on one page, with a private link anyone can open without signing in. Copy it, switch it off, or make a new link." },
  ] },
  { title: "Team and admin", steps: [
    { id: "a1", path: "/teams", role: "manager", sel: ".main .panel", btn: " members", say: "Teams groups people, for example by region or product. Each team shows its lead, members, pipeline and how it's doing. Managers see their team's leads and deals." },
    { id: "a1b", path: "/teams", role: "manager", sel: ".main .panel", btn: "Teams compared", say: "Teams compared puts every team side by side: leads, contacts, emails, replies, meetings, pipeline and wins." },
    { id: "a1c", path: "/teams", role: "manager", sel: ".main button", btn: "New team", say: "New team creates a team and chooses its members." },
    { id: "a2", path: "/team", role: "admin", sel: ".panel", btn: "Team members", say: "Users lists everyone with their role and teams. Change someone's role or teams, or disable their access." },
    { id: "a3", path: "/team", role: "admin", sel: ".panel", btn: "Invite teammates", say: "Invite teammates by email, choosing their role and teams." },
    { id: "a3b", path: "/team", role: "admin", sel: ".panel", btn: "Pending invites", say: "Pending invites lists invitations not yet accepted. Resend or cancel them here." },
    { id: "a3c", path: "/team", role: "admin", sel: ".panel", btn: "Audit log", say: "Audit log shows the most recent changes, like role changes, deletions, merges and exports. The full history is on the audit history page." },
    { id: "a4", path: "/team", role: "admin", sel: ".panel", btn: "Roles: who sees what", say: "Roles explains what admins, managers, sales reps and viewers can see and do." },
    { id: "a5", path: "/settings", role: "manager", sel: ".panel", btn: "Permissions", say: "In settings, permissions decide for each role who can export, delete, see money, and see billing." },
    { id: "a6", path: "/settings", role: "manager", sel: ".panel", btn: "Email compliance", say: "Email compliance holds the postal address added to every follow-up email, with an unsubscribe link, as the law requires." },
    { id: "a7", path: "/settings", role: "manager", sel: ".panel", btn: "Billing: accounts team", say: "Billing sets the accounts team's email address for invoice requests." },
    { id: "a8", path: "/settings", role: "manager", sel: ".panel", btn: "Google Chat alerts", say: "Google Chat alerts post deal wins, bookings, hot replies, new website leads, a daily summary and the Monday digest to a Chat space." },
    { id: "a9", path: "/settings", role: "manager", sel: ".panel", btn: "Weekly backup", say: "Weekly backup saves a spreadsheet of everything to Google Drive." },
    { id: "a10", path: "/settings", role: "manager", sel: "section.panel", btn: "Integrations", say: "Integrations shows which connections are switched on, such as sign-in, email sending, the mailbox and calendar, AI and HubSpot." },
    { id: "a10b", path: "/settings", role: "manager", sel: "section.panel", btn: "Copy form code", say: "Website form gives you code to paste into your website, so enquiries arrive here as new leads." },
    { id: "a10c", path: "/settings", role: "manager", sel: "section.panel.s5", btn: "Background jobs", say: "Background jobs are the automatic tasks, like syncing mailboxes and sending reminders, with when each last ran. Run any of them now." },
    { id: "a10d", path: "/settings", sel: ".sh", role: "manager", say: "Mailbox and calendar sync shows each person's mailbox: when it last synced, what it logged this week, and who hasn't connected yet. The switch here decides whether upcoming calendar meetings suggest prep and follow-up tasks." },
    { id: "a10e", path: "/settings", sel: ".dh", role: "manager", say: "Data clean-up finds duplicate contacts to merge, companies with no website, people filed under the wrong company, and contacts with no email, so emails and meetings land on the right person." },
    { id: "a11", path: "/settings", role: "manager", sel: ".panel", btn: "Possible duplicate people", say: "Possible duplicate people finds leads entered twice, so you can merge them into one." },
    { id: "a12", path: "/audit", role: "admin", sel: ".dir-filters", say: "Audit history shows who did what and when, in plain words. Filter by person, kind of change, date, or search." },
    { id: "a13", path: "/trash", sel: ".dir-head", say: "The recycle bin keeps deleted leads, deals, timeline entries and companies for thirty days, with everything deleted with them. Restore puts it all back, or delete it forever." },
  ] },
  { title: "Your account and phone", steps: [
    { id: "p0", path: "/account", sel: ".panel", btn: "Your account", say: "Your account page starts with your details: your role, when you joined and last signed in, what your role can do, and Sign out." },
    { id: "p1", path: "/account", sel: ".panel", btn: "Mailbox and calendar", say: "Mailbox and calendar connects your Google account, so emails go from your Gmail, replies come back to the timeline, and meetings use your calendar. It syncs by itself every few minutes. Sync now, reconnect or disconnect here." },
    { id: "p2", path: "/account", sel: ".panel", btn: "Daily digest", say: "Daily digest sets your time zone and sends you a morning summary of your day by email." },
    { id: "p3", path: "/account", sel: ".panel", btn: "Phone notifications", say: "Phone notifications sends alerts to this phone or computer. On an iPhone, add the app to the home screen first, then turn them on here. Send a test to check." },
    { id: "p4", path: "/account", sel: ".panel", btn: "Your booking page", say: "Your booking page gives leads a link to book time with you: choose meeting lengths, working days and hours, notice and buffer times. They get a calendar invite and land on your timeline." },
    { id: "p5", path: "/account", sel: ".panel", btn: "Security", say: "Security explains how you sign in, how long a session lasts, how your mailbox connection is protected, and that your access is checked on every action." },
    { id: "p6", path: "/home", sel: ".topbar button", btn: "Add note", say: "Finally, at events use Add note: photograph people and business cards, record a voice note, and save in a second. AI finds the people and asks if you want to add them; Quick add in the menu still works with no signal. That's the whole app. Replay any chapter from the question mark menu." },
  ] },
];

export const ALL_STEPS = DEMO.flatMap((c, ci) => c.steps.map((s) => ({ ...s, chapter: ci })));

/** The narration's address includes a fingerprint of its exact wording, so a reworded step never plays an old recording. */
export function voiceUrl(s: { id: string; say: string }) {
  let h = 5381; for (let i = 0; i < s.say.length; i++) h = ((h << 5) + h + s.say.charCodeAt(i)) >>> 0;
  return `/api/demo/voice?id=${s.id}&v=${h.toString(36)}`;
}
