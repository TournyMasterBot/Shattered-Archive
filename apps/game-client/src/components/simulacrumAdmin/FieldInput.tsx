// apps/game-client/src/components/simulacrumAdmin/FieldInput.tsx
import React from 'react';
import styles from '../../styles/SimulacrumAdminWindow.module.scss';
import { choicesOf } from '../../features/simulacrumAdmin/commandBuilder';
import type { FieldSpec } from '../../features/simulacrumAdmin/commandSyntaxTypes';

interface FieldInputProps {
  id: string;
  field: FieldSpec;
  value: string;
  /** Shown under the field; the field is marked invalid while it is set. */
  error?: string;
  onChange: (value: string) => void;
}

/** One argument of a command: a select for a choice, a text box for everything else (the builder checks the value, not the input). */
const FieldInput: React.FC<FieldInputProps> = ({ id, field, value, error, onChange }) => (
  <div className={styles.fieldRow}>
    <label htmlFor={id} className={styles.fieldLabel}>
      {field.label}
      {field.optional ? ' (optional)' : ''}
    </label>
    {field.type === 'choice' ? (
      <select id={id} className={styles.select} value={value} aria-invalid={error !== undefined} onChange={(e) => onChange(e.target.value)}>
        <option value="">{field.optional ? '(none)' : 'Choose…'}</option>
        {choicesOf(field).map((choice) => (
          <option key={choice} value={choice}>
            {choice}
          </option>
        ))}
      </select>
    ) : (
      <input
        id={id}
        type="text"
        className={styles.input}
        value={value}
        placeholder={field.placeholder}
        aria-invalid={error !== undefined}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
      />
    )}
    {error && (
      <span className={styles.fieldError} role="alert">
        {error}
      </span>
    )}
  </div>
);

export default FieldInput;
