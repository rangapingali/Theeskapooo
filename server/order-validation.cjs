const core = require('../print-core.js');
const idPattern = /^[a-f0-9-]{36}$/;
function validateOrder(body, uid) {
  if (!body || !idPattern.test(body.id || '') || body.shop !== 'campus' || !['offline','online'].includes(body.paymentPreference)) throw Error('Invalid order details.');
  if (!Array.isArray(body.files) || body.files.length > 10) throw Error('Choose up to 10 documents.');
  const trendingPrintIds = body.trendingPrintIds === undefined ? [] : body.trendingPrintIds;
  if (!Array.isArray(trendingPrintIds) || trendingPrintIds.length > 10 || body.files.length + trendingPrintIds.length > 10 || trendingPrintIds.some(id => !idPattern.test(id || '')) || new Set(trendingPrintIds).size !== trendingPrintIds.length) throw Error('Choose up to 10 valid print items.');
  if (!body.files.length && !trendingPrintIds.length) throw Error('Choose a document or a trending print.');
  if (typeof body.notes !== 'string' || body.notes.length > 500) throw Error('Instructions must be 500 characters or fewer.');
  if (body.priority !== undefined && typeof body.priority !== 'boolean') throw Error('Choose a valid urgency option.');
  let bytes = 0;
  const paths = new Set();
  const estimate = { amount: 0, sheets: 0, printedSides: 0, minutes: 0, needsQuote: false };
  const files = body.files.map(file => {
    if (typeof file.name !== 'string' || file.name.length > 240 || !Number.isInteger(file.size)) throw Error('Invalid document information.');
    const error = core.fileError(file); if (error) throw Error(error);
    const prefix = `student-uploads/${uid}/${body.id}/`;
    if (typeof file.path !== 'string' || !file.path.startsWith(prefix) || !/^[a-f0-9-]{36}\.[a-z0-9]+$/.test(file.path.slice(prefix.length)) || paths.has(file.path)) throw Error('Invalid or duplicate upload reference.');
    if (file.path.split('.').pop() !== file.name.split('.').pop().toLowerCase()) throw Error('Document format mismatch.');
    paths.add(file.path); bytes += file.size;
    const s = file.settings;
    if (!s || typeof s.range !== 'string' || s.range.length > 200) throw Error('Invalid page range.');
    const settings = Object.fromEntries(Object.keys(core.defaults).map(key => [key, s[key]]));
    const result = core.estimate(settings, { image: core.isImageFile(file.name) });
    ['amount','sheets','printedSides','minutes'].forEach(key => estimate[key] += result[key]);
    estimate.needsQuote ||= result.needsQuote;
    return { name: file.name, size: file.size, path: file.path, settings };
  });
  if (bytes > 100 * 1024 * 1024) throw Error('Order uploads exceed 100 MB.');
  let pickupTime = null;
  if (body.pickupTime !== null) {
    const date = new Date(body.pickupTime);
    if (!Number.isFinite(date.getTime()) || date <= new Date()) throw Error('Pickup time must be in the future.');
    const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date);
    if (time < '08:30' || time > '17:30') throw Error('Pickup must be within shop hours; before 9 AM is available only on exam days.');
    pickupTime = date.toISOString();
  }
  const priority = body.priority === true;
  const paymentAppointment = body.paymentPreference === 'offline' ? core.paymentAppointment(body.paymentAppointment) : null;
  const priorityFeePaise = priority ? core.priorityFee * 100 : 0;
  estimate.amount += priorityFeePaise / 100;
  return { id: body.id, files, trendingPrintIds, trendingPrints: [], estimate, priority, priorityFeePaise, notes: body.notes, pickupTime, paymentAppointment, shop: 'campus', paymentPreference: body.paymentPreference };
}
module.exports = { validateOrder, idPattern };
