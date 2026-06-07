'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { GROUP_CATEGORIES } from '@/types';
import type { Group } from '@/types';
import styles from './groups.module.css';

export default function GroupsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const supabase = createClient();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const fetchGroups = async () => {
      const { data } = await supabase
        .from('groups')
        .select('*, group_members(count)')
        .order('created_at', { ascending: false });

      if (data) {
        setGroups(data.map((g: Record<string, unknown>) => ({
          ...g,
          member_count: (g.group_members as Array<{ count: number }>)?.[0]?.count || 0,
        })) as Group[]);
      }
      setLoading(false);
    };

    fetchGroups();
  }, [user, supabase]);

  const getCategoryEmoji = (cat: string) => {
    return GROUP_CATEGORIES.find(c => c.value === cat)?.emoji || '📌';
  };

  if (loading) {
    return <div className="loading-page"><div className="spinner spinner-lg" /></div>;
  }

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Groups</h1>
          <p className={styles.pageSubtitle}>{groups.length} group{groups.length !== 1 ? 's' : ''}</p>
        </div>
        <button className="btn btn-primary" onClick={() => router.push('/dashboard/groups/new')}>
          + New Group
        </button>
      </div>

      {groups.length === 0 ? (
        <div className="empty-state">
          <span className="empty-state-icon">👥</span>
          <h3 className="empty-state-title">No groups yet</h3>
          <p className="empty-state-text">Create a group to start tracking shared expenses with friends, roommates, or travel companions.</p>
          <button className="btn btn-primary" onClick={() => router.push('/dashboard/groups/new')}>
            Create Your First Group
          </button>
        </div>
      ) : (
        <div className={styles.groupGrid}>
          {groups.map((group, i) => (
            <div
              key={group.id}
              className={`glass-card ${styles.groupCard}`}
              style={{ animationDelay: `${i * 0.05}s` }}
              onClick={() => router.push(`/dashboard/groups/${group.id}`)}
            >
              <div className={styles.cardTop}>
                <div className={styles.groupAvatar} style={{ background: group.cover_color }}>
                  {group.name.charAt(0).toUpperCase()}
                </div>
                <span className={styles.categoryBadge}>{getCategoryEmoji(group.category)}</span>
              </div>
              <div className={styles.cardBody}>
                <h3 className={styles.groupName}>{group.name}</h3>
                {group.description && (
                  <p className={styles.groupDesc}>{group.description}</p>
                )}
                <div className={styles.groupStats}>
                  <span className={styles.statItem}>👤 {group.member_count}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
