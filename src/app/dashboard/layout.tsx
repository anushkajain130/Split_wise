'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { getInitials, getAvatarColor } from '@/lib/utils';
import styles from './dashboard.module.css';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', emoji: '📊', exact: true },
  { href: '/dashboard/groups', label: 'Groups', emoji: '👥', exact: false },
  { href: '/dashboard/activity', label: 'Activity', emoji: '📋', exact: false },
  { href: '/dashboard/profile', label: 'Profile', emoji: '⚙️', exact: false },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, profile, loading, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  if (loading || !user) {
    return (
      <div className="loading-page">
        <div className="spinner spinner-lg" />
        <p style={{ color: 'var(--text-tertiary)' }}>Loading...</p>
      </div>
    );
  }

  const isActive = (href: string, exact: boolean) => {
    if (exact) return pathname === href;
    return pathname.startsWith(href);
  };

  const displayName = profile?.full_name || user.email?.split('@')[0] || 'User';

  return (
    <div className={styles.dashboardLayout}>
      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div className={styles.overlay} onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : ''}`}>
        <div className={styles.sidebarHeader}>
          <Link href="/dashboard" className={styles.sidebarLogo}>
            <span>💰</span>
            <span className={styles.sidebarLogoText}>SplitEase</span>
          </Link>
        </div>

        <nav className={styles.sidebarNav}>
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`${styles.navItem} ${isActive(item.href, item.exact) ? styles.navItemActive : ''}`}
            >
              <span className={styles.navEmoji}>{item.emoji}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className={styles.sidebarFooter}>
          <div className={styles.userInfo}>
            <div
              className="avatar avatar-sm"
              style={{ background: getAvatarColor(user.id) }}
            >
              {getInitials(displayName)}
            </div>
            <div className={styles.userDetails}>
              <span className={styles.userName}>{displayName}</span>
              <span className={styles.userEmail}>{user.email}</span>
            </div>
          </div>
          <button className={`btn btn-ghost btn-sm ${styles.signOutBtn}`} onClick={signOut}>
            Logout
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className={styles.mainContent}>
        {/* Mobile Header */}
        <header className={styles.mobileHeader}>
          <button className={styles.menuButton} onClick={() => setSidebarOpen(true)}>
            <span />
            <span />
            <span />
          </button>
          <span className={styles.mobileTitle}>SplitEase</span>
          <div
            className="avatar avatar-sm"
            style={{ background: getAvatarColor(user.id) }}
            onClick={() => router.push('/dashboard/profile')}
          >
            {getInitials(displayName)}
          </div>
        </header>

        <div className={styles.contentArea}>
          {children}
        </div>

        {/* Mobile Bottom Nav */}
        <nav className={styles.bottomNav}>
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`${styles.bottomNavItem} ${isActive(item.href, item.exact) ? styles.bottomNavActive : ''}`}
            >
              <span className={styles.bottomNavEmoji}>{item.emoji}</span>
              <span className={styles.bottomNavLabel}>{item.label}</span>
            </Link>
          ))}
        </nav>
      </main>
    </div>
  );
}
