'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { formatCurrency, getInitials, getAvatarColor, simplifyDebts, formatRelativeTime, getCategoryEmoji } from '@/lib/utils';
import type { Group, Expense, ActivityLog } from '@/types';
import styles from './home.module.css';

export default function DashboardPage() {
  const { user, profile } = useAuth();
  const router = useRouter();
  const supabase = createClient();
  const [groups, setGroups] = useState<Group[]>([]);
  const [recentExpenses, setRecentExpenses] = useState<Expense[]>([]);
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [totalOwed, setTotalOwed] = useState(0);
  const [totalOwe, setTotalOwe] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    
    const fetchData = async () => {
      setLoading(true);

      // Fetch groups
      const { data: groupsData } = await supabase
        .from('groups')
        .select('*, group_members(count)')
        .order('created_at', { ascending: false });

      if (groupsData) {
        setGroups(groupsData.map((g: Record<string, unknown>) => ({
          ...g,
          member_count: (g.group_members as Array<{ count: number }>)?.[0]?.count || 0,
        })) as Group[]);
      }

      // Fetch recent expenses
      const { data: expensesData } = await supabase
        .from('expenses')
        .select('*, profiles!expenses_paid_by_fkey(full_name, avatar_url), groups(name)')
        .order('created_at', { ascending: false })
        .limit(5);

      if (expensesData) {
        setRecentExpenses(expensesData as unknown as Expense[]);
      }

      // Fetch activities
      const { data: activityData } = await supabase
        .from('activity_log')
        .select('*, profiles(full_name)')
        .order('created_at', { ascending: false })
        .limit(10);

      if (activityData) {
        setActivities(activityData as unknown as ActivityLog[]);
      }

      // Calculate balances
      const { data: splitsData } = await supabase
        .from('expense_splits')
        .select('owed_amount, paid_amount')
        .eq('user_id', user.id);

      if (splitsData) {
        let owed = 0;
        let owe = 0;
        splitsData.forEach((s: { owed_amount: number; paid_amount: number }) => {
          const net = s.paid_amount - s.owed_amount;
          if (net > 0) owed += net;
          else owe += Math.abs(net);
        });
        setTotalOwed(owed);
        setTotalOwe(owe);
      }

      setLoading(false);
    };

    fetchData();
  }, [user, supabase]);

  if (loading) {
    return (
      <div className={styles.pageLoading}>
        <div className="spinner spinner-lg" />
      </div>
    );
  }

  const netBalance = totalOwed - totalOwe;

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.greeting}>
            Welcome back, {profile?.full_name?.split(' ')[0] || 'there'} 👋
          </h1>
          <p className={styles.subtitle}>Here&apos;s your expense summary</p>
        </div>
        <button className="btn btn-primary" onClick={() => router.push('/dashboard/groups/new')}>
          + New Group
        </button>
      </div>

      {/* Balance Cards */}
      <div className={styles.balanceGrid}>
        <div className={`glass-card-static ${styles.balanceCard} ${styles.netCard}`}>
          <span className={styles.balanceLabel}>Net Balance</span>
          <span className={`${styles.balanceAmount} ${netBalance >= 0 ? 'amount-positive' : 'amount-negative'}`}>
            {netBalance >= 0 ? '+' : ''}{formatCurrency(netBalance)}
          </span>
          <span className={styles.balanceHint}>
            {netBalance > 0 ? 'You are owed overall' : netBalance < 0 ? 'You owe overall' : 'All settled up!'}
          </span>
        </div>
        <div className={`glass-card-static ${styles.balanceCard}`}>
          <span className={styles.balanceLabel}>You are owed</span>
          <span className={`${styles.balanceAmount} amount-positive`}>
            {formatCurrency(totalOwed)}
          </span>
        </div>
        <div className={`glass-card-static ${styles.balanceCard}`}>
          <span className={styles.balanceLabel}>You owe</span>
          <span className={`${styles.balanceAmount} amount-negative`}>
            {formatCurrency(totalOwe)}
          </span>
        </div>
      </div>

      {/* Content Grid */}
      <div className={styles.contentGrid}>
        {/* Groups */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Your Groups</h2>
            <button className="btn btn-ghost btn-sm" onClick={() => router.push('/dashboard/groups')}>
              View All →
            </button>
          </div>
          {groups.length === 0 ? (
            <div className={`glass-card-static ${styles.emptyCard}`}>
              <span style={{ fontSize: '2rem' }}>👥</span>
              <p>No groups yet. Create one to start splitting expenses!</p>
              <button className="btn btn-primary btn-sm" onClick={() => router.push('/dashboard/groups/new')}>
                Create Group
              </button>
            </div>
          ) : (
            <div className={styles.groupList}>
              {groups.slice(0, 4).map((group) => (
                <div
                  key={group.id}
                  className={`glass-card ${styles.groupCard}`}
                  onClick={() => router.push(`/dashboard/groups/${group.id}`)}
                >
                  <div className={styles.groupIcon} style={{ background: group.cover_color }}>
                    {group.name.charAt(0).toUpperCase()}
                  </div>
                  <div className={styles.groupInfo}>
                    <span className={styles.groupName}>{group.name}</span>
                    <span className={styles.groupMeta}>{group.member_count} members</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Recent Expenses */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Recent Expenses</h2>
          </div>
          {recentExpenses.length === 0 ? (
            <div className={`glass-card-static ${styles.emptyCard}`}>
              <span style={{ fontSize: '2rem' }}>💸</span>
              <p>No expenses yet. Add one in a group!</p>
            </div>
          ) : (
            <div className={styles.expenseList}>
              {recentExpenses.map((expense) => (
                <div
                  key={expense.id}
                  className={`glass-card ${styles.expenseCard}`}
                  onClick={() => router.push(`/dashboard/expenses/${expense.id}`)}
                >
                  <span className={styles.expenseEmoji}>{getCategoryEmoji(expense.category)}</span>
                  <div className={styles.expenseInfo}>
                    <span className={styles.expenseName}>{expense.description}</span>
                    <span className={styles.expenseMeta}>
                      {(expense.profiles as unknown as { full_name: string })?.full_name} • {(expense.groups as unknown as { name: string })?.name}
                    </span>
                  </div>
                  <div className={styles.expenseAmount}>
                    <span className="amount-negative">{formatCurrency(expense.amount)}</span>
                    <span className={styles.expenseDate}>{formatRelativeTime(expense.created_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
