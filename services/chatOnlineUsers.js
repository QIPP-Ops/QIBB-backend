const onlineUsers = new Map();

function getOnlineUserIds() {
  return new Set(onlineUsers.keys());
}

function setUserOnline(userId, socketId) {
  onlineUsers.set(String(userId), socketId);
}

function setUserOffline(userId) {
  onlineUsers.delete(String(userId));
}

module.exports = { getOnlineUserIds, setUserOnline, setUserOffline, onlineUsers };
