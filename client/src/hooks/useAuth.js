// src/hooks/useAuth.js
import { useState, useEffect } from "react";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
} from "firebase/auth";
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import { DEFAULT_EA_PARAMS } from "../lib/defaultParams";

const SERVER_URL = import.meta.env.VITE_SERVER_URL;

async function encryptToken(token, uid) {
  const res = await fetch(`${SERVER_URL}/encrypt-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, uid }),
  });
  if (!res.ok) throw new Error("Échec chiffrement token Deriv");
  const { encrypted } = await res.json();
  return encrypted;
}

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
      const tokenEncrypted = await encryptToken(derivToken, u.uid);
      await setDoc(doc(db, "users", u.uid), {
        email,
        token_encrypted: tokenEncrypted,
        ea_active: false,
        params: DEFAULT_EA_PARAMS,
        created_at: serverTimestamp(),
      });
      return u;
    } catch (err) { setError(err.message); throw err; }
    finally { setLoading(false); }
  }

  async function login(email, password, derivToken = null) {
    setLoading(true); setError(null);
    try {
      const { user: u } = await signInWithEmailAndPassword(auth, email, password);
      if (derivToken) {
        const tokenEncrypted = await encryptToken(derivToken, u.uid);
        await setDoc(doc(db, "users", u.uid), { token_encrypted: tokenEncrypted }, { merge: true });
      }
      return u;
    } catch (err) { setError(err.message); throw err; }
    finally { setLoading(false); }
  }

  async function logout() {
    await signOut(auth);
  }

  return { user, register, login, logout, loading, error };
}
