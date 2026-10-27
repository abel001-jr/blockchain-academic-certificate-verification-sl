import DashboardTooltip from "./DashboardTooltip";
import styles from "./CompletionGauges.module.css";

function formatBytes(bytes) {
  if (bytes < 1000) return `${bytes} B`;
  const unit = Math.min(Math.floor(Math.log10(bytes) / 3), 3);
  return `${Number((bytes / 1000 ** unit).toFixed(2))} ${["B", "KB", "MB", "GB"][unit]}`;
}

export default function CompletionGauges({ data }) {
  const cards = [
    { key: "claims", label: "Credential claims", detail: "Claimed credentials / all issued credentials", color: "#780110" },
    { key: "pinata", label: "Pinata storage", detail: "Last synchronized Pinata usage / configured plan quota. Shared across dashboards.", color: "#527B91" },
    { key: "wallets", label: "Wallet linking", detail: "Active admin and signer accounts with a linked wallet / all active admin and signer accounts", color: "#08283F" },
  ];
  return <section aria-label="Completion and capacity"><h2 className={styles.title}>Completion &amp; capacity</h2><div className={styles.grid}>{cards.map(card => {
    const metric = data?.[card.key];
    const available = metric?.count != null && metric?.total > 0;
    const percent = available ? Number((metric.count / metric.total * 100).toFixed(card.key === "pinata" ? 2 : 0)) : null;
    const note = available ? card.key === "pinata" ? `${formatBytes(metric.count)} of ${formatBytes(metric.total)}` : card.key === "claims" ? `${metric.count} claimed of ${metric.total} issued` : `${metric.count} of ${metric.total}` : card.key === "pinata" ? "Temporarily unavailable" : card.key === "claims" ? "No issued credentials yet" : "No eligible records yet";
    return <DashboardTooltip key={card.key} title={card.label} detail={card.detail}><article tabIndex={0} className={styles.card} style={{"--gauge-color": card.color}}><h3>{card.label}</h3><svg viewBox="0 0 140 105" aria-label={percent === null ? "Percentage unavailable" : `${percent}%`}><path d="M25 82 A55 55 0 1 1 115 82" fill="none" stroke="#E4E8EB" strokeWidth="9" strokeLinecap="round" pathLength="100" />{available && <path d="M25 82 A55 55 0 1 1 115 82" fill="none" stroke={card.color} strokeWidth="9" strokeLinecap="round" pathLength="100" strokeDasharray={`${Math.min(100, percent)} 100`} />}<text x="70" y="65" textAnchor="middle">{percent === null ? "—" : `${percent}%`}</text></svg><strong>{note}</strong><p>{card.key === "pinata" && metric?.unavailable ? "Temporarily unavailable. Showing the last saved value when available." : card.detail}</p></article></DashboardTooltip>;
  })}</div></section>;
}
