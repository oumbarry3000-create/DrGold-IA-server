// src/hooks/useAuth.js
import { useState, useEffect } from "react";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  getAdditionalUserInfo,
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

  // Google : fenetre popup, ou redirection si le navigateur bloque la popup
  // (frequent sur mobile). Renvoie { user, isNewUser } ou null (redirection).
  async function loginWithGoogle() {
    setLoading(true); setError(null);
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    try {
      const result = await signInWithPopup(auth, provider);
      return { user: result.user, isNewUser: !!getAdditionalUserInfo(result)?.isNewUser };
    } catch (err) {
      if (err.code === "auth/popup-blocked" || err.code === "auth/operation-not-supported-in-this-environment") {
        await signInWithRedirect(auth, provider);
        return null;
      }
      if (err.code !== "auth/popup-closed-by-user" && err.code !== "auth/cancelled-popup-request") setError(frError(err));
      throw err;
    } finally {
      setLoading(false);
    }
  }

  // Retour d'une connexion Google par redirection
  async function googleRedirectResult() {
    try {
      const result = await getRedirectResult(auth);
      return result ? { user: result.user, isNewUser: !!getAdditionalUserInfo(result)?.isNewUser } : null;
    } catch (err) {
      setError(frError(err));
      return null;
    }
  }

  async function resetPassword(email) {
    setError(null);
    try { await sendPasswordResetEmail(auth, email); }
    catch (err) { setError(frError(err)); throw err; }
  }

  async function logout() {
    await signOut(auth);
  }

  return { user, register, login, loginWithGoogle, googleRedirectResult, logout, resetPassword, loading, error, setError };
}

const FR_ERRORS = {
  "auth/email-already-in-use": "Un compte existe déjà avec cet email. Utilisez l'onglet Connexion.",
  "auth/invalid-credential":   "Email ou mot de passe incorrect.",
  "auth/wrong-password":       "Email ou mot de passe incorrect.",
  "auth/user-not-found":       "Aucun compte avec cet email.",
  "auth/weak-password":        "Mot de passe trop faible (6 caractères minimum).",
  "auth/invalid-email":        "Adresse email invalide.",
  "auth/too-many-requests":    "Trop de tentatives. Réessayez dans quelques minutes.",
  "auth/missing-email":        "Entrez votre adresse email.",
  "auth/operation-not-allowed": "Ce mode de connexion n'est pas encore activé. Utilisez l'email et le mot de passe.",
  "auth/account-exists-with-different-credential": "Un compte existe déjà avec cet email : connectez-vous avec votre mot de passe.",
  "auth/unauthorized-domain":  "Connexion Google non autorisée sur ce site pour le moment.",
  "auth/network-request-failed": "Problème de connexion internet. Réessayez.",
};
export function frError(err) {
  return FR_ERRORS[err.code] || err.message;
}
