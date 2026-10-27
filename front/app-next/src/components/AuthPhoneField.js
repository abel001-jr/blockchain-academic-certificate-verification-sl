"use client";
import AuthField from "./AuthField";
import styles from "./AuthPhoneField.module.css";

export default function AuthPhoneField({ callingCode, onCodeChange, number, onNumberChange }) {
  return <div>
    <div className={styles.row}>
      <div className={styles.code}><span className={styles.plus} aria-hidden="true">+</span><AuthField label="Calling code" example="232" value={callingCode} onChange={e => onCodeChange(e.target.value.replace(/[^0-9]/g, ""))} type="tel" inputMode="numeric" pattern="[1-9][0-9]{0,2}" maxLength={3} required={Boolean(number)} /></div>
      <AuthField label="Contact number" example="e.g. 76000000" value={number} onChange={e => onNumberChange(e.target.value.replace(/[^0-9]/g, "").replace(/^0+/, ""))} type="tel" inputMode="numeric" pattern={`[1-9][0-9]{7,${14 - callingCode.length}}`} minLength={8} maxLength={15 - callingCode.length} autoComplete="tel-national" />
    </div>
    <p className={styles.hint}>Start with a non-zero digit; the calling code is already included. At least 8 phone digits, with a maximum of 15 digits including the calling code.</p>
  </div>;
}
