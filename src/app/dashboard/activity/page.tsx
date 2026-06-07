'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { formatRelativeTime, getAvatarColor, getInitials } from '@/lib/utils';
import type { ActivityLog, Profile, Group } from '@/types';
import styles from './activity.module.css';

export default function ActivityPage() {
  const { user } = useAuth();
  const router = useRouter();
  const supabase = createClient();
  
  const [activities, setActivities] = useState<(ActivityLog & { profiles: Profile; groups: Group | null })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const fetchActivity = async () => {
      const { data } = await supabase
        .from('activity_log')
        .select('*, profiles(*), groups(id, name, cover_color)')
        .order('created_at', { ascending: false })
        .limit(50);

      if (data) {
        setActivities(data as (ActivityLog & { profiles: Profile; groups: Group | null })[]);
      }
      setLoading(false);
    };

    fetchActivity();
  }, [user, supabase]);

  const getActivityIcon = (action: string) => {
    if (action.includes('expense')) return '💸';
    if (action.includes('group')) return '👥';
    if (action.includes('settle')) return '🤝';
    if (action.includes('member')) return '👤';
    return '📝';
  };

  if (loading) return <div className="loading-page"><div className="spinner spinner-lg" /></div>;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Recent Activity</h1>
        <p className={styles.subtitle}>See what&apos;s happening in your groups</p>
      </div>

      {activities.length === 0 ? (
        <div className="empty-state">
          <span className="empty-state-icon">📋</span>
          <h3>No activity yet</h3>
          <p>Create a group or add an expense to see activity here.</p>
        </div>
      ) : (
        <div className={styles.timeline}>
          {activities.map((activity, index) => (
            <div key={activity.id} className={styles.activityItem} style={{ animationDelay: `${index * 0.05}s` }}>
              <div className={styles.activityIcon}>
                {getActivityIcon(activity.action)}
              </div>
              
              <div className={styles.activityContent}>
                <div className={styles.activityText}>
                  <span className={styles.userName}>
                    {activity.user_id === user?.id ? 'You' : activity.profiles.full_name}
                  </span>{' '}
                  {activity.description}
                </div>
                
                <div className={styles.activityMeta}>
                  <span className={styles.time}>{formatRelativeTime(activity.created_at)}</span>
                  {activity.groups && (
                    <button 
                      className={styles.groupBadge}
                      onClick={() => router.push(`/dashboard/groups/${activity.group_id}`)}
                      style={{ borderLeftColor: activity.groups.cover_color }}
                    >
                      in {activity.groups.name}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
