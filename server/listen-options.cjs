// Render routes incoming traffic to all interfaces, not the loopback address.
function listenOptions(env = process.env) {
  const host = env.RENDER === 'true' ? '0.0.0.0' : env.HOST || (env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1');
  const port = env.PORT ? Number(env.PORT) : 4174;
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw Error('PORT must be a valid TCP port.');
  return { host, port };
}
module.exports = { listenOptions };
