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
import { api } from "../lib/api";

export function useAuth() {
  const [user, setUser]       = useState(undefined); // undefined = loading
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u ?? null));
    return unsub;
  }, []);

  async function register(email, password) {
    setLoading(true); setError(null);
    try {
      const { user: u } = await createUserWithEmailAndPassword(auth, email, password);
      await api.register();
      return u;
    } catch (err) { setError(frError(err)); throw err; }
    finally { setLoading(false); }
  }

  async function login(email, password) {
    setLoading(true); setError(null);
    try {
      const { user: u } = await signInWithEmailAndPassword(auth, email, password);
      return u;
    } catch (err) { setError(frError(err)); throw err; }
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

const FR_ERRORS = {
  "auth/email-already-in-use": "Un compte existe déjà avec cet email. Utilisez l'onglet Connexion.",
  "auth/invalid-credential":   "Email ou mot de passe incorrect.",
  "auth/wrong-password":       "Email ou mot de passe incorrect.",
  "auth/user-not-found":       "Aucun compte avec cet email.",
  "auth/weak-password":        "Mot de passe trop faible (6 caractères minimum).",
  "auth/invalid-email":        "Adresse email invalide.",
  "auth/too-many-requests":    "Trop de tentatives. Réessayez dans quelques minutes.",
};
function frError(err) {
  return FR_ERRORS[err.code] || err.message;
}
