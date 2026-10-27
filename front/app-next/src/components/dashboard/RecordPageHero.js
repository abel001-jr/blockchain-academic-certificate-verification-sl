import styles from "./RecordPageHero.module.css";

export default function RecordPageHero({ eyebrow, title, description, count, countLabel, children }) {
  return <header className={styles.hero}>
    <div className={styles.copy}><span className={styles.eyebrow}>{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>
    <div className={styles.side}><div className={styles.count}><strong>{count}</strong><span>{countLabel}</span></div>{children}</div>
  </header>;
}
