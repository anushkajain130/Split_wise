'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { createClient } from '@/lib/supabase/client';
import { getAvatarColor, getInitials } from '@/lib/utils';
import styles from './profile.module.css';

export default function ProfilePage() {
  const { user, profile, refreshProfile } = useAuth();
  const { showToast } = useToast();
  const supabase = createClient();

  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [currency, setCurrency] = useState(profile?.currency || 'INR');
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: fullName,
          currency: currency,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id);

      if (error) throw error;

      await refreshProfile();
      showToast('Profile updated successfully', 'success');
    } catch (error: any) {
      showToast(error.message || 'Failed to update profile', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  if (!user || !profile) return <div className="loading-page"><div className="spinner" /></div>;

  return (
    <div className={styles.page}>
      <h1 className={styles.pageTitle}>Profile Settings</h1>

      <div className={`glass-card ${styles.profileCard}`}>
        <div className={styles.avatarSection}>
          <div 
            className="avatar avatar-xl" 
            style={{ background: getAvatarColor(user.id), fontSize: '2.5rem' }}
          >
            {getInitials(profile.full_name)}
          </div>
          <div className={styles.userInfo}>
            <h2 className={styles.userName}>{profile.full_name}</h2>
            <p className={styles.userEmail}>{user.email}</p>
          </div>
        </div>

        <form onSubmit={handleSave} className={styles.form}>
          <div className="form-group">
            <label htmlFor="fullName" className="form-label">Full Name</label>
            <input
              id="fullName"
              type="text"
              className="form-input"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="email" className="form-label">Email</label>
            <input
              id="email"
              type="email"
              className="form-input"
              value={user.email || ''}
              disabled
              style={{ opacity: 0.7, cursor: 'not-allowed' }}
            />
            <span className="form-error" style={{ color: 'var(--text-muted)' }}>Email cannot be changed</span>
          </div>

          <div className="form-group">
            <label htmlFor="currency" className="form-label">Default Currency</label>
            <select
              id="currency"
              className="form-input form-select"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            >
              <option value="INR">₹ Indian Rupee (INR)</option>
              <option value="USD">$ US Dollar (USD)</option>
              <option value="EUR">€ Euro (EUR)</option>
              <option value="GBP">£ British Pound (GBP)</option>
            </select>
          </div>

          <div className={styles.formActions}>
            <button 
              type="submit" 
              className="btn btn-primary"
              disabled={isSaving || (fullName === profile.full_name && currency === profile.currency)}
            >
              {isSaving ? <div className="spinner" /> : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
