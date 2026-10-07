const $ = selector => document.querySelector(selector);
const form = $('#login-form');
const email = $('#email');
const password = $('#password');
const confirmPassword = $('#confirm-password');
const status = $('#form-status');
const toggle = $('.password-toggle');
const auth = window.KitswAuth;
const tabs = [...document.querySelectorAll('[data-mode]')];
let mode = 'login';
let busy = false;
let resendAfter = 0;

function message(text, target = status) {
  target.textContent = text;
  target.hidden = !text;
}
function setError(input, text) {
  message(text, $(`#${input.id}-error`));
  input.setAttribute('aria-invalid', String(Boolean(text)));
}
function clearPasswords() {
  password.value = '';
  confirmPassword.value = '';
  password.type = 'password';
  toggle.textContent = 'Show';
  toggle.setAttribute('aria-label', 'Show password');
  toggle.setAttribute('aria-pressed', 'false');
}
function setMode(next, focus = true) {
  if (busy) return;
  mode = next;
  clearPasswords();
  [email, password, confirmPassword].forEach(input => setError(input, ''));
  message('');
  const register = mode === 'register';
  const reset = mode === 'reset';
  $('#login-title').textContent = register ? 'Create your account.' : reset ? 'Forgot your password?' : 'Welcome back.';
  $('.login-subtitle').textContent = register ? 'Use your college email.' : reset ? 'We will email a reset link.' : 'Sign in to prepare your print order.';
  $('#password-fields').hidden = reset;
  password.disabled = reset;
  password.autocomplete = register ? 'new-password' : 'current-password';
  password.setAttribute('aria-describedby', register ? 'password-hint password-error' : 'password-error');
  $('#password-hint').hidden = !register;
  $('#confirm-fields').hidden = !register;
  confirmPassword.disabled = !register;
  $('.form-options').hidden = mode !== 'login';
  $('#back-login').hidden = !reset;
  $('#submit-button').textContent = register ? 'Create account' : reset ? 'Send reset link' : 'Log in';
  tabs.forEach(tab => tab.setAttribute('aria-pressed', String(tab.dataset.mode === mode)));
  if (focus) email.focus();
}
function errorText(error) {
  const errors = {
    'app/not-configured': 'Account sign-in is not available yet. Please try again once setup is complete.',
    'app/college-email': 'Please use your @kitsw.ac.in college email.',
    'auth/invalid-credential': 'Email or password is incorrect. Please try again.',
    'auth/wrong-password': 'Email or password is incorrect. Please try again.',
    'auth/user-not-found': 'Email or password is incorrect. Please try again.',
    'auth/email-already-in-use': 'Unable to create this account. Try logging in or resetting your password.',
    'auth/weak-password': 'Choose a stronger app password with uppercase, lowercase and a number.',
    'auth/password-does-not-meet-requirements': 'Your password does not meet the account password requirements.',
    'auth/too-many-requests': 'Too many attempts. Please wait a few minutes and try again.',
    'auth/network-request-failed': 'Unable to connect. Check your internet connection and try again.',
    'auth/user-disabled': 'This account is unavailable. Contact the app team.',
    'auth/user-token-expired': 'Your session expired. Sign out and log in again.',
    'auth/configuration-not-found': 'Firebase Authentication is not set up yet. In Firebase Console, open Authentication, click Get started, then enable Email/Password under Sign-in method.',
    'auth/operation-not-allowed': 'Email/password sign-in is disabled. Enable Email/Password in Firebase Console > Authentication > Sign-in method.',
    'auth/unauthorized-domain': 'This website address is not authorized. Add its hostname in Firebase Console > Authentication > Settings > Authorized domains.',
    'auth/invalid-api-key': 'The Firebase API key is invalid. Check the web app configuration in firebase-config.js.',
    'app/sdk-load-failed': 'The sign-in service could not load. Check your internet connection and whether your browser or network blocks www.gstatic.com, then refresh.'
  };
  const code = typeof error?.code === 'string' ? error.code : '';
  const safeCode = /^(auth|app)\/[a-z0-9-]+$/.test(code) ? ` (${code})` : '';
  return errors[code] || `We could not complete that request${safeCode}. Please try again.`;
}
async function perform(action, target = status) {
  if (busy) return;
  busy = true;
  const controls = [...document.querySelectorAll('.login-card button, .login-card input')];
  const disabledBefore = controls.map(control => control.disabled);
  controls.forEach(control => { control.disabled = true; });
  $('.login-card').setAttribute('aria-busy', 'true');
  message('Please wait...', target);
  try { await action(); }
  catch (error) { message(errorText(error), target); }
  finally {
    controls.forEach((control, index) => { control.disabled = disabledBefore[index]; });
    $('.login-card').setAttribute('aria-busy', 'false');
    busy = false;
  }
}
function showAccount(user) {
  clearPasswords();
  form.hidden = true;
  $('.auth-tabs').hidden = true;
  $('#back-login').hidden = true;
  $('#account-panel').hidden = false;
  const verified = user.emailVerified && auth.isCollegeEmail(user.email);
  $('#login-title').textContent = verified ? 'You are signed in.' : 'Verify your email.';
  $('.login-subtitle').textContent = verified ? 'Welcome to THEESKAPOOO.' : 'One quick step to confirm you are part of KITSW.';
  $('#account-badge').textContent = verified ? 'College email verified' : 'Check your college inbox';
  $('#account-message').textContent = verified ? 'Your account is ready. Open your dashboard.' : 'Verify your email to continue. Check spam if needed.';
  $('#open-dashboard').hidden = !verified;
  $('#account-email').textContent = user.email;
  $('#verification-actions').hidden = verified;
  message('', $('#account-status'));
}
tabs.forEach(tab => tab.addEventListener('click', () => setMode(tab.dataset.mode)));
$('#forgot-password').addEventListener('click', () => setMode('reset'));
$('#back-login').addEventListener('click', () => setMode('login'));
toggle.addEventListener('click', () => {
  const show = password.type === 'password';
  password.type = show ? 'text' : 'password';
  toggle.textContent = show ? 'Hide' : 'Show';
  toggle.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  toggle.setAttribute('aria-pressed', String(show));
});
[email, password, confirmPassword].forEach(input => input.addEventListener('input', () => {
  setError(input, '');
  message('');
}));
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (busy) return;
  email.value = email.value.trim().toLowerCase();
  const emailValid = email.validity.valid && auth.isCollegeEmail(email.value);
  const passwordValid = mode === 'reset' || (mode === 'register'
    ? password.value.length >= 8 && /[A-Z]/.test(password.value) && /[a-z]/.test(password.value) && /[0-9]/.test(password.value)
    : password.value.length > 0);
  const confirmValid = mode !== 'register' || (confirmPassword.value === password.value && confirmPassword.value.length > 0);
  setError(email, emailValid ? '' : 'Enter your college email ending in @kitsw.ac.in.');
  setError(password, passwordValid ? '' : mode === 'register' ? 'Use at least 8 characters, with uppercase, lowercase and a number.' : 'Please enter your app password.');
  setError(confirmPassword, confirmValid ? '' : 'Your passwords must match.');
  if (!emailValid || !passwordValid || !confirmValid) {
    (!emailValid ? email : !passwordValid ? password : confirmPassword).focus();
    return;
  }
  await perform(async () => {
    try {
      if (mode === 'reset') {
        await auth.reset(email.value);
        message('If an account exists for this email, a password reset link has been sent. Check your inbox and spam folder.');
      } else if (mode === 'register') {
        const result = await auth.register(email.value, password.value);
        showAccount(result.user);
        resendAfter = result.verificationSent ? Date.now() + 60000 : 0;
        message(result.verificationSent ? 'Verification email sent. Follow the link to activate your account.' : 'Your account was created, but the email could not be sent. Use Resend verification email to try again.', $('#account-status'));
      } else {
        showAccount(await auth.login(email.value, password.value));
      }
    } finally { clearPasswords(); }
  });
});
$('#check-verification').addEventListener('click', () => perform(async () => {
  const user = await auth.refresh();
  if (!user) throw { code: 'auth/user-token-expired' };
  showAccount(user);
  if (!user.emailVerified) message('Your email is not verified yet. Open the link in your inbox, then try again.', $('#account-status'));
}, $('#account-status')));
$('#resend-verification').addEventListener('click', () => perform(async () => {
  if (Date.now() < resendAfter) {
    message('Please wait a minute before requesting another email.', $('#account-status'));
    return;
  }
  await auth.resend();
  resendAfter = Date.now() + 60000;
  message('Verification email sent. Check your inbox and spam folder.', $('#account-status'));
}, $('#account-status')));
$('#sign-out').addEventListener('click', async () => {
  let signedOut = false;
  await perform(async () => { await auth.logout(); signedOut = true; }, $('#account-status'));
  if (signedOut) {
    $('#account-panel').hidden = true;
    form.hidden = false;
    $('.auth-tabs').hidden = false;
    email.value = '';
    setMode('login');
    message('You have been signed out.');
  }
});
setMode('login', false);
if (auth.configured()) {
  $('#service-note').textContent = 'Use your Xerox app password, not your college password.';
  perform(async () => {
    const user = await auth.current();
    message('');
    if (user) showAccount(user);
  });
} else {
  $('#service-note').textContent = 'Account service awaiting setup. Registration and login are not live yet.';
}
