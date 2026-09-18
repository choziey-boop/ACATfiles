const { callFunction } = require('./cloud');
const { CACHE_KEYS } = require('./constants');

// 判断当前用户是否管理员(结果缓存于 storage,后台管理员变更后清除缓存生效)
function isAdmin(forceRefresh = false) {
  if (!forceRefresh) {
    const cached = wx.getStorageSync(CACHE_KEYS.isAdmin);
    if (cached && typeof cached.value === 'boolean') {
      return Promise.resolve(cached.value);
    }
  }
  return callFunction('adminAuth')
    .then((data) => {
      wx.setStorageSync(CACHE_KEYS.isAdmin, { value: !!data.isAdmin });
      return !!data.isAdmin;
    })
    .catch(() => false);
}

module.exports = { isAdmin };
