import { createContext, useContext, useState, useCallback } from 'react';

const MobileNavContext = createContext(null);

export function MobileNavProvider({ children }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const closeMobileNav = useCallback(() => setMobileNavOpen(false), []);
  const toggleMobileNav = useCallback(() => setMobileNavOpen((v) => !v), []);

  return (
    <MobileNavContext.Provider value={{ mobileNavOpen, setMobileNavOpen, closeMobileNav, toggleMobileNav }}>
      {children}
    </MobileNavContext.Provider>
  );
}

export function useMobileNav() {
  const ctx = useContext(MobileNavContext);
  if (!ctx) {
    throw new Error('useMobileNav must be used within MobileNavProvider');
  }
  return ctx;
}
