import { useState } from 'react';
import type { IFlight } from '../types/Flight.types';

export interface ContextMenuState {
  x: number;
  y: number;
  visible: boolean;
  aircraft: IFlight | null;
}

export const useContextMenu = () => {
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    x: 0,
    y: 0,
    visible: false,
    aircraft: null
  });

  const openMenu = (x: number, y: number, aircraft: IFlight) => {
    setContextMenu({ x, y, visible: true, aircraft });
  };

  const closeMenu = () => {
    setContextMenu(prev => ({ ...prev, visible: false }));
  };

  const toggleMenu = (x: number, y: number, aircraft: IFlight | null) => {
    if (aircraft) {
      openMenu(x, y, aircraft);
    } else {
      closeMenu();
    }
  };

  return {
    contextMenu,
    openMenu,
    closeMenu,
    toggleMenu
  };
};
