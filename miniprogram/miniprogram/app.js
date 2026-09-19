App({
  globalData: {
    // 是否已完成隐私授权
    privacyAuthorized: false,
    // 隐私授权待处理的回调队列(requirePrivacyAuth 使用)
    privacyResolves: [],
    // 官方机制:被拦截的隐私接口(相册等)待恢复队列
    privacyApiResolves: []
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
    this.watchPrivacyAuthorization();
    this.checkPrivacy();
  },

  // 官方机制:调用隐私接口(chooseMedia 等)但未授权时回调。
  // 弹窗让用户操作,同意后 resolve 恢复被拦截的接口,拒绝则放行失败
  watchPrivacyAuthorization() {
    if (!wx.onNeedPrivacyAuthorization) return;
    wx.onNeedPrivacyAuthorization((resolve) => {
      this.globalData.privacyApiResolves.push(resolve);
      this.showPrivacyModal();
    });
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
    // 恢复被拦截的隐私接口(chooseMedia 等)
    const apiResolves = this.globalData.privacyApiResolves;
    this.globalData.privacyApiResolves = [];
    apiResolves.forEach((fn) => fn({ event: 'agree', buttonId: 'privacy-agree-btn' }));
    const resolves = this.globalData.privacyResolves;
    this.globalData.privacyResolves = [];
    resolves.forEach((fn) => fn());
  },

  // 用户拒绝隐私指引:放行被拦截的接口(使其失败),由调用方提示
  onPrivacyDisagreed() {
    const apiResolves = this.globalData.privacyApiResolves;
    this.globalData.privacyApiResolves = [];
    apiResolves.forEach((fn) => fn({ event: 'disagree' }));
  }
});
