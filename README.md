# SplitEase — Splitwise Clone

A full-stack, deployed expense-splitting application built as part of the Spreetail Software Engineering Internship Assignment. Developed in 2 days using AI as a primary engineering collaborator.

---

## Overview

**SplitEase** is a simplified, production-deployed clone of Splitwise that enables groups of users to track shared expenses, calculate who owes what, and record debt settlements.

### Assignment Objective
Study Splitwise, reverse-engineer its core product behaviour, and build a working deployed application using AI as a junior engineering collaborator — acting simultaneously as Product Manager and Developer.

### Splitwise Functionality Replicated
- Group creation and member management with admin role enforcement
- Expense recording with four distinct split modes: equal, exact (unequal), percentage, and shares
- Per-group balance tracking with settlement adjustments via a PostgreSQL stored procedure
- Greedy debt simplification algorithm to minimize the number of required transactions
- Debt settlement recording in both suggested and manual modes
- Real-time chat on individual expense detail pages via Supabase Realtime
- Chronological activity feed for all group events
- Individual net balance summary across all groups on the dashboard home

### Final Delivered Scope
Authentication · Group management · Member invite and removal · Four-mode expense splitting · Real-time expense chat · Group-level and cross-group balance tracking · Debt simplification · Settlement recording · Activity log · Profile management · Mobile-responsive UI · Vercel deployment

---

## Demo

| | |
|---|---|
| **Live Application** | [https://splitease.vercel.app](https://split-wise-delta.vercel.app/) |
| **GitHub Repository** | [(https://github.com/anushkajain130/splitease)](https://github.com/anushkajain130/Split_wise) |

> Replace the URLs above with the actual deployed URL and repository link.

---

## Assignment Coverage

| Requirement | Status | Notes |
|---|---|---|
| Login module | **Complete** | Email/password authentication via Supabase Auth. Signup collects full name, email, and password. Cookie-based session with Next.js middleware route protection. |
| Create and manage groups | **Complete** | Create groups with name, description, category (7 options), and cover color (10 presets). View list and detail. Group deletion by creator cascades all related data. |
| Invite users to groups | **Complete** | Admin inputs target user's email. System looks up `profiles` table. If found, user is added as member. |
| Add users to groups | **Complete** | Admin-only action via Group Settings page. Role enforced both in UI and via RLS policies. |
| Remove users from groups | **Complete** | Admin can remove any member. Non-admin members can remove themselves. Confirmation dialog before deletion. |
| Split equally | **Complete** | Floor-based equal division. Rounding remainder assigned to payer or first included member. |
| Split unequally (exact amounts) | **Complete** | Manual per-member amount entry. Validates that sum equals total amount within ±0.01 tolerance. |
| Split by percentage | **Complete** | Per-member percentage input. Validates sum equals 100% within ±0.1 tolerance. Rounding remainder handled. |
| Split by shares | **Complete** | Per-member share count. Amount calculated proportionally: `(userShares / totalShares) × totalAmount`. |
| User chat in expense (real-time) | **Complete** | Supabase Realtime `postgres_changes` subscription per expense. New messages appear instantly in all open sessions without polling. |
| Group-wise balances | **Complete** | `get_group_balances` PostgreSQL stored procedure. Aggregates total paid, total owed, and settlement adjustments per member. Displayed in group Balances tab. |
| Individual balance summary | **Partial** | Dashboard home shows net balance from `expense_splits` across all groups. Does not factor in settlements — this is a documented approximation. Per-group balance via RPC is fully accurate including settlements. |
| Settle debts / record payments | **Complete** | Two modes: Suggested (uses debt simplification output with one-click "Record Payment") and Manual (free-form payer/receiver/amount selection). Inserts `settlements` row; affects next balance calculation. |
| Use relational DBs only | **Complete** | PostgreSQL via Supabase. Fully normalized schema with foreign keys, ENUM types, and Row Level Security. No document store or key-value database used. |
| Public deployed app URL | **Complete** | Deployed on Vercel. |
| GitHub repository | **Complete** | Public repository with full commit history. |
| README.md with setup instructions | **Complete** | This document. Covers prerequisites, environment, local run, and production build. |
| BUILD_PLAN.md | **Complete** | Covers product research, architecture decisions, AI collaboration process, tradeoffs, and risks. |
| AI_CONTEXT.md | **Complete** | Full implementation context — schema, formulas, workflows, component structure, business logic — sufficient for another engineer or AI agent to recreate the application. |
| Activity feed | **Complete** | Chronological timeline of last 50 group events. Actions: `created_group`, `added_expense`, `deleted_expense`, `added_member`, `removed_member`, `settled_up`. |
| Debt simplification algorithm | **Complete** | Greedy two-pointer algorithm in `src/lib/utils.ts`. Matches largest debtor to largest creditor iteratively. |
| Edit expense | **Not Implemented** | Only delete is supported. Documented tradeoff; edit adds form complexity without blocking core workflows. |
| Multi-payer expenses | **Not Implemented** | Single-payer model only. One user pays the full expense amount; others owe their calculated share. |
| Email invite links | **Not Implemented** | Requires email delivery service. Target user must register independently before being added to a group. |
| Receipt image upload | **Not Implemented** | `receipt_url` column exists in schema. No upload UI or storage bucket configured. |
| Automated test suite | **Not Implemented** | Manual test scripts (`e2e_test.ts`, `test_auth.ts`) present but no Jest/Playwright/Cypress configured. |

---

## Features

### Authentication
- Email and password sign-up with full name capture
- Secure sign-in with descriptive error feedback via Supabase Auth
- Cookie-based session management using `@supabase/ssr`
- Next.js middleware redirects unauthenticated users away from `/dashboard/*`
- Authenticated users are redirected away from `/login`, `/signup`, and `/` to `/dashboard`
- Profile row auto-created via PostgreSQL trigger on first signup

### Group Management
- Create groups with a name, optional description, category (Trip, Home, Couple, Friends, Work, Sports, Other), and a cover color chosen from 10 presets
- Creator is automatically assigned the `admin` role
- View all groups in a card grid showing category emoji, member count, and cover color
- Group detail page shows a two-tab layout: Expenses and Balances
- Member sidebar lists all members with their role badges

### Expense Management
- Add expenses to any group the user belongs to
- Select from 15 expense categories (General, Food, Groceries, Transport, Rent, Utilities, Entertainment, Shopping, Travel, Health, Education, Subscriptions, Gifts, Sports, Other)
- Designate any group member as the payer ("Paid by" dropdown)
- Optional pre-selection of group from the Groups page (passes `?groupId` query param)
- Expense creator can delete an expense (cascades splits and comments); enforced in UI and via RLS
- Expense detail shows split breakdown: each member's owed amount and whether they paid

### Expense Splitting

| Mode | Input | Validation |
|---|---|---|
| **Equal** | None — all included members split evenly | N/A |
| **Exact (Unequal)** | Manual ₹ amount per member | Sum must equal total ±₹0.01 |
| **Percentage** | % per member | Sum must equal 100% ±0.1% |
| **Shares** | Share count per member | Total shares must be > 0 |

- Checkboxes per member to include or exclude them from the split
- Rounding remainders are assigned to the payer (or first included member if payer is excluded)
- Split type displayed on the expense detail page

### Balance Tracking
- **Per-group balances:** Computed via `get_group_balances` PostgreSQL RPC. Formula: `net_balance = total_paid − total_owed + settlement_adjustments`. Positive = owed money back; negative = owes money.
- **"How to settle up" section:** Simplified debt list showing minimum required transactions
- **Dashboard home summary:** Three balance cards — Net Balance, You Are Owed, You Owe — computed from `expense_splits` across all groups (approximate; excludes settlements)
- Color-coded balance amounts: green for positive, red for negative

### Settlements
- **Suggested mode:** Shows debt simplification output. Each transaction has a "Record Payment" button that inserts a settlement and logs activity.
- **Manual mode:** Payer and receiver dropdowns, free-form amount input, submit to record any arbitrary payment
- Settlements affect the `get_group_balances` RPC result on next load
- Settlement recorded = `settlements` row inserted + `activity_log` entry

### Realtime Features
- Per-expense comment chat using Supabase Realtime (`postgres_changes` subscription)
- Channel namespaced as `expense_comments_{expenseId}` with row-level filter
- New messages delivered to all open sessions instantly without page refresh
- Commenter profile fetched on payload receipt and appended to the chat state
- Chat auto-scrolls to the latest message on new comment
- Channel subscription cleaned up on component unmount
- Own messages displayed right-aligned; others left-aligned with avatar

---

## User Workflows

### Login
1. Navigate to `/login`.
2. Enter email and password.
3. On success: redirected to `/dashboard`. On failure: error toast with Supabase message.

### Group Creation
1. Click "+ New Group" on the dashboard or groups page.
2. Enter group name, optional description, select category, pick a cover color.
3. Submit → group created → creator added as admin → activity logged → redirected to group detail.

### Expense Creation
1. Navigate to a group detail page or use the global "+ Add Expense" button.
2. Select the group (pre-filled if accessed from a group page).
3. Enter description, select category, enter amount, select payer.
4. Choose a split mode tab: Equal, Exact, Percent, or Shares.
5. Use checkboxes to include/exclude members. Enter per-member values for non-equal modes.
6. Submit → expense and splits inserted → activity logged → redirected to group detail.

### Splitting Expenses
- **Equal:** No input needed. System divides total evenly; remainder goes to payer.
- **Exact:** Enter exact ₹ amount for each member. Must sum to total.
- **Percentage:** Enter % for each member. Must sum to 100%.
- **Shares:** Enter share count per member. System calculates proportional amounts.

### Viewing Balances
1. Open a group detail page.
2. Click the "Balances" tab.
3. See each member's net position (gets back / owes / settled).
4. See the "How to settle up" section showing the minimum transactions needed.

### Settlements
1. Click "🤝 Settle Up" on any group detail page.
2. **Suggested tab:** Review pre-computed debt transactions. Click "Record Payment" to settle one.
3. **Manual tab:** Select who paid, who received payment, enter amount. Submit.
4. Return to group — balances updated on next load.

### Chat
1. Open any expense detail page (`/dashboard/expenses/{id}`).
2. Type a message in the input at the bottom of the chat panel. Press Enter or click ↑.
3. Message appears instantly in all other open sessions for the same expense.

---

## Architecture Overview

### Frontend
Next.js 16 App Router with React 19 and TypeScript. All dashboard pages are client components (`'use client'`) using `useEffect`-based data fetching. A shared dashboard layout (`src/app/dashboard/layout.tsx`) renders the sidebar, mobile header, and bottom navigation bar. No external component library — all UI is built with vanilla CSS Modules using a custom dark glassmorphism design system.

### Backend
No custom API server. All data operations go directly from the browser to Supabase PostgREST via `@supabase/supabase-js`. Business logic (split calculation, debt simplification) runs client-side in TypeScript utility functions. The only server-side logic is the Next.js middleware for session refresh and route protection.

### Database
PostgreSQL hosted on Supabase. Eight tables with normalized relationships, foreign key constraints, and ENUM types (`group_role`, `split_type`). Row Level Security (RLS) enforces all authorization at the database layer. One stored procedure (`get_group_balances`) handles balance aggregation via CTE joins. One trigger (`on_auth_user_created`) auto-creates a `profiles` row on signup.

### Authentication
Supabase Auth with email/password. Sessions are managed as cookies via `@supabase/ssr`. The Next.js middleware (`src/middleware.ts`) calls `updateSession()` on every request to refresh the session token and enforce route-level access control. `AuthContext` provides user and profile state globally via React Context.

### Realtime
Supabase Realtime via `postgres_changes` events. The `expense_comments` and `activity_log` tables are added to the `supabase_realtime` publication. The expense detail page subscribes to a namespaced channel (`expense_comments_{expenseId}`) with a row-level filter to receive only relevant insert events.

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Frontend Framework | Next.js (App Router) | 16.2.7 |
| UI Library | React | 19.2.4 |
| Language | TypeScript | ^5 |
| Styling | Vanilla CSS Modules | — |
| Database | PostgreSQL (via Supabase) | — |
| Backend/BaaS | Supabase | — |
| Authentication | Supabase Auth | — |
| Realtime | Supabase Realtime | — |
| Supabase JS Client | @supabase/supabase-js | ^2.107.0 |
| Supabase SSR Helper | @supabase/ssr | ^0.10.3 |
| Deployment (Frontend) | Vercel | — |
| Node.js | Node.js | 18+ |

---

## Database Summary

| Table | Purpose |
|---|---|
| `profiles` | User display info (name, email, currency). Auto-created on signup via trigger. |
| `groups` | Group containers. Stores name, description, category, cover color, and creator. |
| `group_members` | Junction table: links users to groups with `admin` or `member` role. |
| `expenses` | Expense records. Stores amount, split type, category, payer, and group. |
| `expense_splits` | Per-member obligation per expense. Stores `owed_amount`, `paid_amount`, `share_value`. |
| `settlements` | Payment records between members to reduce debt. Group-scoped. |
| `expense_comments` | Chat messages per expense. Added to Realtime publication. |
| `activity_log` | Audit trail of all group events. Added to Realtime publication. |

**Balance formula (via `get_group_balances` RPC):**
```
net_balance = total_paid − total_owed + settlement_adjustments
```
A positive result means the group owes the user money. A negative result means the user owes the group.

**Key relationships:**
- Every expense belongs to one group and has one payer (`paid_by`)
- Every expense_split belongs to one expense and one user
- Every settlement belongs to one group, one payer, and one receiver
- All tables protected by Row Level Security — users can only access data for groups they belong to

---

## Project Structure

```
/
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql    # Full DB schema, RLS policies, indexes, RPC, trigger
├── src/
│   ├── app/
│   │   ├── layout.tsx                # Root layout: AuthProvider + ToastProvider
│   │   ├── globals.css               # Design system: CSS variables, utility classes
│   │   ├── page.tsx                  # Landing page (/)
│   │   ├── auth.module.css           # Shared auth page styles
│   │   ├── login/page.tsx            # Sign-in page
│   │   ├── signup/page.tsx           # Registration page
│   │   └── dashboard/
│   │       ├── layout.tsx            # Sidebar + mobile header + bottom nav
│   │       ├── page.tsx              # Home: balance summary + groups + recent expenses
│   │       ├── groups/
│   │       │   ├── page.tsx          # Groups list (card grid)
│   │       │   ├── new/page.tsx      # Create group form
│   │       │   └── [id]/
│   │       │       ├── page.tsx      # Group detail: expenses + balances + members
│   │       │       ├── settings/page.tsx   # Member management + group delete
│   │       │       └── settle/page.tsx     # Settle Up (suggested + manual)
│   │       ├── expenses/
│   │       │   ├── new/page.tsx      # New expense form (all split modes)
│   │       │   └── [id]/page.tsx     # Expense detail + realtime chat
│   │       ├── activity/page.tsx     # Activity timeline (last 50 events)
│   │       └── profile/page.tsx      # Profile: name + currency
│   ├── contexts/
│   │   ├── AuthContext.tsx           # Global auth state + methods
│   │   └── ToastContext.tsx          # Toast notification queue
│   ├── lib/
│   │   ├── utils.ts                  # formatCurrency, simplifyDebts, getAvatarColor, etc.
│   │   └── supabase/
│   │       ├── client.ts             # Browser Supabase client
│   │       ├── server.ts             # Server Supabase client (cookie-based)
│   │       └── middleware.ts         # Session refresh + route redirect logic
│   ├── middleware.ts                 # Next.js middleware entry point
│   └── types/
│       └── index.ts                  # All TypeScript interfaces + category/color constants
├── AI_CONTEXT.md                     # Full implementation context document
├── BUILD_PLAN.md                     # Planning, architecture, AI collaboration, tradeoffs
├── README.md                         # This document
├── .env.local                        # Local environment variables (not committed to public repo)
└── package.json
```

---

## Local Setup

### Prerequisites
- Node.js 18 or higher
- npm
- A [Supabase](https://supabase.com) account (free tier sufficient)

### 1. Clone the Repository
```bash
git clone https://github.com/yourusername/splitease.git
cd splitease
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Supabase Setup
1. Create a new project at [supabase.com](https://supabase.com).
2. In your Supabase project, navigate to **SQL Editor**.
3. Paste the full contents of `supabase/migrations/001_initial_schema.sql` and run it.
   This creates all tables, indexes, RLS policies, the balance RPC, the signup trigger, and enables Realtime for `expense_comments`.
4. Navigate to **Project Settings → API** and copy your **Project URL** and **anon public** key.

### 4. Environment Variables
Create a `.env.local` file in the project root:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

> The anon key is safe to expose in the browser. Row Level Security policies in PostgreSQL enforce all data authorization regardless of key exposure.

### 5. Run the Development Server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 6. Production Build (Local Verification)
```bash
npm run build
npm start
```

---

## Deployment

SplitEase is deployed on **Vercel** with the database hosted on **Supabase**.

### Steps to Deploy
1. Push the repository to GitHub.
2. Go to [vercel.com](https://vercel.com) and import the repository.
3. In the Vercel project settings, add the following environment variables:
   ```
   NEXT_PUBLIC_SUPABASE_URL
   NEXT_PUBLIC_SUPABASE_ANON_KEY
   ```
4. Vercel auto-detects Next.js and runs `npm run build` on every push to the main branch.
5. Vercel handles HTTPS, CDN caching of static assets, and serverless edge middleware automatically.

No additional infrastructure is required. The Supabase project (provisioned once via the SQL migration) is shared between local development and production using the same URL and key.

---

## Tradeoffs

### Single-Payer Expenses Only
Each expense has one designated payer. Multi-payer bills (where two people split a payment at the register) are not supported. Users must record two separate expenses or designate one payer and settle internally. **Reason:** The multi-payer model requires a separate `expense_payments` table and significantly more complex balance aggregation — outside a 2-day scope.

### Dashboard Balance Approximation
The home screen balance summary (You Are Owed / You Owe) is computed from `expense_splits` only, without accounting for recorded settlements. This can show a higher outstanding balance than the user actually owes. **Reason:** A cross-group settlement-adjusted calculation requires one RPC call per group, which at scale becomes expensive. The per-group Balances tab is always fully accurate. **Fix:** A dedicated `get_user_net_balance(user_id)` PostgreSQL function aggregating across all groups in one query.

### INR Currency Hardcoded in Display
The profile page allows selecting a preferred currency (INR, USD, EUR, GBP), but all expense amounts are always displayed in Indian Rupees (₹). **Reason:** Per-expense currency storage was deprioritized within the time constraint. The schema and utility function support other currencies; wiring them to expense display is a straightforward extension.

### No Server-Side Data Fetching for Dashboard
All dashboard pages are client components that fetch data after mount. This means no streaming or SSR for the protected area. **Reason:** Supabase Realtime subscriptions must be established from the browser, requiring client components. Consistency was chosen over hybrid RSC/client patterns to meet the deadline.

### No Custom API Layer
Supabase PostgREST is called directly from the browser. Split calculation runs client-side and is not server-validated. **Reason:** Supabase RLS enforces authorization; an API layer would add development time without meaningful security improvement at this stage.

### Invite Requires Pre-Registration
Target users must have a SplitEase account before they can be added to a group. **Reason:** Email invite links require a transactional email service and token-based invite flow — out of scope for the 2-day build.

### No Automated Test Suite
Manual test scripts are present but no Jest, Playwright, or Cypress configuration exists. **Reason:** Time was prioritized toward feature completeness. The split calculation logic and RPC formula are the highest-priority units for future test coverage.

---

## Future Improvements

### Near-Term (1–2 Weeks)
- **Server-side data loading:** Migrate non-realtime pages to React Server Components for faster initial paint
- **Cross-group settlement-adjusted balance:** `get_user_net_balance` PostgreSQL function for accurate dashboard summary
- **Edit expense:** Allow expense creator to modify description, amount, category without delete-recreate
- **Pagination:** Cursor-based pagination for expense lists and activity feeds via Supabase `.range()`

### Medium-Term (1 Month)
- **Email invite links:** `group_invitations` table with expiring tokens + transactional email via Resend
- **Receipt image upload:** Supabase Storage bucket for receipts; display on expense detail
- **Unit tests:** Jest tests for `calculateFinalSplits`, `validateSplits`, and `simplifyDebts` covering all four modes and edge cases
- **E2E tests:** Playwright tests for core user journeys running against Vercel preview deployments
- **Optimistic UI updates:** Instant UI feedback for comment posting and settlement recording

### Longer-Term
- **Multi-payer expenses:** `expense_payments` table supporting multiple payers; updated balance RPC
- **Multi-currency support:** Per-expense currency storage; cross-currency group summaries
- **Push notifications:** Real-time toast on new group expenses without requiring the user to be on that page
- **Mobile app:** React Native or PWA with the same Supabase backend
- **Optimal debt simplification:** Minimum-edge debt graph algorithm replacing the greedy approach
- **Recurring expenses:** `recurrence_rule` field for automatic monthly rent or subscription entries

---

## AI-Assisted Development

This project was built using **Claude (Anthropic)** as the primary AI engineering collaborator throughout the entire development lifecycle — from initial product scoping through deployment.

### Planning and Requirements
The AI was instructed via the assignment's mandatory initial prompt to behave as a junior engineer: ask questions before writing any code, never assume requirements, and maintain a living context document. Before a single file was created, the AI generated a detailed `implementation_plan.md` and asked clarifying questions across product scope, authentication method, currency requirements, UI aesthetic, multi-payer support, and invite flow. Human answers to these questions became the binding specification.

### Architecture Design
The AI proposed a tech stack and database schema, then revised both based on human feedback. Key decisions refined through dialogue:
- **Dropped NextAuth.js** in favour of native Supabase Auth after the AI identified that NextAuth sessions would not be trusted by Supabase RLS `auth.uid()` without a custom bridging layer.
- **Moved balance aggregation to a PostgreSQL stored procedure** after the AI flagged that client-side aggregation across four async fetches was error-prone and slow.
- **Chose direct Supabase client access** over Next.js API routes after confirming that RLS policies provide equivalent authorization enforcement with significantly less boilerplate.

### Implementation
The AI wrote all application code — database schema, RLS policies, TypeScript interfaces, utility functions, React components, and CSS Modules — based on explicitly agreed specifications. Each feature was implemented against the exact formulas and validation rules documented in `AI_CONTEXT.md`. When implementation details diverged from the original plan (e.g., the `profiles!expenses_paid_by_fkey` join hint required for the expense-payer query), the AI identified and corrected the issue and updated the context document.

### Debugging
The AI identified and resolved several runtime issues during implementation:
- Missing Realtime channel cleanup causing subscription accumulation on unmount
- Ambiguous foreign key join on `expenses → profiles` requiring an explicit named hint
- Floating-point rounding errors in split calculations corrected with floor-based truncation and explicit remainder assignment

### AI_CONTEXT.md Workflow
`AI_CONTEXT.md` was maintained as the single source of truth throughout development. It was updated at each phase: after the planning session (schema, stack, API design), after each feature implementation (exact formulas, component structure, RLS policies), and after each architectural revision. The document is detailed enough that another engineer or AI agent can paste it into the same tool and recreate a functionally identical application — which is an explicit evaluation criterion of the assignment.

### Key AI Collaboration Principles Applied
- AI asked questions; human made decisions. No autonomous choices by the AI.
- Every product assumption was recorded before any code was written.
- Code was written to match documented specifications, not the other way around.
- The AI flagged when implementation diverged from the plan and proposed corrections for human approval.
- `AI_CONTEXT.md` was the forcing function that prevented scope creep and maintained architectural consistency across the 2-day build.

---

## Acknowledgements

- **Spreetail** — for the internship assignment brief and evaluation framework.
- **Splitwise** — whose product was studied and reverse-engineered as the reference application.
- **Supabase** — for the PostgreSQL, Auth, and Realtime infrastructure that made this scope achievable in 2 days.
- **Vercel** — for zero-configuration Next.js deployment.
- **Anthropic / Claude** — AI engineering collaborator used throughout planning, architecture, implementation, and debugging.
