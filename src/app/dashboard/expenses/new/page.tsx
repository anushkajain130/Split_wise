'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { EXPENSE_CATEGORIES } from '@/types';
import type { Group, GroupMember, Profile, SplitType } from '@/types';
import styles from './newExpense.module.css';

export default function NewExpensePage() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const preSelectedGroupId = searchParams.get('groupId');
  const supabase = createClient();
  const { showToast } = useToast();

  const [groups, setGroups] = useState<Group[]>([]);
  const [members, setMembers] = useState<(GroupMember & { profiles: Profile })[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [groupId, setGroupId] = useState(preSelectedGroupId || '');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('general');
  const [splitType, setSplitType] = useState<SplitType>('equal');
  const [paidBy, setPaidBy] = useState<string>(user?.id || '');
  
  // Split values per user: 
  // - unequal: direct amount
  // - percentage: percentage value
  // - shares: number of shares
  const [splitValues, setSplitValues] = useState<Record<string, number>>({});
  const [splitIncluded, setSplitIncluded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!user) return;

    const fetchGroups = async () => {
      const { data } = await supabase
        .from('groups')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (data) {
        setGroups(data as Group[]);
        if (!preSelectedGroupId && data.length > 0) {
          setGroupId(data[0].id);
        }
      }
      setLoading(false);
    };

    fetchGroups();
  }, [user, supabase, preSelectedGroupId]);

  useEffect(() => {
    if (!groupId) return;

    const fetchMembers = async () => {
      const { data } = await supabase
        .from('group_members')
        .select('*, profiles(*)')
        .eq('group_id', groupId);

      if (data) {
        const typedMembers = data as (GroupMember & { profiles: Profile })[];
        setMembers(typedMembers);
        
        // Initialize split values
        const initialIncluded: Record<string, boolean> = {};
        const initialValues: Record<string, number> = {};
        typedMembers.forEach(m => {
          initialIncluded[m.user_id] = true;
          initialValues[m.user_id] = splitType === 'shares' ? 1 : 0;
        });
        setSplitIncluded(initialIncluded);
        setSplitValues(initialValues);
      }
    };

    fetchMembers();
  }, [groupId, supabase, splitType]);

  const handleSplitValueChange = (userId: string, value: string) => {
    const num = parseFloat(value) || 0;
    setSplitValues(prev => ({ ...prev, [userId]: num }));
  };

  const toggleMemberIncluded = (userId: string) => {
    setSplitIncluded(prev => ({ ...prev, [userId]: !prev[userId] }));
  };

  const calculateFinalSplits = (totalAmount: number): Record<string, number> => {
    const includedUsers = Object.keys(splitIncluded).filter(id => splitIncluded[id]);
    const splits: Record<string, number> = {};

    if (includedUsers.length === 0) return splits;

    if (splitType === 'equal') {
      const splitAmount = Math.floor((totalAmount / includedUsers.length) * 100) / 100;
      let remainder = Math.round((totalAmount - (splitAmount * includedUsers.length)) * 100) / 100;
      
      includedUsers.forEach(id => {
        splits[id] = splitAmount;
      });
      // Add remainder to payer or first person
      const firstId = includedUsers.includes(paidBy) ? paidBy : includedUsers[0];
      splits[firstId] += remainder;
      
    } else if (splitType === 'unequal') {
      includedUsers.forEach(id => {
        splits[id] = splitValues[id] || 0;
      });
    } else if (splitType === 'percentage') {
      let totalAssigned = 0;
      includedUsers.forEach(id => {
        const pct = splitValues[id] || 0;
        const amt = Math.floor((totalAmount * (pct / 100)) * 100) / 100;
        splits[id] = amt;
        totalAssigned += amt;
      });
      
      const remainder = totalAmount - totalAssigned;
      if (Math.abs(remainder) > 0.01) {
        const firstId = includedUsers.includes(paidBy) ? paidBy : includedUsers[0];
        if (splits[firstId] !== undefined) {
          splits[firstId] += remainder;
        }
      }
    } else if (splitType === 'shares') {
      let totalShares = 0;
      includedUsers.forEach(id => {
        totalShares += splitValues[id] || 0;
      });

      if (totalShares > 0) {
        const perShare = totalAmount / totalShares;
        let totalAssigned = 0;
        includedUsers.forEach(id => {
          const amt = Math.floor(((splitValues[id] || 0) * perShare) * 100) / 100;
          splits[id] = amt;
          totalAssigned += amt;
        });

        const remainder = totalAmount - totalAssigned;
        if (Math.abs(remainder) > 0.01) {
          const firstId = includedUsers.includes(paidBy) ? paidBy : includedUsers[0];
          if (splits[firstId] !== undefined) {
            splits[firstId] += remainder;
          }
        }
      }
    }

    return splits;
  };

  const validateSplits = (totalAmount: number): boolean => {
    if (splitType === 'unequal') {
      const sum = Object.keys(splitIncluded)
        .filter(id => splitIncluded[id])
        .reduce((acc, id) => acc + (splitValues[id] || 0), 0);
      if (Math.abs(sum - totalAmount) > 0.01) {
        showToast(`Split amounts sum to ${sum}, not ${totalAmount}`, 'error');
        return false;
      }
    } else if (splitType === 'percentage') {
      const sum = Object.keys(splitIncluded)
        .filter(id => splitIncluded[id])
        .reduce((acc, id) => acc + (splitValues[id] || 0), 0);
      if (Math.abs(sum - 100) > 0.1) {
        showToast(`Percentages sum to ${sum}%, not 100%`, 'error');
        return false;
      }
    } else if (splitType === 'shares') {
      const sum = Object.keys(splitIncluded)
        .filter(id => splitIncluded[id])
        .reduce((acc, id) => acc + (splitValues[id] || 0), 0);
      if (sum <= 0) {
        showToast('Total shares must be greater than 0', 'error');
        return false;
      }
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const totalAmount = parseFloat(amount);
    if (!groupId || !description || isNaN(totalAmount) || totalAmount <= 0 || !paidBy) {
      showToast('Please fill in all required fields correctly', 'error');
      return;
    }

    if (!validateSplits(totalAmount)) return;

    const finalSplits = calculateFinalSplits(totalAmount);

    setIsSubmitting(true);
    try {
      // 1. Create expense
      const { data: expenseData, error: expenseError } = await supabase
        .from('expenses')
        .insert({
          group_id: groupId,
          paid_by: paidBy,
          description: description.trim(),
          amount: totalAmount,
          split_type: splitType,
          category
        })
        .select()
        .single();

      if (expenseError) throw expenseError;

      // 2. Create splits
      const splitsToInsert = Object.keys(finalSplits).map(userId => ({
        expense_id: expenseData.id,
        user_id: userId,
        owed_amount: finalSplits[userId],
        paid_amount: userId === paidBy ? totalAmount : 0,
        share_value: splitValues[userId] || 0
      }));

      // Adjust paid_amount logic if multiple people paid (not supported in UI yet, defaulting to single payer)

      const { error: splitsError } = await supabase
        .from('expense_splits')
        .insert(splitsToInsert);

      if (splitsError) throw splitsError;

      // 3. Log activity
      await supabase.from('activity_log').insert({
        user_id: user.id,
        group_id: groupId,
        action: 'added_expense',
        description: `added "${description}" for ${totalAmount}`
      });

      showToast('Expense added successfully!', 'success');
      router.push(`/dashboard/groups/${groupId}`);
    } catch (error: any) {
      console.error('Error creating expense:', error);
      showToast(error.message || 'Failed to add expense', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) return <div className="loading-page"><div className="spinner" /></div>;

  if (groups.length === 0) {
    return (
      <div className="empty-state">
        <span className="empty-state-icon">👥</span>
        <h3>You need a group first</h3>
        <p>Create a group before adding an expense.</p>
        <button className="btn btn-primary mt-4" onClick={() => router.push('/dashboard/groups/new')}>
          Create Group
        </button>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <button className="btn btn-ghost btn-sm" onClick={() => router.back()} style={{ marginBottom: 'var(--space-4)' }}>
        ← Back
      </button>

      <div className={`glass-card ${styles.formCard}`}>
        <div className={styles.formHeader}>
          <h1 className={styles.formTitle}>Add an Expense</h1>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className="form-group">
            <label className="form-label">Group</label>
            <select
              className="form-input form-select"
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              required
            >
              <option value="" disabled>Select a group</option>
              {groups.map(g => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>

          <div className={styles.formRow}>
            <div className="form-group" style={{ flex: 2 }}>
              <label className="form-label">Description</label>
              <input
                type="text"
                className="form-input"
                placeholder="Dinner, Uber, etc."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
              />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">Category</label>
              <select
                className="form-input form-select"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {EXPENSE_CATEGORIES.map((cat) => (
                  <option key={cat.value} value={cat.value}>
                    {cat.emoji} {cat.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className={styles.formRow}>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">Amount</label>
              <div className={styles.amountInputWrapper}>
                <span className={styles.currencySymbol}>₹</span>
                <input
                  type="number"
                  className={`form-input ${styles.amountInput}`}
                  placeholder="0.00"
                  step="0.01"
                  min="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">Paid by</label>
              <select
                className="form-input form-select"
                value={paidBy}
                onChange={(e) => setPaidBy(e.target.value)}
                required
              >
                {members.map(m => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.user_id === user?.id ? 'You' : m.profiles.full_name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Split Options */}
          <div className={styles.splitSection}>
            <div className={styles.splitTabs}>
              <button 
                type="button" 
                className={`${styles.splitTab} ${splitType === 'equal' ? styles.splitTabActive : ''}`}
                onClick={() => setSplitType('equal')}
              >
                = Equal
              </button>
              <button 
                type="button" 
                className={`${styles.splitTab} ${splitType === 'unequal' ? styles.splitTabActive : ''}`}
                onClick={() => setSplitType('unequal')}
              >
                1.23 Exact
              </button>
              <button 
                type="button" 
                className={`${styles.splitTab} ${splitType === 'percentage' ? styles.splitTabActive : ''}`}
                onClick={() => setSplitType('percentage')}
              >
                % Percent
              </button>
              <button 
                type="button" 
                className={`${styles.splitTab} ${splitType === 'shares' ? styles.splitTabActive : ''}`}
                onClick={() => setSplitType('shares')}
              >
                📊 Shares
              </button>
            </div>

            <div className={styles.splitMembersList}>
              {members.map((member) => (
                <div key={member.user_id} className={styles.splitMemberItem}>
                  <label className={styles.splitCheckbox}>
                    <input 
                      type="checkbox" 
                      checked={!!splitIncluded[member.user_id]}
                      onChange={() => toggleMemberIncluded(member.user_id)}
                    />
                    <span className={styles.memberName}>
                      {member.user_id === user?.id ? 'You' : member.profiles.full_name}
                    </span>
                  </label>
                  
                  {splitIncluded[member.user_id] && splitType !== 'equal' && (
                    <div className={styles.splitInputWrapper}>
                      <input 
                        type="number"
                        className="form-input"
                        style={{ padding: '4px 8px', width: '100px' }}
                        step={splitType === 'shares' ? '1' : '0.01'}
                        min="0"
                        value={splitValues[member.user_id] || ''}
                        onChange={(e) => handleSplitValueChange(member.user_id, e.target.value)}
                        placeholder="0"
                      />
                      <span className={styles.splitSuffix}>
                        {splitType === 'percentage' ? '%' : splitType === 'shares' ? 'shares' : '₹'}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className={styles.formActions}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => router.back()}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSubmitting || !description || !amount}
            >
              {isSubmitting ? <div className="spinner" /> : 'Save Expense'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
