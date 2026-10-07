(() => {
  const $ = selector => document.querySelector(selector);
  const core = window.PrintCore;
  const demo = new URLSearchParams(location.search).get('preview') === '1';
  const money = value => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(value);
  const fields = ['copies','pages','colour','sides','size','orientation','range','layout','binding'];
  let files = [], selected = null, orders = [], filter = 'all', user = null, trendingPrints = [], selectedTrendingPrintIds = new Set();
  let shopAccepting = null;
  let config = { ordersEnabled: false, paymentsEnabled: false }, working = false, previewURL = null, paymentOrder = null;
  let pendingSubmission = null;
  let checkoutDraft = null, confirmingPayment = false;
  const declarationMode = () => config.paymentMode === 'self_declared';
  const offlinePayment = () => $('[name=payment]:checked')?.value === 'offline';
  const appointmentInput = () => ({ date: $('#payment-date').value, time: $('#payment-time').value });
  let pageQueue = Promise.resolve();
  const node = (tag, text, className) => { const el = document.createElement(tag); if (text !== undefined) el.textContent = text; if (className) el.className = className; return el; };
  function tell(selector, text) { const el = $(selector); el.textContent = text; el.hidden = !text; }
  function setView(view) {
    for (const name of ['new','orders','guide']) $(`#${name}-view`).hidden = name !== view;
    document.querySelectorAll('[data-view]').forEach(button => { const active = button.dataset.view === view; button.classList.toggle('active', active); if (active) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current'); });
    $('#breadcrumb-current').textContent = { new: 'New print order', orders: 'My orders', guide: 'Printing guide' }[view];
    if (view === 'orders') refreshOrders();
  }
  document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => setView(button.dataset.view)));
  function readSettings() {
    if (!selected || working) return;
    const item = files.find(file => file.id === selected);
    for (const key of fields.filter(key => key !== 'pages' || item.manualPages)) item.settings[key] = ['copies','pages','layout'].includes(key) ? Number($('#' + key).value) : $('#' + key).value;
    pendingSubmission = null;
    updateSummary();
  }
  fields.forEach(key => $('#' + key).addEventListener('input', readSettings));
  function chooseFile(id) {
    selected = id;
    const item = files.find(file => file.id === id);
    $('#settings-fields').disabled = !item || working;
    $('#settings-empty').hidden = Boolean(item);
    $('#selected-name').textContent = item?.file.name || 'No file selected';
    if (item) {
      fields.forEach(key => { $('#' + key).value = item.settings[key]; });
      $('#pages').readOnly = !item.manualPages;
      $('#pages').closest('label').classList.toggle('manual-pages', Boolean(item.manualPages));
      if (item.counting || item.countError || !item.settings.pages) $('#pages').value = '';
      $('#pages').placeholder = item.counting ? 'Counting...' : item.manualPages ? 'Enter pages to print' : 'Unavailable';
      $('#page-source').textContent = item.counting ? 'Counting pages...' : item.countError || (item.manualPages ? 'Enter the page count from Print Preview in your document app. The shop checks it before printing. PDF gives the most predictable layout.' : 'Automatically counted. No entry needed.');
    } else { $('#pages').value = ''; $('#page-source').textContent = 'Select a file to detect its pages.'; }
    renderFiles();
  }
  function renderFiles() {
    const list = $('#file-list'); list.replaceChildren();
    files.forEach(item => {
      const row = node('div', undefined, 'file-row' + (item.id === selected ? ' selected' : ''));
      row.append(node('span', item.file.name.split('.').pop().toUpperCase(), 'file-symbol'));
      const pick = node('button', undefined, 'file-pick'); pick.type = 'button'; pick.disabled = working;
      const pageLabel = item.counting ? 'Counting pages...' : item.countError ? 'Cannot read file' : item.manualPages ? (item.settings.pages ? item.settings.pages + ' pages · entered by you' : 'Enter page count below') : item.settings.pages + ' pages · counted automatically';
      pick.append(node('strong', item.file.name), node('small', `${(item.file.size / 1024).toFixed(1)} KB · ${pageLabel} · ${item.settings.copies} cop${item.settings.copies === 1 ? 'y' : 'ies'}`));
      pick.addEventListener('click', () => chooseFile(item.id));
      const remove = node('button', '×', 'remove-file'); remove.type = 'button'; remove.disabled = working; remove.setAttribute('aria-label', `Remove ${item.file.name}`);
      remove.addEventListener('click', () => { files = files.filter(file => file.id !== item.id); pendingSubmission = null; chooseFile(files.some(file => file.id === selected) ? selected : files[0]?.id); updateSummary(); });
      row.append(pick, remove); list.append(row);
    });
  }
  function addFiles(incoming) {
    if (working) return;
    const errors = [];
    for (const file of incoming) {
      const error = core.fileError(file);
      if (error) { errors.push(`${file.name}: ${error}`); continue; }
      if (files.length + selectedTrendingPrintIds.size >= 10) { errors.push('Only 10 print items are allowed per order.'); break; }
      if (files.reduce((sum, item) => sum + item.file.size, 0) + file.size > 100 * 1024 * 1024) { errors.push(`${file.name}: the order would exceed 100 MB.`); continue; }
      if (files.some(item => item.file.name === file.name && item.file.size === file.size && item.file.lastModified === file.lastModified)) { errors.push(`${file.name} is already selected.`); continue; }
      const image = /\.(jpg|jpeg|png|webp|heic|tif|tiff)$/i.test(file.name);
      const item = { id: crypto.randomUUID(), file, image, counting: true, settings: { ...core.defaults, pages: 0 } };
      files.push(item);
      pageQueue = pageQueue.then(async () => {
        if (!files.includes(item)) return;
        try {
          const count = await window.DocumentPages.count(file);
          item.manualPages = count === null;
          item.settings.pages = count === null ? 0 : count;
          item.countError = '';
        } catch (error) { item.countError = error.message || 'Could not count pages. Export to PDF and try again.'; }
        finally {
          item.counting = false;
          if (files.includes(item)) { if (selected === item.id) chooseFile(item.id); updateSummary(); }
        }
      });
    }
    pendingSubmission = null;
    chooseFile(selected || files[0]?.id);
    tell('#file-feedback', errors.join(' ')); updateSummary();
  }
  $('#file-input').addEventListener('change', event => { addFiles(event.target.files); event.target.value = ''; });
  const zone = $('#drop-zone');
  ['dragover','dragenter'].forEach(type => zone.addEventListener(type, event => { event.preventDefault(); zone.classList.add('dragover'); }));
  ['dragleave','drop'].forEach(type => zone.addEventListener(type, event => { event.preventDefault(); zone.classList.remove('dragover'); }));
  zone.addEventListener('drop', event => addFiles(event.dataTransfer.files));
  $('#apply-all').addEventListener('click', () => {
    const source = files.find(file => file.id === selected);
    if (!source) return;
    for (const item of files) { const { pages, range } = item.settings; item.settings = { ...source.settings, pages, range }; }
    pendingSubmission = null; renderFiles(); updateSummary();
  });
  function totals() {
    const total = files.reduce((total, item) => { const result = core.estimate(item.settings); ['amount','sheets','printedSides','minutes'].forEach(key => total[key] += result[key]); total.needsQuote ||= result.needsQuote; return total; }, { amount: 0, sheets: 0, printedSides: 0, minutes: 0, needsQuote: false });
    for (const id of selectedTrendingPrintIds) {
      const print = trendingPrints.find(item => item.id === id);
      if (!print) throw Error('A selected quick print is no longer available. Refresh the list and choose it again.');
      total.amount += print.pricePaise / 100;
    }
    if ((files.length || selectedTrendingPrintIds.size) && $('#urgent-order').checked) total.amount += core.priorityFee;
    return total;
  }
  function renderTrendingPrints() {
    const list = $('#trending-print-list'); list.replaceChildren();
    if (!trendingPrints.length) { list.append(node('p', 'No trending quick prints are available right now.', 'empty-orders')); return; }
    trendingPrints.forEach(item => {
      const label = node('label', undefined, 'trending-print-choice');
      const checkbox = node('input'); checkbox.type = 'checkbox'; checkbox.checked = selectedTrendingPrintIds.has(item.id); checkbox.disabled = working || (!checkbox.checked && files.length + selectedTrendingPrintIds.size >= 10);
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) selectedTrendingPrintIds.add(item.id); else selectedTrendingPrintIds.delete(item.id);
        pendingSubmission = null; updateSummary();
      });
      label.append(checkbox, node('strong', item.title), node('span', money(item.pricePaise / 100), 'trending-print-price'));
      list.append(label);
    });
  }
  function updateTrendingChoices() {
    const atLimit = files.length + selectedTrendingPrintIds.size >= 10;
    document.querySelectorAll('#trending-print-list input[type=checkbox]').forEach(input => { input.disabled = working || (!input.checked && atLimit); });
  }
  async function refreshTrendingPrints() {
    if (!window.OrderService.trendingPrints) return;
    try {
      const result = await window.OrderService.trendingPrints();
      if (!Array.isArray(result.prints)) throw Error('The shop returned an invalid quick-print list.');
      const previous = trendingPrints;
      trendingPrints = result.prints.filter(item => typeof item.id === 'string' && typeof item.title === 'string' && Number.isSafeInteger(item.pricePaise) && item.pricePaise > 0);
      const changedSelection = [...selectedTrendingPrintIds].filter(id => {
        const before = previous.find(item => item.id === id), current = trendingPrints.find(item => item.id === id);
        return !current || (before && (before.title !== current.title || before.pricePaise !== current.pricePaise));
      });
      changedSelection.forEach(id => selectedTrendingPrintIds.delete(id));
      if (changedSelection.length) {
        pendingSubmission = null;
        tell('#trending-print-feedback', 'A selected quick print changed or was removed. Review your selection and updated total.');
      } else tell('#trending-print-feedback', '');
    } catch (error) { tell('#trending-print-feedback', 'Quick prints could not be loaded: ' + (error.message || 'Use Check connection to retry.')); }
    renderTrendingPrints(); updateSummary();
  }
  function updateSummary() {
    const list = $('#summary-files'); list.replaceChildren(); let error = '';
    files.forEach(item => {
      const row = node('p'); row.append(node('span', item.file.name));
      try { if (item.counting || item.countError) throw Error(item.countError || 'Counting pages...'); const result = core.estimate(item.settings); row.append(node('span', result.needsQuote && !result.amount ? 'Quote required' : money(result.amount) + (result.needsQuote ? ' + quote' : ''))); }
      catch (e) { error = `${item.file.name}: ${e.message}`; row.append(node('span', 'Check settings')); }
      list.append(row);
    });
    let missingTrendingPrint = false;
    for (const id of selectedTrendingPrintIds) {
      const item = trendingPrints.find(print => print.id === id);
      if (!item) { missingTrendingPrint = true; continue; }
      const row = node('p'); row.append(node('span', item.title + ' · Quick print'), node('span', money(item.pricePaise / 100))); list.append(row);
    }
    if (!files.length && !selectedTrendingPrintIds.size) list.textContent = 'Your print selections will appear here.';
    $('#total-files').textContent = files.length + selectedTrendingPrintIds.size;
    $('#priority-summary').hidden = !(files.length || selectedTrendingPrintIds.size) || !$('#urgent-order').checked;
    try {
      if (files.some(item => item.counting || item.countError)) throw Error('Page count pending');
      if (missingTrendingPrint) throw Error('A selected quick print is no longer available. Refresh the list and choose it again.');
      const total = totals();
      $('#total-sides').textContent = total.printedSides;
      $('#total-sheets').textContent = total.sheets;
      $('#total-price').textContent = total.needsQuote && !total.amount ? 'Shop quote' : money(total.amount) + (total.needsQuote ? ' + quote' : '');
      $('#total-time').textContent = files.length ? `About ${Math.max(5, total.minutes)}-${Math.max(10, total.minutes + 10)} minutes` : selectedTrendingPrintIds.size ? 'Shop will print your selected quick prints' : 'Choose a print item';
    }     catch (summaryError) { error ||= summaryError.message; $('#total-price').textContent = files.some(item => item.counting) ? 'Counting pages...' : 'Check selection'; $('#total-sides').textContent = '—'; $('#total-sheets').textContent = '—'; $('#total-time').textContent = 'Check your selections'; }
    tell('#summary-error', error);
    updateTrendingChoices();
    let reason = '';
    if (working) reason = 'Preparing your checkout. Keep this page open.';
    else if (!demo && !user) reason = 'Connecting to your account. If this persists, return to login.';
    else if (!demo && !config.ordersEnabled) reason = config.backendUnavailable || config.serviceUnavailable ? 'The shop connection is unavailable. Your files stay here; use Check connection to retry.' : 'Online ordering has not been activated by the shop yet.';
    else if (!demo && shopAccepting !== true) reason = shopAccepting === false ? 'The shop is busy and has paused new orders.' : 'Checking shop availability. Use Check connection if this persists.';
    else if (!demo && !offlinePayment() && declarationMode() && !config.paymentsEnabled) reason = 'UPI checkout has not been activated by the shop yet. Choose Pay at the shop or retry later.';
    else if (!files.length && !selectedTrendingPrintIds.size) reason = 'Add a document or choose a trending quick print to continue.';
    else if (error) reason = error;
    if (!reason && offlinePayment()) { try { core.paymentAppointment(appointmentInput()); } catch (error) { reason = error.message; } }
    if (!reason && !$('#review-confirm').checked) reason = 'Tick “I have checked my files and print settings” above to continue.';
    $('#place-order').disabled = Boolean(reason);
    $('#place-order').textContent = working ? 'Preparing checkout…' : demo ? 'Create preview order →' : offlinePayment() ? 'Place offline order →' : declarationMode() ? 'Continue to payment →' : 'Place order →';
    tell('#checkout-status', reason);
    $('#retry-connection').hidden = demo || Boolean(user && config.ordersEnabled && shopAccepting !== null && (!declarationMode() || config.paymentsEnabled));
    renderFiles();
  }
  $('#review-confirm').addEventListener('change', updateSummary);
  $('#urgent-order').addEventListener('change', () => { pendingSubmission = null; updateSummary(); });
  $('#pickup').addEventListener('change', () => { $('#pickup-time-label').hidden = $('#pickup').value !== 'later'; pendingSubmission = null; });
  ['notes','pickup-time'].forEach(id => $('#' + id).addEventListener('input', () => { pendingSubmission = null; }));
  document.querySelectorAll('[name=payment]').forEach(input => input.addEventListener('change', () => { pendingSubmission = null; configurePaymentMode(); updateSummary(); }));
  ['payment-date','payment-time'].forEach(id => $('#' + id).addEventListener('change', () => { pendingSubmission = null; updateSummary(); }));
  $('#preview-file').addEventListener('click', async () => {
    const item = files.find(file => file.id === selected); if (!item) return;
    if (previewURL) URL.revokeObjectURL(previewURL);
    const ext = item.file.name.split('.').pop().toLowerCase();
    $('#preview-title').textContent = item.file.name;
    const content = $('#preview-content'); content.replaceChildren();
    if (['jpg','jpeg','png','webp'].includes(ext)) { previewURL = URL.createObjectURL(item.file); const img = node('img'); img.src = previewURL; img.alt = item.file.name; content.append(img); }
    else if (ext === 'pdf') { previewURL = URL.createObjectURL(new Blob([item.file], { type: 'application/pdf' })); const frame = node('iframe'); frame.title = 'PDF document preview'; frame.setAttribute('sandbox', 'allow-same-origin'); frame.src = previewURL; content.append(frame); content.append(node('p', 'If the browser cannot display this PDF, review the original file before ordering.', 'microcopy')); }
    else if (['txt','csv'].includes(ext)) { const text = await item.file.slice(0, 200000).text(); content.append(node('pre', text)); if (item.file.size > 200000) content.append(node('p', 'Preview limited to the first 200 KB.', 'microcopy')); }
    else content.append(node('p', `Format: ${ext.toUpperCase()} · Size: ${(item.file.size / 1024).toFixed(1)} KB. A visual preview is not available for this format. Review the original or export to PDF.`, 'microcopy'));
    $('#preview-dialog').showModal();
  });
  $('#close-preview').addEventListener('click', () => $('#preview-dialog').close());
  $('#preview-dialog').addEventListener('close', () => { $('#preview-content').replaceChildren(); if (previewURL) URL.revokeObjectURL(previewURL); previewURL = null; });
  function lock(value) {
    working = value;
    document.querySelectorAll('#new-view input, #new-view select, #new-view textarea, #new-view button').forEach(el => { el.disabled = value; });
    $('#settings-fields').disabled = value || !files.length;
    renderTrendingPrints();
    updateSummary();
  }
  $('#place-order').addEventListener('click', async () => {
    if (working || $('#place-order').disabled) return;
    let total;
    try { if (files.some(item => item.counting || item.countError)) throw Error('Wait for page counting to finish or remove unreadable files.'); total = totals(); } catch (error) { tell('#summary-error', error.message); return; }
    let pickupTime = null;
    if (!offlinePayment() && $('#pickup').value === 'later') {
      // The shop operates in India. Interpret the user's selected wall time explicitly as IST.
      const value = $('#pickup-time').value;
      const date = value ? new Date(value + ':00+05:30') : null;
      pickupTime = date && Number.isFinite(date.getTime()) ? date.toISOString() : null;
      const time = value.split('T')[1];
      if (!pickupTime || new Date(pickupTime) <= new Date() || time < '08:30' || time > '17:30') { tell('#summary-error', 'Choose a future pickup time between 8:30 AM and 5:30 PM IST. Before 9:00 AM is available only on exam days.'); return; }
    }
    if (!demo && shopAccepting !== true) { tell('#summary-error', 'The shop is busy or availability could not be checked. Please try later.'); return; }
    if (total.needsQuote) { tell('#summary-error', 'Binding is currently unavailable. Choose no binding.'); return; }
    lock(true); tell('#global-message', ''); tell('#checkout-error', '');
    try {
      if (!pendingSubmission) pendingSubmission = { id: crypto.randomUUID(), uploaded: null };
      const id = pendingSubmission.id;
      let placedOrder;
      const input = { id, pickupTime, priority: $('#urgent-order').checked, paymentPreference: document.querySelector('[name=payment]:checked').value, notes: $('#notes').value.trim(), shop: 'campus', trendingPrintIds: [...selectedTrendingPrintIds] };
      if (offlinePayment()) input.paymentAppointment = core.paymentAppointment(appointmentInput());
      if (demo) {
        const used = new Set(orders.filter(o => !['collected','cancelled'].includes(o.status)).map(o => o.offlineNumber));
        const offlineNumber = offlinePayment() ? Array.from({length:1000},(_,i)=>i+1).find(n=>!used.has(n)) : null;
        const chosenPrints = trendingPrints.filter(item => selectedTrendingPrintIds.has(item.id)).map(({ id: printId, title, pricePaise }) => ({ id: printId, title, pricePaise }));
        orders.unshift({ ...input, trendingPrints: chosenPrints, offlineNumber, id: 'PREVIEW-' + id.slice(0,8).toUpperCase(), createdAt: new Date().toISOString(), status: 'accepted', paymentStatus: 'unpaid', estimate: total, quoteAmountPaise: Math.round(total.amount * 100), files: files.map(item => ({ name: item.file.name, settings: { ...item.settings }, size: item.file.size })) });
        tell('#orders-message', 'Preview order created in memory only. No documents were uploaded and nothing was sent to the shop.');
      } else {
        if (files.length && !pendingSubmission.uploaded) pendingSubmission.uploaded = await window.OrderService.upload(files, id, (current, count, percent) => { $('#upload-progress').textContent = `Uploading file ${current} of ${count}: ${percent}%`; });
        input.files = pendingSubmission.uploaded || [];
        if (offlinePayment()) { finishDeclaredOrder((await window.OrderService.create(input)).order); return; }
        if (declarationMode()) {
          input.paymentPreference = 'online';
          pendingSubmission.input = input;
          $('#upload-progress').textContent = 'Documents uploaded. Preparing your payment QR…';
          const info = await window.OrderService.preparePayment(input);
          if (info.order) { finishDeclaredOrder(info.order); return; }
          checkoutDraft = input;
          paymentOrder = null;
          $('#manual-payment-form').reset();
          configureDeclarationForm();
          showPaymentInfo(info);
          $('#payment-message').textContent = 'Pay the total below, then tick the confirmation and select Done to place your order. Closing this window does not place an order. If you already transferred money, do not pay again.';
          $('#pay-at-collection').hidden = true;
          $('.payment-options').hidden = true;
          tell('#manual-feedback', '');
          $('#payment-dialog').showModal();
          return;
        }
        placedOrder = (await window.OrderService.create(input)).order;
        tell('#orders-message', 'Your fixed-price order is placed. Track printing and collection here.');
      }
      files = []; selected = null; selectedTrendingPrintIds.clear(); pendingSubmission = null; $('#urgent-order').checked = false; $('#review-confirm').checked = false; $('#notes').value = ''; $('#upload-progress').textContent = ''; chooseFile(null); renderTrendingPrints(); setView('orders');
      if (placedOrder) openPayment(placedOrder);
    } catch (error) { const message = error.message || 'Order submission failed. Retry to check or complete the same order.'; tell('#global-message', message); tell('#checkout-error', message); $('#upload-progress').textContent = ''; }
    finally { lock(false); }
  });
  function finishDeclaredOrder(order) {
    if (!order || typeof order.id !== 'string') throw Error('The server did not confirm the order. Retry Done without paying again.');
    orders = [order, ...orders.filter(item => item.id !== order.id)];
    window.OrderAlerts?.observe(user.uid, orders, true);
    files = []; selected = null; selectedTrendingPrintIds.clear(); pendingSubmission = null; checkoutDraft = null;
    $('#urgent-order').checked = false; $('#review-confirm').checked = false;
    $('#notes').value = ''; $('#upload-progress').textContent = '';
    chooseFile(null); renderTrendingPrints(); updateSummary();
    tell('#orders-message', order.offlineNumber ? 'Offline order placed. Show your identification number at the shop, pay during your visit, and stay while your documents are printed.' : 'Order placed. Payment recorded from your confirmation; no recipient approval is needed.');
    setView('orders'); renderOrders();
  }
  function configureDeclarationForm() {
    const enabled = declarationMode();
    $('#manual-reference').required = !enabled;
    $('#manual-reference').closest('.input-wrap').hidden = enabled;
    $('label[for=manual-reference]').hidden = enabled;
    if (enabled) {
      $('#manual-declaration').nextElementSibling.textContent = 'I completed this UPI payment. I understand the app records my confirmation and does not verify the bank transfer.';
      $('#manual-payment-fields .notice').textContent = 'Student-confirmed payment. No recipient approval is required. Check the amount and receiver in your UPI app before paying.';
      $('#submit-manual').textContent = checkoutDraft ? 'Done — place order' : 'Done — confirm payment';
      $('#submit-manual').disabled = !$('#manual-declaration').checked;
    }
  }
  function showPaymentInfo(info) {
    $('#manual-recipient').textContent = `Recipient: ${info.payee.name} | UPI ID: ${info.payee.upiId}`;
    $('#manual-amount').textContent = `Amount: ${money(info.amountPaise / 100)}`;
    $('#manual-qr').src = info.qr; $('#save-qr').href = info.qr;
    $('#manual-upi-link').href = info.uri; $('#copy-upi').dataset.upi = info.payee.upiId;
    $('#manual-payment-fields').hidden = false; $('#start-payment').hidden = true;
  }
  $('#manual-declaration').addEventListener('change', () => {
    if (declarationMode()) $('#submit-manual').disabled = confirmingPayment || !$('#manual-declaration').checked;
  });
  function slotCard(slot) {
    const badge = node('div', undefined, 'collection-slot');
    badge.append(node('strong', 'Slot ' + slot.slot + ' / No. ' + String(slot.number).padStart(3, '0')), node('span', slot.date + ' | ' + slot.startHour + ':00-' + slot.endHour + ':00 IST'), node('small', 'Show this collection code at the counter. Wait for Ready to collect.'));
    return badge;
  }
  const statusNames = { submitted: 'Order placed', accepted: 'Order placed', printing: 'Order placed', ready: 'Ready to collect', collected: 'Collected', cancelled: 'Cancelled' };
  function renderOrders() {
    const list = $('#orders-list'); list.replaceChildren(); $('#order-count').textContent = orders.length;
    const visible = orders.filter(order => (filter === 'all' && !['collected','cancelled'].includes(order.status)) || (filter === 'active' && ['submitted','accepted','printing'].includes(order.status)) || (filter === 'ready' && order.status === 'ready') || (filter === 'completed' && ['collected','cancelled'].includes(order.status)));
    if (!visible.length) { const empty = node('div', undefined, 'panel empty-orders'); empty.append(node('span', '▤'), node('h2', 'No orders here yet.'), node('p', 'Your print orders will appear here once you place them.')); list.append(empty); return; }
    visible.forEach(order => {
      const card = node('article', undefined, 'panel order-card'); const top = node('div', undefined, 'order-card-top'); const details = node('div');
      const date = new Date(order.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
      details.append(node('h2', 'Order #' + order.id.slice(0,8).toUpperCase()), node('p', `${date} IST · Campus Xerox centre${demo ? ' · DEMO' : ''}`));
      top.append(details, node('span', statusNames[order.status] || 'Status pending', 'status-pill' + (order.status === 'ready' ? ' ready' : ''))); card.append(top);
      if (order.priority) card.append(node('strong', 'Urgent order · ₹8 priority fee included', 'priority-badge'));
      if (order.collectionSlot) card.append(slotCard(order.collectionSlot));
      if (order.status === 'cancelled' && order.cancellationReason) card.append(node('p',order.cancellationReason,'notice'));
      if (order.offlineNumber) {
        const badge = node('div',undefined,'collection-slot');
        badge.append(node('strong','Offline ID ' + String(order.offlineNumber).padStart(3,'0')),node('small','Show this number and your order to the shop. It is an identification number, not a queue position.'));
        if (order.paymentAppointment) badge.append(node('span', appointmentLabel(order.paymentAppointment)));
        card.append(badge);
        if (!['collected','cancelled'].includes(order.status)) card.append(node('p',order.paymentStatus === 'unpaid' ? 'Waiting for your visit and payment. The shop prints only while you are present.' : 'Payment received at the shop. Your position follows payment time; stay for printing.','notice'));
      }
      const docs = node('div', undefined, 'order-documents'); (order.files || []).forEach(file => { const s = file.settings; docs.append(node('p', `${file.name} · ${s.copies} cop${s.copies === 1 ? 'y' : 'ies'} · ${s.colour === 'bw' ? 'B&W' : 'Colour'} · ${s.size} · ${s.sides === 'double' ? 'Double-sided' : 'Single-sided'} · Pages ${s.range || 'all'}`)); }); (order.trendingPrints || []).forEach(item => docs.append(node('p', `${item.title} · Quick print · ${money(item.pricePaise / 100)}`))); card.append(docs);

      if (order.status === 'ready') card.append(node('p', 'Your prints are ready. Show this order reference at the counter.', 'notice'));
      const bottom = node('div', undefined, 'order-bottom'); const amount = node('div'); const quoted = Number.isInteger(order.quoteAmountPaise);
      const paymentLabel = order.paymentStatus === 'declared_paid' ? 'Declared paid — student confirmation' : order.paymentStatus === 'paid' ? (config.paymentMode === 'test' ? 'Test payment only' : order.paymentMethod === 'manual_upi' ? 'Payment successful - confirmed by recipient' : 'Paid') : order.paymentStatus === 'pending_verification' ? (declarationMode() ? 'Confirm your previous payment — do not pay again' : 'Awaiting recipient confirmation - do not pay again') : order.paymentStatus === 'rejected' ? 'Payment not confirmed - contact recipient before retrying' : 'Unpaid';
      amount.append(node('strong', money(quoted ? order.quoteAmountPaise / 100 : order.estimate.amount) + (!quoted && order.estimate.needsQuote ? ' + quote' : '')), node('small', `${quoted ? 'Order total' : 'Legacy order - contact the shop'} - ${paymentLabel}`)); bottom.append(amount);
      if (order.paymentReviewNote && order.paymentStatus === 'rejected') card.append(node('p', order.paymentReviewNote, 'inline-message'));
      if (!order.offlineNumber && !['paid','declared_paid', ...(declarationMode() ? [] : ['pending_verification'])].includes(order.paymentStatus) && !['cancelled','collected'].includes(order.status)) { const pay = node('button', order.paymentStatus === 'pending_verification' ? 'Confirm payment' : order.paymentStatus === 'rejected' ? 'Review payment details' : 'Pay online ↗', 'secondary-action'); pay.addEventListener('click', () => openPayment(order)); bottom.append(pay); }
      card.append(bottom); list.append(card);
    });
  }
  let refreshingOrders = false;
  async function refreshOrders() {
    if (refreshingOrders) return;
    refreshingOrders = true;
    if (!demo && user && config.ordersEnabled) {
      try { const latest = (await window.OrderService.list()).orders; if (!Array.isArray(latest)) throw Error('Orders could not be loaded. Please retry.'); orders = latest; window.OrderAlerts?.observe(user.uid, orders); }
      catch (error) { tell('#orders-message', error.message); }
    }
    renderOrders(); refreshingOrders = false;
  }
  $('#refresh-orders').addEventListener('click', refreshOrders);
  document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => { filter = button.dataset.filter; document.querySelectorAll('[data-filter]').forEach(item => item.setAttribute('aria-pressed', String(item === button))); renderOrders(); }));
  function openPayment(order) {
    checkoutDraft = null;
    $('#start-payment').disabled = false;
    $('#pay-at-collection').hidden = false;
    $('#manual-payment-fields').hidden = true;
    $('#manual-payment-form').reset();
    configureDeclarationForm();
    $('#pay-at-collection').hidden = declarationMode();
    tell('#manual-feedback', '');
    paymentOrder = order; const hasQuote = Number.isInteger(order.quoteAmountPaise);
    $('#start-payment').hidden = demo || !config.paymentsEnabled || !hasQuote;
    $('#payment-message').textContent = demo ? 'Preview only. No money can be sent from this demo.' : !hasQuote ? 'This older order needs assistance from the shop. New orders have an immediate fixed total.' : !config.paymentsEnabled ? 'Online payments are not activated. The supplied UPI account has not been verified for this app. You can pay at the shop when collecting.' : config.paymentMode === 'test' ? `TEST CHECKOUT: simulate ${money(order.quoteAmountPaise / 100)}. No money is transferred to Hanish or the shop. Use only the provider test payment options.` : `Pay ${money(order.quoteAmountPaise / 100)} to ${config.merchantName} using the payment provider. Select an available UPI app or scan the provider QR. Check the payee in your UPI app before approving.`;
    $('#payment-dialog').showModal();
    if (!demo && ['manual','self_declared'].includes(config.paymentMode) && config.paymentsEnabled && hasQuote) {
      $('#payment-message').textContent = declarationMode() ? 'Pay by UPI, then tick the checkbox and select Done. If you already transferred money for this order, confirm it here without paying again.' : 'Pay the confirmed total by UPI, then submit your transaction reference. The recipient checks receipt before payment is marked successful.';
      $('#start-payment').textContent = 'Retry loading QR';
      $('#start-payment').click();
    } else $('#start-payment').textContent = 'Continue to secure checkout';
  }
  $('#pay-at-collection').addEventListener('click', () => { $('#payment-dialog').close(); tell('#orders-message', 'Order placed. Pay at the counter, or open Pay online later. If you already sent money, submit its reference before paying again.'); });
  $('#close-payment').addEventListener('click', () => { if (!confirmingPayment) $('#payment-dialog').close(); });
  $('#payment-dialog').addEventListener('close', () => { $('.payment-options').hidden = false; });
  $('#payment-dialog').addEventListener('cancel', event => { if (confirmingPayment) event.preventDefault(); });
  $('#start-payment').addEventListener('click', async () => {
    $('#start-payment').disabled = true;
    if (['manual','self_declared'].includes(config.paymentMode)) {
      const orderId = paymentOrder.id;
      try {
        const info = await window.OrderService.manualInstructions(orderId);
        if (paymentOrder.id !== orderId || !$('#payment-dialog').open) return;
        $('#manual-recipient').textContent = `Expected recipient: ${info.payee.name} | UPI ID: ${info.payee.upiId}`;
        $('#manual-amount').textContent = `Amount: ${money(info.amountPaise / 100)}`;
        $('#manual-qr').src = info.qr;
        $('#save-qr').href = info.qr;
        $('#manual-upi-link').href = info.uri;
        $('#copy-upi').dataset.upi = info.payee.upiId;
        $('#manual-payment-fields').hidden = false;
        $('#start-payment').hidden = true;
      } catch (error) { $('#payment-message').textContent = error.message; }
      finally { $('#start-payment').disabled = false; }
      return;
    }
    try { $('#payment-dialog').close(); const result = await window.OrderService.pay(paymentOrder.id); tell('#orders-message', result.status === 'paid' ? (config.paymentMode === 'test' ? 'Test payment verified. No real money was transferred; this is not a paid shop order.' : 'Payment verified by the server. Your order is paid.') : result.message || 'Payment is pending confirmation. Refresh your orders before retrying.'); await refreshOrders(); }
    catch (error) { tell('#orders-message', error.message); }
    finally { $('#start-payment').disabled = false; }
  });
  $('#copy-upi').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('#copy-upi').dataset.upi); tell('#manual-feedback', 'UPI ID copied. Check the receiver name in your app before paying.'); }
    catch { tell('#manual-feedback', 'Copy the UPI ID displayed above manually.'); }
  });
  $('#manual-payment-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (confirmingPayment) return;
    if (!$('#manual-payment-form').reportValidity() || demo) return;
    $('#submit-manual').disabled = true;
    if (declarationMode()) {
      if (!$('#manual-declaration').checked) return;
      confirmingPayment = true; $('#close-payment').disabled = true; lock(true);
      tell('#manual-feedback', 'Saving your confirmation…');
      try {
        if (checkoutDraft) {
          const result = await window.OrderService.create({ ...checkoutDraft, paymentDeclared: true });
          finishDeclaredOrder(result.order);
        } else {
          const result = await window.OrderService.declarePayment(paymentOrder.id);
          orders = orders.map(order => order.id === result.order.id ? result.order : order);
          window.OrderAlerts?.observe(user.uid, orders, true); renderOrders();
          tell('#orders-message', 'Payment recorded from your confirmation. No recipient approval is needed.');
        }
        $('#payment-dialog').close();
      } catch (error) { tell('#manual-feedback', error.message + ' If you already paid, do not transfer again. Retry Done to save the same order.'); }
      finally { confirmingPayment = false; $('#close-payment').disabled = false; $('#submit-manual').disabled = !$('#manual-declaration').checked; lock(false); }
      return;
    }
    try {
      await window.OrderService.submitManualPayment(paymentOrder.id, $('#manual-reference').value.trim());
      $('#payment-dialog').close();
      tell('#orders-message', 'Payment reference submitted. Awaiting recipient confirmation; do not pay again.');
      await refreshOrders();
    } catch (error) { tell('#manual-feedback', error.message); }
    finally { $('#submit-manual').disabled = false; }
  });
  $('#dashboard-signout').addEventListener('click', async () => {
    if (working) return;
    try { if (!demo) await window.KitswAuth.logout(); location.assign('index.html'); } catch { tell('#global-message', 'Sign-out failed. Please try again.'); }
  });
  async function start() {
    configurePaymentMode();
    $('#place-order').textContent = demo ? 'Create preview order →' : 'Place order →';
    if (demo) {
      $('#student-email').textContent = 'Student preview'; $('#dashboard-signout').textContent = 'Back to login';
      $('#mode-banner').textContent = 'PREVIEW MODE · Files stay on this device. Orders are examples held in memory, not sent to the shop. No real payments.';
      orders = [{ id: 'PREVIEW-KITS-1042', createdAt: new Date().toISOString(), status: 'ready', paymentStatus: 'unpaid', paymentPreference: 'offline', quoteAmountPaise: 6000, estimate: { amount: 60, needsQuote: false }, files: [{ name: 'Example assignment.pdf', settings: { ...core.defaults, pages: 12 } }] }];
    } else {
      try {
        user = await window.KitswAuth.current();
        if (!user?.emailVerified || !window.KitswAuth.isCollegeEmail(user.email)) { location.replace('index.html'); return; }
        $('#student-email').textContent = user.email;
        config = await window.OrderService.configuration();
        configurePaymentMode();
        window.OrderAlerts?.setup(config.notificationSound);
        await refreshShop();
        await refreshAccess();
        if (config.ordersEnabled) await refreshTrendingPrints();
        showServiceState();
      } catch { $('#mode-banner').textContent = 'Account service unavailable. Return to login to reconnect, or use the dashboard preview.'; }
    }
    if (!demo) await refreshOrders();
    renderTrendingPrints(); updateSummary(); renderOrders();
  }
  async function refreshShop() {
    if (demo || !user || !config.ordersEnabled) return;
    try { shopAccepting = (await window.OrderService.shop()).acceptingOrders; }
    catch { shopAccepting = null; }
    const banner = $('#shop-availability');
    banner.hidden = shopAccepting === true;
    banner.textContent = shopAccepting === false ? 'The shop is busy and is not accepting new orders. You can still track or pay for existing orders.' : 'Unable to check shop availability. New orders are paused until we reconnect.';
    updateSummary();
  }
  async function refreshAccess() {
    let allowed = false;
    if (config.ordersEnabled && window.OrderService.me) {
      try { allowed = (await window.OrderService.me()).isOperator === true; } catch {}
    }
    $('#operator-link').hidden = !allowed; $('#operator-nav').hidden = !allowed;
  }
  function appointmentLabel(a) {
    return 'Pay at the shop: ' + a.date + ' ? ' + a.time + ' IST. Pay by ' + new Date(a.deadlineMs).toLocaleTimeString('en-IN',{timeZone:'Asia/Kolkata',hour:'numeric',minute:'2-digit'}) + ' IST to avoid cancellation.';
  }
  function configurePaymentMode() {
    const offline = offlinePayment();
    $('.payment-options').hidden = false;
    $('#offline-appointment').hidden = !offline;
    $('#pickup').closest('label').hidden = offline;
    $('#pickup-time-label').hidden = offline || $('#pickup').value !== 'later';
    $('#payment-date').min = new Date(Date.now()+19800000).toISOString().slice(0,10);
    $('#payment-guide').textContent = 'Online: pay and confirm before ordering. Offline: choose your payment appointment and place the order now. Show your offline ID at the counter and pay; stay while printing. The print queue follows payment time.';
    $('#checkout-note').hidden = false;
    $('#checkout-note').textContent = offline ? 'Place now to get your offline ID. Your payment appointment does not reserve a queue position.' : 'Next: pay by UPI, tick the confirmation and select Done to place your order.';
  }
  function showServiceState() {
    configurePaymentMode();
    $('#mode-banner').textContent = config.backendUnavailable || config.serviceUnavailable ? 'The shop connection is temporarily unavailable. Keep this page open: your selected files and settings stay here. We’ll reconnect automatically. Check saved orders before repeating a payment.' : config.paymentMode === 'test' ? 'PAYMENT TEST ENVIRONMENT — no real money is transferred.' : config.ordersEnabled ? 'Campus Xerox centre · Normal days 9:00 AM–5:30 PM · Exam days 8:30 AM–5:30 PM IST.' : 'Orders are not activated yet. You can prepare your print settings.';
  }
  let reconnecting = false;
  async function reconnect(force = false) {
    if (demo || !user || (!force && document.hidden) || working || reconnecting) return;
    reconnecting = true;
    try {
      if (force || !config.ordersEnabled || shopAccepting === null || (declarationMode() && !config.paymentsEnabled)) { config = await window.OrderService.configuration(); showServiceState(); await refreshAccess(); }
      await Promise.all([refreshShop(), refreshOrders(), refreshTrendingPrints()]);
    } finally { reconnecting = false; }
  }
  $('#retry-connection').addEventListener('click', async () => {
    const button = $('#retry-connection'); button.disabled = true; button.textContent = 'Checking connection…';
    try { if (!user) await start(); else await reconnect(true); }
    finally { button.disabled = false; button.textContent = 'Check connection'; updateSummary(); }
  });
  setInterval(() => reconnect(), 8000);
  window.addEventListener('online', () => reconnect());
  window.addEventListener('focus', () => reconnect());
  window.addEventListener('beforeunload', event => { if (working || files.length) { event.preventDefault(); event.returnValue = ''; } });
  // Refresh server state while My orders is visible; the client never invents progress.
  start();
})();
