function failure(message) { return Object.assign(new Error(message), { httpStatus: 409 }); }

function priceSnapshot(ids, prints) {
  if (!Array.isArray(prints) || prints.length !== ids.length || prints.some((item, index) =>
    item?.id !== ids[index] || typeof item.title !== 'string' || !Number.isSafeInteger(item.pricePaise) || item.pricePaise < 100 || item.pricePaise > 5000000)) {
    throw failure('Saved quick-print prices are invalid. Reopen checkout before continuing.');
  }
  const totalPaise = prints.reduce((total, item) => total + item.pricePaise, 0);
  if (!Number.isSafeInteger(totalPaise)) throw failure('Trending print total is invalid. Contact the shop.');
  return { prints: prints.map(({ id, title, pricePaise }) => ({ id, title, pricePaise })), totalPaise };
}

async function resolveTrendingPrints(tx, db, ids) {
  const snapshots = await Promise.all(ids.map(id => tx.get(db.collection('trendingPrints').doc(id))));
  const prints = snapshots.map(snapshot => {
    const item = snapshot.data();
    if (!snapshot.exists || item?.active !== true) throw failure('A selected trending print is no longer available. Refresh the list and try again.');
    if (typeof item.title !== 'string' || !Number.isSafeInteger(item.pricePaise) || item.pricePaise < 100 || item.pricePaise > 5000000) throw failure('A selected trending print has invalid pricing. Contact the shop.');
    return { id: snapshot.id, title: item.title, pricePaise: item.pricePaise };
  });
  return priceSnapshot(ids, prints);
}

module.exports = { resolveTrendingPrints, priceSnapshot };
