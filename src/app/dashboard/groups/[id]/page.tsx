'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { formatCurrency, formatRelativeTime, getAvatarColor, getInitials, getCategoryEmoji, simplifyDebts } from '@/lib/utils';
import type { Group, Expense, Profile, GroupMember, GroupBalance, DebtSimplification } from '@/types';
import styles from './groupDetail.module.css';

export default function GroupDetailPage() {
  const params = useParams();
  const groupId = params.id as string;
  const { user } = useAuth();
  const router = useRouter();
  const supabase = createClient();
  const { showToast } = useToast();

  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<(GroupMember & { profiles: Profile })[]>([]);
  const [expenses, setExpenses] = useState<(Expense & { profiles: Profile })[]>([]);
  const [balances, setBalances] = useState<GroupBalance[]>([]);
  const [simplifiedDebts, setSimplifiedDebts] = useState<DebtSimplification[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'expenses' | 'balances'>('expenses');

  useEffect(() => {
    if (!user || !groupId) return;

    const fetchGroupData = async () => {
      setLoading(true);
      try {
        // 1. Fetch group details
        const { data: groupData, error: groupError } = await supabase
          .from('groups')
          .select('*')
          .eq('id', groupId)
          .single();
        
        if (groupError) throw groupError;
        setGroup(groupData);

        // 2. Fetch members
        const { data: membersData, error: membersError } = await supabase
          .from('group_members')
          .select('*, profiles(*)')
          .eq('group_id', groupId);

        if (membersError) throw membersError;
        setMembers(membersData as (GroupMember & { profiles: Profile })[]);

        // 3. Fetch expenses
        const { data: expensesData, error: expensesError } = await supabase
          .from('expenses')
          .select('*, profiles(*)')
          .eq('group_id', groupId)
          .order('created_at', { ascending: false });

        if (expensesError) throw expensesError;
        setExpenses(expensesData as (Expense & { profiles: Profile })[]);

        // 4. Fetch balances (using the RPC function)
        const { data: balancesData, error: balancesError } = await supabase
          .rpc('get_group_balances', { p_group_id: groupId });

        if (balancesError) throw balancesError;
        setBalances(balancesData as GroupBalance[]);
        
        // Calculate simplified debts
        if (balancesData && balancesData.length > 0) {
          setSimplifiedDebts(simplifyDebts(balancesData as GroupBalance[]));
        }

      } catch (error: any) {
        console.error('Error fetching group data:', error);
        showToast('Failed to load group details', 'error');
        router.push('/dashboard/groups');
      } finally {
        setLoading(false);
      }
    };

    fetchGroupData();
  }, [user, groupId, supabase, showToast, router]);

  if (loading) return <div className="loading-page"><div className="spinner spinner-lg" /></div>;
  if (!group) return <div className="empty-state"><p>Group not found</p></div>;

  const myBalance = balances.find(b => b.user_id === user?.id)?.net_balance || 0;
  const isMember = members.some(m => m.user_id === user?.id);

  return (
    <div className={styles.page}>
      {/* Header Area */}
      <div className={styles.header}>
        <div className={styles.headerTop}>
          <button className="btn btn-ghost btn-sm" onClick={() => router.push('/dashboard/groups')}>
            ← Back
          </button>
          <div className={styles.headerActions}>
            <button className="btn btn-secondary btn-sm" onClick={() => router.push(`/dashboard/groups/${groupId}/settings`)}>
              ⚙️ Settings
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => router.push(`/dashboard/groups/${groupId}/settle`)}>
              🤝 Settle Up
            </button>
          </div>
        </div>

        <div className={styles.groupHero}>
          <div className={styles.groupAvatar} style={{ background: group.cover_color }}>
            {group.name.charAt(0).toUpperCase()}
          </div>
          <div className={styles.groupInfo}>
            <h1 className={styles.groupName}>{group.name}</h1>
            <p className={styles.groupDesc}>{group.description || 'No description provided'}</p>
          </div>
          <div className={styles.myBalanceCard}>
            <span className={styles.balanceLabel}>My Balance</span>
            <span className={`${styles.balanceAmount} ${myBalance >= 0 ? 'amount-positive' : 'amount-negative'}`}>
              {myBalance > 0 ? '+' : ''}{formatCurrency(myBalance)}
            </span>
            <span className={styles.balanceStatus}>
              {myBalance > 0 ? 'getting back' : myBalance < 0 ? 'you owe' : 'settled up'}
            </span>
          </div>
        </div>
      </div>

      <div className={styles.contentLayout}>
        {/* Main Content Area */}
        <div className={styles.mainContent}>
          <div className={styles.tabs}>
            <button 
              className={`${styles.tab} ${activeTab === 'expenses' ? styles.activeTab : ''}`}
              onClick={() => setActiveTab('expenses')}
            >
              Expenses
            </button>
            <button 
              className={`${styles.tab} ${activeTab === 'balances' ? styles.activeTab : ''}`}
              onClick={() => setActiveTab('balances')}
            >
              Balances
            </button>
          </div>

          <div className={styles.tabContent}>
            {activeTab === 'expenses' ? (
              <div className={styles.expensesTab}>
                <div className={styles.tabHeader}>
                  <h2 className={styles.sectionTitle}>Expenses</h2>
                  <button className="btn btn-primary btn-sm" onClick={() => router.push(`/dashboard/expenses/new?groupId=${groupId}`)}>
                    + Add Expense
                  </button>
                </div>

                {expenses.length === 0 ? (
                  <div className="empty-state glass-card-static">
                    <span className="empty-state-icon">💸</span>
                    <p>No expenses yet. Add one to start splitting!</p>
                  </div>
                ) : (
                  <div className={styles.expenseList}>
                    {expenses.map((expense) => (
                      <div 
                        key={expense.id} 
                        className={`glass-card ${styles.expenseCard}`}
                        onClick={() => router.push(`/dashboard/expenses/${expense.id}`)}
                      >
                        <div className={styles.expenseIcon}>
                          {getCategoryEmoji(expense.category)}
                        </div>
                        <div className={styles.expenseDetails}>
                          <h3 className={styles.expenseTitle}>{expense.description}</h3>
                          <p className={styles.expenseMeta}>
                            Paid by {expense.profiles?.full_name} • {formatRelativeTime(expense.created_at)}
                          </p>
                        </div>
                        <div className={styles.expenseTotal}>
                          <span className={styles.amountLabel}>Total</span>
                          <span className={styles.amountValue}>{formatCurrency(expense.amount)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className={styles.balancesTab}>
                <h2 className={styles.sectionTitle} style={{ marginBottom: 'var(--space-4)' }}>Group Balances</h2>
                
                {balances.length === 0 ? (
                  <div className="empty-state glass-card-static">
                    <p>No balances to show.</p>
                  </div>
                ) : (
                  <div className={styles.balanceList}>
                    {balances.map((b) => (
                      <div key={b.user_id} className={`glass-card-static ${styles.balanceCard}`}>
                        <div className={styles.balanceUser}>
                          <div className="avatar avatar-sm" style={{ background: getAvatarColor(b.user_id) }}>
                            {getInitials(b.full_name)}
                          </div>
                          <span>{b.full_name}</span>
                        </div>
                        <div className={`${styles.balanceAmount} ${b.net_balance > 0 ? 'amount-positive' : b.net_balance < 0 ? 'amount-negative' : 'amount-neutral'}`}>
                          {b.net_balance > 0 ? 'gets back' : b.net_balance < 0 ? 'owes' : 'settled'} {formatCurrency(Math.abs(b.net_balance))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {simplifiedDebts.length > 0 && (
                  <div className={styles.simplifiedDebts}>
                    <h3 className={styles.sectionSubtitle}>How to settle up</h3>
                    <div className={styles.debtList}>
                      {simplifiedDebts.map((debt, idx) => (
                        <div key={idx} className={styles.debtItem}>
                          <span className={styles.debtor}>{debt.from_name}</span>
                          <span className={styles.owesText}>owes</span>
                          <span className={styles.creditor}>{debt.to_name}</span>
                          <span className={styles.debtAmount}>{formatCurrency(debt.amount)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className={styles.sideContent}>
          <div className={`glass-card-static ${styles.membersCard}`}>
            <div className={styles.cardHeader}>
              <h3>Members ({members.length})</h3>
              {isMember && (
                <button className="btn btn-ghost btn-sm" onClick={() => router.push(`/dashboard/groups/${groupId}/settings`)}>
                  Manage
                </button>
              )}
            </div>
            <div className={styles.memberList}>
              {members.map((member) => (
                <div key={member.id} className={styles.memberItem}>
                  <div className="avatar avatar-sm" style={{ background: getAvatarColor(member.user_id) }}>
                    {getInitials(member.profiles.full_name)}
                  </div>
                  <div className={styles.memberInfo}>
                    <span className={styles.memberName}>
                      {member.profiles.full_name}
                      {member.user_id === user?.id && ' (You)'}
                    </span>
                    <span className={styles.memberRole}>{member.role}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
