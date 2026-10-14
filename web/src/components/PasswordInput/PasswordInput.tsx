import { useState } from 'react';
import type { InputHTMLAttributes } from 'react';
import { Icon } from '../Icon';
import styles from './PasswordInput.module.css';

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

/** Göz ikonuyla şifreyi gösterip gizleyebilen şifre alanı. */
export function PasswordInput({ className, disabled, ...rest }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className={styles.wrapper}>
      <input
        {...rest}
        type={visible ? 'text' : 'password'}
        disabled={disabled}
        className={[styles.input, className].filter(Boolean).join(' ')}
      />
      <button
        type="button"
        className={styles.toggle}
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Şifreyi gizle' : 'Şifreyi göster'}
        aria-pressed={visible}
        disabled={disabled}
      >
        <Icon name={visible ? 'visibility_off' : 'visibility'} size="md" />
      </button>
    </div>
  );
}
