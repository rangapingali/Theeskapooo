(() => {
  const $ = selector => document.querySelector(selector);
  const api = window.OrderService;
  const node = (tag, text, className) => { const el = document.createElement(tag); if (text !== undefined) el.textContent = text; if (className) el.className = className; return el; };
  const money = paise => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(paise / 100);
  let prints = [], allowed = false, busy = false;
  function message(text) { $('#trending-feedback').textContent = text; $('#trending-feedback').hidden = !text; }
  function render() {
    const list = $('#trending-admin-list'); list.replaceChildren();
    if (!allowed) return;
    if (!prints.length) { list.append(node('p', 'No quick prints yet. Add a title and price above.', 'empty-orders')); return; }
    prints.forEach(item => {
      const form = node('form', undefined, 'trending-admin-item setting-grid');
      const titleLabel = node('label', 'Document title'); const title = node('input'); title.type = 'text'; title.maxLength = 100; title.required = true; title.value = item.title; titleLabel.append(title);
      const priceLabel = node('label', 'Price (₹)'); const price = node('input'); price.type = 'number'; price.min = '1'; price.max = '50000'; price.step = '0.01'; price.required = true; price.value = (item.pricePaise / 100).toFixed(2); priceLabel.append(price);
      const actions = node('div', undefined, 'trending-admin-actions wide-field');
      const save = node('button', 'Save changes', 'secondary-action'); save.type = 'submit';
      const remove = node('button', 'Remove from student list', 'quiet'); remove.type = 'button';
      actions.append(node('strong', 'Currently shown to students · ' + money(item.pricePaise)), save, remove);
      form.append(titleLabel, priceLabel, actions);
      form.addEventListener('submit', async event => {
        event.preventDefault();
        if (busy || !form.reportValidity()) return;
        await change(async () => { await api.updateTrendingPrint(item.id, { title: title.value, price: Number(price.value) }); return 'Quick print updated.'; });
      });
      remove.addEventListener('click', async () => {
        if (busy) return;
        await change(async () => { await api.removeTrendingPrint(item.id); return 'Quick print removed from the student list.'; });
      });
      list.append(form);
    });
  }
  async function load() {
    if (!allowed) return;
    const result = await api.trendingPrints();
    if (!Array.isArray(result.prints)) throw Error('The shop returned an invalid quick-print list.');
    prints = result.prints; render();
  }
  async function change(operation) {
    busy = true; message('Saving…');
    document.querySelectorAll('#trending-admin input, #trending-admin button').forEach(el => { el.disabled = true; });
    try { const success = await operation(); await load(); message(success); }
    catch (error) { message(error.message || 'Could not save the quick print. Please retry.'); }
    finally { busy = false; render(); }
  }
  $('#trending-add-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    if (busy || !form.reportValidity()) return;
    const title = $('#trending-title'), price = $('#trending-price');
    await change(async () => {
      await api.addTrendingPrint({ title: title.value, price: Number(price.value) });
      form.reset();
      return 'Quick print added to the student list.';
    });
  });
  $('#trending-refresh').addEventListener('click', async () => {
    if (!allowed || busy) return;
    try { await load(); message('Trending print list refreshed.'); }
    catch (error) { message(error.message || 'Could not refresh the quick-print list.'); }
  });
  async function start() {
    try {
      const actor = await window.KitswAuth.current();
      if (!actor?.emailVerified) { $('#trending-banner').textContent = 'Sign in with your verified college account to manage quick prints.'; return; }
      $('#trending-operator-email').textContent = actor.email;
      allowed = (await api.me()).isOperator === true;
      $('#trending-banner').textContent = allowed ? 'Operator access confirmed. These titles and prices appear in the student order screen.' : 'Your student account is active, but operator access has not been assigned.';
      $('#trending-admin').hidden = !allowed;
      if (allowed) await load();
    } catch (error) { $('#trending-banner').textContent = error.message || 'Could not verify operator access. Refresh to retry.'; }
  }
  start();
})();
