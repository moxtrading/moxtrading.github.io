// Relie le site à Firebase (connexion Google / e-mail et base Firestore).
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getAuth, onAuthStateChanged, signInWithPopup, signInWithRedirect, getRedirectResult, GoogleAuthProvider,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, signOut
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  getFirestore, collection, doc, setDoc, getDoc, deleteDoc, onSnapshot
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

(function boot() {
  try {
    const cfg = window.FIREBASE_CONFIG || {};
    const configured = !!cfg.apiKey && !String(cfg.apiKey).startsWith('REMPLACE') && !String(cfg.projectId || '').startsWith('REMPLACE');
    if (!configured) { window.__fbResolve({ configured: false }); return; }

    const app = initializeApp(cfg);
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
