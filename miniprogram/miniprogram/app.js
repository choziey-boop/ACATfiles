App({
  globalData: {
    // 是否已完成隐私授权
    privacyAuthorized: false,
    // 隐私授权待处理的回调队列
    privacyResolves: []
  },

  onLaunch() {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
      return;
    }
    wx.cloud.init({
      env: 'cloudbase-d1gmx9xlhccbfd3d6',
      traceUser: true
    });
    this.checkPrivacy();
  },

  // 检测隐私授权状态,未授权则弹出指引弹窗
  checkPrivacy() {
    if (!wx.getPrivacySetting) return;
    wx.getPrivacySetting({
      success: (res) => {
        if (res.needAuthorization) {
          this.showPrivacyModal();
        } else {
          this.globalData.privacyAuthorized = true;
        }
      },
      fail: () => {
        // 基础库不支持或接口异常时,不阻塞使用
        this.globalData.privacyAuthorized = true;
      }
    });
  },

  showPrivacyModal() {
    // 各页面中的 privacy-modal 组件监听该事件并展示
    if (this.privacyModalCallback) {
      this.privacyModalCallback();
    }
  },

  // 页面/组件调用:返回 Promise,resolve 时表示已获得隐私授权
  requirePrivacyAuth() {
    if (this.globalData.privacyAuthorized) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.globalData.privacyResolves.push(resolve);
      this.showPrivacyModal();
    });
  },

  // 隐私授权完成(由 privacy-modal 组件回调)
  onPrivacyAuthorized() {
    this.globalData.privacyAuthorized = true;
    const resolves = this.globalData.privacyResolves;
    this.globalData.privacyResolves = [];
    resolves.forEach((fn) => fn());
  }
});
