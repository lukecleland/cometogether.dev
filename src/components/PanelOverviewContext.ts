import { createContext } from 'react';
import type { OverviewFrame } from '../utils/panelOverview';
export const PanelOverviewContext = createContext<{ frames: Record<string, OverviewFrame>; onSelect: (id: string) => void } | null>(null);
