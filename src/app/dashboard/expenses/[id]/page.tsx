'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { formatCurrency, formatRelativeTime, getAvatarColor, getInitials, getCategoryEmoji, formatDate } from '@/lib/utils';
import type { Expense, ExpenseSplit, Profile, ExpenseComment, Group } from '@/types';
import styles from './expenseDetail.module.css';

export default function ExpenseDetailPage() {
  const params = useParams();
  const expenseId = params.id as string;
  const { user } = useAuth();
  const router = useRouter();
  const supabase = createClient();
  const { showToast } = useToast();

  const [expense, setExpense] = useState<(Expense & { profiles: Profile; groups: Group }) | null>(null);
  const [splits, setSplits] = useState<(ExpenseSplit & { profiles: Profile })[]>([]);
  const [comments, setComments] = useState<(ExpenseComment & { profiles: Profile })[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user || !expenseId) return;

    const fetchExpenseData = async () => {
      setLoading(true);
      try {
        // 1. Fetch expense details
        const { data: expenseData, error: expenseError } = await supabase
          .from('expenses')
          .select('*, profiles!expenses_paid_by_fkey(*), groups(*)')
          .eq('id', expenseId)
          .single();

        if (expenseError) throw expenseError;
        setExpense(expenseData as (Expense & { profiles: Profile; groups: Group }));

        // 2. Fetch splits
        const { data: splitsData, error: splitsError } = await supabase
          .from('expense_splits')
          .select('*, profiles(*)')
          .eq('expense_id', expenseId);

        if (splitsError) throw splitsError;
        setSplits(splitsData as (ExpenseSplit & { profiles: Profile })[]);

        // 3. Fetch initial comments
        const { data: commentsData, error: commentsError } = await supabase
          .from('expense_comments')
          .select('*, profiles(*)')
          .eq('expense_id', expenseId)
          .order('created_at', { ascending: true });

        if (commentsError) throw commentsError;
        setComments(commentsData as (ExpenseComment & { profiles: Profile })[]);
        
        setTimeout(() => scrollToBottom(), 100);

      } catch (error) {
        console.error('Error fetching expense:', error);
        showToast('Failed to load expense details', 'error');
        router.back();
      } finally {
        setLoading(false);
      }
    };

    fetchExpenseData();

    // Set up real-time subscription for comments
    const commentsSubscription = supabase
      .channel(`expense_comments_${expenseId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'expense_comments',
          filter: `expense_id=eq.${expenseId}`
        },
        async (payload) => {
          // Fetch the profile for the new comment
          const { data: profileData } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', payload.new.user_id)
            .single();

          if (profileData) {
            const newCommentObj = {
              ...payload.new,
              profiles: profileData
            } as (ExpenseComment & { profiles: Profile });
            
            setComments(prev => [...prev, newCommentObj]);
            setTimeout(() => scrollToBottom(), 100);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(commentsSubscription);
    };
  }, [user, expenseId, supabase, showToast, router]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handlePostComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || !user) return;

    setIsSubmittingComment(true);
    try {
      const { error } = await supabase
        .from('expense_comments')
        .insert({
          expense_id: expenseId,
          user_id: user.id,
          message: newComment.trim()
        });

      if (error) throw error;
      setNewComment('');
    } catch (error) {
      console.error('Error posting comment:', error);
      showToast('Failed to post comment', 'error');
    } finally {
      setIsSubmittingComment(false);
    }
  };

  const handleDeleteExpense = async () => {
    if (!expense || !user) return;
    if (expense.paid_by !== user.id) {
      showToast('Only the person who paid can delete this expense', 'error');
      return;
    }

    if (confirm('Are you sure you want to delete this expense? This cannot be undone.')) {
      try {
        const { error } = await supabase
          .from('expenses')
          .delete()
          .eq('id', expenseId);

        if (error) throw error;

        await supabase.from('activity_log').insert({
          user_id: user.id,
          group_id: expense.group_id,
          action: 'deleted_expense',
          description: `deleted the expense "${expense.description}"`
        });

        showToast('Expense deleted', 'success');
        router.push(`/dashboard/groups/${expense.group_id}`);
      } catch (error) {
        showToast('Failed to delete expense', 'error');
      }
    }
  };

  if (loading) return <div className="loading-page"><div className="spinner" /></div>;
  if (!expense) return <div className="empty-state"><p>Expense not found</p></div>;

  return (
    <div className={styles.page}>
      <button className="btn btn-ghost btn-sm" onClick={() => router.back()} style={{ marginBottom: 'var(--space-4)' }}>
        ← Back
      </button>

      <div className={styles.layout}>
        {/* Main Info */}
        <div className={styles.mainInfo}>
          <div className={`glass-card ${styles.expenseCard}`}>
            <div className={styles.expenseHeader}>
              <div className={styles.expenseIcon}>
                {getCategoryEmoji(expense.category)}
              </div>
              <div className={styles.expenseTitleContainer}>
                <h1 className={styles.expenseTitle}>{expense.description}</h1>
                <p className={styles.expenseAmount}>{formatCurrency(expense.amount)}</p>
                <p className={styles.expenseMeta}>
                  Added by {expense.profiles.full_name} on {formatDate(expense.created_at)}
                </p>
              </div>
            </div>

            {expense.notes && (
              <div className={styles.expenseNotes}>
                <h4>Notes</h4>
                <p>{expense.notes}</p>
              </div>
            )}

            <div className={styles.splitsSection}>
              <h3 className={styles.sectionTitle}>Split Details ({expense.split_type})</h3>
              <div className={styles.splitsList}>
                {splits.map((split) => (
                  <div key={split.id} className={styles.splitItem}>
                    <div className={styles.splitUser}>
                      <div className="avatar avatar-sm" style={{ background: getAvatarColor(split.user_id) }}>
                        {getInitials(split.profiles.full_name)}
                      </div>
                      <span className={styles.splitName}>
                        {split.profiles.full_name}
                        {split.user_id === user?.id && ' (You)'}
                      </span>
                    </div>
                    <div className={styles.splitAmounts}>
                      {split.paid_amount > 0 && (
                        <span className={styles.paidBadge}>Paid {formatCurrency(split.paid_amount)}</span>
                      )}
                      <span className={styles.owedAmount}>Owes {formatCurrency(split.owed_amount)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {expense.paid_by === user?.id && (
              <div className={styles.actionsSection}>
                <button className="btn btn-danger btn-sm" onClick={handleDeleteExpense}>
                  Delete Expense
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Chat / Comments */}
        <div className={styles.chatSection}>
          <div className={`glass-card-static ${styles.chatCard}`}>
            <div className={styles.chatHeader}>
              <h3>Comments</h3>
              <span className="badge badge-neutral">{comments.length}</span>
            </div>

            <div className={styles.chatMessages}>
              {comments.length === 0 ? (
                <div className={styles.emptyChat}>
                  No comments yet. Start the conversation!
                </div>
              ) : (
                comments.map((comment) => {
                  const isMine = comment.user_id === user?.id;
                  return (
                    <div key={comment.id} className={`${styles.messageWrapper} ${isMine ? styles.messageMine : ''}`}>
                      {!isMine && (
                        <div className="avatar avatar-sm" style={{ background: getAvatarColor(comment.user_id) }}>
                          {getInitials(comment.profiles.full_name)}
                        </div>
                      )}
                      <div className={styles.messageContent}>
                        {!isMine && <span className={styles.messageAuthor}>{comment.profiles.full_name}</span>}
                        <div className={styles.messageBubble}>
                          {comment.message}
                        </div>
                        <span className={styles.messageTime}>{formatRelativeTime(comment.created_at)}</span>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            <form onSubmit={handlePostComment} className={styles.chatInputForm}>
              <input
                type="text"
                className="form-input"
                placeholder="Add a comment..."
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                disabled={isSubmittingComment}
              />
              <button 
                type="submit" 
                className="btn btn-primary btn-icon"
                disabled={isSubmittingComment || !newComment.trim()}
              >
                {isSubmittingComment ? '...' : '↑'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
