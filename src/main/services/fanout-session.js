/** @type {Map<number, { skipRequested: boolean }>} */
const sessionsBySenderId = new Map();

function beginFanoutSession(senderId) {
  if (senderId == null) return null;
  const session = { skipRequested: false };
  sessionsBySenderId.set(senderId, session);
  return session;
}

function requestSkipFanout(senderId) {
  const session = sessionsBySenderId.get(senderId);
  if (!session) return { ok: false };
  session.skipRequested = true;
  return { ok: true };
}

function getSkipRequested(senderId) {
  const session = sessionsBySenderId.get(senderId);
  return session?.skipRequested === true;
}

function endFanoutSession(senderId) {
  if (senderId != null) {
    sessionsBySenderId.delete(senderId);
  }
}

module.exports = {
  beginFanoutSession,
  requestSkipFanout,
  getSkipRequested,
  endFanoutSession,
};
