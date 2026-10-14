(() => {
  const $ = selector => document.querySelector(selector);
  const api = window.OrderService;
  const preview = new URLSearchParams(location.search).get('preview') === '1';
  const earningsPage = document.body.classList.contains('earnings-dashboard');
  const money = value => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(value / 100);
  const node = (tag, text, css) => { const el = document.createElement(tag); if (text !== undefined) el.textContent = text; if (css) el.className = css; return el; };
  let declarationMode = false, brotherTestBridge = false, bridgePairing = '';
  let orders = [], actor, allowed = false, busy = false, loading = false, filter = 'all';
  let earningsTimer;
  const unreadOrders = new Set();
  let knownOrders = null;
  function observeOrders(latest, apply = true) {
    if (!Array.isArray(latest)) throw Error('The server returned an invalid order list.');
    if (!knownOrders) {
      try { knownOrders = new Set(JSON.parse(localStorage.getItem('theeskapooo:operator-seen:' + actor.uid) || '[]')); } catch { knownOrders = new Set(); }
    }
    const fresh = latest.filter(order => !knownOrders.has(order.id) && !['collected', 'cancelled'].includes(order.status));
    fresh.forEach(order => unreadOrders.add(order.id));
    if (fresh.length) window.AppNotifications?.notify(fresh.length === 1 ? 'New print order' : fresh.length + ' new print orders', 'Open the shop dashboard to view them.', 'operator-orders', 'operator.html');
    latest.forEach(order => knownOrders.add(order.id));
    // Persist acknowledgements only; unseen cards remain highlighted after reopening.
    if (apply) orders = latest;
    return fresh.length;
  }
  function acknowledge(order) {
    unreadOrders.delete(order.id);
    try { localStorage.setItem('theeskapooo:operator-seen:' + actor.uid, JSON.stringify([...knownOrders || []].filter(id => !unreadOrders.has(id)).slice(-2000))); } catch {}
  }
  const paid = order => ['paid', 'declared_paid'].includes(order.paymentStatus);
  const waitingOffline = order => order.paymentPreference === 'offline' && !paid(order);
  const queueTime = order => order.paymentReceivedMs || Date.parse(order.createdAt) || 0;
  function matchesFilter(order) {
    const completed = ['collected', 'cancelled'].includes(order.status);
    if (filter === 'history') return completed;
    if (completed) return false;
    return filter === 'all' || (filter === 'pending' ? order.paymentStatus === 'pending_verification' : order.status === filter);
  }
  function setFilter(next) {
    filter = next;
    document.querySelectorAll('[data-filter]').forEach(item => item.setAttribute('aria-pressed', String(item.dataset.filter === filter)));
  }
  function applyLatestOrders(latest) {
    const currentIds = new Set(orders.map(order => order.id));
    const newActiveOrders = latest.filter(order => !currentIds.has(order.id) && !['collected', 'cancelled'].includes(order.status));
    observeOrders(latest);
    if (newActiveOrders.some(order => !matchesFilter(order))) {
      setFilter('all');
      message('A new order arrived. Showing all active orders.');
    }
  }

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
  function indiaClock(date) {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(date);
    const value = type => Number(parts.find(part => part.type === type).value);
    return { minutes: value('hour') * 60 + value('minute'), seconds: value('second') };
  }
  function renderEarnings() {
    const history = $('#earnings-history');
    const section = $('#daily-earnings');
    if (!history || !section) return;
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
        const item = node('div', undefined, 'earnings-history-row');
        item.dataset.date = dateKey;
        const top = node('div', undefined, 'order-card-top');
        top.append(
          node('span', new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short' }).format(date)),
          node('strong', money(total))
        );
        item.append(top);
        days.append(item);
      }
    }

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
      acknowledge(order); saved = true;
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
    if (earningsPage) {
      renderEarnings();
      return;
    }
    renderEarnings();
    const list = $('#operator-orders'); list.replaceChildren();
    if ($('#queue-updates')) $('#queue-updates').hidden = true;
    const active = orders.filter(order => !['collected','cancelled'].includes(order.status));
    $('#count-active').textContent = active.length;
    $('#count-payments').textContent = active.filter(o => o.paymentStatus === 'pending_verification').length;
    $('#count-ready').textContent = active.filter(o => o.status === 'ready').length;
    const selected = orders.filter(matchesFilter);
    if (!selected.length) { list.append(node('div', allowed ? 'No orders in this queue.' : 'Operator access is required to view orders.', 'panel empty-orders')); return; }
    selected.sort((a,b) => filter === 'history'
      ? (b.closedMs || Date.parse(b.createdAt) || 0) - (a.closedMs || Date.parse(a.createdAt) || 0)
      : Number(waitingOffline(a)) - Number(waitingOffline(b)) || Number(paid(b)) - Number(paid(a)) || Number(b.priority === true) - Number(a.priority === true) || queueTime(a) - queueTime(b) || a.id.localeCompare(b.id));
    let offlineHeading = false;
    selected.forEach(order => {
      if (filter !== 'history' && waitingOffline(order) && !offlineHeading) { list.append(node('h2', 'Counter visits · awaiting payment', 'queue-heading')); offlineHeading = true; }

      const card = node('article', undefined, 'panel order-card' + (order.priority ? ' priority-order' : ''));
      if (order.priority) card.append(node('strong', 'URGENT · Priority order · ₹8 extra included', 'priority-badge'));
      card.dataset.orderId = order.id;
      if (unreadOrders.has(order.id)) {
        card.classList.add('new-order');
        const seen = node('button', 'NEW ORDER · Mark seen', 'new-order-badge');
        seen.addEventListener('click', () => { acknowledge(order); card.classList.remove('new-order'); seen.remove(); }); card.prepend(seen);
      }
      if (order.offlineNumber) {
        const code = node('div', undefined, 'collection-slot'); code.append(node('strong', 'Offline ID ' + String(order.offlineNumber).padStart(3, '0')));
        if (order.paymentAppointment) code.append(node('span', order.paymentAppointment.date + ' · Pay at ' + order.paymentAppointment.time + ' IST'), node('small', 'Payment deadline: ' + new Date(order.paymentAppointment.deadlineMs).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' })));
        card.append(code);
      }
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
      (order.trendingPrints || []).forEach(item => card.append(node('p', `Use saved shop document: ${item.title} · ${money(item.pricePaise)}`, 'operator-file')));
      (order.files || []).forEach((file, index) => {
        const s = file.settings; const row = node('p', undefined, 'operator-file');
        row.append(node('strong', file.name));
        const specs = node('span', undefined, 'print-specs');
        const image = /\.(jpg|jpeg|png|webp|heic|heif|bmp|gif|tif|tiff)$/i.test(file.name);
        [s.copies + ' copies', s.colour === 'bw' ? 'Black & white' : 'Colour', s.sides === 'double' ? 'Double-sided' : 'Single-sided', s.size, 'Pages: ' + (s.range || 'all (' + s.pages + ')'), (s.orientation || 'portrait'), image ? (s.layout || 1) + ' image' + (s.layout === 1 ? '' : 's') + ' per side' : (s.layout || 1) + ' page' + (s.layout === 1 ? '' : 's') + ' per side'].forEach(label => specs.append(node('span', label)));
        row.append(specs);
        if (brotherTestBridge && s.colour === 'bw') {
          const direct = node('button', 'Print on Brother (test)', 'primary-action');
          direct.disabled = preview || order.documentsDeleted || !['accepted','printing'].includes(order.status) || !paid(order) || order.uid === actor.uid;
          direct.addEventListener('click', async () => {
            if (!bridgePairing) bridgePairing = (window.prompt('Enter the pairing code displayed by the bridge on this laptop. Never paste Firebase or Supabase keys here.') || '').trim();
            if (!/^[a-f0-9]{48}$/.test(bridgePairing)) { bridgePairing = ''; message('Enter the bridge pairing code to continue.'); return; }
            const present = order.paymentPreference !== 'offline' || window.confirm('Is this student present at the printer, with their offline ID checked?');
            if (!present) return;
            direct.disabled = true; direct.textContent = 'Sending to Brother...';
            try { const result = await api.brotherPrint(order.id, index, bridgePairing, present); message(result.message); direct.textContent = 'Submitted - check printer'; }
            catch (error) { message(error.message); direct.textContent = 'Check laptop before retrying'; }
          }); row.append(direct);
        }
        row.append(node('strong', s.colour === 'colour' ? 'Printer: Canon · Colour · PDF only' : brotherTestBridge ? 'Test printer: Brother HL-L2321D · Paired Windows laptop' : 'Printer: Kyocera TASKalfa MZ3200i · Black & white', 'printer-destination'));
        if (/\.(pdf|png)$/i.test(file.name) && navigator.share && navigator.canShare) {
          const share = node('button', 'Prepare phone printing', 'primary-action document-share');
          let send = null;
          share.disabled = preview || order.documentsDeleted || ['collected','cancelled'].includes(order.status) || !['paid','declared_paid'].includes(order.paymentStatus) || Boolean(order.offlineNumber && order.status === 'accepted');
          if (share.disabled) share.title = 'Requires an active paid order. For offline orders, confirm the student is present and select Mark printing first.';
          share.addEventListener('click', async () => {
            share.disabled = true;
            try {
              if (!send) { send = await api.preparePrintShare(order.id, index, file.name); share.textContent = 'Open in print / PDF app →'; }
              else { await send(); send = null; share.textContent = 'Prepare phone printing'; message('File opened/shared. Choose Print in the receiving PDF/print app. Match the order settings on the phone or printer, then check the pages before marking ready.'); }
            } catch (error) { send = null; share.textContent = 'Prepare phone printing'; if (error.name !== 'AbortError') message(error.message); }
            finally { share.disabled = false; }
          });
          row.append(share);
        }
        if (file.pageCountSource === 'manual') row.append(node('strong', 'Student-entered page count: ' + s.pages + ' — check the file before printing.', 'manual-page-warning'));
        const download = node('button', preview ? 'Preview file unavailable' : '↓ Download document', 'primary-action document-download'); download.disabled = preview;
        if (order.documentsDeleted || order.status === 'collected') { download.disabled = true; download.textContent = 'File deleted after collection'; }
        download.addEventListener('click', async () => { download.disabled = true; download.textContent = 'Downloading…'; try { await api.download(order.id, index, file.name); acknowledge(order); card.classList.remove('new-order'); card.querySelector('.new-order-badge')?.remove(); } catch (error) { message(error.message); } finally { download.disabled = false; download.textContent = '↓ Download document'; } }); row.append(download);
        if (/\.(pdf|png|jpe?g|webp)$/i.test(file.name)) {
          const print = node('button', 'Open & print ↗', 'secondary-action document-print'); print.disabled = preview || order.documentsDeleted || order.status === 'collected';
          print.addEventListener('click', async () => {
            print.disabled = true; print.textContent = 'Opening…';
            try { await api.openForPrint(order.id, index, file.name); acknowledge(order); card.classList.remove('new-order'); card.querySelector('.new-order-badge')?.remove(); }
            catch (error) { message(error.message); }
            finally { print.disabled = false; print.textContent = 'Open & print ↗'; }
          }); row.append(print);
        }
        card.append(row);
      });
      card.append(node('p', `Order total: ${Number.isInteger(order.quoteAmountPaise) ? money(order.quoteAmountPaise) : 'Legacy order - contact student'} | Pickup: ${order.pickupTime ? new Date(order.pickupTime).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) + ' IST' : 'When ready'}`, 'order-key-details'));
      if (order.notes) card.append(node('p', 'Student note: ' + order.notes, 'notice'));
      if (order.uid === actor.uid) { card.append(node('p', 'This is your student order. Another authorized operator must handle its payment and status.', 'notice')); list.append(card); return; }
      if (['collected', 'cancelled'].includes(order.status)) { list.append(card); return; }
      paymentReview(card, order);
      if ((order.paymentPreference === 'offline' || !declarationMode) && order.reviewStatus === 'approved' && order.paymentStatus === 'unpaid' && !order.providerOrderId && !['cancelled','collected'].includes(order.status)) {
        const cash = node('form', undefined, 'operator-action setting-grid'); const received = inputField(cash, 'Cash received at counter (Rs)', 'number'); received.step = '0.01'; received.required = true; received.min = '1';
        const noUpi = order.lockedAmountPaise ? checkField(cash, 'I checked the recipient account: no UPI transfer was received for this order.') : null;
        const checked = checkField(cash, 'I have received the full cash amount.'); submitButton(cash, 'Confirm cash received');
        const studentPresent = order.offlineNumber ? checkField(cash, 'The student is present and I matched their offline identification number.') : null;
        cash.addEventListener('submit', event => {
          event.preventDefault();
          if (!checked.checked || (noUpi && !noUpi.checked) || (studentPresent && !studentPresent.checked)) { message('Confirm receipt, any required UPI check, and the student identification before saving cash payment.'); return; }
          act(order, 'cash', { amountPaise: Math.round(Number(received.value) * 100), receiptChecked: checked.checked, noUpiReceived: noUpi ? noUpi.checked : true, studentPresent: studentPresent ? studentPresent.checked : true });
        }); card.append(cash);
      }
      const next = { accepted: 'printing', printing: 'ready', ready: 'collected' }[order.status];
      const pagesCheck = next === 'printing' && (order.files || []).some(file => file.pageCountSource === 'manual') ? checkField(card, 'I checked the student-entered page counts in the documents. If they differ, contact the student before printing.') : null;
      const studentPresent = next === 'printing' && order.paymentPreference === 'offline' ? checkField(card, 'The student is present and I matched their offline identification number before printing.') : null;
      if (next) { const button = node('button', { printing: 'Mark printing', ready: 'Mark ready to collect', collected: 'Confirm handed over' }[next], 'secondary-action'); button.disabled = (next === 'collected' && !['paid','declared_paid'].includes(order.paymentStatus)) || (next === 'printing' && !['paid','declared_paid'].includes(order.paymentStatus)); button.addEventListener('click', () => { if (pagesCheck && !pagesCheck.checked) { message('Check the page counts in the downloaded documents first.'); pagesCheck.focus(); return; } if (studentPresent && !studentPresent.checked) { message('Confirm the student is present and match their offline identification number before printing.'); studentPresent.focus(); return; } act(order, 'status', { status: next, pagesChecked: pagesCheck?.checked === true, studentPresent: studentPresent?.checked === true }); }); card.append(button); }
      if (['submitted', 'accepted'].includes(order.status) && order.paymentStatus === 'unpaid' && !order.lockedAmountPaise && !order.providerOrderId) {
        const cancel = node('button', 'Cancel unprinted order', 'quiet');
        cancel.addEventListener('click', () => { if (window.confirm('Cancel this unprinted order? The student will see it as cancelled.')) act(order, 'status', { status: 'cancelled' }); }); card.append(cancel);
      }
      list.append(card);
    });
  }
  async function load(manual = false) {
    if (!allowed) return;
    if (loading) { if (manual) message('A refresh is already running…'); return; }
    loading = true;
    const button = $('#operator-refresh'); button.disabled = true; button.textContent = 'Refreshing…'; button.setAttribute('aria-busy', 'true');
    try {
      if (!preview) {
        const results = await Promise.allSettled([earningsPage ? Promise.resolve() : refreshShop(), api.operatorOrders()]);
        if (results[1].status === 'rejected') throw results[1].reason;
        if (!busy) applyLatestOrders(results[1].value.orders);
      }
      render();
      if (manual) message(shopError && !earningsPage ? 'Orders updated. Shop status unavailable: ' + shopError : 'Updated just now.');
    } catch (error) { message('Could not load orders: ' + error.message); }
    finally { loading = false; button.disabled = false; button.textContent = 'Refresh'; button.removeAttribute('aria-busy'); }
  }
  $('#operator-refresh').addEventListener('click', async () => {
    if (busy) { message('Your update is being saved. Refresh after it finishes.'); return; }
    editing = false;
    await (allowed ? load(true) : start());
  });
  document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => { if (busy) return; setFilter(button.dataset.filter); render(); }));
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
        if (api.configuration) { const configuration = await api.configuration(); declarationMode = configuration.paymentMode === 'self_declared'; brotherTestBridge = configuration.brotherTestBridge === true; }
        const paymentCount = $('#count-payments');
        if (paymentCount) paymentCount.closest('.panel').hidden = declarationMode;
        const pendingFilter = $('[data-filter=pending]');
        if (pendingFilter) pendingFilter.hidden = declarationMode;
        if (declarationMode) { $('.sidebar-note strong').textContent = 'Print. Prepare. Hand over.'; $('.sidebar-note p').textContent = 'Students confirm payment before new orders arrive. Declared paid means student-confirmed, not bank-verified. No payment approval step is needed.'; }
        $('#operator-banner').hidden = allowed;
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
    if (!$('#shop-status') || !$('#shop-status-detail') || !$('#shop-toggle')) return;
    if (!shop) { $('#shop-status').textContent = 'Shop availability unavailable'; $('#shop-status-detail').textContent = shopError || (allowed ? 'Checking the shop connection. Use Refresh to retry.' : 'Sign in with an authorized shop account to manage availability.'); $('#shop-toggle').disabled = true; $('#shop-toggle').textContent = 'Use Refresh to reconnect'; return; }
    $('#shop-status').textContent = shop.acceptingOrders ? 'Open - accepting orders' : 'Busy - new orders paused';
    $('#shop-toggle').textContent = shop.acceptingOrders ? 'Pause new orders' : 'Resume accepting orders';
    $('#shop-toggle').disabled = !allowed || busy;
    $('#shop-status-detail').textContent = shop.acceptingOrders ? 'Students can place fixed-price orders now.' : 'Students can track and pay for existing orders, but cannot place new ones.';
  }
  const shopToggle = $('#shop-toggle');
  if (shopToggle) shopToggle.addEventListener('click', async () => {
    if (!allowed || busy) return;
    shopToggle.disabled = true;
    try { shop = preview ? { acceptingOrders: !shop.acceptingOrders } : await api.setShop(!shop.acceptingOrders); message(preview ? 'PREVIEW: shop availability changed locally.' : 'Shop availability updated for students.'); }
    catch (error) { message(error.message); }
    finally { renderShop(); }
  });
  start().then(() => { renderShop(); scheduleEarningsTransition(); });
  // Fetch new approvals without erasing a receipt review being edited.
  let editing = false, polling = false;
  $('#operator-orders')?.addEventListener('input', () => { editing = true; });
  $('#operator-refresh').addEventListener('click', () => { editing = false; });
  setInterval(async () => {
    if (preview || !allowed || busy || loading || polling || document.hidden) return;
    polling = true;
    try {
      if (!earningsPage) await refreshShop();
      const latest = (await api.operatorOrders()).orders;
      if (editing && !busy) {
        const fresh = observeOrders(latest, false);
        if (fresh && $('#queue-updates')) { $('#queue-updates').hidden = false; $('#queue-updates').textContent = 'New orders have arrived. Finish this entry, then refresh to see them.'; }
        return;
      }
      if (!busy && !editing && !loading && JSON.stringify(latest) !== JSON.stringify(orders)) { applyLatestOrders(latest); render(); }
    } catch { message('Could not refresh approvals. Use Refresh to retry.'); }
    finally { polling = false; }
  }, 10000);
})();
