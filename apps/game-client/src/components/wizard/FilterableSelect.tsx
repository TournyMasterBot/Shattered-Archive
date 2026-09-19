// apps/game-client/src/components/wizard/FilterableSelect.tsx

/**
 * A text-input-driven picker that behaves like a `<select>` for the caller (one `onPick(value)`
 * callback on commit) but narrows a long ability list live-as-you-type instead of requiring a
 * scroll through a native dropdown. Options are rendered in the order given — callers
 * alphabetize/group before passing them in; consecutive options sharing a `group` get one
 * header, mirroring the `<optgroup>` layout this replaces.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';

import styles from '../../styles/AutoLevelingWizard.module.scss';

export interface FilterableSelectOption {
  value: string;
  label: string;
  group?: string;
}

export interface FilterableSelectProps {
  options: FilterableSelectOption[];
  onPick: (value: string) => void;
  placeholder: string;
  ariaLabel: string;
  className?: string;
}

export const FilterableSelect: React.FC<FilterableSelectProps> = ({
  options,
  onPick,
  placeholder,
  ariaLabel,
  className,
}) => {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIx, setActiveIx] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  useEffect(() => setActiveIx(0), [query, open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const commit = (opt: FilterableSelectOption) => {
    onPick(opt.value);
    setQuery('');
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActiveIx((i) => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIx((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (open && filtered[activeIx]) commit(filtered[activeIx]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  let lastGroup: string | undefined;

  return (
    <div className={`${styles.filterableSelect} ${className ?? ''}`} ref={rootRef}>
      <input
        type="text"
        className={styles.filterableSelectInput}
        aria-label={ariaLabel}
        placeholder={placeholder}
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
      />
      {open && filtered.length > 0 && (
        <ul className={styles.filterableSelectList} role="listbox">
          {filtered.map((o, ix) => {
            const showHeader = !!o.group && o.group !== lastGroup;
            lastGroup = o.group;
            return (
              <React.Fragment key={o.value}>
                {showHeader && (
                  <li className={styles.filterableSelectGroup} aria-hidden="true">
                    {o.group}
                  </li>
                )}
                <li
                  role="option"
                  aria-selected={ix === activeIx}
                  className={`${styles.filterableSelectOption} ${
                    ix === activeIx ? styles.filterableSelectOptionActive : ''
                  }`}
                  onMouseDown={(e) => {
                    e.preventDefault(); // keep focus on the input, don't blur-close before the click lands
                    commit(o);
                  }}
                  onMouseEnter={() => setActiveIx(ix)}
                >
                  {o.label}
                </li>
              </React.Fragment>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default FilterableSelect;
