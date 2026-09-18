const { isAdmin } = require('../../utils/admin');
const { callFunction } = require('../../utils/cloud');

Page({
  data: {
    loading: true,
    authorized: false,
    needAssignCodes: true
  },

  onLoad() {
    // 强制刷新一次,避免缓存过期管理员身份
    isAdmin(true).then((v) => {
      this.setData({ loading: false, authorized: v });
    });
  },

  // 批量生成编号
  async onAssignCodes() {
    const res = await new Promise((resolve) => {
      wx.showModal({
        title: '确认',
        content: '将给所有没有编号的猫咪自动生成编号，确定执行？',
        success: resolve
      });
    });
    if (!res.confirm) return;

    wx.showLoading({ title: '执行中...' });
    try {
      const result = await callFunction('assignCatCodes');
      wx.hideLoading();
      wx.showToast({ title: result.message || '完成', icon: 'none', duration: 3000 });
      this.setData({ needAssignCodes: false });
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: '执行失败: ' + (e.message || e), icon: 'none' });
    }
  },

  onGoCats() {
    wx.navigateTo({ url: '/pages/admin/cats/index' });
  },

  onGoBanners() {
    wx.navigateTo({ url: '/pages/admin/banners/index' });
  },

  onGoReview() {
    wx.showToast({ title: '领养审核功能将在 P1 阶段开放', icon: 'none' });
  }
});
