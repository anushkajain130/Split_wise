'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { GROUP_CATEGORIES, AVATAR_COLORS } from '@/types';
import styles from './newGroup.module.css';

export default function NewGroupPage() {
  const { user } = useAuth();
  const router = useRouter();
  const supabase = createClient();
  const { showToast } = useToast();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('other');
  const [coverColor, setCoverColor] = useState(AVATAR_COLORS[0]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!name.trim()) {
      showToast('Group name is required', 'error');
      return;
    }

    setIsSubmitting(true);

    try {
      // 1. Create the group
      const { data: groupData, error: groupError } = await supabase
        .from('groups')
        .insert({
          name: name.trim(),
          description: description.trim(),
          category,
          cover_color: coverColor,
          created_by: user.id
        })
        .select()
        .single();

      if (groupError) throw groupError;

      // 2. Add creator as admin member
      const { error: memberError } = await supabase
        .from('group_members')
        .insert({
          group_id: groupData.id,
          user_id: user.id,
          role: 'admin'
        });

      if (memberError) throw memberError;

      // 3. Log activity
      await supabase.from('activity_log').insert({
        user_id: user.id,
        group_id: groupData.id,
        action: 'created_group',
        description: `created the group "${name}"`
      });

      showToast('Group created successfully!', 'success');
      router.push(`/dashboard/groups/${groupData.id}`);
    } catch (error: any) {
      console.error('Error creating group:', error);
      showToast(error.message || 'Failed to create group', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={styles.page}>
      <button className="btn btn-ghost btn-sm" onClick={() => router.back()} style={{ marginBottom: 'var(--space-4)' }}>
        ← Back
      </button>

      <div className={`glass-card ${styles.formCard}`}>
        <div className={styles.formHeader}>
          <h1 className={styles.formTitle}>Create a New Group</h1>
          <p className={styles.formSubtitle}>Set up a space to share expenses</p>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className="form-group">
            <label htmlFor="name" className="form-label">Group Name</label>
            <input
              id="name"
              type="text"
              className="form-input"
              placeholder="e.g. Bali Trip, Apartment 4B"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="description" className="form-label">Description (Optional)</label>
            <textarea
              id="description"
              className="form-input"
              placeholder="What is this group for?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          <div className={styles.formRow}>
            <div className="form-group" style={{ flex: 1 }}>
              <label htmlFor="category" className="form-label">Category</label>
              <select
                id="category"
                className="form-input form-select"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {GROUP_CATEGORIES.map((cat) => (
                  <option key={cat.value} value={cat.value}>
                    {cat.emoji} {cat.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Cover Color</label>
              <div className={styles.colorPicker}>
                {AVATAR_COLORS.slice(0, 5).map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`${styles.colorBtn} ${coverColor === color ? styles.colorBtnActive : ''}`}
                    style={{ backgroundColor: color }}
                    onClick={() => setCoverColor(color)}
                    aria-label={`Select color ${color}`}
                  />
                ))}
              </div>
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
              disabled={isSubmitting || !name.trim()}
            >
              {isSubmitting ? <div className="spinner" /> : 'Create Group'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
