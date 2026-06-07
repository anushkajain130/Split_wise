// ============================================
// Splitwise Clone — TypeScript Types
// ============================================

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string;
  currency: string;
  created_at: string;
  updated_at: string;
}

export interface Group {
  id: string;
  name: string;
  description: string;
  category: string;
  cover_color: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  // Joined fields
  member_count?: number;
  members?: GroupMember[];
  total_expenses?: number;
}

export type GroupRole = 'admin' | 'member';

export interface GroupMember {
  id: string;
  group_id: string;
  user_id: string;
  role: GroupRole;
  joined_at: string;
  // Joined
  profiles?: Profile;
}

export type SplitType = 'equal' | 'unequal' | 'percentage' | 'shares';

export interface Expense {
  id: string;
  group_id: string;
  paid_by: string;
  description: string;
  amount: number;
  split_type: SplitType;
  category: string;
  notes: string;
  receipt_url: string;
  created_at: string;
  updated_at: string;
  // Joined
  profiles?: Profile;
  expense_splits?: ExpenseSplit[];
  groups?: Group;
}

export interface ExpenseSplit {
  id: string;
  expense_id: string;
  user_id: string;
  owed_amount: number;
  paid_amount: number;
  share_value: number;
  created_at: string;
  // Joined
  profiles?: Profile;
}

export interface Settlement {
  id: string;
  group_id: string;
  paid_by: string;
  paid_to: string;
  amount: number;
  note: string;
  created_at: string;
  // Joined
  payer?: Profile;
  receiver?: Profile;
}

export interface ExpenseComment {
  id: string;
  expense_id: string;
  user_id: string;
  message: string;
  created_at: string;
  // Joined
  profiles?: Profile;
}

export interface ActivityLog {
  id: string;
  user_id: string;
  group_id: string | null;
  action: string;
  description: string;
  metadata: Record<string, unknown>;
  created_at: string;
  // Joined
  profiles?: Profile;
  groups?: Group;
}

export interface GroupBalance {
  user_id: string;
  full_name: string;
  avatar_url: string;
  total_paid: number;
  total_owed: number;
  net_balance: number;
}

export interface DebtSimplification {
  from: string;
  from_name: string;
  to: string;
  to_name: string;
  amount: number;
}

// Expense categories with icons
export const EXPENSE_CATEGORIES = [
  { value: 'general', label: 'General', emoji: '📋' },
  { value: 'food', label: 'Food & Dining', emoji: '🍕' },
  { value: 'groceries', label: 'Groceries', emoji: '🛒' },
  { value: 'transport', label: 'Transportation', emoji: '🚗' },
  { value: 'rent', label: 'Rent', emoji: '🏠' },
  { value: 'utilities', label: 'Utilities', emoji: '💡' },
  { value: 'entertainment', label: 'Entertainment', emoji: '🎬' },
  { value: 'shopping', label: 'Shopping', emoji: '🛍️' },
  { value: 'travel', label: 'Travel', emoji: '✈️' },
  { value: 'health', label: 'Health', emoji: '🏥' },
  { value: 'education', label: 'Education', emoji: '📚' },
  { value: 'subscriptions', label: 'Subscriptions', emoji: '📱' },
  { value: 'gifts', label: 'Gifts', emoji: '🎁' },
  { value: 'sports', label: 'Sports', emoji: '⚽' },
  { value: 'other', label: 'Other', emoji: '📌' },
] as const;

export const GROUP_CATEGORIES = [
  { value: 'trip', label: 'Trip', emoji: '✈️' },
  { value: 'home', label: 'Home', emoji: '🏠' },
  { value: 'couple', label: 'Couple', emoji: '❤️' },
  { value: 'friends', label: 'Friends', emoji: '👥' },
  { value: 'work', label: 'Work', emoji: '💼' },
  { value: 'sports', label: 'Sports', emoji: '⚽' },
  { value: 'other', label: 'Other', emoji: '📌' },
] as const;

export const AVATAR_COLORS = [
  '#1abc9c', '#2ecc71', '#3498db', '#9b59b6', '#e74c3c',
  '#e67e22', '#f39c12', '#1f8ef1', '#e91e8a', '#00d2d3',
];
