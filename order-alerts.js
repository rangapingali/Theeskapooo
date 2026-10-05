// Sounds require a browser gesture. Only server-confirmed transitions are heard.
window.OrderAlerts = (() => {
  let context, player, source = null, enabled = false, previous = new Map(), owner = null;
  const button = () => document.querySelector('#sound-alerts');
  function label() { if (button()) button().textContent = enabled ? 'Sound alerts: on' : 'Enable sound alerts'; }
  async function sound() {
    if (!enabled) return;
    try {
      if (source) { player ||= new Audio(source); if (player.paused === false) return; player.currentTime = 0; await player.play(); return; }
      if (!context) return;
      await context.resume();
      [660,880].forEach((frequency,index) => {
        const osc = context.createOscillator(), gain = context.createGain(), start = context.currentTime + index*.17;
        osc.frequency.value = frequency; gain.gain.setValueAtTime(0,start); gain.gain.linearRampToValueAtTime(.12,start+.02); gain.gain.exponentialRampToValueAtTime(.001,start+.28);
        osc.connect(gain).connect(context.destination); osc.start(start); osc.stop(start+.3);
      });
    } catch { enabled = false; if (button()) button().textContent = 'Tap to enable sound again'; }
  }
  function setup(url) {
    source = typeof url === 'string' && url.startsWith('/') && !url.startsWith('//') ? url : null;
    const el = button(); if (!el || el.dataset.bound) return;
    try { enabled = localStorage.getItem('theeskapooo:sound-alerts') === 'on'; } catch {}
    el.dataset.bound = 'true';
    el.addEventListener('click', async () => {
      enabled = !enabled;
      try { localStorage.setItem('theeskapooo:sound-alerts', enabled ? 'on' : 'off'); } catch {}
      if (enabled && !context && (window.AudioContext || window.webkitAudioContext)) context = new (window.AudioContext || window.webkitAudioContext)();
      label(); if (enabled) await sound();
    }); label();
  }
  function observe(uid, orders) {
    if (owner !== uid) {
      owner = uid; previous = new Map();
      try { previous = new Map(JSON.parse(sessionStorage.getItem('order-alerts:' + uid) || '[]')); } catch {}
    }
    const messages = [];
    for (const order of orders) {
      const old = previous.get(order.id);
      if (old && old.status !== 'ready' && order.status === 'ready') messages.push('Order #' + order.id.slice(0,8).toUpperCase() + ' is ready to collect.');
      if (old && old.paymentStatus !== 'paid' && order.paymentStatus === 'paid') messages.push('Payment confirmed for order #' + order.id.slice(0,8).toUpperCase() + '.');
      previous.set(order.id, { status: order.status, paymentStatus: order.paymentStatus });
    }
    // Bound remembered statuses; do not store filenames, receipts or documents.
    previous = new Map([...previous].slice(-150));
    try { sessionStorage.setItem('order-alerts:' + uid, JSON.stringify([...previous])); } catch {}
    if (messages.length) {
      const notice = document.querySelector('#order-alert');
      if (notice) { notice.textContent = messages.join(' '); notice.hidden = false; }
      sound();
    }
  }
  return { setup, observe };
})();
