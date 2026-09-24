// src/hooks/useAuth.js
import { useState, useEffect } from "react";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  sendPasswordResetEmail,
} from "firebase/auth";
import { auth } from "../lib/firebase";
import { api, encryptToken } from "../lib/api";

export function useAuth() {
  const [user, setUser]       = useState(undefined); // undefined = loading
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u ?? null));
    return unsub;
  }, []);

  async function register(email, password, derivToken) {
    setLoading(true); setError(null);
    try {
      const { user: u } = await createUserWithEmailAndPassword(auth, email, password);
      const tokenEncrypted = await encryptToken(derivToken);
      await api.register(tokenEncrypted);
      return u;
    } catch (err) { setError(err.message); throw err; }
    finally { setLoading(false); }
  }

  async function login(email, password, derivToken = null) {
    setLoading(true); setError(null);
    try {
      const { user: u } = await signInWithEmailAndPassword(auth, email, password);
      if (derivToken) {
        await api.updateDerivToken(derivToken);
      }
      return u;
    } catch (err) { setError(err.message); throw err; }
    finally { setLoading(false); }
  }

  async function resetPassword(email) {
    setError(null);
    try { await sendPasswordResetEmail(auth, email); }
    catch (err) { setError(err.message); throw err; }
  }

  async function logout() {
    await signOut(auth);
  }

  return { user, register, login, logout, resetPassword, loading, error };
}
