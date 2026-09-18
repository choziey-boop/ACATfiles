const { isAdmin } = require('../../utils/admin');

Page({
  data: {
    loading: true,
    authorized: false
  },

  onLoad() {
    // 强制刷新一次,避免缓存过期管理员身份
    isAdmin(true).then((v) => {
      this.setData({ loading: false, authorized: v });
    });
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
