"use client";

import { GraduationCap, ShieldCheck, FileCheck2, CalendarDays } from "lucide-react";
import { useAuth } from "@/lib/useAuth";
import styles from "./WelcomeCard.module.css";

const messages = {
  super_admin: "Oversee institutions, manage access and keep your credential network running smoothly.",
  institutional_admin: "Your institution at a glance. Manage your team, review activity and follow credential progress.",
  registrar: "Prepare student credentials, review documents and keep each award moving through approval.",
  vc: "Review the credentials awaiting your approval and follow their progress to issuance.",
  chancellor: "Review pending awards and complete your part in the credential approval process.",
  student: "Your academic achievements, together in one place. View your credentials and verification details.",
};

export default function WelcomeCard({ children, compact = false }) {
  const { user, role } = useAuth();
  const name = user?.first_name?.trim();
  const date = new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric" }).format(new Date());

  return (
    <section className={`${styles.card} ${compact ? styles.compact : ""}`} aria-label="Dashboard welcome">
      <div className={styles.heading}>
      <div className={styles.content}>
        <span className={styles.eyebrow}>YOUR CREDENTIAL WORKSPACE</span>
        <h1>Welcome back{name ? `, ${name}` : ""}</h1>
        <p>{messages[role] ?? "Explore your workspace and stay up to date with credential activity."}</p>
        <div className={styles.date}><CalendarDays size={18} aria-hidden="true" /><span suppressHydrationWarning>{date}</span></div>
      </div>
      <div className={styles.art} aria-hidden="true">
        <div className={styles.orbit} />
        <div className={styles.document}>
          <GraduationCap size={42} strokeWidth={1.4} />
          <div className={styles.line} /><div className={styles.shortLine} />
          <div className={styles.seal}><ShieldCheck size={30} strokeWidth={1.6} /></div>
        </div>
        <div className={styles.badge}><FileCheck2 size={20} /> Academic credentials</div>
      </div>
      </div>
      {children && <div className={styles.overview}>{children}</div>}
    </section>
  );
}
