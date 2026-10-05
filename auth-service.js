// Provider-specific code stays here so it can be replaced without redesigning the UI.
window.KitswAuth = (() => {
  let connection;
  const isCollegeEmail = email => /^[^\s@]+@kitsw\.ac\.in$/i.test(email || '');
  const configured = () => ['apiKey', 'authDomain', 'projectId', 'appId'].every(key =>
    typeof window.KITSW_FIREBASE_CONFIG?.[key] === 'string' && window.KITSW_FIREBASE_CONFIG[key].trim());
  async function connect() {
    if (!configured()) throw { code: 'app/not-configured' };
    if (!connection) connection = (async () => {
      const [appSdk, sdk] = await Promise.all([
        import('https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js'),
        import('https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js')
      ]).catch(() => { throw { code: 'app/sdk-load-failed' }; });
      const app = appSdk.getApps().length ? appSdk.getApp() : appSdk.initializeApp(window.KITSW_FIREBASE_CONFIG);
      const auth = sdk.getAuth(app);
      await sdk.setPersistence(auth, sdk.browserLocalPersistence);
      await auth.authStateReady();
      return { auth, sdk };
    })().catch(error => { connection = null; throw error; });
    return connection;
  }
  function requireCollegeEmail(email) {
    if (!isCollegeEmail(email)) throw { code: 'app/college-email' };
  }
  return {
    configured, isCollegeEmail,
    async current() {
      const { auth, sdk } = await connect();
      if (auth.currentUser && !isCollegeEmail(auth.currentUser.email)) {
        await sdk.signOut(auth);
        return null;
      }
      // Firebase refreshes tokens automatically. Reload only when explicitly
      // checking email verification; ordinary API requests reuse this session.
      return auth.currentUser;
    },
    async register(email, password) {
      requireCollegeEmail(email);
      const { auth, sdk } = await connect();
      const { user } = await sdk.createUserWithEmailAndPassword(auth, email, password);
      // Report account creation separately from email delivery, so a delivery
      // failure doesn't encourage the student to register the same account again.
      try {
        await sdk.sendEmailVerification(user);
        return { user, verificationSent: true };
      } catch { return { user, verificationSent: false }; }
    },
    async login(email, password) {
      requireCollegeEmail(email);
      const { auth, sdk } = await connect();
      return (await sdk.signInWithEmailAndPassword(auth, email, password)).user;
    },
    async reset(email) {
      requireCollegeEmail(email);
      const { auth, sdk } = await connect();
      try { await sdk.sendPasswordResetEmail(auth, email); }
      catch (error) { if (error.code !== 'auth/user-not-found') throw error; }
    },
    async resend() {
      const { auth, sdk } = await connect();
      if (!auth.currentUser) throw { code: 'auth/user-token-expired' };
      await sdk.sendEmailVerification(auth.currentUser);
    },
    async refresh() {
      const { auth, sdk } = await connect();
      if (!auth.currentUser) return null;
      await sdk.reload(auth.currentUser);
      await sdk.getIdToken(auth.currentUser, true);
      return auth.currentUser;
    },
    async logout() {
      const { auth, sdk } = await connect();
      await sdk.signOut(auth);
    }
  };
})();
