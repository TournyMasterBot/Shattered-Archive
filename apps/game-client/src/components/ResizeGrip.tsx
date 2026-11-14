import React from 'react';
import styles from '../styles/ResizeGrip.module.scss';

/**
 * The corner grip of a resizable modal (see `useResizableModal`): put it last inside the modal's root and spread the hook's `gripProps`.
 * It is the same grip the Copilot window has.
 */
export const ResizeGrip: React.FC<{ onPointerDown: (event: React.PointerEvent<HTMLElement>) => void }> = ({ onPointerDown }) => (
  <div className={styles.grip} onPointerDown={onPointerDown} aria-hidden="true" title="Drag to resize" />
);

export default ResizeGrip;
