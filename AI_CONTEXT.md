# AI_CONTEXT.md — SplitEase (Splitwise Clone)

> **Purpose:** This file is the complete, forensic source of truth for the SplitEase application, reverse-engineered from the actual repository. It is detailed enough for another engineer or AI agent to recreate a highly similar application without seeing the original source code.

---

## Project Overview

- **Assignment objective:** Build and deploy a simplified Splitwise-inspired expense-splitting app in 2 days as part of the Spreetail internship assignment, using an AI as a junior engineering collaborator.
- **Delivered scope:** Full-stack web app named **SplitEase** with authentication, group management, multi-mode expense splitting, real-time chat per expense, balance tracking, debt simplification, settlement recording, activity log, and a profile page.
- **Core functionality:** Users sign up, create groups, add members, create expenses (split 4 ways), view balances, record payments to settle debts, and chat on individual expenses in real time.
- **Deployment target:** Vercel (Next.js) + Supabase (PostgreSQL, Auth, Realtime).

---

## Product Research

### Splitwise features studied
- Group-centric organization: all expenses belong to a group.
- Four split modes: Equal, Exact amounts (Unequal), Percentage, Shares.
- Single payer per expense records who paid the total amount.
- Balance aggregation per group and per individual (net across all groups).
- "Simplify Debts" feature reduces the number of transactions needed to settle a group via a greedy matching algorithm.
- Real-time comments/chat attached to each individual expense.
- Activity feed showing all group events chronologically.

### Workflows identified
1. Sign up → create group → add members → add expense → view balance → settle up.
2. Open expense → view split breakdown → chat with group members.
3. Dashboard shows net balance summary and quick access to groups and recent expenses.

### Product assumptions
- All expenses must belong to a group (no standalone non-group expenses).
- Currency is defaulted to INR (₹) for all UI display, though the profile stores a currency field. The `formatCurrency` utility uses `en-IN` locale by default.
- Only one payer per expense (single payer model).
- Users must already be registered before they can be added to a group (no email invite link flow).
- No image uploads for avatars or receipts.

### Scope reductions vs full Splitwise
- No multi-payer expenses.
- No email invite links (target user must exist in the system).
- No receipt image uploads.
- No push notifications.
- No CSV export.
- No dashboard analytics/charts.
- No Google/social OAuth.
- No multi-currency conversion.

---

## User Personas

1. **Primary user:** Friend in a shared household or travel group who wants to track who paid what and settle up without spreadsheets.
2. **Admin user:** Group creator who manages membership, adds/removes users, and records settlements.
3. **Passive member:** Added to a group by an admin; can view balances, add expenses, and chat, but cannot remove other members.

---

## Functional Requirements

### Authentication

**Purpose:** Secure, session-based login using Supabase Auth (email/password only).

**Signup workflow:**
1. User fills form: Full Name, Email, Password, Confirm Password.
2. Validation: all fields required; password ≥ 6 characters; passwords must match.
3. Calls `supabase.auth.signUp({ email, password, options: { data: { full_name } } })`.
4. Supabase DB trigger `on_auth_user_created` fires → inserts row in `profiles` with `id`, `email`, `full_name` (from metadata, fallback to email prefix).
5. On success: redirected to `/dashboard`.

**Login workflow:**
1. User fills Email + Password.
2. Calls `supabase.auth.signInWithPassword({ email, password })`.
3. On success: toast "Welcome back!" → redirect to `/dashboard`.
4. On error: toast with Supabase error message.

**Session management:**
- `AuthContext` wraps the app. On mount, calls `supabase.auth.getSession()` to hydrate state.
- `supabase.auth.onAuthStateChange` listener updates `user` and `profile` state on every auth event.
- `AuthContext` exposes: `user` (Supabase User object), `profile` (Profile row), `loading`, `signUp`, `signIn`, `signOut`, `refreshProfile`.

**Route protection:**
- Next.js middleware (`src/middleware.ts` → `src/lib/supabase/middleware.ts`) runs on every non-static request.
- Unauthenticated user accessing `/dashboard/*` → redirect to `/login`.
- Authenticated user accessing `/login`, `/signup`, or `/` → redirect to `/dashboard`.
- Dashboard layout additionally checks `useAuth()` and redirects to `/login` if `!user && !loading`.

**Inputs:** email (string), password (string), full_name (string, signup only), confirmPassword (string, signup only).
**Outputs:** Supabase session cookie set; user/profile state populated in AuthContext.
**Edge cases:** Supabase returns error string on duplicate email or wrong password; displayed via toast.

---

### Groups

**Purpose:** Organizational containers for expenses and members.

**Create group workflow:**
1. Navigate to `/dashboard/groups/new`.
2. Fill form: Name (required), Description (optional), Category (dropdown, 7 options), Cover Color (color picker from 10 predefined hex values in `AVATAR_COLORS`).
3. Submit → `supabase.from('groups').insert(...)` → get back `groupData`.
4. Insert creator as admin in `group_members`: `{ group_id, user_id: creator, role: 'admin' }`.
5. Insert activity log: `{ action: 'created_group', description: 'created the group "name"' }`.
6. Toast "Group created!" → navigate to `/dashboard/groups/{groupId}`.

**List groups:**
- `/dashboard/groups` — fetches all groups the user is a member of (RLS enforced) with `group_members(count)` aggregate. Displays as a card grid with cover color, category emoji, name, description, member count.

**Group detail (`/dashboard/groups/[id]`):**
- Fetches: group data, members (with profiles joined), expenses (with payer profile joined, ordered newest first), balances via RPC `get_group_balances`.
- Displays two tabs: **Expenses** and **Balances**.
- Hero area shows group name, description, user's personal net balance in this group.
- Sidebar shows member list with role badges.
- Header has "⚙️ Settings" and "🤝 Settle Up" buttons.

**Group Settings (`/dashboard/groups/[id]/settings`):**
- Admin check: `currentUserMember.role === 'admin' || group.created_by === user.id`.
- **Add member:** Input email → lookup `profiles` by email → if found and not already a member, insert `group_members` row (role: 'member') → log activity → refresh member list.
- **Remove member:** Admin can remove any member; non-admin can only remove themselves. Confirmation dialog → delete `group_members` row → log activity.
- **Delete group:** Only group creator (`created_by === user.id`) can delete. Confirmation dialog → delete `groups` row (cascades to all related data) → log activity → navigate to `/dashboard/groups`.

**Inputs:** name, description, category, cover_color, inviteEmail.
**Validation:** name required; email must pass regex `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`; invitee must exist in `profiles`.
**Edge cases:** User already a member → toast "User is already a member"; user not found → toast "User not found. They must sign up first."

---

### Expenses

**Purpose:** Record a shared expense with a specific split distribution among group members.

**Create expense (`/dashboard/expenses/new`):**
- Accepts optional `?groupId=` query param to pre-select a group.
- Fetches all user's groups on mount; fetches group members when group changes.
- Initializes `splitIncluded` (all members = true) and `splitValues` (all = 0, or 1 for shares mode).

**Form fields:**
- Group (select, required)
- Description (text, required)
- Category (select, 15 options with emojis)
- Amount (number, step 0.01, min 0.01, required, prefixed with ₹)
- Paid By (select from group members; default = current user)
- Split Type (tab buttons: Equal / Exact / Percent / Shares)
- Per-member checkboxes to include/exclude from split
- Per-member number input (hidden for Equal mode)

**Split type tab labels in UI:**
- `= Equal`
- `1.23 Exact`
- `% Percent`
- `📊 Shares`

**Split suffix labels in per-member input:**
- percentage → `%`
- shares → `shares`
- unequal → `₹`

**Submit workflow:**
1. Parse `totalAmount = parseFloat(amount)`.
2. Validate required fields.
3. Validate splits (`validateSplits`).
4. `calculateFinalSplits(totalAmount)` → `splits: Record<userId, owedAmount>`.
5. Insert `expenses` row.
6. Insert `expense_splits` rows: one per included user. `paid_amount` = totalAmount for payer, 0 for others. `owed_amount` = calculated split. `share_value` = raw splitValues[userId] (0 for equal).
7. Insert `activity_log`: `{ action: 'added_expense', description: 'added "desc" for amount' }`.
8. Toast "Expense added!" → navigate to `/dashboard/groups/{groupId}`.

**Delete expense:**
- Only payer (`expense.paid_by === user.id`) can delete.
- Confirmation dialog → delete `expenses` row (cascades to splits and comments) → log activity → navigate back to group.

**Inputs:** groupId, description, amount, category, splitType, paidBy, splitValues, splitIncluded.
**Outputs:** expense row + expense_splits rows + activity_log row.

---

### Split Methods — Exact Calculation Logic

#### Equal Split
```
splitAmount = Math.floor((totalAmount / includedCount) * 100) / 100
remainder = Math.round((totalAmount - splitAmount * includedCount) * 100) / 100
```
- Every included user gets `splitAmount`.
- Remainder (rounding artifact) is added to payer if payer is included, else to first included user.

**Example:** ₹100 split 3 ways → ₹33.33 each, remainder ₹0.01 → payer gets ₹33.34, others get ₹33.33.

#### Unequal Split (Exact Amounts)
- Each included member has a manually entered amount.
- `splits[userId] = splitValues[userId]`.
- Validation: sum of all included amounts must equal `totalAmount` within 0.01 tolerance.

**Example:** ₹100 total, Alice ₹60, Bob ₹40 → stored directly.

#### Percentage Split
```
amt = Math.floor((totalAmount * (pct / 100)) * 100) / 100
```
- Applied per included user.
- Rounding remainder added to payer (or first included user).
- Validation: sum of all percentages must equal 100 within 0.1 tolerance.

**Example:** ₹1000 total, Alice 60%, Bob 40% → Alice ₹600, Bob ₹400.

#### Shares Split
```
perShare = totalAmount / totalShares
amt = Math.floor((userShares * perShare) * 100) / 100
```
- `totalShares` = sum of all included users' share values.
- Rounding remainder added to payer (or first included user).
- Validation: totalShares must be > 0.

**Example:** ₹900 total, Alice 2 shares, Bob 1 share → totalShares=3, perShare=300, Alice ₹600, Bob ₹300.

---

### Expense Detail (`/dashboard/expenses/[id]`)

**Data fetched:**
- Expense with payer profile: `expenses.select('*, profiles!expenses_paid_by_fkey(*), groups(*)')`.
- Splits: `expense_splits.select('*, profiles(*)')`.
- Comments: `expense_comments.select('*, profiles(*)')` ordered ascending.

**Display:**
- Category emoji icon + description + total amount + "Added by [name] on [date]".
- Notes section (if notes field non-empty).
- Split details table: each split shows member avatar, name, "Paid ₹X" badge (if paid_amount > 0), "Owes ₹X".
- Delete button visible only to payer.
- Chat panel (right column on desktop, below on mobile).

**Real-time chat:**
- Subscribes to Supabase Realtime channel `expense_comments_{expenseId}`.
- Event: `postgres_changes` → `INSERT` on `expense_comments` filtered by `expense_id=eq.{expenseId}`.
- On new comment: fetches the commenter's profile, appends to comments state, scrolls to bottom.
- Message bubbles: own messages right-aligned (no avatar shown), others left-aligned with avatar.
- Input: text field + submit button (↑). Empty messages blocked.
- Channel cleaned up on component unmount.

---

### Balances

**Purpose:** Show each member's net financial position within a group.

**Calculation via `get_group_balances` RPC (PostgreSQL function):**
```sql
net_balance = total_paid - total_owed + sum(settlements.settled_paid)
```

Where:
- `total_paid` = sum of all expense amounts in the group where `expenses.paid_by = user_id`.
- `total_owed` = sum of all `expense_splits.owed_amount` for the user within the group.
- `settled_paid` = +amount for each settlement where user is payer, -amount where user is receiver.

**Result:** Array of `{ user_id, full_name, avatar_url, total_paid, total_owed, net_balance }`.
- `net_balance > 0` → user is owed money (gets back).
- `net_balance < 0` → user owes money.
- `net_balance ≈ 0` → settled.

**Group balance display:** Balances tab in group detail shows each member's status as "gets back ₹X", "owes ₹X", or "settled".

**Dashboard balance summary (home page):**
- Fetches all `expense_splits` for the current user across all groups.
- For each split: `net = paid_amount - owed_amount`. If net > 0, adds to `totalOwed`; else adds to `totalOwe`.
- Shows three cards: Net Balance (totalOwed - totalOwe), You are owed (totalOwed), You owe (totalOwe).
- Note: this calculation does NOT factor in settlements — it is approximate and simplified compared to the per-group RPC. This is an acknowledged limitation.

---

### Debt Simplification

**Algorithm:** Greedy matching (implemented client-side in `src/lib/utils.ts`, `simplifyDebts` function).

**Input:** Array of `{ user_id, full_name, net_balance }`.

**Process:**
1. Split into `debtors` (net_balance < -0.01) and `creditors` (net_balance > 0.01).
2. Sort both arrays by absolute amount descending.
3. Two-pointer iteration:
   - Take largest debtor and largest creditor.
   - `amount = min(debtor.amount, creditor.amount)`.
   - If amount > 0.01, create transaction `{ from: debtor, to: creditor, amount: round(amount, 2) }`.
   - Subtract amount from both. Advance pointer for whichever reaches 0.
4. Return transaction array.

**Threshold:** Balances within ±0.01 of zero are ignored (floating point tolerance).
**Limitation:** Greedy approach minimizes transactions well in most cases but is not guaranteed to find the mathematical minimum for complex cyclic debt graphs.

**Used in:** Group detail (Balances tab → "How to settle up" section) and Settle Up page (Suggested tab).

---

### Settlement System

**Purpose:** Record that one member paid another to reduce debt.

**Settle Up page (`/dashboard/groups/[id]/settle`):**
Two modes (tabs):
1. **Suggested:** Shows simplified debt list from `simplifyDebts`. Each entry has a "Record Payment" button.
2. **Manual Entry:** Dropdowns for payer and receiver (from group members), amount input.

**Record payment workflow:**
1. Validate: payer ≠ receiver, amount > 0.
2. Insert `settlements` row: `{ group_id, paid_by: payerId, paid_to: receiverId, amount }`.
3. Insert `activity_log`: `{ action: 'settled_up', description: 'recorded a payment of ₹X from A to B' }`.
4. Toast "Payment recorded successfully" → navigate back to group detail.

**Effect on balances:** The `get_group_balances` RPC's `settlement_adjustments` CTE adds settlements to net_balance computation, so balances update after refresh.

**Inputs:** paid_by (UUID), paid_to (UUID), amount (decimal), group_id (UUID).
**Edge cases:** Payer = receiver → toast error; amount ≤ 0 → toast error.

---

### Activity Log

**Purpose:** Chronological audit trail of significant events in groups.

**Events logged (action strings):**
- `created_group` — when user creates a group.
- `added_expense` — when user adds an expense.
- `deleted_expense` — when user deletes an expense.
- `added_member` — when admin adds someone to a group.
- `removed_member` — when admin removes someone (inferred from settings page logic).
- `settled_up` — when a payment is recorded.

**Activity page (`/dashboard/activity`):**
- Fetches last 50 activity_log entries for user's groups (RLS: `user_id = auth.uid() OR group_id IN user's groups`), joined with profiles and groups.
- Timeline UI with icons per action type: `💸` for expense, `👥` for group, `🤝` for settle, `👤` for member, `📝` default.
- Each entry shows: icon, actor name ("You" or full_name), description text, relative time, clickable group badge.

---

## Complete User Journeys

### Screen: Landing Page (`/`)
- **Purpose:** Marketing/entry page for unauthenticated users. Authenticated users redirected to `/dashboard`.
- **Components:** Header with logo and nav buttons (Log In, Get Started), hero section with headline "Split expenses without the hassle" + gradient text.
- **User actions:** Click "Log In" → `/login`, Click "Get Started" → `/signup`.
- **Data fetched:** None. Uses `useAuth()` to check session.

### Screen: Login (`/login`)
- **Purpose:** Email/password sign-in.
- **Components:** Auth card (glassmorphism), email input, password input, submit button, link to `/signup`.
- **User actions:** Fill form → submit. On success → `/dashboard`. On error → toast.
- **Data fetched:** None (uses AuthContext.signIn).

### Screen: Signup (`/signup`)
- **Purpose:** Create new account.
- **Components:** Auth card, full name input, email input, password input, confirm password input, submit button, link to `/login`.
- **Validation:** password ≥ 6 chars, passwords match.
- **User actions:** Fill form → submit. On success → `/dashboard`.

### Screen: Dashboard Home (`/dashboard`)
- **Route:** `/dashboard` (exact).
- **Purpose:** Overview of net balance, groups, recent expenses.
- **Components:** Balance cards (3), groups list (up to 4, with "View All"), recent expenses list (up to 5).
- **Data fetched:**
  - `groups` with `group_members(count)`.
  - `expenses` last 5, with payer profile + group name.
  - `activity_log` last 10, with profiles.
  - `expense_splits` for current user (all groups) for balance summary.
- **User actions:** Click group → `/dashboard/groups/{id}`. Click expense → `/dashboard/expenses/{id}`. Click "+ New Group" → `/dashboard/groups/new`.

### Screen: Groups List (`/dashboard/groups`)
- **Purpose:** See all user's groups in a card grid.
- **Data fetched:** `groups` with member count.
- **User actions:** Click card → `/dashboard/groups/{id}`. Click "+ New Group" → `/dashboard/groups/new`.

### Screen: New Group (`/dashboard/groups/new`)
- **Purpose:** Create a group.
- **Components:** Form card — name, description, category dropdown, color picker (10 swatches).
- **User actions:** Fill form → submit → `/dashboard/groups/{newId}`. Back button → browser back.

### Screen: Group Detail (`/dashboard/groups/[id]`)
- **Purpose:** View group expenses, balances, members.
- **Components:** Hero header (group name, avatar, personal balance), Expenses tab, Balances tab, Members sidebar.
- **Data fetched:** group, group_members with profiles, expenses with profiles, balances via RPC.
- **User actions:**
  - Switch tabs (Expenses / Balances).
  - Click expense → `/dashboard/expenses/{id}`.
  - Click "+ Add Expense" → `/dashboard/expenses/new?groupId={id}`.
  - Click "⚙️ Settings" → `/dashboard/groups/{id}/settings`.
  - Click "🤝 Settle Up" → `/dashboard/groups/{id}/settle`.
  - Back → `/dashboard/groups`.

### Screen: Group Settings (`/dashboard/groups/[id]/settings`)
- **Purpose:** Manage group membership and delete group.
- **Components:** Group info display, member list with role + remove buttons, invite-by-email form, delete group button.
- **Data fetched:** group, group_members with profiles.
- **User actions:** Invite member, remove member, delete group.

### Screen: Settle Up (`/dashboard/groups/[id]/settle`)
- **Purpose:** Record debt payments.
- **Components:** Two tabs — Suggested (simplified debt list with "Record Payment" buttons) and Manual Entry (payer/receiver dropdowns + amount).
- **Data fetched:** group, group_members with profiles, balances via RPC → simplifyDebts.
- **User actions:** Click "Record Payment" on suggested tab OR fill manual form → submit → back to group.

### Screen: New Expense (`/dashboard/expenses/new`)
- **Purpose:** Add an expense with split configuration.
- **Components:** Form card — group select, description, category, amount, paid-by, split tabs, member inclusion checkboxes, per-member inputs.
- **Data fetched:** groups (all user's), members (of selected group).
- **User actions:** Change group (re-fetches members), change split type, toggle member checkboxes, enter values → submit.

### Screen: Expense Detail (`/dashboard/expenses/[id]`)
- **Purpose:** View expense breakdown and real-time chat.
- **Layout:** Two-column on desktop (expense info left, chat right), single column on mobile.
- **Components:** Expense header card (icon, description, amount, who paid, date, notes, splits table, delete button), Chat card (message list, input form).
- **Data fetched:** expense + profile + group, expense_splits + profiles, expense_comments + profiles.
- **Realtime:** Supabase subscription on `expense_comments`.
- **User actions:** Post comment, delete expense (payer only), navigate back.

### Screen: Activity (`/dashboard/activity`)
- **Purpose:** Timeline of all group events.
- **Components:** Timeline list of activity items with icon, actor, description, time, group badge.
- **Data fetched:** activity_log last 50, with profiles and groups.
- **User actions:** Click group badge → `/dashboard/groups/{id}`.

### Screen: Profile (`/dashboard/profile`)
- **Purpose:** Update display name and currency preference.
- **Components:** Avatar (initials-based, color from hash), full name input, email (disabled), currency select (INR/USD/EUR/GBP), Save button.
- **Data fetched:** Current profile from AuthContext.
- **User actions:** Edit name/currency → save → toast confirmation.

---

## Information Architecture

```
/ (Landing)
├── /login
├── /signup
└── /dashboard (protected, layout with sidebar)
    ├── /dashboard (home overview)
    ├── /dashboard/groups
    │   ├── /dashboard/groups/new
    │   └── /dashboard/groups/[id]
    │       ├── /dashboard/groups/[id]/settings
    │       └── /dashboard/groups/[id]/settle
    ├── /dashboard/expenses
    │   ├── /dashboard/expenses/new
    │   └── /dashboard/expenses/[id]
    ├── /dashboard/activity
    └── /dashboard/profile
```

Sidebar navigation links: Dashboard (📊), Groups (👥), Activity (📋), Profile (⚙️).
Mobile: top header with hamburger + bottom nav bar with same 4 items.

---

## Frontend Architecture

- **Framework:** Next.js 16.2.7, App Router, React 19, TypeScript.
- **Rendering strategy:** All dashboard pages are `'use client'` components using client-side data fetching. No RSC data fetching in dashboard. Landing, login, signup are also `'use client'`.
- **Routing:** File-based App Router. Dynamic segments: `[id]` for groups and expenses.
- **Component structure:** Monolithic page components (no shared component library). Each page is self-contained with all data fetching inline.
- **State management:**
  - `AuthContext` — global user/profile/auth methods. Wraps entire app in `src/app/layout.tsx`.
  - `ToastContext` — global toast notification queue (array of `{ id, type, message }`). Auto-dismisses after 4000ms.
  - Local `useState` — all form state, loading flags, fetched data within each page component.
- **Forms:** Uncontrolled via React state, no form library. Standard HTML form elements with `onSubmit`.
- **Validation:** Inline, imperative logic before API calls. Error messages shown via `showToast`.
- **Navigation:** `useRouter()` for programmatic navigation; `<Link>` for sidebar nav items.

---

## Backend Architecture

- **Backend type:** BaaS (Supabase). No custom API server. No Next.js API routes.
- **Data access:** Direct Supabase JS client calls from client components using `@supabase/supabase-js`.
- **Client instances:**
  - Browser: `createBrowserClient` from `@supabase/ssr` (in `src/lib/supabase/client.ts`).
  - Server: `createServerClient` from `@supabase/ssr` using Next.js cookie store (in `src/lib/supabase/server.ts`) — used only in middleware.
  - Middleware: `createServerClient` with request/response cookie handling (in `src/lib/supabase/middleware.ts`).
- **Authentication:** Supabase Auth with cookie-based sessions managed by `@supabase/ssr`.
- **Authorization:** PostgreSQL Row Level Security (RLS) policies on all tables.
- **Realtime:** Supabase Realtime via `supabase.channel()` with `postgres_changes` listener. Only `expense_comments` and `activity_log` tables are added to the `supabase_realtime` publication.
- **Storage:** None implemented. `receipt_url` column exists in schema but no upload UI.
- **Custom DB logic:** One stored procedure (`get_group_balances`) and one trigger (`on_auth_user_created`).

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Frontend Framework | Next.js | 16.2.7 |
| UI Library | React | 19.2.4 |
| Language | TypeScript | ^5 |
| Styling | Vanilla CSS Modules | — |
| Backend/BaaS | Supabase | — |
| Database | PostgreSQL (via Supabase) | — |
| Auth | Supabase Auth | — |
| Realtime | Supabase Realtime | — |
| Supabase Client | @supabase/supabase-js | ^2.107.0 |
| Supabase SSR Helper | @supabase/ssr | ^0.10.3 |
| Deployment (Frontend) | Vercel | — |
| Date Utilities | date-fns | ^4.4.0 |
| Icon Library | lucide-react | ^1.17.0 |
| Charting | recharts | ^3.8.1 |

Note: `lucide-react` and `recharts` are in `package.json` dependencies but are **not used in any source file in the repository**. They were likely installed speculatively. `date-fns` is also not directly imported; relative time formatting is done with custom `formatRelativeTime` in `utils.ts`.

---

## Folder Structure

```
/
├── .env.local                          # Supabase URL + anon key + service role key
├── package.json
├── tsconfig.json
├── next.config.ts
├── AI_CONTEXT.md
├── BUILD_PLAN.md
├── README.md
├── AGENTS.md
├── CLAUDE.md
├── e2e_test.ts                         # Manual E2E test script (not a test runner)
├── test_auth.ts                        # Auth test script
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql      # Full DB schema, RLS, indexes, RPC, trigger
├── public/                             # Static assets (SVGs)
└── src/
    ├── app/
    │   ├── layout.tsx                  # Root layout: wraps AuthProvider + ToastProvider
    │   ├── globals.css                 # Global CSS variables, base styles, utility classes
    │   ├── page.tsx                    # Landing page (/)
    │   ├── auth.module.css             # Shared styles for /login and /signup
    │   ├── login/
    │   │   └── page.tsx
    │   ├── signup/
    │   │   └── page.tsx
    │   └── dashboard/
    │       ├── layout.tsx              # Dashboard shell: sidebar, mobile header, bottom nav
    │       ├── dashboard.module.css
    │       ├── page.tsx                # Home overview (/dashboard)
    │       ├── home.module.css
    │       ├── groups/
    │       │   ├── page.tsx            # Groups list
    │       │   ├── groups.module.css
    │       │   ├── new/
    │       │   │   ├── page.tsx        # Create group form
    │       │   │   └── newGroup.module.css
    │       │   └── [id]/
    │       │       ├── page.tsx        # Group detail (expenses + balances tabs)
    │       │       ├── groupDetail.module.css
    │       │       ├── settings/
    │       │       │   ├── page.tsx    # Group membership management
    │       │       │   └── settings.module.css
    │       │       └── settle/
    │       │           ├── page.tsx    # Settle up (suggested + manual)
    │       │           └── settle.module.css
    │       ├── expenses/
    │       │   ├── new/
    │       │   │   ├── page.tsx        # New expense form (all split modes)
    │       │   │   └── newExpense.module.css
    │       │   └── [id]/
    │       │       ├── page.tsx        # Expense detail + realtime chat
    │       │       └── expenseDetail.module.css
    │       ├── activity/
    │       │   ├── page.tsx            # Activity timeline
    │       │   └── activity.module.css
    │       └── profile/
    │           ├── page.tsx            # Profile edit
    │           └── profile.module.css
    ├── contexts/
    │   ├── AuthContext.tsx             # Auth state + methods
    │   └── ToastContext.tsx            # Toast notifications
    ├── lib/
    │   ├── utils.ts                    # formatCurrency, getInitials, getAvatarColor, simplifyDebts, etc.
    │   └── supabase/
    │       ├── client.ts               # Browser Supabase client
    │       ├── server.ts               # Server Supabase client (cookie-based)
    │       └── middleware.ts           # Session refresh + route redirect logic
    ├── middleware.ts                   # Next.js middleware entry point
    └── types/
        └── index.ts                   # All TypeScript interfaces + EXPENSE_CATEGORIES + GROUP_CATEGORIES + AVATAR_COLORS
```

---

## Database Design

### Table: `profiles`
**Purpose:** Stores user display information. One row per Supabase auth user.
| Column | Type | Constraints |
|---|---|---|
| id | UUID | PRIMARY KEY, FK → auth.users(id) ON DELETE CASCADE |
| email | TEXT | NOT NULL, UNIQUE |
| full_name | TEXT | NOT NULL, DEFAULT '' |
| avatar_url | TEXT | DEFAULT '' |
| currency | TEXT | DEFAULT 'INR' |
| created_at | TIMESTAMPTZ | DEFAULT NOW() |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() |

**Auto-populated by:** `on_auth_user_created` trigger on `auth.users` INSERT.
**full_name source:** `NEW.raw_user_meta_data->>'full_name'` COALESCE `split_part(email, '@', 1)`.

---

### Table: `groups`
**Purpose:** Group containers for expenses.
| Column | Type | Constraints |
|---|---|---|
| id | UUID | PRIMARY KEY, DEFAULT uuid_generate_v4() |
| name | TEXT | NOT NULL |
| description | TEXT | DEFAULT '' |
| category | TEXT | DEFAULT 'other' |
| cover_color | TEXT | DEFAULT '#1abc9c' |
| created_by | UUID | NOT NULL, FK → profiles(id) ON DELETE CASCADE |
| created_at | TIMESTAMPTZ | DEFAULT NOW() |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() |

---

### Table: `group_members`
**Purpose:** Junction table linking users to groups with role.
| Column | Type | Constraints |
|---|---|---|
| id | UUID | PRIMARY KEY, DEFAULT uuid_generate_v4() |
| group_id | UUID | NOT NULL, FK → groups(id) ON DELETE CASCADE |
| user_id | UUID | NOT NULL, FK → profiles(id) ON DELETE CASCADE |
| role | group_role ENUM | DEFAULT 'member' (values: 'admin', 'member') |
| joined_at | TIMESTAMPTZ | DEFAULT NOW() |

**Unique constraint:** `(group_id, user_id)`.

---

### Table: `expenses`
**Purpose:** Individual expense records.
| Column | Type | Constraints |
|---|---|---|
| id | UUID | PRIMARY KEY, DEFAULT uuid_generate_v4() |
| group_id | UUID | NOT NULL, FK → groups(id) ON DELETE CASCADE |
| paid_by | UUID | NOT NULL, FK → profiles(id) ON DELETE CASCADE |
| description | TEXT | NOT NULL |
| amount | DECIMAL(12,2) | NOT NULL, CHECK (amount > 0) |
| split_type | split_type ENUM | NOT NULL, DEFAULT 'equal' (values: 'equal', 'unequal', 'percentage', 'shares') |
| category | TEXT | DEFAULT 'general' |
| notes | TEXT | DEFAULT '' |
| receipt_url | TEXT | DEFAULT '' |
| created_at | TIMESTAMPTZ | DEFAULT NOW() |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() |

---

### Table: `expense_splits`
**Purpose:** Individual user obligations per expense.
| Column | Type | Constraints |
|---|---|---|
| id | UUID | PRIMARY KEY, DEFAULT uuid_generate_v4() |
| expense_id | UUID | NOT NULL, FK → expenses(id) ON DELETE CASCADE |
| user_id | UUID | NOT NULL, FK → profiles(id) ON DELETE CASCADE |
| owed_amount | DECIMAL(12,2) | NOT NULL, DEFAULT 0 |
| paid_amount | DECIMAL(12,2) | NOT NULL, DEFAULT 0 |
| share_value | DECIMAL(12,4) | DEFAULT 0 |
| created_at | TIMESTAMPTZ | DEFAULT NOW() |

**Unique constraint:** `(expense_id, user_id)`.
**paid_amount meaning:** Full expense amount for the payer, 0 for everyone else (single-payer model).
**share_value meaning:** Raw value entered by user — shares count for 'shares' type, percentage for 'percentage' type, exact amount for 'unequal', 0 for 'equal'.

---

### Table: `settlements`
**Purpose:** Records payment transactions between members to settle debts.
| Column | Type | Constraints |
|---|---|---|
| id | UUID | PRIMARY KEY, DEFAULT uuid_generate_v4() |
| group_id | UUID | NOT NULL, FK → groups(id) ON DELETE CASCADE |
| paid_by | UUID | NOT NULL, FK → profiles(id) ON DELETE CASCADE |
| paid_to | UUID | NOT NULL, FK → profiles(id) ON DELETE CASCADE |
| amount | DECIMAL(12,2) | NOT NULL, CHECK (amount > 0) |
| note | TEXT | DEFAULT '' |
| created_at | TIMESTAMPTZ | DEFAULT NOW() |

---

### Table: `expense_comments`
**Purpose:** Chat messages attached to a specific expense (real-time).
| Column | Type | Constraints |
|---|---|---|
| id | UUID | PRIMARY KEY, DEFAULT uuid_generate_v4() |
| expense_id | UUID | NOT NULL, FK → expenses(id) ON DELETE CASCADE |
| user_id | UUID | NOT NULL, FK → profiles(id) ON DELETE CASCADE |
| message | TEXT | NOT NULL |
| created_at | TIMESTAMPTZ | DEFAULT NOW() |

**Realtime:** Added to `supabase_realtime` publication.

---

### Table: `activity_log`
**Purpose:** Audit trail of user actions in groups.
| Column | Type | Constraints |
|---|---|---|
| id | UUID | PRIMARY KEY, DEFAULT uuid_generate_v4() |
| user_id | UUID | NOT NULL, FK → profiles(id) ON DELETE CASCADE |
| group_id | UUID | FK → groups(id) ON DELETE SET NULL (nullable) |
| action | TEXT | NOT NULL |
| description | TEXT | DEFAULT '' |
| metadata | JSONB | DEFAULT '{}' |
| created_at | TIMESTAMPTZ | DEFAULT NOW() |

**Realtime:** Added to `supabase_realtime` publication (though no client subscription is implemented for activity_log — it is fetched on-demand only).

---

### Indexes
```sql
idx_group_members_group       ON group_members(group_id)
idx_group_members_user        ON group_members(user_id)
idx_expenses_group            ON expenses(group_id)
idx_expenses_paid_by          ON expenses(paid_by)
idx_expense_splits_expense    ON expense_splits(expense_id)
idx_expense_splits_user       ON expense_splits(user_id)
idx_settlements_group         ON settlements(group_id)
idx_expense_comments_expense  ON expense_comments(expense_id)
idx_activity_log_user         ON activity_log(user_id)
idx_activity_log_group        ON activity_log(group_id)
idx_activity_log_created      ON activity_log(created_at DESC)
```

---

### Relationships
- `profiles` ← `group_members` (many users in many groups)
- `groups` ← `group_members` (many members per group)
- `groups` ← `expenses` (many expenses per group)
- `profiles` ← `expenses.paid_by` (one payer per expense)
- `expenses` ← `expense_splits` (one split row per included member)
- `profiles` ← `expense_splits.user_id`
- `groups` ← `settlements` (settlements are group-scoped)
- `profiles` ← `settlements.paid_by` and `settlements.paid_to`
- `expenses` ← `expense_comments` (chat per expense)
- `profiles` ← `expense_comments.user_id`
- `groups` ← `activity_log` (nullable — group_id SET NULL if group deleted)
- `profiles` ← `activity_log.user_id`

---

## Row Level Security Policies

All tables have RLS enabled. Summary:

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| profiles | Any authenticated user | — (trigger only) | Own row | — |
| groups | Members of the group | created_by = auth.uid() | Group admins | created_by = auth.uid() |
| group_members | Members of the group | Group admins or group creator | — | Group admins or self |
| expenses | Group members | Group members | paid_by = auth.uid() | paid_by = auth.uid() |
| expense_splits | Group members | Group members | — | Expense creator |
| settlements | Group members | Group members (paid_by = auth.uid()) | — | — |
| expense_comments | Group members | user_id = auth.uid() | — | — |
| activity_log | Own entries or own groups | user_id = auth.uid() | — | — |

---

## Business Logic

1. **Group creation auto-membership:** Creator is always inserted as `role: 'admin'` in `group_members`.
2. **Expense creator authorization:** Only `paid_by` user can delete an expense. The UI check is `expense.paid_by === user.id`; RLS enforces this server-side.
3. **Admin authorization for member management:** Admin check: `member.role === 'admin' OR group.created_by === user.id`. Non-admins can only remove themselves.
4. **Group delete authorization:** Only `group.created_by === user.id` (creator), not just admins.
5. **Split validation before insert:** Unequal splits must sum to totalAmount ±0.01; percentages must sum to 100 ±0.1; shares must total > 0.
6. **Rounding:** Equal, percentage, and shares splits use `Math.floor(x * 100) / 100` (truncate to 2 decimals). Remainders are added to payer or first included user.
7. **Single payer:** `paid_amount = totalAmount` for payer; `paid_amount = 0` for all others.
8. **Currency display:** Hardcoded to INR (₹) with `en-IN` locale in `formatCurrency`. Profile stores currency field but it is only used in the profile edit dropdown UI; not applied to expense display.
9. **Avatar:** No image upload. Avatars are rendered as initials (up to 2 chars, uppercase) in a colored circle. Color is deterministically derived from `user.id` via hash → `AVATAR_COLORS[hash % 10]`.

---

## Realtime System

**Technology:** Supabase Realtime (postgres_changes).

**Tables published:** `expense_comments`, `activity_log` (via `ALTER PUBLICATION supabase_realtime ADD TABLE`).

**Active subscription:** Only `expense_comments` is actually subscribed to in client code (in `ExpenseDetailPage`).

**Subscription setup:**
```javascript
supabase
  .channel(`expense_comments_${expenseId}`)
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'expense_comments',
    filter: `expense_id=eq.${expenseId}`
  }, async (payload) => {
    // Fetch commenter profile
    // Append to comments state
    // Scroll to bottom
  })
  .subscribe()
```

**Cleanup:** `supabase.removeChannel(commentsSubscription)` on component unmount.

**Behavior:** When a comment is inserted (by any user in any session), all subscribed clients receive the `payload.new` object. The commenter profile is then fetched separately (second query) to enrich the message before displaying.

**Note:** `activity_log` is in the publication but no client subscription is active for it. Activity page fetches on page load only.

---

## API and Data Flow

### Create Expense

```
User fills form → clicks "Save Expense"
→ validateSplits() → calculateFinalSplits()
→ supabase.from('expenses').insert({...}).select().single()
→ supabase.from('expense_splits').insert([{expense_id, user_id, owed_amount, paid_amount, share_value}, ...])
→ supabase.from('activity_log').insert({...})
→ showToast('success')
→ router.push(`/dashboard/groups/${groupId}`)
```

### View Group Balances

```
Group detail mounts
→ supabase.rpc('get_group_balances', { p_group_id })
→ PostgreSQL CTE: member_payments + settlement_adjustments
→ Returns [{user_id, full_name, avatar_url, total_paid, total_owed, net_balance}]
→ setBalances(data)
→ simplifyDebts(data) → setSimplifiedDebts(transactions)
→ Render Balances tab + Settle Up page
```

### Real-time Chat

```
User opens ExpenseDetail
→ fetchExpenseData() → initial comments loaded
→ supabase.channel().on('postgres_changes').subscribe()
[Another user posts comment]
→ INSERT fires → Supabase Realtime pushes to all subscribers
→ payload.new received by client
→ Fetch commenter profile
→ setComments(prev => [...prev, newComment])
→ scrollToBottom()
```

### Record Settlement

```
User clicks "Record Payment" on Settle Up page
→ handleSettle(payerId, receiverId, amount)
→ supabase.from('settlements').insert({group_id, paid_by, paid_to, amount})
→ supabase.from('activity_log').insert({...settled_up...})
→ showToast('success')
→ router.push(`/dashboard/groups/${groupId}`)
```

---

## Security Model

- **Authentication:** Cookie-based Supabase session. `@supabase/ssr` manages cookie read/write in middleware and server components.
- **Authorization:** PostgreSQL RLS policies are the primary enforcement layer. Client-side checks (e.g., "only payer can delete") are UI conveniences; the database enforces the same rules.
- **Route protection:** Next.js middleware redirects unauthenticated `/dashboard/*` requests to `/login`. Dashboard layout additionally gates rendering on `!loading && user`.
- **Data isolation:** RLS ensures users can only SELECT data for groups they belong to. Users cannot read other users' group data, expenses, or comments from unrelated groups.
- **Anon key exposure:** `NEXT_PUBLIC_SUPABASE_ANON_KEY` is exposed client-side (expected). RLS is the security boundary, not the key.
- **Service role key:** Present in `.env.local` but not used in any application code (added speculatively or for future server-side use).

---

## Component Documentation

### `AuthContext` (`src/contexts/AuthContext.tsx`)
- Provides: `user` (Supabase User), `profile` (Profile), `loading`, `signUp`, `signIn`, `signOut`, `refreshProfile`.
- Hydrates from `getSession()` on mount.
- Subscribes to `onAuthStateChange`.
- `fetchProfile` queries `profiles` by user ID.

### `ToastContext` (`src/contexts/ToastContext.tsx`)
- Manages array of `{ id, type: 'success'|'error'|'info', message }`.
- `showToast(message, type)` adds toast, auto-removes after 4000ms.
- Renders `.toast-container` div with individual `.toast.toast-{type}` divs.
- Toast renders inside `ToastProvider` (not a portal).

### `DashboardLayout` (`src/app/dashboard/layout.tsx`)
- Sidebar with: logo (💰 SplitEase), 4 nav links, user info, Logout button.
- Mobile: hamburger menu → sliding sidebar + overlay; bottom navigation bar.
- `sidebarOpen` state toggled by hamburger; auto-closed on route change via `pathname` useEffect.
- Active link detection: exact match for `/dashboard`, prefix match for others.

### `simplifyDebts` (`src/lib/utils.ts`)
- Pure function. Input: `Array<{user_id, full_name, net_balance}>`. Output: `Array<{from, from_name, to, to_name, amount}>`.
- Threshold: balances within ±0.01 ignored.
- Greedy two-pointer algorithm.

### `formatCurrency` (`src/lib/utils.ts`)
- Uses `Intl.NumberFormat('en-IN', { style: 'currency', currency })`.
- Default currency: 'INR'.

### `getAvatarColor` (`src/lib/utils.ts`)
- Hash function over `userId` string → index into `AVATAR_COLORS` array (10 hex colors).
- Deterministic: same user always gets same color.

---

## State Management

### Global State (React Context)

| Context | State | Updated when |
|---|---|---|
| AuthContext | user, profile, loading | Auth state changes, profile refresh |
| ToastContext | toasts[] | showToast called, 4s timeout, manual dismiss |

### Local State (per page)
- All data fetching results (groups, expenses, members, balances, etc.) stored in `useState` within the page component.
- Form inputs: description, amount, splitType, splitValues, splitIncluded, etc.
- UI flags: loading, isSubmitting, isInviting, activeTab, sidebarOpen, mode (suggested/manual).

---

## Styling System

- **Framework:** Vanilla CSS Modules — zero external UI library.
- **Theme:** Dark theme with glassmorphism aesthetic.
- **CSS variables** (in `globals.css`): Color palette (background layers, surface colors, accent colors, text levels), spacing scale (`--space-1` through `--space-16`), font sizes, border radius, shadows.
- **Global utility classes** (defined in `globals.css`, used inline across components):
  - `.glass-card` — semi-transparent card with blur backdrop and hover animation.
  - `.glass-card-static` — same but no hover effect.
  - `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.btn-danger`, `.btn-sm`, `.btn-lg`, `.btn-icon` — button variants.
  - `.form-input`, `.form-label`, `.form-group`, `.form-select`, `.form-error` — form elements.
  - `.avatar`, `.avatar-sm`, `.avatar-xl` — circular avatar containers.
  - `.badge`, `.badge-neutral` — pill-style labels.
  - `.spinner`, `.spinner-lg` — CSS loading spinners.
  - `.loading-page` — full-viewport centered loading state.
  - `.empty-state`, `.empty-state-icon`, `.empty-state-title`, `.empty-state-text` — empty states.
  - `.amount-positive`, `.amount-negative`, `.amount-neutral` — color-coded money amounts.
  - `.toast-container`, `.toast`, `.toast-success`, `.toast-error`, `.toast-info` — toast notifications.
- **Responsive:** Dashboard layout uses CSS Grid/Flexbox. Mobile sidebar slides in. Bottom nav appears on mobile. Two-column expense detail collapses to single column.
- **Per-page CSS Modules:** Each page/layout has a `.module.css` file with component-specific scoped styles.

---

## Deployment

**Environment variables required:**
```
NEXT_PUBLIC_SUPABASE_URL=https://{project-ref}.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY={anon-key}
SUPABASE_SERVICE_ROLE_KEY={service-role-key}  # present but unused in code
```

**Build process:**
1. `npm install`
2. `npm run build` (Next.js build)
3. `npm start` or deploy to Vercel.

**Supabase setup:**
1. Create Supabase project.
2. Run `supabase/migrations/001_initial_schema.sql` in SQL Editor.
3. Enable Realtime for `expense_comments` table (done by migration SQL).
4. Copy Project URL and anon key to `.env.local`.

**Vercel deployment:**
- Connect GitHub repo to Vercel.
- Set environment variables in Vercel dashboard.
- Auto-deploy on push to main branch.

**Node.js requirement:** 18+.

---

## Testing

**Existing test files:**
- `e2e_test.ts` — Manual E2E test script (not using a test runner like Jest or Playwright). Appears to be a TypeScript file with test scenarios written out, not executable as-is.
- `test_auth.ts` — Auth test script, similar manual style.

**No automated test suite implemented.** No Jest, Vitest, Playwright, or Cypress configured.

**Manual testing plan (from AI_CONTEXT.md):**
1. Register new user, log out, log back in.
2. Create group, verify in list. Invite another user (must exist).
3. Add expense with all 4 split types. Verify splits sum correctly.
4. Verify `get_group_balances` RPC returns accurate balances.
5. Record settlement. Verify balance change on refresh.
6. Open expense in two browser sessions. Post comment, verify realtime delivery.

---

## Tradeoffs

1. **Client-side data fetching everywhere:** All dashboard pages use `'use client'` + useEffect for data. This simplifies realtime subscription setup but means no SSR benefits, slower initial paint, and no streaming.
2. **No custom API layer:** Direct Supabase client access from browser. Simpler to build but means all business logic (split calculation) runs client-side, which could be spoofed. RLS prevents unauthorized writes but doesn't validate split math server-side.
3. **Split calculation is client-side only:** The `calculateFinalSplits` function runs in the browser. A malicious client could insert arbitrary `owed_amount` values. No server-side validation of split correctness exists.
4. **Dashboard balance calculation ignores settlements:** The home page balance summary (totalOwed, totalOwe) is computed from `expense_splits` only, without accounting for settlements. This differs from the per-group RPC which includes settlements. Acknowledged as a simplification.
5. **Greedy debt simplification:** Not mathematically optimal for all graph configurations.
6. **Single-payer expenses only:** Multi-payer not supported in UI (comment in code: "Adjust paid_amount logic if multiple people paid — not supported in UI yet").
7. **No image uploads:** `receipt_url` column exists but upload UI was not built.
8. **INR hardcoded in display:** Profile stores a `currency` field but `formatCurrency` is called with the default 'INR' everywhere. Currency preference has no effect on expense display.
9. **Invite requires existing user:** No email invite link flow. Admin must type exact email of a user who has already signed up.
10. **No pagination:** Expense lists, activity logs, and groups all fetch without pagination. Performance will degrade at scale.
11. **No optimistic updates:** All state changes wait for server confirmation before updating UI.

---

## Known Limitations

1. Multi-payer expenses not supported.
2. No email invitations for non-registered users.
3. No receipt/avatar image uploads.
4. Dashboard home balance summary does not factor in settlements (only expense_splits).
5. `currency` profile field is editable but has no effect on expense display (always INR).
6. No automated tests.
7. No pagination — all data fetched in full.
8. Activity log realtime subscription not implemented (fetched once on page load).
9. `lucide-react`, `recharts`, and `date-fns` are installed but unused in the codebase.
10. `SUPABASE_SERVICE_ROLE_KEY` is in `.env.local` but no server-side code uses it.
11. `notes` field exists in `expenses` schema but there is no input for it in the New Expense form. Notes are only displayed in Expense Detail if non-empty.
12. `metadata` JSONB column in `activity_log` is always written as `{}` (unused).
13. No "edit expense" feature — only delete.
14. Expense cannot be reassigned to a different group after creation.

---

## AI Collaboration Process

**Initial instruction:** User pasted the required prompt defining the AI's role as a junior engineer who must ask questions, not assume requirements, and maintain `AI_CONTEXT.md`.

**AI response:** Generated an `implementation_plan.md` artifact outlining architecture, schema, and open questions rather than immediately coding. Questions asked:
1. Supabase/Vercel account availability.
2. Authentication method (email vs OAuth).
3. Currency requirements.
4. UI/UX direction (dark mode glassmorphism confirmed by user as "rich aesthetics").

**Approval:** User approved plan → AI proceeded with email/password auth, INR, dark glassmorphism CSS.

**Architecture decisions made during implementation:**
- Dropped NextAuth.js in favor of native Supabase Auth for tighter RLS integration.
- Used `--no-tailwind` flag at project creation; enforced raw CSS Modules throughout.
- Chose App Router over Pages Router for modern React and Vercel optimization.
- Used direct Supabase client in client components instead of Next.js API routes for speed.

**Context maintenance:** `AI_CONTEXT.md` was updated as phases completed and decisions changed. The file in the repo represents the state at end of implementation.

---

## Rebuild Instructions

Follow these steps to recreate SplitEase from scratch:

### Step 1: Project scaffolding
```bash
npx create-next-app@latest splitease --typescript --no-tailwind --app --src-dir --import-alias "@/*"
cd splitease
npm install @supabase/supabase-js @supabase/ssr
```

### Step 2: Environment
Create `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### Step 3: Supabase setup
1. Create Supabase project.
2. In SQL Editor, run the full contents of `supabase/migrations/001_initial_schema.sql` (schema as documented in Database Design section above).

### Step 4: Supabase client files
Create:
- `src/lib/supabase/client.ts` — `createBrowserClient` from `@supabase/ssr`.
- `src/lib/supabase/server.ts` — `createServerClient` with Next.js cookie store.
- `src/lib/supabase/middleware.ts` — `updateSession` with route redirect logic (unauthenticated `/dashboard` → `/login`; authenticated `/` or `/login` or `/signup` → `/dashboard`).
- `src/middleware.ts` — calls `updateSession`, matcher excludes static files.

### Step 5: Types and utilities
- `src/types/index.ts` — all interfaces (Profile, Group, GroupMember, Expense, ExpenseSplit, Settlement, ExpenseComment, ActivityLog, GroupBalance, DebtSimplification) + constants (EXPENSE_CATEGORIES 15 items, GROUP_CATEGORIES 7 items, AVATAR_COLORS 10 hex strings).
- `src/lib/utils.ts` — formatCurrency (Intl, en-IN), getInitials, getAvatarColor (hash-based), getCategoryEmoji, formatRelativeTime, formatDate, simplifyDebts (greedy algorithm), isValidEmail (regex), truncate.

### Step 6: Contexts
- `src/contexts/AuthContext.tsx` — `AuthProvider` with useState for user/profile/loading. `signUp` (with full_name metadata), `signIn`, `signOut`, `refreshProfile`. Subscribe to `onAuthStateChange`.
- `src/contexts/ToastContext.tsx` — `ToastProvider` with toasts array, `showToast` (auto-dismiss 4s), `removeToast`. Renders toast container inside provider.

### Step 7: Root layout and globals
- `src/app/layout.tsx` — Wraps children in `<AuthProvider><ToastProvider>`. Sets font, metadata.
- `src/app/globals.css` — Dark theme CSS variables, utility classes (glass-card, btn variants, form inputs, avatar, badge, spinner, toast, empty-state, amount colors).

### Step 8: Auth pages
- `src/app/page.tsx` — Landing page. If `user`, redirect to `/dashboard`. Show hero with Log In / Get Started buttons.
- `src/app/auth.module.css` — Shared auth card styles (glassmorphism card, glow effect).
- `src/app/login/page.tsx` — Email + password form. `useAuth().signIn` → redirect to `/dashboard`.
- `src/app/signup/page.tsx` — Full name + email + password + confirm password. Validate password ≥ 6 chars, passwords match. `useAuth().signUp` → redirect to `/dashboard`.

### Step 9: Dashboard layout
- `src/app/dashboard/layout.tsx` — Sidebar with 4 nav items (Dashboard, Groups, Activity, Profile with emojis), user info, logout. Mobile: hamburger + bottom nav. Active state detection.
- `src/app/dashboard/dashboard.module.css` — Sidebar, mobile header, bottom nav styles.

### Step 10: Dashboard pages (implement in this order)

1. **`/dashboard` (home):** 3 balance cards (net, owed, owe). Groups list (4 max). Recent expenses list (5 max). Calculate balances from expense_splits.

2. **`/dashboard/groups`:** Grid of group cards with color, category emoji, name, member count.

3. **`/dashboard/groups/new`:** Form: name, description, category dropdown, color picker (10 swatches from AVATAR_COLORS). On submit: insert group → insert group_members (admin) → log activity → navigate to group detail.

4. **`/dashboard/groups/[id]`:** Fetch group + members + expenses + balances RPC. Two tabs. Hero with personal balance. Member sidebar. Simplified debts in Balances tab.

5. **`/dashboard/groups/[id]/settings`:** Admin check. Invite-by-email form (lookup profiles.email, check not already member, insert group_members). Remove member (confirm dialog). Delete group (confirm, creator only).

6. **`/dashboard/groups/[id]/settle`:** Two tabs. Suggested: show simplifyDebts output with "Record Payment" buttons. Manual: payer/receiver dropdowns + amount. Insert settlements row + log activity.

7. **`/dashboard/expenses/new`:** Group select (pre-fill from ?groupId param). Fetch members on group change. Description, category, amount (₹ prefix), paid-by. Split type tabs (Equal / Exact / Percent / Shares). Member checkboxes. Per-member inputs (hidden for equal). Validate + calculateFinalSplits + insert expense + insert expense_splits + log activity.

8. **`/dashboard/expenses/[id]`:** Fetch expense (with `profiles!expenses_paid_by_fkey` join), splits, comments. Two-column layout. Split breakdown. Delete button (payer only). Chat panel with realtime subscription on `expense_comments`. Post comment → insert row → realtime delivers to others.

9. **`/dashboard/activity`:** Fetch last 50 activity_log rows (user's groups). Timeline with icon per action type.

10. **`/dashboard/profile`:** Show avatar (initials). Edit full_name, currency (INR/USD/EUR/GBP). Email display (read-only). Update profiles row → refreshProfile.

### Step 11: Verify realtime
Confirm `expense_comments` and `activity_log` are in the Realtime publication (the migration SQL does this). Test by opening the same expense in two browser windows and posting a comment.

---

## Feature Completion Matrix

| Requirement | Status | Notes |
|---|---|---|
| Login module | **Complete** | Email/password via Supabase Auth. Signup with name + email + password. Session management via cookies. Route protection via middleware. |
| Create and manage groups | **Complete** | Create with name, description, category, color. View list and detail. |
| Invite users to groups | **Complete** | By email address lookup. Target must be registered. |
| Add users to groups | **Complete** | Admin-only action via Settings page. |
| Remove users from groups | **Complete** | Admin can remove others; self-removal allowed. |
| Split equally | **Complete** | Floor-based equal division; remainder to payer. |
| Split unequally (exact) | **Complete** | Manual amounts per member; validates sum = total. |
| Split by percentage | **Complete** | Per-member percentage; validates sum = 100. |
| Split by shares | **Complete** | Per-member share count; proportional allocation. |
| User chat in expense (real-time) | **Complete** | Supabase Realtime subscription per expense. New messages pushed live. |
| Group-wise balances | **Complete** | Via `get_group_balances` RPC. Displayed in group Balances tab. |
| Individual balance summary | **Partial** | Dashboard home shows net balance from expense_splits but does NOT account for settlements. Per-group view via RPC is complete. |
| Settle debts / record payments | **Complete** | Suggested (debt simplification) + manual modes. Inserts settlements row. Balances updated on next RPC call. |
| Relational DB only | **Complete** | PostgreSQL via Supabase with normalized schema, foreign keys, and RLS. |
| Public deployed app URL | **Complete** (inferred) | Vercel deployment configured. Actual URL not in repo files. |
| GitHub repository | **Complete** (inferred) | README references GitHub. |
| README.md with setup instructions | **Complete** | Supabase setup, local setup, run instructions, AI usage section. |
| BUILD_PLAN.md | **Complete** | Product research, architecture, AI collaboration, tradeoffs. |
| AI_CONTEXT.md | **Partial** (original) → **Complete** (this document) | Original AI_CONTEXT.md was present but lacked full implementation detail. This document is the comprehensive version. |
| Activity feed | **Complete** | Activity log table with 50-entry history. Timeline UI. |
| Debt simplification algorithm | **Complete** | Greedy two-pointer implementation in utils.ts. |
| Edit expense | **Missing** | Only delete is supported; no edit expense flow. |
| Multi-payer expenses | **Missing** | Single payer model only. |
| Email invite links | **Missing** | Target user must sign up independently first. |
| Receipt image upload | **Missing** | Column exists in schema; no UI or storage integration. |
| Push notifications | **Missing** | Out of scope. |
| CSV export | **Missing** | Out of scope. |
| Multi-currency | **Missing** | Profile stores currency but display always uses INR. |
| Automated tests | **Missing** | Manual test scripts only; no Jest/Cypress. |
