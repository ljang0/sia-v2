import { createContext, useContext } from 'react';

export type Appearance = 'calm' | 'expressive';
export const AppearanceContext = createContext<Appearance>('expressive');
export const useAppearance = () => useContext(AppearanceContext);
