// Relie le site à Firebase (connexion Google / e-mail et base Firestore).
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import {
  getAuth, onAuthStateChanged, signInWithPopup, signInWithRedirect, getRedirectResult, GoogleAuthProvider,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, signOut
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import {
  getFirestore, collection, doc, setDoc, getDoc, deleteDoc, onSnapshot
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app-check.js';

// Modèles essayés dans l'ordre : le premier disponible sur l'offre gratuite est utilisé.
// Clé publique reCAPTCHA (Fraud Defense, pour App Check) : elle prouve à Firebase que les demandes viennent de ce site.
const RECAPTCHA_SITE_KEY = '6Le_ci8uAAAAAFdV0RnUeK4GKLPO5vpc5hGXR8Fz';
const AI_MODELS = ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-2.0-flash'];

(function boot() {
  try {
    const cfg = window.FIREBASE_CONFIG || {};
    const configured = !!cfg.apiKey && !String(cfg.apiKey).startsWith('REMPLACE') && !String(cfg.projectId || '').startsWith('REMPLACE');
    if (!configured) { window.__fbResolve({ configured: false }); return; }

    const app = initializeApp(cfg);
    try { initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(RECAPTCHA_SITE_KEY), isTokenAutoRefreshEnabled: true }); }
    catch (e) { console.warn('App Check indisponible', e); }
    const auth = getAuth(app);
    const db = getFirestore(app);
    getRedirectResult(auth).catch(() => {});

    const user = (u) => (u ? { uid: u.uid, name: u.displayName || '', email: u.email || '' } : null);
    const mine = (uid, name) => collection(db, 'users', uid, name);

    window.__fbResolve({
      configured: true,

      // --- compte ---
      onAuth: (cb) => onAuthStateChanged(auth, (u) => cb(user(u))),
      async signInGoogle() {
        const provider = new GoogleAuthProvider();
        try { await signInWithPopup(auth, provider); }
        catch (e) {
          if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment') {
            await signInWithRedirect(auth, provider); return;
          }
          throw e;
        }
      },
      signInEmail: (mail, pass) => signInWithEmailAndPassword(auth, mail, pass),
      signUpEmail: (mail, pass) => createUserWithEmailAndPassword(auth, mail, pass),
      resetPassword: (mail) => sendPasswordResetEmail(auth, mail),
      signOut: () => signOut(auth),

      // --- mes trades et mes captures (privés) ---
      onTrades: (uid, next, err) => onSnapshot(mine(uid, 'trades'),
        (s) => next(s.docs.map((d) => ({ ...d.data(), id: d.id }))), err),
      saveTrade: (uid, id, data) => setDoc(doc(db, 'users', uid, 'trades', id), data),
      deleteTrade: (uid, id) => deleteDoc(doc(db, 'users', uid, 'trades', id)),
      putShot: (uid, id, d) => setDoc(doc(db, 'users', uid, 'shots', id), { d }),
      async getShot(uid, id) { const s = await getDoc(doc(db, 'users', uid, 'shots', id)); return s.exists() ? s.data().d : null; },
      deleteShot: (uid, id) => deleteDoc(doc(db, 'users', uid, 'shots', id)),

      // --- consignes permanentes pour l'IA (privées) ---
      async getAiRules(uid) { const s = await getDoc(doc(db, 'users', uid, 'settings', 'ai')); return s.exists() ? s.data() : null; },
      putAiRules: (uid, data) => setDoc(doc(db, 'users', uid, 'settings', 'ai'), data),

      // --- analyse par IA (Gemini, via Firebase AI Logic ; chargée seulement à la demande) ---
      async ai(prompt) {
        const m = await import('https://www.gstatic.com/firebasejs/12.19.0/firebase-ai.js');
        const svc = m.getAI(app, { backend: new m.GoogleAIBackend() });
        let last = null;
        for (const name of AI_MODELS) {
          try {
            const res = await m.getGenerativeModel(svc, { model: name }).generateContent(prompt);
            return res.response.text();
          } catch (e) {
            last = e;
            if (!/404|not.?found|not supported|unknown model|no longer available/i.test(String((e && e.message) || ''))) throw e;
          }
        }
        throw last;
      },

      // --- trades partagés (lisibles par toute personne qui a le lien) ---
      putShared: (uid, token, data) => setDoc(doc(db, 'shared', token), { ...data, ownerUid: uid }),
      async getShared(token) { const s = await getDoc(doc(db, 'shared', token)); return s.exists() ? s.data() : null; },
      onShared: (token, next, err) => onSnapshot(doc(db, 'shared', token), (s) => next(s.exists() ? s.data() : null), err),
      deleteShared: (token) => deleteDoc(doc(db, 'shared', token)),
      putSharedShot: (uid, token, id, d) => setDoc(doc(db, 'shared', token, 'shots', id), { d, ownerUid: uid }),
      async getSharedShot(token, id) { const s = await getDoc(doc(db, 'shared', token, 'shots', id)); return s.exists() ? s.data().d : null; },
      deleteSharedShot: (token, id) => deleteDoc(doc(db, 'shared', token, 'shots', id))
    });
  } catch (e) {
    console.error('Firebase indisponible', e);
    window.__fbResolve(null);
  }
})();
