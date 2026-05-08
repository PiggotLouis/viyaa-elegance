// ─────────────────────────────────────────────────────────
//  STEP 1: Paste your Firebase config here
//  (Get it from Firebase Console → Project Settings → Your apps → Web)
// ─────────────────────────────────────────────────────────
const firebaseConfig = {
apiKey: "AIzaSyBDt-H25d2I1fu9S9AyhpA97cBIBFhtJtk",
authDomain: "viyaa-elegance.firebaseapp.com",
databaseURL: "https://viyaa-elegance-default-rtdb.asia-southeast1.firebasedat...",
projectId: "viyaa-elegance",
storageBucket: "viyaa-elegance.firebasestorage.app",
messagingSenderId: "14046391722",
appId: "1:14046391722:web:0f0245772d19bbb8fc4fd3",
measurementId: "G-V8NVNHZ194"
};

import { initializeApp }                    from "firebase/app";
import { getDatabase, ref, set, get, onValue } from "firebase/database";

const app      = initializeApp(firebaseConfig);
const database = getDatabase(app);

// ─────────────────────────────────────────────────────────
//  db — drop-in replacement for localStorage used in App.jsx
//  Data is stored as JSON strings in Firebase Realtime DB.
// ─────────────────────────────────────────────────────────
export const db = {
  get: async (k, fallback) => {
    try {
      const snap = await get(ref(database, k));
      if (!snap.exists()) return fallback;
      const val = snap.val();
      return typeof val === "string" ? JSON.parse(val) : fallback;
    } catch (e) {
      console.warn("Firebase get error:", e);
      return fallback;
    }
  },
  set: async (k, v) => {
    try {
      await set(ref(database, k), JSON.stringify(v));
    } catch (e) {
      console.warn("Firebase set error:", e);
    }
  },
};

// ─────────────────────────────────────────────────────────
//  listen — real-time listener (calls callback when data changes)
// ─────────────────────────────────────────────────────────
export const listen = (k, fallback, callback) => {
  const unsubscribe = onValue(ref(database, k), (snap) => {
    try {
      if (!snap.exists()) { callback(fallback); return; }
      const val = snap.val();
      callback(typeof val === "string" ? JSON.parse(val) : fallback);
    } catch {
      callback(fallback);
    }
  });
  return unsubscribe; // call this to stop listening
};
