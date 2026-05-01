import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setTokenState] = useState(() => localStorage.getItem('mw_admin_token') || '');
  const [email, setEmail] = useState(() => localStorage.getItem('mw_admin_email') || '');

  const setToken = useCallback((t, em) => {
    if (t) localStorage.setItem('mw_admin_token', t);
    else localStorage.removeItem('mw_admin_token');
    if (em) localStorage.setItem('mw_admin_email', em);
    else localStorage.removeItem('mw_admin_email');
    setTokenState(t || '');
    setEmail(em || '');
  }, []);

  const logout = useCallback(() => {
    setToken('', '');
  }, [setToken]);

  const value = useMemo(
    () => ({
      token,
      email,
      isAuthed: Boolean(token),
      setToken,
      logout,
    }),
    [token, email, setToken, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside provider');
  return ctx;
}
