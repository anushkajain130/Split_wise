# BUILD_PLAN.md — SplitEase (Splitwise Clone)

---

## Project Goal

### Assignment Objective
Build and deploy a simplified Splitwise-inspired expense-splitting application in 2 days, acting simultaneously as Product Manager and Developer, using an AI tool as the primary engineering collaborator. The AI was required to behave as a junior engineer — asking clarifying questions before writing any code, maintaining a living context document (`AI_CONTEXT.md`), and producing implementation only after explicit scope agreement.

### Success Criteria
1. A publicly deployed, working web application.
2. All minimum product requirements implemented: login, group management, expense creation with four split modes, real-time chat, group and individual balance views, and debt settlement.
3. A relational database (PostgreSQL) as the exclusive data store.
4. `AI_CONTEXT.md` detailed enough that a second engineer or AI agent could recreate the application from it alone.
5. `BUILD_PLAN.md` and `README.md` present with accurate setup instructions.

### Final Scope Delivered
The delivered application, named **SplitEase**, covers the full minimum product requirement surface:

- Email/password authentication with cookie-based sessions and middleware route protection.
- Group creation, listing, and detail views with per-group cover color and category.
- Member management: admin-controlled invite-by-email, member removal, and group deletion.
- Expense creation with all four split modes: equal, exact (unequal), percentage, and shares.
- Per-expense real-time chat using Supabase Realtime.
- Group-level balance tracking via a PostgreSQL stored procedure (`get_group_balances`), including settlement adjustments.
- Individual net balance summary on the dashboard home.
- Debt settlement recording in both a suggested (simplification-driven) and manual mode.
- Greedy debt simplification algorithm to minimize the number of required transactions.
- Activity log feed displaying the last 50 group events in a timeline view.
- Profile page for updating display name and currency preference.

---

## Product Research

### How Splitwise Was Researched
Splitwise was studied by walking through its core user journeys end-to-end: account creation, group formation, adding members, recording an expense, reviewing who owes what, and settling up. The balance aggregation behavior was examined carefully — specifically how Splitwise presents both group-level balances and a cross-group individual summary on the home screen. The "Simplify Debts" feature was identified as a significant UX differentiator: rather than showing every bilateral debt, Splitwise computes the minimum number of transactions required to fully settle a group.

The four split modes were documented in terms of their inputs, outputs, and validation rules before any code was written. The real-time comment thread per expense was noted as a critical feature for dispute resolution and group communication.

### Core Workflows Identified

**1. Group lifecycle:**
Sign up → create group (with name, category, color) → add members by email → members join the group.

**2. Expense lifecycle:**
Member selects group → enters description, amount, category, payer, split mode → system calculates per-member obligations → expense and splits persisted → group balances updated.

**3. Balance resolution:**
View group balances → review simplified debt list → click "Record Payment" for a suggested transaction, or enter a manual settlement → settlements recorded → balances recalculated on next page load.

**4. Real-time communication:**
Any member opens an expense detail view → a Supabase Realtime channel is opened → messages posted by any participant appear instantly in all open sessions.

**5. Activity tracking:**
Every significant action (group creation, expense addition/deletion, member changes, settlements) is written to an `activity_log` table and surfaced in a chronological timeline.

### Features Selected for MVP

| Feature | Rationale |
|---|---|
| Email/password auth | Core requirement; fastest path with Supabase Auth |
| Group creation and management | Foundation of the entire product |
| Invite by email | Enables multi-user groups without a separate invite system |
| All four split modes | Explicitly required by the assignment |
| Real-time expense chat | Explicitly required by the assignment |
| Group-level balances | Explicitly required |
| Individual balance summary (dashboard) | Explicitly required |
| Debt simplification (greedy) | Differentiating UX feature; straightforward to implement |
| Settlement recording (suggested + manual) | Explicitly required |
| Activity feed | Required for audit transparency |
| Profile page | Needed for name display throughout the app |

### Features Intentionally Excluded

| Feature | Reason for Exclusion |
|---|---|
| Google / social OAuth | Time constraint; email auth satisfies the requirement |
| Multi-payer expenses | Significantly increases data model and UI complexity; not required |
| Email invitation links | Requires email service integration; out of scope for 2-day build |
| Receipt image upload | Requires Supabase Storage configuration; deferred |
| Multi-currency conversion | Live exchange rates require third-party API; INR default satisfies MVP |
| Push / email notifications | Infrastructure complexity; no explicit requirement |
| CSV export | No requirement; deferred |
| Dashboard analytics / charts | No requirement; deferred |
| Edit expense | Delete covers the critical path; edit adds significant form complexity |
| Expense pagination | Deferred; acceptable at expected data volumes for the assignment |

### Product Assumptions Made

1. All expenses must belong to a group. No standalone non-group expenses are supported.
2. One user pays the full amount of an expense (single-payer model). The system records who is owed by everyone else.
3. Currency is displayed in INR (₹) throughout the application. The profile stores a currency preference field, but it does not affect expense display in the MVP.
4. A user must be registered on the platform before they can be added to a group. No ghost-user or invite-link model.
5. Group membership is managed by administrators only. The group creator is always the initial admin. Members cannot add or remove other members.
6. Balance recalculation happens on page load via the `get_group_balances` RPC. There is no automatic live balance update beyond the initial fetch.

---

## Architecture

### Tech Stack

| Technology | Role | Selection Rationale |
|---|---|---|
| **Next.js 16 (App Router)** | Frontend framework | Modern React with file-based routing, Vercel-native deployment, and support for middleware-level session management |
| **React 19** | UI rendering | Latest stable; pairs with Next.js App Router |
| **TypeScript** | Language | Type safety across frontend and shared type definitions; catches schema mismatches at compile time |
| **Vanilla CSS Modules** | Styling | No Tailwind was the explicit project constraint. CSS Modules provide scoped styles without a build-time class purging step. Enables the custom dark glassmorphism aesthetic without utility class limitations. |
| **Supabase (PostgreSQL)** | Database | Satisfies the "relational DB only" requirement with a managed PostgreSQL instance. Built-in Auth, Realtime, and PostgREST eliminate the need for a custom API server. |
| **Supabase Auth** | Authentication | Native integration with Supabase RLS policies. Dropped NextAuth.js/Auth.js because Supabase Auth session tokens are automatically trusted by RLS, eliminating the need for a separate token validation layer. |
| **Supabase Realtime** | Real-time messaging | Postgres-change-event streaming over WebSocket. No additional infrastructure required. Provides per-row filtered subscriptions needed for per-expense chat. |
| **@supabase/ssr** | Session management | Official library for cookie-based Supabase session handling in Next.js middleware and server components. Required for correct session refresh behavior. |
| **Vercel** | Deployment | Zero-config deployment for Next.js. Automatic HTTPS, edge middleware support, environment variable management. |

### Database Design

#### Entities and Responsibilities

**`profiles`** — One row per authenticated user. Stores display name, email, avatar URL (unused in MVP), and currency preference. Auto-populated via a PostgreSQL trigger on `auth.users` INSERT. The trigger extracts `full_name` from signup metadata, falling back to the email prefix.

**`groups`** — A named container for expenses. Stores name, description, category (7 options), cover color (hex), and the creator's user ID. All expenses and memberships are scoped to a group.

**`group_members`** — Junction table linking `profiles` to `groups`. Stores role (`admin` or `member`). Enforces uniqueness on `(group_id, user_id)`. The group creator is always inserted as `admin` at group creation time.

**`expenses`** — An individual expense record. References the group and the paying user. Stores amount (DECIMAL 12,2 with a > 0 check), split type (ENUM), category, and optional notes and receipt URL fields.

**`expense_splits`** — One row per included member per expense. Stores `owed_amount` (the user's share of the expense), `paid_amount` (the total expense amount for the payer, zero for everyone else), and `share_value` (the raw input: share count, percentage, or exact amount depending on split type).

**`settlements`** — A record that one member paid another. Stores payer, receiver, amount, and an optional note. Group-scoped.

**`expense_comments`** — Chat messages attached to a specific expense. Ordered by `created_at` ascending. Added to the Supabase Realtime publication.

**`activity_log`** — Audit trail. Records user ID, group ID (nullable; SET NULL on group deletion), action string, and human-readable description. Supports the activity timeline.

#### Key Relationships

- Every `expense` belongs to exactly one `group` and has exactly one `paid_by` user.
- Every `expense_split` belongs to exactly one `expense` and exactly one `profile`.
- Every `settlement` belongs to one `group`, one `paid_by` profile, and one `paid_to` profile.
- Every `expense_comment` belongs to one `expense` and one `profile`.

#### Balance Tracking Approach

Balances are not stored as a materialized value. They are computed on demand via the `get_group_balances` PostgreSQL stored procedure, which runs a CTE-based aggregation:

```
net_balance = total_paid − total_owed + settlement_adjustments
```

Where:
- `total_paid` = sum of all expense amounts in the group where the user is the payer.
- `total_owed` = sum of all `expense_splits.owed_amount` for the user within the group.
- `settlement_adjustments` = +amount for settlements where user is payer (they reduced their debt by paying), −amount where user is receiver.

A positive `net_balance` means the group owes the user money. A negative value means the user owes the group. This computation is always fresh and reflects the current state of all expenses and settlements.

#### Authorization Model

All eight tables have Row Level Security enabled. The core rule: a user may only SELECT, INSERT, UPDATE, or DELETE data for groups they belong to (enforced via subquery on `group_members`). Admins have elevated permissions for member management. Expense creators can delete their own expenses. Settlement inserts are restricted to the paying user (`paid_by = auth.uid()`).

### API Design

There is no custom REST or GraphQL API server. All data operations go directly from the Next.js client to the Supabase PostgREST API via the `@supabase/supabase-js` client. RLS policies enforce authorization at the database level.

#### Major Operations

**Authentication:**
- `supabase.auth.signUp({ email, password, options: { data: { full_name } } })`
- `supabase.auth.signInWithPassword({ email, password })`
- `supabase.auth.signOut()`
- `supabase.auth.getSession()` — hydrates context on mount
- `supabase.auth.onAuthStateChange(...)` — real-time session listener

**Group CRUD:**
- Create: `supabase.from('groups').insert({...}).select().single()` then insert `group_members` admin row.
- List: `supabase.from('groups').select('*, group_members(count)')` — returns all user's groups with member counts (RLS filters to membership).
- Read: `supabase.from('groups').select('*').eq('id', groupId).single()`
- Delete: `supabase.from('groups').delete().eq('id', groupId)` — cascades to members, expenses, settlements, comments.

**Expense CRUD:**
- Create: insert `expenses` row → insert `expense_splits` rows.
- Read: `supabase.from('expenses').select('*, profiles!expenses_paid_by_fkey(*), groups(*)')` — the named foreign key hint selects the payer's profile, not all profiles.
- Delete: `supabase.from('expenses').delete().eq('id', expenseId)` — cascades to splits and comments.

**Balances:**
- `supabase.rpc('get_group_balances', { p_group_id })` — calls the stored procedure and returns computed balance rows.

**Settlements:**
- Create: `supabase.from('settlements').insert({ group_id, paid_by, paid_to, amount })`.

**Real-time (comments):**
- `supabase.channel('expense_comments_{expenseId}').on('postgres_changes', { event: 'INSERT', filter: 'expense_id=eq.{id}' }, callback).subscribe()`

All write operations are followed by an `activity_log` insert to maintain the audit trail.

### Frontend Structure

#### Routes and Pages

```
/                              Landing page (unauthenticated entry)
/login                         Email + password sign-in
/signup                        Account creation (name + email + password)
/dashboard                     Home: net balance, groups preview, recent expenses
/dashboard/groups              Full group list (card grid)
/dashboard/groups/new          Group creation form
/dashboard/groups/[id]         Group detail: expenses tab + balances tab + member sidebar
/dashboard/groups/[id]/settings  Member invite, remove, group delete
/dashboard/groups/[id]/settle  Settle Up: suggested (simplified debts) + manual entry
/dashboard/expenses/new        New expense form (all split modes)
/dashboard/expenses/[id]       Expense detail + real-time chat
/dashboard/activity            Chronological activity timeline (last 50 events)
/dashboard/profile             Display name + currency preference
```

#### Component Hierarchy

All pages are `'use client'` components. There is no shared component library. Each page owns its data fetching and rendering logic. The architectural layers are:

```
src/app/layout.tsx (AuthProvider → ToastProvider)
└── src/app/dashboard/layout.tsx (Sidebar + Mobile Header + Bottom Nav)
    └── [page].tsx (data fetching + local state + UI rendering)
```

The dashboard layout is the only shared structural wrapper within the protected area. It renders the sidebar navigation (4 items: Dashboard, Groups, Activity, Profile), handles mobile responsiveness (hamburger menu + overlay + sliding sidebar + bottom nav), and guards the route by checking `useAuth()`.

#### State Management

**Global (React Context):**
- `AuthContext` — provides `user` (Supabase User object), `profile` (profiles row), `loading`, `signUp`, `signIn`, `signOut`, `refreshProfile`. Hydrated from `getSession()` on mount; kept live via `onAuthStateChange` listener.
- `ToastContext` — manages a queue of `{ id, type, message }` toast notifications. `showToast` auto-dismisses after 4 seconds. Renders the toast container inside the provider itself (not a portal).

**Local (useState per page):**
Every page manages its own fetched data, loading flags, form values, and UI state (active tab, modal open/closed, submission in progress). No shared data cache. No global store (no Redux, Zustand, or React Query).

### Deployment Approach

**Frontend:** Vercel. The Next.js repository is connected to Vercel via GitHub. Every push to the main branch triggers an automatic build (`next build`) and deployment. Vercel handles HTTPS termination, CDN edge caching of static assets, and serverless function execution for Next.js middleware.

**Database and Auth:** Supabase cloud (free tier). The PostgreSQL schema is provisioned by running `supabase/migrations/001_initial_schema.sql` in the Supabase SQL Editor. No local Supabase CLI workflow is required for deployment.

**Environment configuration:**
```
NEXT_PUBLIC_SUPABASE_URL       — Supabase project REST endpoint (exposed to browser)
NEXT_PUBLIC_SUPABASE_ANON_KEY  — Supabase anon key (exposed to browser; RLS is the security boundary)
SUPABASE_SERVICE_ROLE_KEY      — Service role key (present in .env.local; not used in application code)
```

Both `NEXT_PUBLIC_*` variables are set in the Vercel project dashboard. The anon key exposure is intentional and expected with Supabase's architecture — RLS policies prevent any unauthorized data access regardless of key exposure.

---

## AI Collaboration Process

### How AI Was Used Throughout Development

The AI was instructed to operate strictly as a junior engineer — not an autonomous builder. This meant the AI was forbidden from assuming requirements, jumping to implementation, or making technology choices without explicit human approval. The interaction was structured as a product discovery and scoping session before any line of code was written.

### Initial Engagement: The Interview Phase

The session began with the mandatory initial prompt provided by the assignment, which directed the AI to interview the developer across all product and engineering dimensions before producing any plan. The AI responded by generating a comprehensive `implementation_plan.md` artifact rather than starting to code. This artifact outlined:

- Proposed tech stack with justifications.
- Draft database schema with all tables and relationships.
- Open questions requiring human answers before proceeding.

The questions asked by the AI covered:

1. **Infrastructure availability:** Do you have a Supabase account and a Vercel account ready?
2. **Authentication scope:** Email/password only, or should Google OAuth be included?
3. **Currency requirements:** Single currency sufficient, or multi-currency from the start?
4. **UI direction:** Should the design use Tailwind CSS or a custom approach? What aesthetic — minimal, professional, or premium?
5. **Expense constraints:** Single payer per expense or support for multi-payer?
6. **Member invitation flow:** Require pre-registration, or support invite links?

### How Requirements Were Answered and Evolved

The developer's answers were explicit and became the contract for implementation:

- Email/password only — no OAuth.
- INR single currency — sufficient for the MVP.
- Custom CSS, no Tailwind — confirmed by the `--no-tailwind` flag at project creation.
- "Rich aesthetics" approved — led to the dark glassmorphism design.
- Single payer per expense — simplifies the data model significantly.
- Pre-registration required — avoids email service dependency.

These answers were incorporated into `AI_CONTEXT.md` immediately, establishing the source of truth before any code was written.

### How Architecture Decisions Were Refined

**Decision: Supabase Auth over NextAuth.js**

The initial plan considered NextAuth.js (Auth.js) as the authentication layer. During planning review, the developer identified that NextAuth.js sessions would require custom middleware to propagate JWT claims to Supabase, creating a mismatch between the session identity and the `auth.uid()` function used in RLS policies. The decision was made to use Supabase Auth natively, which eliminates this indirection — Supabase Auth cookies are directly read by the database's `auth.uid()`, meaning RLS policies work without any additional session bridging.

**Decision: Direct client-to-Supabase pattern (no API routes)**

The original approach considered using Next.js API routes (`/api/*`) as a thin backend layer. This was rejected because:
1. The assignment had a 2-day window — API routes add a round-trip and development overhead.
2. Supabase RLS provides authorization enforcement at the database level, making a middleware authorization layer redundant.
3. Client-side Supabase access is the standard pattern for Supabase projects and is well-supported by `@supabase/ssr`.

**Decision: PostgreSQL stored procedure for balances**

Initial prototyping explored computing balances entirely client-side by fetching raw splits and settlements. This was rejected because the aggregation logic (cross-joining members, expenses, splits, and settlements) is complex enough to produce errors if done in JavaScript with multiple async fetches. Moving the computation to a single PostgreSQL CTE-based function (`get_group_balances`) guaranteed consistency, reduced the number of network round-trips from four to one, and allowed the database query planner to optimize the join.

**Decision: Greedy debt simplification client-side**

The debt simplification algorithm was implemented as a pure JavaScript function (`simplifyDebts` in `utils.ts`) rather than in the database. This decision was made because:
1. The algorithm operates on the output of `get_group_balances`, which is already fetched.
2. It is a pure, stateless computation that does not require database access.
3. Keeping it in TypeScript makes it easily testable and readable.

### How AI_CONTEXT.md Was Continuously Maintained

`AI_CONTEXT.md` was treated as a living document updated at each implementation phase:

- **Phase 1 (Planning):** Product scope, tech stack, database schema, and API design written before any code.
- **Phase 2 (Auth + Layout):** Auth flow decisions (dropped NextAuth, chose Supabase native) recorded.
- **Phase 3 (Groups):** Group creation workflow, RLS policies for group_members, admin role logic documented.
- **Phase 4 (Expenses):** All four split calculation algorithms documented with exact formulas. Split validation rules recorded.
- **Phase 5 (Balances + Settlements):** RPC function design, settlement adjustment logic, and debt simplification algorithm captured.
- **Phase 6 (Realtime + Chat):** Channel naming convention, filter syntax, profile-fetch-on-payload pattern, and cleanup lifecycle documented.
- **Phase 7 (Activity + Profile):** Activity log action strings, timeline UI behavior, profile edit constraints captured.

When implementation details diverged from the original plan (e.g., discovering that `profiles!expenses_paid_by_fkey` was needed as an explicit join hint for the expense-payer profile query), those specifics were recorded in `AI_CONTEXT.md` to reflect the actual implementation rather than the intended one.

### Examples of Iterative Prompting and Refinement

**Prompt pattern — Validation logic:**
Rather than telling the AI "validate the splits," the developer specified the exact rules: unequal splits must sum to `totalAmount ± 0.01`; percentages must sum to `100 ± 0.1`; shares must be `> 0`. The AI then implemented `validateSplits()` and `calculateFinalSplits()` to match those exact tolerances.

**Prompt pattern — Rounding behavior:**
The developer specified that rounding remainders should go to the payer if the payer is included in the split, otherwise to the first included user. This produced the specific logic: `const firstId = includedUsers.includes(paidBy) ? paidBy : includedUsers[0]`. This was not a default behavior — it required an explicit decision.

**Prompt pattern — RLS policies:**
The developer reviewed the RLS policies draft and identified that the `expense_splits DELETE` policy was too permissive. It was refined to only allow deletion by the expense creator (`expense_id IN (SELECT id FROM expenses WHERE paid_by = auth.uid())`), matching the application-level rule that only the payer can delete an expense.

**Prompt pattern — Realtime subscription cleanup:**
The developer flagged that the initial realtime subscription implementation did not clean up the channel on component unmount, causing memory leaks in development. The AI added the `return () => supabase.removeChannel(commentsSubscription)` cleanup inside the `useEffect`.

### How Implementation Decisions Were Validated

Each major feature was validated against the original scoped requirements in `AI_CONTEXT.md` before being committed. The checklist used:
- Does this match the agreed split formula?
- Do the RLS policies allow the right operations and block the wrong ones?
- Is this action logged to `activity_log`?
- Does the UI provide feedback (toast) for both success and failure paths?
- Is the component cleaned up correctly (subscriptions, async state updates on unmounted components)?

---

## Tradeoffs

### 1. Client-Side Data Fetching for All Dashboard Pages

**Decision:** All dashboard pages use `'use client'` components with `useEffect`-based data fetching rather than React Server Components with server-side data loading.

**Reason:** Supabase Realtime subscriptions must be established from the browser. Since the expense detail page requires a live Realtime subscription, it must be a client component. To maintain consistency and simplify the mental model across all pages, the same pattern was applied everywhere.

**Impact:** No server-side rendering for dashboard pages — initial paint requires a client-side fetch. Slightly slower time-to-content compared to RSC data loading. No streaming.

**Future improvement:** Use RSC for initial data load on pages that do not require Realtime, then hydrate a client component for the subscription only (e.g., the chat panel can be a client island while the expense details are server-rendered).

---

### 2. No Custom API Layer

**Decision:** All client code calls Supabase PostgREST directly. There are no Next.js API routes (`/api/*`).

**Reason:** Time constraint and RLS-as-authorization model. Adding an API layer would add boilerplate without adding security (RLS already handles authorization) or meaningful abstraction at this scale.

**Impact:** Split calculation logic runs in the browser and is not server-validated. A malicious client could insert arbitrary `owed_amount` values that do not match any of the four split formulas. The database only enforces that amounts are non-negative, not that they are mathematically correct.

**Future improvement:** Move expense creation to a server action or Next.js API route that validates split correctness before inserting, using the same `calculateFinalSplits` logic server-side.

---

### 3. Dashboard Balance Summary Ignores Settlements

**Decision:** The home dashboard's "You are owed" / "You owe" summary is computed from `expense_splits` alone, without joining settlements.

**Reason:** Computing the cross-group settlement-adjusted balance requires calling `get_group_balances` for every group the user belongs to and summing the results — a potentially expensive multi-RPC pattern. Fetching all `expense_splits` for the user is a single query and is fast.

**Impact:** The dashboard balance summary will overstate the user's outstanding debt or credit after settlements have been recorded. It is an approximation. The accurate per-group balance is always shown correctly in the group detail view.

**Future improvement:** Create a second PostgreSQL function, `get_user_net_balance(user_id)`, that runs the full settlement-adjusted calculation across all groups in a single query.

---

### 4. Single-Payer Expenses Only

**Decision:** Each expense has exactly one payer (`paid_by` field on the `expenses` table).

**Reason:** Multi-payer expenses (where two or more people pay portions of a single bill) require a separate `expense_payments` table and a significantly more complex split calculation model. The assignment did not require this, and implementing it within a 2-day window would have crowded out other required features.

**Impact:** Users cannot represent a dinner where Alice paid ₹500 and Bob paid ₹500 for a ₹1000 bill as a single expense. They must either record two separate expenses or designate one person as the full payer and settle the internal split separately.

**Future improvement:** Add an `expense_payments` table with `(expense_id, user_id, paid_amount)` rows, removing `paid_by` from `expenses`. Update `get_group_balances` to aggregate from the payments table.

---

### 5. Greedy Debt Simplification (Not Optimal)

**Decision:** The `simplifyDebts` function uses a greedy two-pointer algorithm that matches the largest debtor to the largest creditor.

**Reason:** The greedy algorithm is simple to implement, easy to understand, and correct for most practical group configurations. A provably optimal algorithm (minimum-edge debt graph reduction) requires graph theory techniques that are significantly more complex to implement and debug within the time constraint.

**Impact:** For groups with cyclic debts (A owes B, B owes C, C owes A), the greedy algorithm may not find the absolute minimum number of transactions. In practice, most real-world groups have debt graphs that the greedy approach handles optimally.

**Future improvement:** Implement the minimum-edge debt settlement algorithm using a max-heap approach for provably optimal transaction minimization.

---

### 6. INR Hardcoded in Expense Display

**Decision:** All `formatCurrency` calls in expense and balance display default to INR (₹, `en-IN` locale), regardless of the user's saved currency preference in `profiles.currency`.

**Reason:** Multi-currency display without conversion requires knowing the currency of each expense at recording time, storing it on the `expenses` table, and rendering accordingly. Adding a `currency` column to `expenses` was deprioritized in favor of completing the core split and balance features.

**Impact:** The currency preference the user sets on their profile page has no visible effect on the application. This is documented as a known limitation.

**Future improvement:** Add a `currency` column to `expenses` (defaulting to the group creator's currency preference), use it in `formatCurrency` calls throughout the expense detail and balance views.

---

### 7. No Image Uploads

**Decision:** Receipt photos and profile avatars are not supported. The `receipt_url` and `avatar_url` columns exist in the schema but have no associated upload UI.

**Reason:** Supabase Storage bucket setup, file upload handling, and secure URL generation each require non-trivial implementation time. Avatars are replaced with initials-based colored circles that are visually adequate.

**Impact:** Users cannot attach receipts to expenses, reducing auditability for large shared bills.

**Future improvement:** Configure a Supabase Storage bucket for receipts, add a file input to the expense form, upload on submit, store the public URL in `receipt_url`, and display it on the expense detail page. Repeat for profile avatars.

---

### 8. Invite Requires Pre-Registration

**Decision:** Adding a member to a group requires the target user to already have a SplitEase account. The admin inputs the user's email; the system looks up `profiles` by email.

**Reason:** Sending invite emails requires an email delivery service (SendGrid, Resend, etc.) and a token-based invite link system with expiry logic. This was outside the 2-day scope.

**Impact:** New users must independently discover and sign up for the application before they can be added to an existing group. This creates friction in onboarding new members.

**Future improvement:** Add a `group_invitations` table with a token, expiry timestamp, and target email. On invite, send a transactional email via Resend with a link like `/invite?token=abc123`. On link click, auto-join the group if the user is already logged in, or prompt signup then auto-join.

---

## Risks Encountered

### Technical Risks

**Supabase join syntax for named foreign keys:**
The `expenses` table has two foreign keys to `profiles` — one for `paid_by` and one implicitly through splits. When fetching the expense with the payer's profile, a naive `profiles(*)` join would be ambiguous. The correct Supabase query syntax requires an explicit foreign key hint: `profiles!expenses_paid_by_fkey(*)`. This was identified during implementation of the expense detail page when the join returned null. It was resolved by using the named hint and documented in `AI_CONTEXT.md`.

**RLS recursion risk in `group_members` policies:**
The `group_members` SELECT policy checks `group_id IN (SELECT group_id FROM group_members WHERE user_id = auth.uid())`. This is a self-referential subquery. PostgreSQL can handle this correctly, but it required verification that the policy did not create an infinite loop or excessive query cost. Testing confirmed correct behavior.

**Realtime channel naming collisions:**
If two users opened different expenses simultaneously, a generic channel name (e.g., `expense_comments`) would deliver all comment events to all open expense pages. The channel was namespaced as `expense_comments_{expenseId}` with a row-level filter (`expense_id=eq.{expenseId}`) to ensure isolation. This was identified as a risk during the realtime design phase.

### Architecture Risks

**Floating-point rounding in split calculations:**
Financial calculations with JavaScript `number` types are subject to floating-point precision errors. For example, `100 / 3` produces `33.333...` rather than `33.33`. All split calculations use `Math.floor(x * 100) / 100` to truncate to 2 decimal places and explicitly calculate and reassign remainders. This approach was documented and tested with representative examples before being accepted.

**`get_group_balances` correctness with settlements:**
The settlement adjustment CTE in the stored procedure uses `UNION ALL` with positive and negative signed amounts for payers and receivers respectively. The sign convention required careful review: a user who pays a settlement is reducing the debt they owe (net_balance becomes less negative), so their `settled_paid` is positive. A user who receives a settlement is reducing what others owe them (net_balance becomes less positive), so their `settled_paid` is negative. The signs were verified against manual calculations.

### Scope Risks

**Feature creep during implementation:**
The 2-day timeline created pressure to add "just one more" feature (multi-currency, edit expense, email invites). These were explicitly deferred at each decision point by referencing the agreed scope in `AI_CONTEXT.md`. The context document served as a forcing function against scope expansion.

### Time Constraints

The 2-day window required aggressive prioritization. The sequence of implementation was ordered to deliver the core user journey (auth → group → expense → balance → settle) as early as possible, so the application was functionally demonstrable even if polish features (activity feed, profile page) had not yet been implemented. The realtime chat was implemented third-to-last because it could be deferred without breaking the core financial workflows.

---

## What Would Be Improved With More Time

### Scalability Improvements

1. **Server-side data loading via RSC:** Migrate non-realtime pages (groups list, activity feed, dashboard home) to React Server Components. Use `createServerClient` for the initial data fetch, hydrating client components only where interactivity or subscriptions are needed.

2. **Cross-group balance RPC:** Create a `get_user_net_balance(user_id)` PostgreSQL function that computes the settlement-adjusted net balance across all groups in a single query, replacing the approximation currently used on the dashboard home.

3. **Pagination:** Add cursor-based pagination for expense lists, activity logs, and groups using Supabase's `.range()` method.

4. **Optimistic UI updates:** Apply optimistic state updates for comment posting and settlement recording so the UI responds immediately without waiting for the server round-trip.

### Testing Improvements

1. **Unit tests for split logic:** Write Jest tests for `calculateFinalSplits` and `validateSplits` covering all four split modes, edge cases (single member, zero amount, rounding), and boundary conditions for each validation rule.

2. **Unit tests for `simplifyDebts`:** Test the greedy algorithm with known configurations including settled groups (empty output), two-party debts, three-party chains, and cyclic graphs.

3. **Integration tests for RLS policies:** Use the Supabase local development stack with `supabase test db` to verify that unauthorized data access is correctly blocked at the database level.

4. **E2E tests with Playwright:** Automate the core user journeys: signup → create group → add expense (equal split) → verify balance → record settlement → verify balance change. Run as a CI check on the Vercel preview deployment.

### UX Improvements

1. **Inline balance indicators on expense list:** Show each list item's "your share" and whether you owe or are owed directly on the expense card, without requiring a tab switch.

2. **Edit expense:** Allow the expense creator to modify description, amount, and category without deleting and recreating the expense.

3. **Notification system:** Real-time toast notifications when a new expense is added to a group the user is a member of, without requiring them to be on that group's page.

4. **Onboarding flow:** A guided first-run experience that walks new users through creating their first group and adding their first expense.

5. **Mobile-optimized expense creation:** A step-by-step wizard UI for mobile (one section per screen) rather than a long scrolling form.

### Feature Improvements

1. **Email invite links:** `group_invitations` table with token + expiry, transactional email via Resend, and auto-join on link click.

2. **Multi-payer expenses:** `expense_payments` table supporting multiple payers per expense; updated balance calculation.

3. **Receipt image upload:** Supabase Storage bucket for receipt photos with display on expense detail.

4. **Multi-currency support:** `currency` column on `expenses`; `formatCurrency` renders each expense in its recorded currency; cross-currency group summaries shown in a base currency with user-selectable conversion.

5. **Recurring expenses:** A `recurrence_rule` field on expenses to auto-generate monthly rent or subscription entries.

6. **Expense comments deletion:** Allow users to delete their own comments.

### Performance Improvements

1. **Memoization of `simplifyDebts`:** The debt simplification result is recomputed on every render that receives new balances. Wrap in `useMemo` to avoid unnecessary recalculation.

2. **SWR or React Query:** Replace manual `useEffect`/`useState` data fetching with a caching layer (SWR or TanStack Query) to avoid redundant fetches when navigating between pages and to enable background revalidation.

3. **Connection pooling:** For production scale, configure PgBouncer on the Supabase connection string to reduce database connection overhead from concurrent serverless function invocations.

---

## Conclusion

SplitEase delivers on every minimum product requirement specified in the assignment. Authentication, group management with role-based admin controls, expense creation across all four split modes with mathematically correct rounding, real-time chat per expense, group-level and individual balance tracking, debt simplification, and settlement recording are all fully implemented and deployed.

The architecture — Next.js on Vercel, Supabase for PostgreSQL and Auth and Realtime — was chosen deliberately to eliminate infrastructure complexity without compromising the relational database requirement. Row Level Security enforces authorization at the database layer, replacing the need for a custom API server. A single PostgreSQL stored procedure handles the balance aggregation that would otherwise require multiple client-side queries and error-prone JavaScript joins.

The AI collaboration process was structured as a genuine engineering dialogue: requirements were discovered through questioning, decisions were made explicitly and recorded in `AI_CONTEXT.md`, implementation divergences from the original plan were captured in the context document, and scope expansion was actively resisted by referencing the agreed contract at each decision point.

The known tradeoffs — single-payer model, client-side balance approximation on the dashboard, INR-only display — are intentional, documented, and each has a clear improvement path for a production-grade follow-on. The application as delivered is functional, demonstrable, and architecturally sound as a foundation for all identified improvements.
