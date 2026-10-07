window.OrderService = (() => {
  async function readResponse(response, fallback) {
    const data = await response.json().catch(() => null);
    if (!response.ok) throw Error(data?.error || fallback);
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw Error('The server is starting or returned an unexpected response. Keep this page open and retry; do not repeat a payment.');
    return data;
  }
  // Same-origin API. Use the Node server for live orders; Live Server supports preview only.
  async function request(path, options = {}) {
    const user = await window.KitswAuth.current();
    if (!user?.emailVerified) throw Error('Sign in with a verified college email to continue.');
    const token = await user.getIdToken();
    let response;
    try { response = await fetch('/api' + path, {
      ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(30000)
    }); } catch { throw Error('Connection interrupted. Your saved orders are safe. Reconnect and refresh before repeating an order or payment.'); }
    return readResponse(response, 'The order service is unavailable. Please try again later.');
  }
  async function configuration() {
    const unavailable = { ordersEnabled: false, paymentsEnabled: false, backendUnavailable: true };
    try {
      const response = await fetch('/api/config', { cache: 'no-store', signal: AbortSignal.timeout(10000) });
      if (!response.ok) return unavailable;
      const config = await response.json();
      return typeof config.ordersEnabled === 'boolean' ? config : unavailable;
    } catch { return unavailable; }
  }
  async function upload(files, orderId, onProgress) {
    const user = await window.KitswAuth.current();
    if (!user?.emailVerified) throw Error('Please verify your college email first.');
    const uploaded = [];
    for (let i = 0; i < files.length; i++) {
      const item = files[i];
      onProgress(i + 1, files.length, 0);
      let response;
      try { response = await fetch('/api/uploads/' + encodeURIComponent(orderId) + '/' + encodeURIComponent(item.id) + '?name=' + encodeURIComponent(item.file.name), {
        method: 'POST', headers: { Authorization: 'Bearer ' + await user.getIdToken(), 'Content-Type': 'application/octet-stream', 'X-File-Size': String(item.file.size) },
        body: item.file, signal: AbortSignal.timeout(120000)
      }); } catch { throw Error('Upload connection interrupted. Your files and settings stay here. Retry to continue the same checkout.'); }
      const data = await readResponse(response, 'Document upload failed. Please retry.');
      if (typeof data.path !== 'string') throw Error('Upload was not confirmed by the server. Keep your files selected and retry.');
      if (data.pageCountSource !== 'manual' && data.pages !== item.settings.pages) throw Error('The verified page count differs from the preview. Select this file again before ordering.');
      uploaded.push({ name: item.file.name, size: item.file.size, path: data.path, settings: { ...item.settings }, pageCountSource: data.pageCountSource || 'automatic' });
      onProgress(i + 1, files.length, 100);
    }
    return uploaded;
  }

  let checkoutScript;
  function loadCheckout() {
    if (window.Razorpay) return Promise.resolve();
    if (!checkoutScript) checkoutScript = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = resolve;
      script.onerror = () => { script.remove(); checkoutScript = null; reject(Error('Payment checkout could not load. Please retry.')); };
      document.head.append(script);
    });
    return checkoutScript;
  }
  async function pay(orderId) {
    const checkout = await request(`/orders/${encodeURIComponent(orderId)}/checkout`, { method: 'POST', body: '{}' });
    await loadCheckout();
    return new Promise((resolve, reject) => {
      const widget = new window.Razorpay({
        key: checkout.keyId, order_id: checkout.providerOrderId, amount: checkout.amount,
        currency: 'INR', name: checkout.merchantName, description: 'THEESKAPOOO print order',
        theme: { color: '#214f3c' },
        handler: async result => {
          try { resolve(await request(`/orders/${encodeURIComponent(orderId)}/verify-payment`, { method: 'POST', body: JSON.stringify(result) })); }
          catch { reject(Error('Payment confirmation is pending. Do not pay again yet; refresh My orders to check the server-confirmed status.')); }
        },
        modal: { ondismiss: () => resolve({ status: 'pending', message: 'Checkout closed. Refresh orders before retrying a payment.' }) }
      });
      widget.on('payment.failed', () => reject(Error('Payment failed or was declined. Refresh your order before retrying.')));
      widget.open();
    });
  }
  async function download(orderId, index, name) {
    const user = await window.KitswAuth.current();
    const response = await fetch(`/api/operator/orders/${encodeURIComponent(orderId)}/files/${index}`, { headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
    if (!response.ok) throw Error('Document download failed. Check your operator access.');
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement('a'); link.href = url; link.download = name; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  const post = (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) });
  return {
    configuration, upload, pay, download,
    preparePayment: body => post('/payment-drafts', body),
    declarePayment: id => post(`/orders/${encodeURIComponent(id)}/declare-payment`, { paymentDeclared: true }),
    shop: () => request('/shop'),
    setShop: acceptingOrders => post('/shop', { acceptingOrders }),
    me: () => request('/me'),
    manualInstructions: id => post(`/orders/${encodeURIComponent(id)}/manual-instructions`, {}),
    submitManualPayment: (id, reference) => post(`/orders/${encodeURIComponent(id)}/manual-payment`, { reference }),
    operatorOrders: () => request('/operator/orders'),
    operatorAction: (id, action, body) => post(`/operator/orders/${encodeURIComponent(id)}/${action}`, body),
    trendingPrints: () => request('/trending-prints'),
    addTrendingPrint: body => post('/operator/trending-prints', body),
    updateTrendingPrint: (id, body) => request(`/operator/trending-prints/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(body) }),
    removeTrendingPrint: id => request(`/operator/trending-prints/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    list: () => request('/orders'), create: body => post('/orders', body)
  };
})();
