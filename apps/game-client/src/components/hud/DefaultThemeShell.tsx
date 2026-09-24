import React from 'react';
import LayoutShell from '../LayoutShell';
import { BottomPane } from '../BottomPane';
import { useLayoutSizing } from '../../hooks/useMainContainer';
import type { HudShellBaseProps } from './LayoutShellProps';

/**
 * Adapts today's classic LayoutShell (which historically received its sizing
 * state and BottomPane as props from MainContainer) behind the same
 * HudShellBaseProps contract every other theme's shell uses — sourcing
 * sizing internally via its own hook call, the way CompactLayoutShell
 * already does. This is what makes 'default' a real, uniform entry in the
 * theme registry instead of a special case.
 */
export const DefaultThemeShell: React.FC<HudShellBaseProps> = (props) => {
  const { layoutVars, handleVerticalResizeMouseDown, handleHorizontalResizeMouseDown } = useLayoutSizing();

  return (
    <LayoutShell
      layoutVars={layoutVars}
      onVerticalResizeMouseDown={handleVerticalResizeMouseDown}
      onHorizontalResizeMouseDown={handleHorizontalResizeMouseDown}
      BottomPaneComponent={BottomPane}
      {...props}
    />
  );
};

export default DefaultThemeShell;
