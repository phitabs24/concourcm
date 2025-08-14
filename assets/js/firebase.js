// Firebase client setup for Prepa Concour
// IMPORTANT: Replace firebaseConfig below with your project's config from Firebase Console
// Auth providers enabled: Google (start simple). Add Email/Password later if needed.

// Load modular Firebase SDK via CDN ESM imports
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getFirestore,
  addDoc,
  collection,
  serverTimestamp,
  query,
  orderBy,
  limit,
  getDocs,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// You can safely commit these values; Firebase enforces security via Auth + Rules.
const firebaseConfig = {
  apiKey: "AIzaSyCg-evPVifD3P1rzggZhOaektLwdGF6rqo",
  authDomain: "concourcm.firebaseapp.com",
  projectId: "concourcm",
  storageBucket: "concourcm.firebasestorage.app",
  messagingSenderId: "450846829422",
  appId: "1:450846829422:web:b94cb04ea9695607c22f7f",
  measurementId: "G-C5MCGFBDVM"
};

// Initialize
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Helper: save an attempt for current user (no-op if not signed in)
async function saveAttempt(subject, results) {
  const user = auth.currentUser;
  if (!user) return { ok: false, reason: 'not-signed-in' };
  const payload = {
    subject,
    total: results?.total ?? 0,
    correct: results?.correct ?? 0,
    details: results?.details ?? [],
    finishedAt: serverTimestamp(),
    // Optional: client time
    clientFinishedAt: new Date().toISOString(),
  };
  await addDoc(collection(db, 'users', user.uid, 'attempts'), payload);
  return { ok: true };
}

// Helper: fetch recent attempts for current user
async function getRecentAttempts(maxCount = 20) {
  const user = auth.currentUser;
  if (!user) return [];
  const q = query(
    collection(db, 'users', user.uid, 'attempts'),
    orderBy('finishedAt', 'desc'),
    limit(maxCount)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// Expose to window for easy use in static pages
window.fb = {
  app,
  auth,
  db,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged,
  addDoc,
  collection,
  serverTimestamp,
  saveAttempt,
  getRecentAttempts,
};

// Notify pages that Firebase is ready
window.dispatchEvent(new CustomEvent('firebase-ready'));
