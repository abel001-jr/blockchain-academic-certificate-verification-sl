import Image from "next/image";
import styles from "./AnimatedBrandMark.module.css";

export default function AnimatedBrandMark({ src = "/fav.png", size = 44, priority = false }) {
  return <span className={styles.mark} style={{ "--brand-size": `${size}px` }} aria-hidden="true">
    <Image src={src} alt="" width={size} height={size} priority={priority} />
    <span className={styles.caption}>Trust</span>
  </span>;
}
