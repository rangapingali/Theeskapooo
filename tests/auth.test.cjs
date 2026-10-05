const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

function screen(overrides = {}) {
  const elements = new Map();
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const make = (id = '') => ({
    id, value: '', type: 'password', hidden: false, disabled: false, attrs: {}, listeners: {}, dataset: {},
    setAttribute(key, value) { this.attrs[key] = value; },
    addEventListener(event, callback) { this.listeners[event] = callback; },
    focus() { this.focused = true; },
    get validity() { return { valid: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.value) }; }
  });
  for (const [, id] of html.matchAll(/id="([^"]+)"/g)) elements.set('#' + id, make(id));
  for (const name of ['password-toggle', 'login-card', 'login-subtitle', 'form-options', 'auth-tabs']) {
    assert.ok(html.includes(name));
    elements.set('.' + name, make());
  }
  const tabs = ['login', 'register'].map(mode => ({ ...make(), dataset: { mode } }));
  const auth = {
    configured: () => false,
    isCollegeEmail: value => /^[^\s@]+@kitsw\.ac\.in$/i.test(value),
    login: async () => { throw { code: 'app/not-configured' }; },
    register: async () => { throw { code: 'app/not-configured' }; },
    reset: async () => {}, logout: async () => {}, resend: async () => {},
    ...overrides
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'app.js'), 'utf8'), {
    window: { KitswAuth: auth },
    document: {
      querySelector: selector => { assert.ok(elements.has(selector), 'Missing HTML element: ' + selector); return elements.get(selector); },
      querySelectorAll: selector => selector === '[data-mode]' ? tabs : [...elements.values(), ...tabs]
    }
  });
  const get = id => elements.get('#' + id);
  return {
    get, auth,
    mode: value => tabs.find(tab => tab.dataset.mode === value).listeners.click(),
    click: id => get(id).listeners.click(),
    submit: () => get('login-form').listeners.submit({ preventDefault() {} }),
    fill(email = 'student@kitsw.ac.in', password = 'StrongPass1', confirm = password) {
      get('email').value = email; get('password').value = password; get('confirm-password').value = confirm;
    }
  };
}

test('email domain and empty fields prevent authentication calls', async () => {
  let called = false;
  const ui = screen({ login: async () => { called = true; } });
  await ui.submit();
  assert.equal(ui.get('email').attrs['aria-invalid'], 'true');
  ui.fill('student@kitsw.ac.in.evil.example');
  await ui.submit();
  assert.equal(called, false);
  assert.equal(ui.get('email').focused, true);
});
test('registration checks strength and confirmation before creating account', async () => {
  let calls = 0;
  const ui = screen({ register: async email => { calls++; return { user: { email, emailVerified: false }, verificationSent: true }; } });
  ui.mode('register');
  ui.fill('student@kitsw.ac.in', 'weak');
  await ui.submit();
  assert.equal(calls, 0);
  ui.fill('student@kitsw.ac.in', 'StrongPass1', 'Different1');
  await ui.submit();
  assert.equal(calls, 0);
  ui.fill(' STUDENT@KITSW.AC.IN ');
  await ui.submit();
  assert.equal(calls, 1);
  assert.equal(ui.get('account-email').textContent, 'student@kitsw.ac.in');
  assert.equal(ui.get('verification-actions').hidden, false);
  assert.equal(ui.get('password').value, '');
  assert.match(ui.get('account-status').textContent, /Verification email sent/);
});
test('delivery failure retains account and offers resend', async () => {
  const ui = screen({ register: async email => ({ user: { email, emailVerified: false }, verificationSent: false }) });
  ui.mode('register'); ui.fill(); await ui.submit();
  assert.equal(ui.get('account-panel').hidden, false);
  assert.match(ui.get('account-status').textContent, /account was created/);
  await ui.click('resend-verification');
  assert.match(ui.get('account-status').textContent, /Verification email sent/);
  await ui.click('resend-verification');
  assert.match(ui.get('account-status').textContent, /wait a minute/);
});
test('unverified login stays in verification flow until provider confirms verification', async () => {
  const user = { email: 'student@kitsw.ac.in', emailVerified: false };
  const ui = screen({ login: async () => user, refresh: async () => user });
  ui.fill(); await ui.submit();
  assert.equal(ui.get('verification-actions').hidden, false);
  await ui.click('check-verification');
  assert.match(ui.get('account-status').textContent, /not verified/);
  user.emailVerified = true;
  await ui.click('check-verification');
  assert.equal(ui.get('verification-actions').hidden, true);
  assert.equal(ui.get('login-title').textContent, 'You are signed in.');
  await ui.click('sign-out');
  assert.equal(ui.get('account-panel').hidden, true);
  assert.equal(ui.get('login-form').hidden, false);
  assert.equal(ui.get('email').value, '');
});
test('reset needs only college email and uses a neutral account-existence message', async () => {
  let resetEmail;
  const ui = screen({ reset: async email => { resetEmail = email; } });
  await ui.click('forgot-password');
  assert.equal(ui.get('password').disabled, true);
  ui.fill('student@kitsw.ac.in', '', ''); await ui.submit();
  assert.equal(resetEmail, 'student@kitsw.ac.in');
  assert.match(ui.get('form-status').textContent, /If an account exists/);
  await ui.click('back-login');
  assert.equal(ui.get('password').disabled, false);
});
test('unconfigured service does not report login success and clears password', async () => {
  const ui = screen(); ui.fill(); await ui.submit();
  assert.match(ui.get('form-status').textContent, /not available yet/);
  assert.equal(ui.get('password').value, '');
  assert.equal(ui.get('submit-button').disabled, false);
});
test('failed requests release controls; repeated submits cannot duplicate requests', async () => {
  let reject, calls = 0;
  const ui = screen({ login: () => { calls++; return new Promise((resolve, fail) => { reject = fail; }); } });
  ui.fill(); const pending = ui.submit();
  assert.equal(ui.get('submit-button').disabled, true);
  await ui.submit(); assert.equal(calls, 1);
  reject({ code: 'auth/network-request-failed' }); await pending;
  assert.match(ui.get('form-status').textContent, /internet connection/);
  assert.equal(ui.get('submit-button').disabled, false);
});
test('real adapter rejects missing configuration and wrong domains before importing Firebase', async () => {
  const context = { window: { KITSW_FIREBASE_CONFIG: {} } };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'auth-service.js'), 'utf8'), context);
  const auth = context.window.KitswAuth;
  assert.equal(auth.configured(), false);
  await assert.rejects(auth.login('student@kitsw.ac.in', 'x'), { code: 'app/not-configured' });
  await assert.rejects(auth.register('student@gmail.com', 'x'), { code: 'app/college-email' });
});

test('missing Firebase Authentication configuration explains how to enable it', async () => {
  const ui = screen({ login: async () => { throw { code: 'auth/configuration-not-found' }; } });
  ui.fill(); await ui.submit();
  assert.match(ui.get('form-status').textContent, /Authentication is not set up/);
  assert.match(ui.get('form-status').textContent, /Get started/);
  assert.equal(ui.get('submit-button').disabled, false);
});

test('SDK loading failures give actionable network guidance', async () => {
  const ui = screen({ login: async () => { throw { code: 'app/sdk-load-failed' }; } });
  ui.fill(); await ui.submit();
  assert.match(ui.get('form-status').textContent, /www\.gstatic\.com/);
});
