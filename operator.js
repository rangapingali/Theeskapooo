(() => {
  const $ = selector => document.querySelector(selector);
  const api = window.OrderService;
  const preview = new URLSearchParams(location.search).get('preview') === '1';
  const money = value => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(value / 100);
  const node = (tag, text, css) => { const el = document.createElement(tag); if (text !== undefined) el.textContent = text; if (css) el.className = css; return el; };
  let declarationMode = false;
  let orders = [], actor, allowed = false, busy = false, filter = 'all', slotVisibility = '';
  let earningsTimer;
  function message(text) { $('#operator-feedback').textContent = text; $('#operator-feedback').hidden = !text; }
  function indiaDateKey(date) {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
    const value = type => parts.find(part => part.type === type).value;
    return `${value('year')}-${value('month')}-${value('day')}`;
  }
  function dateKeyOffset(dateKey, offset) {
    const [year, month, day] = dateKey.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day + offset)).toISOString().slice(0, 10);
  }
  function paymentsMarkedPaidOn(dateKey) {
    return orders.filter(order => {
      if (!['paid', 'declared_paid'].includes(order.paymentStatus) || !Number.isFinite(order.paymentReceivedMs)
        || !Number.isSafeInteger(order.quoteAmountPaise) || order.quoteAmountPaise <= 0) return false;
      const receivedAt = new Date(order.paymentReceivedMs);
      return Number.isFinite(receivedAt.getTime()) && indiaDateKey(receivedAt) === dateKey;
    });
  }
  function isPickupSlotExpired(order, now = Date.now()) {
    const slot = order.collectionSlot;
    if (!slot || !/^\d{4}-\d{2}-\d{2}$/.test(slot.date) || !Number.isInteger(slot.endHour) || slot.endHour < 1 || slot.endHour > 24) return false;
    const end = new Date(`${slot.date}T${String(slot.endHour % 24).padStart(2, '0')}:00:00+05:30`).getTime() + (slot.endHour === 24 ? 24 * 60 * 60 * 1000 : 0);
    return Number.isFinite(end) && now >= end && !['collected', 'cancelled'].includes(order.status);
  }
  function slotVisibilityKey(list = orders) {
    return JSON.stringify(list.map(order => [order.id, isPickupSlotExpired(order)]));
  }
  function indiaClock(date) {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(date);
    const value = type => Number(parts.find(part => part.type === type).value);
    return { minutes: value('hour') * 60 + value('minute'), seconds: value('second') };
  }
  function renderEarnings() {
    const history = $('#earnings-history');
    history.hidden = !allowed;
    if (allowed) {
      const days = $('#earnings-history-days');
      days.replaceChildren();
      const today = indiaDateKey(new Date());
      for (let offset = 1; offset <= 7; offset++) {
        const dateKey = dateKeyOffset(today, -offset);
        const received = paymentsMarkedPaidOn(dateKey);
        const total = received.reduce((sum, order) => sum + order.quoteAmountPaise, 0);
        const date = new Date(`${dateKey}T12:00:00+05:30`);
        const item = node('article', undefined, 'panel order-card');
        item.dataset.date = dateKey;
        const top = node('div', undefined, 'order-card-top');
        top.append(
          node('span', new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(date)),
          node('strong', money(total))
        );
        item.append(top, node('p', `${received.length} ${received.length === 1 ? 'payment' : 'payments'} marked paid`));
        days.append(item);
      }
    }

    const section = $('#daily-earnings');
    const now = new Date();
    section.hidden = !allowed;
    if (section.hidden) return;

    const today = indiaDateKey(now);
    const received = paymentsMarkedPaidOn(today)
      .sort((a, b) => a.paymentReceivedMs - b.paymentReceivedMs);
    const total = received.reduce((sum, order) => sum + order.quoteAmountPaise, 0);
    $('#daily-earnings-date').textContent = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'full' }).format(now) + ' · Live total · Daily close: 5:30 PM IST';
    $('#daily-earnings-total').textContent = money(total);
    $('#daily-earnings-count').textContent = String(received.length);
    const list = $('#daily-earnings-orders');
    list.replaceChildren();
    if (!received.length) {
      list.append(node('p', 'No payments marked paid today.', 'empty-orders'));
      return;
    }
    received.forEach(order => {
      const item = node('article', undefined, 'panel order-card');
      const top = node('div', undefined, 'order-card-top');
      const heading = node('div');
      heading.append(node('h2', '#' + order.id.slice(0, 8).toUpperCase()));
      const time = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' }).format(new Date(order.paymentReceivedMs));
      const paymentMethod = order.paymentMethod === 'self_declared_upi' ? 'Student-declared UPI'
        : order.paymentMethod === 'manual_upi' ? 'Recipient-confirmed UPI'
          : order.paymentMethod || 'Payment received';
      heading.append(node('p', `${time} IST · ${paymentMethod}`));
      top.append(heading, node('strong', money(order.quoteAmountPaise)));
      item.append(top);
      list.append(item);
    });
  }
  function scheduleEarningsTransition() {
    clearTimeout(earningsTimer);
    if (!allowed) return;
    const now = new Date();
    const { minutes, seconds } = indiaClock(now);
    const delay = (24 * 60 - minutes) * 60_000 - seconds * 1_000 - now.getMilliseconds();
    earningsTimer = setTimeout(async () => {
      await load();
      render();
      scheduleEarningsTransition();
    }, Math.max(1_000, delay));
  }
  function inputField(parent, label, type = 'text') {
    const wrap = node('label', label); const input = node('input'); input.type = type; wrap.append(input); parent.append(wrap); return input;
  }
  function checkField(parent, label) { const wrap = node('label', undefined, 'consent'); const input = node('input'); input.type = 'checkbox'; input.required = true; wrap.append(input, node('span', label)); parent.append(wrap); return input; }
  function submitButton(form, text) { const button = node('button', text, 'secondary-action'); button.type = 'submit'; form.append(button); return button; }
  async function act(order, action, body) {
    if (busy || !allowed) return;
    const controls = [...$('#operator-orders').querySelectorAll('button,input,select,textarea')].map(el => [el, el.disabled]);
    let saved = false;
    busy = true; message('Saving this update…'); controls.forEach(([el]) => { el.disabled = true; });
    $('#operator-orders').setAttribute('aria-busy', 'true');
    try {
      if (preview) {
        if (action === 'payment-review') { order.paymentStatus = body.decision === 'approve' ? 'paid' : 'rejected'; order.paymentMethod = 'manual_upi'; order.paymentReviewNote = body.reason || 'Preview approval only'; }
        if (action === 'quote') { order.quoteAmountPaise = body.amountPaise; order.reviewStatus = 'approved'; order.status = 'accepted'; }
        if (action === 'status') order.status = body.status;
        if (action === 'cash') { order.paymentStatus = 'paid'; order.paymentMethod = 'cash'; }
        message('PREVIEW updated. No real order, payment or bank record was changed.'); render();
      } else {
        const result = await api.operatorAction(order.id, action, body);
        if (result.order) Object.assign(order, result.order); else await load();
        message('Saved. The student’s dashboard refreshes automatically.');
      }
      saved = true;
    } catch (error) { message(error.message); }
    finally {
      busy = false; $('#operator-orders').removeAttribute('aria-busy');
      if (saved) { editing = false; render(); }
      else { editing = true; controls.forEach(([el, disabled]) => { el.disabled = disabled; }); }
      renderShop();
    }
  }
  function paymentReview(card, order) {
    const claim = order.manualPayment;
    if (declarationMode || order.paymentStatus !== 'pending_verification' || !claim) return;
    const area = node('section', undefined, 'operator-action');
    area.append(node('h2', 'Check this payment'), node('p', `Expected receipt: ${money(claim.amountPaise)} | Reference: ${claim.reference}`, 'notice'), node('p', `Recipient: ${claim.payee.name} (${claim.payee.upiId})`, 'microcopy'));
    const form = node('form', undefined, 'setting-grid');
    const choiceLabel = node('label', 'Decision'); const choice = node('select');
    ['Confirm receipt','Reject claim'].forEach((text, i) => { const option = node('option', text); option.value = i ? 'reject' : 'approve'; choice.append(option); }); choiceLabel.append(choice); form.append(choiceLabel);
    const amount = inputField(form, 'Amount actually received (Rs)', 'number'); amount.min = '1'; amount.step = '0.01'; amount.required = true;
    const reason = inputField(form, 'Reason if rejecting'); reason.maxLength = 300;
    const checked = checkField(form, 'I checked the recipient bank/UPI records and matched the reference, receiver and full amount.');
    const save = submitButton(form, 'Confirm received payment');
    choice.addEventListener('change', () => { const approve = choice.value === 'approve'; amount.required = approve; checked.required = approve; reason.required = !approve; reason.minLength = approve ? 0 : 5; save.textContent = approve ? 'Confirm received payment' : 'Reject payment claim'; });
    form.addEventListener('submit', event => {
      event.preventDefault(); const receivedAmountPaise = Math.round(Number(amount.value) * 100);
      if (choice.value === 'approve' && receivedAmountPaise !== claim.amountPaise) { message('The received amount does not match. Do not approve; resolve the difference with the student.'); return; }
      act(order, 'payment-review', { decision: choice.value, claimId: claim.claimId, receivedAmountPaise, receiptChecked: checked.checked, reason: reason.value.trim() });
    }); area.append(form); card.append(area);
  }
  function render() {
    renderEarnings();
    slotVisibility = slotVisibilityKey();
    const list = $('#operator-orders'); list.replaceChildren();
    const active = orders.filter(order => !['collected','cancelled'].includes(order.status) && !isPickupSlotExpired(order));
    $('#count-active').textContent = active.length;
    $('#count-payments').textContent = active.filter(o => o.paymentStatus === 'pending_verification').length;
    $('#count-ready').textContent = active.filter(o => o.status === 'ready').length;
    const selected = filter === 'history' ? orders.filter(order => ['collected','cancelled'].includes(order.status) || isPickupSlotExpired(order)) : active.filter(order => filter === 'all' || (filter === 'pending' ? order.paymentStatus === 'pending_verification' : order.status === filter));
    if (!selected.length) { list.append(node('div', allowed ? 'No orders in this queue.' : 'Operator access is required to view orders.', 'panel empty-orders')); return; }
    selected.sort((a,b) => Number(b.priority === true) - Number(a.priority === true) || new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
    selected.forEach(order => {
      const card = node('article', undefined, 'panel order-card' + (order.priority ? ' priority-order' : ''));
      if (order.priority) card.append(node('strong', 'URGENT · Priority order · ₹8 extra included', 'priority-badge'));
      const slotExpired = isPickupSlotExpired(order);
      const labels = { accepted: 'New order', submitted: 'Older order', printing: 'Printing', ready: 'Ready to collect', collected: 'Collected', cancelled: 'Cancelled', unpaid: 'Unpaid', paid: 'Paid', declared_paid: 'Declared paid (student)', pending_verification: 'Payment to check', rejected: 'Payment not confirmed' };
      const top = node('div', undefined, 'order-card-top'); const heading = node('div');
      const title = node('h2', '#' + order.id.slice(0, 8).toUpperCase()); title.title = order.id;
      heading.append(title, node('p', order.email)); top.append(heading, node('span', `${labels[order.status] || order.status} / ${labels[order.paymentStatus] || order.paymentStatus}`, 'status-pill')); card.append(top);
      if (order.collectionSlot) {
        const slot = order.collectionSlot;
        const badge = node('div', undefined, 'collection-slot shop-slot');
        badge.append(node('strong', 'Slot ' + slot.slot + ' / No. ' + String(slot.number).padStart(3, '0')), node('span', slot.date + ' | ' + slot.startHour + ':00-' + slot.endHour + ':00 IST'));
        card.append(badge);
      }
      (order.trendingPrints || []).forEach(item => card.append(node('p', `Trending quick print: ${item.title} · ${money(item.pricePaise)}`, 'operator-file')));
      (order.files || []).forEach((file, index) => {
        const s = file.settings; const row = node('p', undefined, 'operator-file');
        row.append(node('strong', file.name));
        const specs = node('span', undefined, 'print-specs');
        [s.copies + ' copies', s.colour === 'bw' ? 'Black & white' : 'Colour', s.sides === 'double' ? 'Double-sided' : 'Single-sided', s.size, 'Pages: ' + (s.range || 'all (' + s.pages + ')'), (s.orientation || 'portrait'), (s.layout || 1) + ' per side'].forEach(label => specs.append(node('span', label)));
        row.append(specs);
        if (file.pageCountSource === 'manual') row.append(node('strong', 'Student-entered page count: ' + s.pages + ' — check the file before printing.', 'manual-page-warning'));
        const download = node('button', preview ? 'Preview file unavailable' : 'Download document', 'quiet'); download.disabled = preview;
        if (order.documentsDeleted) { download.disabled = true; download.textContent = 'File deleted after collection'; }
        download.addEventListener('click', async () => { download.disabled = true; download.textContent = 'Downloading…'; try { await api.download(order.id, index, file.name); } catch (error) { message(error.message); } finally { download.disabled = false; download.textContent = 'Download document'; } }); row.append(download); card.append(row);
      });
      card.append(node('p', `Order total: ${Number.isInteger(order.quoteAmountPaise) ? money(order.quoteAmountPaise) : 'Legacy order - contact student'} | Pickup: ${order.pickupTime ? new Date(order.pickupTime).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) + ' IST' : 'When ready'}`, 'microcopy'));
      if (order.notes) card.append(node('p', 'Student note: ' + order.notes, 'notice'));
      if (slotExpired) { card.append(node('p', 'Pickup slot passed. This order is archived from the active queue; the order record is retained.', 'notice')); list.append(card); return; }
      if (order.uid === actor.uid) { card.append(node('p', 'This is your student order. Another authorized operator must handle its payment and status.', 'notice')); list.append(card); return; }
      if (['collected', 'cancelled'].includes(order.status)) { list.append(card); return; }
      paymentReview(card, order);
      if (!declarationMode && order.reviewStatus === 'approved' && order.paymentStatus === 'unpaid' && !order.providerOrderId && !['cancelled','collected'].includes(order.status)) {
        const cash = node('form', undefined, 'operator-action setting-grid'); const received = inputField(cash, 'Cash received at counter (Rs)', 'number'); received.step = '0.01'; received.required = true; received.min = '1';
        const noUpi = order.lockedAmountPaise ? checkField(cash, 'I checked the recipient account: no UPI transfer was received for this order.') : null;
        const checked = checkField(cash, 'I have received the full cash amount.'); submitButton(cash, 'Confirm cash received');
        cash.addEventListener('submit', event => { event.preventDefault(); act(order, 'cash', { amountPaise: Math.round(Number(received.value) * 100), receiptChecked: checked.checked, noUpiReceived: noUpi ? noUpi.checked : true }); }); card.append(cash);
      }
      const next = { accepted: 'printing', printing: 'ready', ready: 'collected' }[order.status];
      const pagesCheck = next === 'printing' && order.files.some(file => file.pageCountSource === 'manual') ? checkField(card, 'I checked the student-entered page counts in the documents. If they differ, contact the student before printing.') : null;
      if (next) { const button = node('button', { printing: 'Start printing', ready: 'Mark ready to collect', collected: 'Confirm handed over' }[next], 'secondary-action'); button.disabled = next === 'collected' && !['paid','declared_paid'].includes(order.paymentStatus); button.addEventListener('click', () => { if (pagesCheck && !pagesCheck.checked) { message('Check the page counts in the downloaded documents first.'); pagesCheck.focus(); return; } act(order, 'status', { status: next, pagesChecked: pagesCheck?.checked === true }); }); card.append(button); }
      if (['submitted', 'accepted'].includes(order.status) && order.paymentStatus === 'unpaid' && !order.lockedAmountPaise && !order.providerOrderId) {
        const cancel = node('button', 'Cancel unprinted order', 'quiet');
        cancel.addEventListener('click', () => { if (window.confirm('Cancel this unprinted order? The student will see it as cancelled.')) act(order, 'status', { status: 'cancelled' }); }); card.append(cancel);
      }
      list.append(card);
    });
  }
  async function load() {
    if (!allowed) return;
    if (!preview) {
      const results = await Promise.allSettled([refreshShop(), api.operatorOrders()]);
      if (results[1].status === 'fulfilled' && !busy) orders = results[1].value.orders;
      else if (results[1].status === 'rejected') message('Could not load orders: ' + results[1].reason.message);
    }
    render();
  }
  $('#operator-refresh').addEventListener('click', () => { if (!busy) (allowed ? load() : start()).catch(error => message(error.message)); });
  document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => { if (busy) return; filter = button.dataset.filter; document.querySelectorAll('[data-filter]').forEach(item => item.setAttribute('aria-pressed', String(item === button))); render(); }));
  async function start() {
    if (preview) {
      shop = { acceptingOrders: true };
      actor = { uid: 'preview-operator' }; allowed = true;
      $('#operator-email').textContent = 'Operator preview';
      $('#operator-banner').textContent = 'PREVIEW ONLY - approvals change this in-memory example. No real payments or student data.';
      $('#student-workspace').href = $('#header-student-link').href = 'dashboard.html?preview=1';
      orders = [{ id: 'PREVIEW-1042', uid: 'preview-student', email: 'Example student', status: 'ready', paymentStatus: 'pending_verification', reviewStatus: 'approved', lockedAmountPaise: 6000, quoteAmountPaise: 6000, notes: '', manualPayment: { claimId: 'preview-claim', amountPaise: 6000, reference: 'DEMO12345678', payee: { name: 'Example recipient', upiId: 'example-only' } }, files: [{ name: 'Example assignment.pdf', settings: { copies: 1, pages: 12, colour: 'bw', sides: 'double', size: 'A4', range: '' } }] }];
    } else {
      try {
        actor = await window.KitswAuth.current();
        if (!actor?.emailVerified) { $('#operator-banner').textContent = 'Sign in with your verified student account first. Operator access is an extra permission on that same account.'; render(); return; }
        $('#operator-email').textContent = actor.email;
        allowed = (await api.me()).isOperator;
        if (api.configuration) declarationMode = (await api.configuration()).paymentMode === 'self_declared';
        $('#count-payments').closest('.panel').hidden = declarationMode;
        $('[data-filter=pending]').hidden = declarationMode;
        if (declarationMode) { $('.sidebar-note strong').textContent = 'Print. Prepare. Hand over.'; $('.sidebar-note p').textContent = 'Students confirm payment before new orders arrive. Declared paid means student-confirmed, not bank-verified. No payment approval step is needed.'; }
        $('#operator-banner').textContent = allowed ? 'Operator workspace - your student account remains available using the Student dashboard link.' : 'Your student account is active, but operator access has not been assigned.';
      } catch (error) { $('#operator-banner').textContent = error.message || 'Operator service unavailable. Server setup is required.'; }
    }
    try { await load(); } catch (error) { message(error.message); } render();
  }
  let shop = null;
  let shopError = '';
  async function refreshShop() {
    try {
      if (typeof api.shop !== 'function') throw Error('This page has an older app script. Reload the page with Ctrl + F5.');
      const state = await api.shop();
      if (typeof state.acceptingOrders !== 'boolean') throw Error('The server returned an invalid shop status.');
      shop = state; shopError = '';
    } catch (error) { shop = null; shopError = error.message || 'Connection failed. Use Refresh to retry.'; }
    renderShop();
  }
  function renderShop() {
    if (!shop) { $('#shop-status').textContent = 'Shop availability unavailable'; $('#shop-status-detail').textContent = shopError || (allowed ? 'Checking the shop connection. Use Refresh to retry.' : 'Sign in with an authorized shop account to manage availability.'); $('#shop-toggle').disabled = true; $('#shop-toggle').textContent = 'Use Refresh to reconnect'; return; }
    $('#shop-status').textContent = shop.acceptingOrders ? 'Open - accepting orders' : 'Busy - new orders paused';
    $('#shop-toggle').textContent = shop.acceptingOrders ? 'Pause new orders' : 'Resume accepting orders';
    $('#shop-toggle').disabled = !allowed || busy;
    $('#shop-status-detail').textContent = shop.acceptingOrders ? 'Students can place fixed-price orders now.' : 'Students can track and pay for existing orders, but cannot place new ones.';
  }
  $('#shop-toggle').addEventListener('click', async () => {
    if (!allowed || busy) return;
    $('#shop-toggle').disabled = true;
    try { shop = preview ? { acceptingOrders: !shop.acceptingOrders } : await api.setShop(!shop.acceptingOrders); message(preview ? 'PREVIEW: shop availability changed locally.' : 'Shop availability updated for students.'); }
    catch (error) { message(error.message); }
    finally { renderShop(); }
  });
  start().then(() => { renderShop(); scheduleEarningsTransition(); });
  // Fetch new approvals without erasing a receipt review being edited.
  let editing = false, polling = false;
  $('#operator-orders').addEventListener('input', () => { editing = true; });
  $('#operator-refresh').addEventListener('click', () => { editing = false; });
  setInterval(async () => {
    if (preview || !allowed || busy || polling || document.hidden) return;
    polling = true;
    try {
      await refreshShop();
      if (editing) return;
      const latest = (await api.operatorOrders()).orders;
      const slotChanged = slotVisibilityKey(latest) !== slotVisibility;
      if (!busy && !editing && (slotChanged || JSON.stringify(latest) !== JSON.stringify(orders))) { orders = latest; render(); }
    } catch { message('Could not refresh approvals. Use Refresh to retry.'); }
    finally { polling = false; }
  }, 10000);
})();
