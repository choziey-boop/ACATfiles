const { isAdmin } = require('../../utils/admin');
const { CACHE_KEYS } = require('../../utils/constants');

Page({
  data: {
    isAdmin: false,
    tapCount: 0,
    lastTap: 0,
    scrollTop: 0 // 滚动区顶边(胶囊按钮下边缘)
  },

  onLoad() {
    const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    const menuBtn = wx.getMenuButtonBoundingClientRect ? wx.getMenuButtonBoundingClientRect() : null;
    const scrollTop = menuBtn && menuBtn.bottom ? menuBtn.bottom : (info.statusBarHeight || 0) + 44;
    this.setData({ scrollTop });
  },

  onShow() {
    // 自定义 tabBar 选中态
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 });
    }
    // 检查是否管理员,显示后台入口
    isAdmin().then((v) => this.setData({ isAdmin: v }));
  },

  onGoAdmin() {
    wx.navigateTo({ url: '/pages/admin/index' });
  },

  // 隐藏初始化入口:1 秒内连点底部文字 7 次触发(仅首次部署时使用)
  // initDb 云函数仅在 admins 集合为空时才会把调用者登记为管理员,重复触发无副作用
  onFooterTap() {
    const now = Date.now();
    const count = now - this.data.lastTap < 1000 ? this.data.tapCount + 1 : 1;
    this.setData({ tapCount: count, lastTap: now });
    if (count < 7) return;
    this.setData({ tapCount: 0 });

    wx.showLoading({ title: '初始化中...', mask: true });
    wx.cloud
      .callFunction({ name: 'initDb' })
      .then((r) => {
        wx.hideLoading();
        const d = (r.result && r.result.data) || {};
        wx.showModal({
          title: d.adminAdded ? '初始化成功' : '初始化完成',
          content: d.adminAdded
            ? '数据库集合已创建,你已被登记为管理员。下拉刷新本页即可看到后台入口。'
            : '集合状态:' + JSON.stringify(d.results || {}, null, 2),
          showCancel: false
        });
        if (d.adminAdded) {
          wx.removeStorageSync(CACHE_KEYS.isAdmin);
          this.onShow();
        }
      })
      .catch((e) => {
        wx.hideLoading();
        wx.showModal({
          title: '初始化失败',
          content: e.errMsg || String(e),
          showCancel: false
        });
      });
  }
});
