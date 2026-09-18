Page({
  onBackHome() {
    wx.switchTab({ url: '/pages/home/index' });
  },

  onBackAdopt() {
    // 领养中心 Tab 已隐藏,改为去猫咪档案
    wx.switchTab({ url: '/pages/cats/index' });
  }
});
