'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { getAvatarColor, getInitials, isValidEmail } from '@/lib/utils';
import type { Group, GroupMember, Profile } from '@/types';
import styles from './settings.module.css';

export default function GroupSettingsPage() {
  const params = useParams();
  const groupId = params.id as string;
  const { user } = useAuth();
  const router = useRouter();
  const supabase = createClient();
  const { showToast } = useToast();

  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<(GroupMember & { profiles: Profile })[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [isInviting, setIsInviting] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!user || !groupId) return;

    const fetchSettingsData = async () => {
      setLoading(true);
      try {
        const { data: groupData } = await supabase
          .from('groups')
          .select('*')
          .eq('id', groupId)
          .single();
        
        if (groupData) setGroup(groupData);

        const { data: membersData } = await supabase
          .from('group_members')
          .select('*, profiles(*)')
          .eq('group_id', groupId);

        if (membersData) {
          const typedMembers = membersData as (GroupMember & { profiles: Profile })[];
          setMembers(typedMembers);
          const currentUserMember = typedMembers.find(m => m.user_id === user.id);
          setIsAdmin(currentUserMember?.role === 'admin' || groupData?.created_by === user.id);
        }
      } catch (error) {
        console.error('Error fetching settings:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchSettingsData();
  }, [user, groupId, supabase]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      showToast('Only admins can add members', 'error');
      return;
    }
    if (!isValidEmail(inviteEmail)) {
      showToast('Please enter a valid email address', 'error');
      return;
    }

    setIsInviting(true);
    try {
      // 1. Find user by email
      const { data: userData, error: userError } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('email', inviteEmail.trim().toLowerCase())
        .single();

      if (userError || !userData) {
        showToast('User not found. They must sign up first.', 'error');
        setIsInviting(false);
        return;
      }

      // 2. Check if already a member
      if (members.some(m => m.user_id === userData.id)) {
        showToast('User is already a member', 'info');
        setInviteEmail('');
        setIsInviting(false);
        return;
      }

      // 3. Add to group
      const { error: addError } = await supabase
        .from('group_members')
        .insert({
          group_id: groupId,
          user_id: userData.id,
          role: 'member'
        });

      if (addError) throw addError;

      // 4. Log activity
      await supabase.from('activity_log').insert({
        user_id: user!.id,
        group_id: groupId,
        action: 'added_member',
        description: `added ${userData.full_name} to the group`
      });

      showToast('Member added successfully!', 'success');
      setInviteEmail('');
      
      // Refresh members list
      const { data: newMembersData } = await supabase
        .from('group_members')
        .select('*, profiles(*)')
        .eq('group_id', groupId);
      
      if (newMembersData) setMembers(newMembersData as (GroupMember & { profiles: Profile })[]);

    } catch (error: any) {
      console.error('Invite error:', error);
      showToast(error.message || 'Failed to add member', 'error');
    } finally {
      setIsInviting(false);
    }
  };

  const handleRemoveMember = async (memberId: string, memberUserId: string, memberName: string) => {
    if (!isAdmin && memberUserId !== user?.id) {
      showToast('Only admins can remove other members', 'error');
      return;
    }

    if (confirm(`Are you sure you want to remove ${memberName}?`)) {
      try {
        const { error } = await supabase
          .from('group_members')
          .delete()
          .eq('id', memberId);

        if (error) throw error;

        await supabase.from('activity_log').insert({
          user_id: user!.id,
          group_id: groupId,
          action: 'removed_member',
          description: `removed ${memberName} from the group`
        });

        showToast('Member removed', 'success');
        
        if (memberUserId === user?.id) {
          router.push('/dashboard/groups'); // Left the group
        } else {
          setMembers(members.filter(m => m.id !== memberId));
        }
      } catch (error: any) {
        showToast('Failed to remove member', 'error');
      }
    }
  };

  if (loading) return <div className="loading-page"><div className="spinner" /></div>;
  if (!group) return <div className="empty-state"><p>Group not found</p></div>;

  return (
    <div className={styles.page}>
      <button className="btn btn-ghost btn-sm" onClick={() => router.push(`/dashboard/groups/${groupId}`)} style={{ marginBottom: 'var(--space-4)' }}>
        ← Back to Group
      </button>

      <div className={styles.header}>
        <h1 className={styles.title}>Group Settings</h1>
        <p className={styles.subtitle}>{group.name}</p>
      </div>

      <div className={styles.contentGrid}>
        {/* Members Management */}
        <div className={`glass-card ${styles.settingsCard}`}>
          <h2 className={styles.cardTitle}>Members</h2>
          
          {isAdmin && (
            <form onSubmit={handleInvite} className={styles.inviteForm}>
              <div className="form-group" style={{ flex: 1 }}>
                <input
                  type="email"
                  className="form-input"
                  placeholder="Enter user email to add..."
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                />
              </div>
              <button type="submit" className="btn btn-primary" disabled={isInviting || !inviteEmail}>
                {isInviting ? <div className="spinner" style={{ width: 16, height: 16 }} /> : 'Add'}
              </button>
            </form>
          )}

          <div className={styles.memberList}>
            {members.map((member) => (
              <div key={member.id} className={styles.memberItem}>
                <div className={styles.memberInfo}>
                  <div className="avatar avatar-sm" style={{ background: getAvatarColor(member.user_id) }}>
                    {getInitials(member.profiles.full_name)}
                  </div>
                  <div className={styles.memberDetails}>
                    <span className={styles.memberName}>
                      {member.profiles.full_name}
                      {member.user_id === user?.id && ' (You)'}
                    </span>
                    <span className={styles.memberEmail}>{member.profiles.email}</span>
                  </div>
                </div>
                
                <div className={styles.memberActions}>
                  {member.role === 'admin' && <span className="badge badge-info">Admin</span>}
                  
                  {(isAdmin || member.user_id === user?.id) && member.user_id !== group.created_by && (
                    <button 
                      className="btn btn-ghost btn-sm" 
                      onClick={() => handleRemoveMember(member.id, member.user_id, member.profiles.full_name)}
                      style={{ color: 'var(--color-negative)' }}
                    >
                      {member.user_id === user?.id ? 'Leave' : 'Remove'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Group Details form could go here, omitting for brevity in MVP */}
        <div className={`glass-card ${styles.settingsCard}`}>
           <h2 className={styles.cardTitle}>Danger Zone</h2>
           {group.created_by === user?.id ? (
             <div className={styles.dangerAction}>
               <div>
                 <p className={styles.dangerTitle}>Delete Group</p>
                 <p className={styles.dangerDesc}>This will permanently delete all expenses and activity logs.</p>
               </div>
               <button 
                 className="btn btn-danger"
                 onClick={async () => {
                   if (confirm('Are you absolutely sure? This cannot be undone.')) {
                     await supabase.from('groups').delete().eq('id', groupId);
                     router.push('/dashboard/groups');
                   }
                 }}
               >
                 Delete
               </button>
             </div>
           ) : (
             <p className={styles.dangerDesc}>Only the group creator can delete this group.</p>
           )}
        </div>
      </div>
    </div>
  );
}
