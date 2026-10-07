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
