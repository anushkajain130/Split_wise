'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import styles from './page.module.css';

export default function LandingPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="loading-page">
        <div className="spinner spinner-lg" />
      </div>
    );
  }

  return (
    <div className={styles.landing}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.logo}>
          <span className={styles.logoIcon}>💰</span>
          <span className={styles.logoText}>SplitEase</span>
        </div>
        <nav className={styles.nav}>
          <button className="btn btn-ghost" onClick={() => router.push('/login')}>
            Log In
          </button>
          <button className="btn btn-primary" onClick={() => router.push('/signup')}>
            Get Started
          </button>
        </nav>
      </header>

      {/* Hero Section */}
      <section className={styles.hero}>
        <div className={styles.heroGlow} />
        <div className={styles.heroContent}>
          <h1 className={styles.heroTitle}>
            Split expenses <br />
            <span className={styles.heroGradient}>without the hassle</span>
          </h1>
          <p className={styles.heroSubtitle}>
            Track shared expenses, split bills fairly, and settle debts effortlessly 
            with friends, roommates, and travel companions.
          </p>
          <div className={styles.heroCta}>
            <button className="btn btn-primary btn-lg" onClick={() => router.push('/signup')}>
              Start Splitting Free →
            </button>
          </div>
        </div>

        {/* Feature Cards */}
        <div className={styles.featureGrid}>
          {[
            { emoji: '⚡', title: 'Split Instantly', desc: 'Equal, unequal, percentage, or by shares — any way you want' },
            { emoji: '👥', title: 'Group Expenses', desc: 'Create groups for trips, home, or any shared spending' },
            { emoji: '💬', title: 'Real-time Chat', desc: 'Discuss expenses with your group members instantly' },
            { emoji: '📊', title: 'Smart Balances', desc: 'See who owes what with simplified debt calculations' },
            { emoji: '🤝', title: 'Settle Up', desc: 'Record payments and keep everyone on the same page' },
            { emoji: '📱', title: 'Works Everywhere', desc: 'Beautiful responsive design on any device' },
          ].map((feature, i) => (
            <div key={i} className={`glass-card ${styles.featureCard}`} style={{ animationDelay: `${i * 0.1}s` }}>
              <span className={styles.featureEmoji}>{feature.emoji}</span>
              <h3 className={styles.featureTitle}>{feature.title}</h3>
              <p className={styles.featureDesc}>{feature.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className={styles.footer}>
        <p>Built with ❤️ for the Panda Internship Assignment</p>
      </footer>
    </div>
  );
}
