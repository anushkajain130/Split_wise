'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { simplifyDebts, formatCurrency, getAvatarColor, getInitials } from '@/lib/utils';
import type { DebtSimplification, GroupBalance, Group, GroupMember, Profile } from '@/types';
import styles from './settle.module.css';

export default function SettleUpPage() {
  const params = useParams();
  const groupId = params.id as string;
  const { user } = useAuth();
  const router = useRouter();
  const supabase = createClient();
  const { showToast } = useToast();

  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<(GroupMember & { profiles: Profile })[]>([]);
  const [simplifiedDebts, setSimplifiedDebts] = useState<DebtSimplification[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Manual settlement state
  const [selectedPayer, setSelectedPayer] = useState(user?.id || '');
  const [selectedReceiver, setSelectedReceiver] = useState('');
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState<'suggested' | 'manual'>('suggested');

  useEffect(() => {
    if (!user || !groupId) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        const { data: groupData } = await supabase.from('groups').select('*').eq('id', groupId).single();
        if (groupData) setGroup(groupData);

        const { data: membersData } = await supabase.from('group_members').select('*, profiles(*)').eq('group_id', groupId);
        if (membersData) {
          setMembers(membersData as (GroupMember & { profiles: Profile })[]);
          const otherMembers = membersData.filter(m => m.user_id !== user.id);
          if (otherMembers.length > 0) {
            setSelectedReceiver(otherMembers[0].user_id);
          }
        }

        const { data: balancesData } = await supabase.rpc('get_group_balances', { p_group_id: groupId });
        if (balancesData && balancesData.length > 0) {
          setSimplifiedDebts(simplifyDebts(balancesData as GroupBalance[]));
        }
      } catch (error) {
        console.error('Error loading settle up data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user, groupId, supabase]);

  const handleSettle = async (payerId: string, receiverId: string, settleAmount: number) => {
    if (!user) return;
    if (payerId === receiverId) {
      showToast('Payer and receiver cannot be the same', 'error');
      return;
    }
    if (settleAmount <= 0) {
      showToast('Amount must be greater than 0', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from('settlements')
        .insert({
          group_id: groupId,
          paid_by: payerId,
          paid_to: receiverId,
          amount: settleAmount
        });

      if (error) throw error;

      // Log activity
      const payerName = members.find(m => m.user_id === payerId)?.profiles.full_name || 'Someone';
      const receiverName = members.find(m => m.user_id === receiverId)?.profiles.full_name || 'Someone';
      
      await supabase.from('activity_log').insert({
        user_id: user.id,
        group_id: groupId,
        action: 'settled_up',
        description: `recorded a payment of ${formatCurrency(settleAmount)} from ${payerName} to ${receiverName}`
      });

      showToast('Payment recorded successfully', 'success');
      router.push(`/dashboard/groups/${groupId}`);
    } catch (error: any) {
      showToast(error.message || 'Failed to record payment', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitManual = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(amount);
    if (!isNaN(amt)) {
      handleSettle(selectedPayer, selectedReceiver, amt);
    }
  };

  if (loading) return <div className="loading-page"><div className="spinner" /></div>;

  return (
    <div className={styles.page}>
      <button className="btn btn-ghost btn-sm" onClick={() => router.back()} style={{ marginBottom: 'var(--space-4)' }}>
        ← Back
      </button>

      <div className={`glass-card ${styles.card}`}>
        <div className={styles.header}>
          <h1 className={styles.title}>Settle Up</h1>
          <p className={styles.subtitle}>Record a payment to settle debts in {group?.name}</p>
        </div>

        <div className={styles.tabs}>
          <button 
            className={`${styles.tab} ${mode === 'suggested' ? styles.activeTab : ''}`}
            onClick={() => setMode('suggested')}
          >
            Suggested
          </button>
          <button 
            className={`${styles.tab} ${mode === 'manual' ? styles.activeTab : ''}`}
            onClick={() => setMode('manual')}
          >
            Manual Entry
          </button>
        </div>

        {mode === 'suggested' ? (
          <div className={styles.suggestedSection}>
            {simplifiedDebts.length === 0 ? (
              <div className="empty-state">
                <span className="empty-state-icon">🎉</span>
                <h3>You are all settled up!</h3>
                <p>There are no outstanding debts in this group.</p>
              </div>
            ) : (
              <div className={styles.debtList}>
                {simplifiedDebts.map((debt, i) => (
                  <div key={i} className={styles.debtCard}>
                    <div className={styles.debtInfo}>
                      <div className={styles.debtor}>
                        <div className="avatar avatar-sm" style={{ background: getAvatarColor(debt.from) }}>
                          {getInitials(debt.from_name)}
                        </div>
                        <span className={styles.name}>{debt.from === user?.id ? 'You' : debt.from_name}</span>
                      </div>
                      
                      <div className={styles.debtArrow}>
                        <span className={styles.debtAmount}>{formatCurrency(debt.amount)}</span>
                        <span className={styles.arrowIcon}>→</span>
                      </div>
                      
                      <div className={styles.creditor}>
                        <div className="avatar avatar-sm" style={{ background: getAvatarColor(debt.to) }}>
                          {getInitials(debt.to_name)}
                        </div>
                        <span className={styles.name}>{debt.to === user?.id ? 'You' : debt.to_name}</span>
                      </div>
                    </div>
                    
                    <button 
                      className="btn btn-primary"
                      onClick={() => handleSettle(debt.from, debt.to, debt.amount)}
                      disabled={isSubmitting}
                    >
                      Record Payment
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <form onSubmit={submitManual} className={styles.manualForm}>
            <div className={styles.formRow}>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Who paid?</label>
                <select 
                  className="form-input form-select"
                  value={selectedPayer}
                  onChange={(e) => setSelectedPayer(e.target.value)}
                >
                  {members.map(m => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.user_id === user?.id ? 'You' : m.profiles.full_name}
                    </option>
                  ))}
                </select>
              </div>
              
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">To whom?</label>
                <select 
                  className="form-input form-select"
                  value={selectedReceiver}
                  onChange={(e) => setSelectedReceiver(e.target.value)}
                >
                  {members.map(m => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.user_id === user?.id ? 'You' : m.profiles.full_name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Amount</label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <span style={{ position: 'absolute', left: 'var(--space-4)', color: 'var(--text-secondary)' }}>₹</span>
                <input
                  type="number"
                  className="form-input"
                  style={{ paddingLeft: '3rem', fontSize: 'var(--font-size-lg)', height: '48px' }}
                  placeholder="0.00"
                  step="0.01"
                  min="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
              </div>
            </div>

            <button 
              type="submit" 
              className="btn btn-primary btn-lg" 
              style={{ width: '100%', marginTop: 'var(--space-4)' }}
              disabled={isSubmitting || !amount || selectedPayer === selectedReceiver}
            >
              {isSubmitting ? <div className="spinner" /> : 'Record Payment'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
