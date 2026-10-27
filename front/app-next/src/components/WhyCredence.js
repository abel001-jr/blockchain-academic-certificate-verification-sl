import Link from "next/link";
import { ArrowUpRight, BadgeCheck, Database, Globe2, LockKeyhole, ShieldCheck, Wallet } from "lucide-react";
import styles from "./WhyCredence.module.css";

const benefits = [
  { icon: Wallet, title: "Wallet-based access", body: "Institutional staff connect a linked wallet to authenticate and sign authorised blockchain transactions.", href: "/login", cta: "Connect your wallet" },
  { icon: Database, title: "IPFS document storage", body: "Credential documents are stored on IPFS through Pinata, separate from the blockchain record.", href: "#lifecycle", cta: "Explore document storage" },
  { icon: ShieldCheck, title: "Blockchain integrity", body: "An on-chain digital fingerprint provides a reference for detecting changes to an issued credential.", href: "#lifecycle", cta: "See how anchoring works" },
  { icon: BadgeCheck, title: "Independent verification", body: "Check the credential, issuing institution and blockchain record together without a wallet or account.", href: "#verify", cta: "Verify a credential" },
  { icon: Globe2, title: "Shareable credentials", body: "Graduates share credential links or QR codes so employers can check the issued record.", href: "#stakeholders", cta: "Find your role" },
  { icon: LockKeyhole, title: "Institutional accountability", body: "Role-based approvals and linked wallets identify who is authorised to issue and approve credentials.", href: "#stakeholders", cta: "Meet the roles" },
];

export default function WhyCredence() {
  return (
    <section className={`scroll-anchor ${styles.section}`} id="why">
      <div className={`landing-wrap ${styles.layout}`}>
        <div className={styles.intro}>
          <p className="cred-section-kicker">Why Web3</p>
          <h2 className="cred-section-title mt-3">Trusted by universities.<br />Verified by anyone.</h2>
          <p className={styles.lead}>Wallets connect authorised institutional staff, IPFS stores credential documents, and blockchain anchors their digital fingerprints. Together, they make issued credentials shareable and independently checkable.</p>
          <div className={styles.proof}>
            <span className={styles.proofLabel}>Wallets, IPFS and blockchain. One credential.</span>
            <ol className={styles.steps}>
              <li><span>01</span><strong>Authorised</strong><small>Linked wallet</small></li>
              <li><span>02</span><strong>Stored</strong><small>IPFS via Pinata</small></li>
              <li><span>03</span><strong>Anchored</strong><small>Blockchain record</small></li>
            </ol>
          </div>
          <a href="#lifecycle" className="cred-btn cred-btn-primary mt-7">Learn more <ArrowUpRight size={16} aria-hidden="true" /></a>
        </div>
        <div className={styles.benefits}>
          {benefits.map(({ icon: Icon, title, body, href, cta }) => (
            <Link key={title} href={href} className={styles.benefit}>
              <span className={styles.icon}><Icon size={21} strokeWidth={1.6} aria-hidden="true" /></span>
              <h3>{title}</h3>
              <p>{body}</p>
              <span className={styles.cta}>{cta}<ArrowUpRight size={15} aria-hidden="true" /></span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
