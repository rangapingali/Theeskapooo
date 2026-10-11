(() => {
  if (!('serviceWorker' in navigator)) return;

  const script = document.currentScript;
  if (!script?.src) return;
  const workerUrl = new URL('service-worker.js', script.src);

  window.addEventListener('load', () => {
    navigator.serviceWorker.register(workerUrl, {
      scope: new URL('./', workerUrl).pathname,
      updateViaCache: 'none'
    }).catch(error => {
      console.error('PWA service worker registration failed.', error);
    });
  }, { once: true });
})();

// These alerts are delivered while the app is running; this is not background push.
window.AppNotifications = (() => {
  const supported = 'Notification' in window && window.isSecureContext;
  let enabled = false;
  try { enabled = localStorage.getItem('theeskapooo:notifications') === 'on'; } catch {}
  const button = document.createElement('button'); button.type = 'button'; button.className = 'quiet'; button.id = 'notification-alerts';
  button.title = 'Notifications while the app is open. Closed-app push is not enabled.';
  function label() { button.textContent = enabled && supported && Notification.permission === 'granted' ? 'Notifications: on' : 'Enable notifications'; }
  if (supported && document.querySelector('.user-menu')) document.querySelector('.user-menu').append(button);
  button.addEventListener('click', async () => {
    if (enabled) enabled = false;
    else {
      try { enabled = (await Notification.requestPermission()) === 'granted'; } catch { enabled = false; }
    }
    try { localStorage.setItem('theeskapooo:notifications', enabled ? 'on' : 'off'); } catch {}
    label();
    if (!enabled && Notification.permission === 'denied') { button.textContent = 'Notifications blocked'; button.title = 'Allow notifications in browser site settings. In-app order updates still work.'; }
  });
  label();
  async function notify(title, body, tag, page = 'dashboard.html') {
    if (!enabled || !supported || Notification.permission !== 'granted') return;
    try {
      const registration = await navigator.serviceWorker?.getRegistration();
      const options = { body, tag, icon: '/pwa-icon-192.png', data: { page } };
      if (registration?.active) await registration.showNotification(title, options);
      else { const notice = new Notification(title, options); notice.onclick = () => { window.focus(); notice.close(); }; }
    } catch { /* In-app notices remain available when the OS blocks notifications. */ }
  }
  return { notify };
})();
