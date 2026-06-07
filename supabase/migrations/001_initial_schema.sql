-- ============================================
-- Splitwise Clone — Database Schema
-- PostgreSQL (Supabase)
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. PROFILES (extends Supabase auth.users)
-- ============================================
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL DEFAULT '',
  avatar_url TEXT DEFAULT '',
  currency TEXT DEFAULT 'INR',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- ============================================
-- 2. GROUPS
-- ============================================
CREATE TABLE groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  category TEXT DEFAULT 'other',
  cover_color TEXT DEFAULT '#1abc9c',
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 3. GROUP MEMBERS
-- ============================================
CREATE TYPE group_role AS ENUM ('admin', 'member');

CREATE TABLE group_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role group_role DEFAULT 'member',
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(group_id, user_id)
);

-- ============================================
-- 4. EXPENSES
-- ============================================
CREATE TYPE split_type AS ENUM ('equal', 'unequal', 'percentage', 'shares');

CREATE TABLE expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  paid_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  amount DECIMAL(12, 2) NOT NULL CHECK (amount > 0),
  split_type split_type NOT NULL DEFAULT 'equal',
  category TEXT DEFAULT 'general',
  notes TEXT DEFAULT '',
  receipt_url TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 5. EXPENSE SPLITS
-- ============================================
CREATE TABLE expense_splits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  expense_id UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  owed_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
  paid_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
  share_value DECIMAL(12, 4) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(expense_id, user_id)
);

-- ============================================
-- 6. SETTLEMENTS
-- ============================================
CREATE TABLE settlements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  paid_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  paid_to UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount DECIMAL(12, 2) NOT NULL CHECK (amount > 0),
  note TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 7. EXPENSE COMMENTS (Chat)
-- ============================================
CREATE TABLE expense_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  expense_id UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 8. ACTIVITY LOG
-- ============================================
CREATE TABLE activity_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  group_id UUID REFERENCES groups(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  description TEXT DEFAULT '',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX idx_group_members_group ON group_members(group_id);
CREATE INDEX idx_group_members_user ON group_members(user_id);
CREATE INDEX idx_expenses_group ON expenses(group_id);
CREATE INDEX idx_expenses_paid_by ON expenses(paid_by);
CREATE INDEX idx_expense_splits_expense ON expense_splits(expense_id);
CREATE INDEX idx_expense_splits_user ON expense_splits(user_id);
CREATE INDEX idx_settlements_group ON settlements(group_id);
CREATE INDEX idx_expense_comments_expense ON expense_comments(expense_id);
CREATE INDEX idx_activity_log_user ON activity_log(user_id);
CREATE INDEX idx_activity_log_group ON activity_log(group_id);
CREATE INDEX idx_activity_log_created ON activity_log(created_at DESC);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

-- Profiles: users can read all profiles, update own
CREATE POLICY "Profiles are viewable by authenticated users"
  ON profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);

-- ============================================
-- HELPER FUNCTIONS FOR RLS (breaks recursion)
-- ============================================
CREATE OR REPLACE FUNCTION public.check_is_group_member(p_group_id UUID, p_user_id UUID)
RETURNS BOOLEAN SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = p_group_id AND user_id = p_user_id
  );
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.check_is_group_admin(p_group_id UUID, p_user_id UUID)
RETURNS BOOLEAN SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = p_group_id AND user_id = p_user_id AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql;

-- Groups: members can view their groups
CREATE POLICY "Users can view groups they belong to"
  ON groups FOR SELECT
  TO authenticated
  USING (
    created_by = auth.uid()
    OR
    check_is_group_member(id, auth.uid())
  );

CREATE POLICY "Authenticated users can create groups"
  ON groups FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Group admins can update groups"
  ON groups FOR UPDATE
  TO authenticated
  USING (
    check_is_group_admin(id, auth.uid())
  );

CREATE POLICY "Group admins can delete groups"
  ON groups FOR DELETE
  TO authenticated
  USING (created_by = auth.uid());

-- Group Members: visible to group members
CREATE POLICY "Group members are viewable by group members"
  ON group_members FOR SELECT
  TO authenticated
  USING (
    check_is_group_member(group_id, auth.uid())
  );

CREATE POLICY "Group admins can add members"
  ON group_members FOR INSERT
  TO authenticated
  WITH CHECK (
    check_is_group_admin(group_id, auth.uid())
    OR
    group_id IN (SELECT id FROM groups WHERE created_by = auth.uid())
  );

CREATE POLICY "Group admins can remove members"
  ON group_members FOR DELETE
  TO authenticated
  USING (
    check_is_group_admin(group_id, auth.uid())
    OR user_id = auth.uid()
  );

-- Expenses: visible to group members
CREATE POLICY "Expenses are viewable by group members"
  ON expenses FOR SELECT
  TO authenticated
  USING (
    check_is_group_member(group_id, auth.uid())
  );

CREATE POLICY "Group members can create expenses"
  ON expenses FOR INSERT
  TO authenticated
  WITH CHECK (
    check_is_group_member(group_id, auth.uid())
  );

CREATE POLICY "Expense creators can update"
  ON expenses FOR UPDATE
  TO authenticated
  USING (paid_by = auth.uid());

CREATE POLICY "Expense creators can delete"
  ON expenses FOR DELETE
  TO authenticated
  USING (paid_by = auth.uid());

-- Expense Splits
CREATE POLICY "Splits viewable by group members"
  ON expense_splits FOR SELECT
  TO authenticated
  USING (
    expense_id IN (
      SELECT e.id FROM expenses e
      WHERE check_is_group_member(e.group_id, auth.uid())
    )
  );

CREATE POLICY "Splits can be created by group members"
  ON expense_splits FOR INSERT
  TO authenticated
  WITH CHECK (
    expense_id IN (
      SELECT e.id FROM expenses e
      WHERE check_is_group_member(e.group_id, auth.uid())
    )
  );

CREATE POLICY "Splits can be deleted by expense creator"
  ON expense_splits FOR DELETE
  TO authenticated
  USING (
    expense_id IN (SELECT id FROM expenses WHERE paid_by = auth.uid())
  );

-- Settlements
CREATE POLICY "Settlements viewable by group members"
  ON settlements FOR SELECT
  TO authenticated
  USING (
    check_is_group_member(group_id, auth.uid())
  );

CREATE POLICY "Group members can create settlements"
  ON settlements FOR INSERT
  TO authenticated
  WITH CHECK (
    check_is_group_member(group_id, auth.uid())
    AND auth.uid() = paid_by
  );

-- Comments
CREATE POLICY "Comments viewable by group members"
  ON expense_comments FOR SELECT
  TO authenticated
  USING (
    expense_id IN (
      SELECT e.id FROM expenses e
      WHERE check_is_group_member(e.group_id, auth.uid())
    )
  );

CREATE POLICY "Group members can post comments"
  ON expense_comments FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Activity Log
CREATE POLICY "Users can view activity for their groups"
  ON activity_log FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR check_is_group_member(group_id, auth.uid())
  );

CREATE POLICY "Authenticated users can create activity"
  ON activity_log FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- ============================================
-- REALTIME (enable for chat)
-- ============================================
ALTER PUBLICATION supabase_realtime ADD TABLE expense_comments;
ALTER PUBLICATION supabase_realtime ADD TABLE activity_log;

-- ============================================
-- HELPER FUNCTION: Get group balances
-- ============================================
CREATE OR REPLACE FUNCTION get_group_balances(p_group_id UUID)
RETURNS TABLE (
  user_id UUID,
  full_name TEXT,
  avatar_url TEXT,
  total_paid DECIMAL,
  total_owed DECIMAL,
  net_balance DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  WITH member_payments AS (
    SELECT
      gm.user_id,
      p.full_name,
      p.avatar_url,
      COALESCE(SUM(CASE WHEN e.paid_by = gm.user_id THEN e.amount ELSE 0 END), 0) AS total_paid,
      COALESCE(SUM(es.owed_amount), 0) AS total_owed
    FROM group_members gm
    JOIN profiles p ON p.id = gm.user_id
    LEFT JOIN expenses e ON e.group_id = gm.group_id AND e.paid_by = gm.user_id
    LEFT JOIN expense_splits es ON es.user_id = gm.user_id
      AND es.expense_id IN (SELECT id FROM expenses WHERE group_id = p_group_id)
    WHERE gm.group_id = p_group_id
    GROUP BY gm.user_id, p.full_name, p.avatar_url
  ),
  settlement_adjustments AS (
    SELECT
      paid_by AS user_id,
      SUM(amount) AS settled_paid
    FROM settlements
    WHERE group_id = p_group_id
    GROUP BY paid_by
    UNION ALL
    SELECT
      paid_to AS user_id,
      -SUM(amount) AS settled_paid
    FROM settlements
    WHERE group_id = p_group_id
    GROUP BY paid_to
  )
  SELECT
    mp.user_id,
    mp.full_name,
    mp.avatar_url,
    mp.total_paid,
    mp.total_owed,
    (mp.total_paid - mp.total_owed + COALESCE(SUM(sa.settled_paid), 0)) AS net_balance
  FROM member_payments mp
  LEFT JOIN settlement_adjustments sa ON sa.user_id = mp.user_id
  GROUP BY mp.user_id, mp.full_name, mp.avatar_url, mp.total_paid, mp.total_owed;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
