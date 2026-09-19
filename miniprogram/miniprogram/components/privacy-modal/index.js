Component({
  data: {
    visible: false
  },

  lifetimes: {
    attached() {
      const app = getApp();
      // 注册为全局隐私弹窗触发入口
      app.privacyModalCallback = () => {
        this.setData({ visible: true });
      };
      // 若 app 启动时已判定需要授权,立即展示
      if (wx.getPrivacySetting) {
        wx.getPrivacySetting({
          success: (res) => {
            if (res.needAuthorization) {
              this.setData({ visible: true });
            }
          }
        });
      }
    },
    detached() {
      const app = getApp();
      if (app.privacyModalCallback) {
        app.privacyModalCallback = null;
      }
    }
  },

  methods: {
    // 用户点击"同意"(open-type 会自动完成授权)
    onAgree() {
      this.setData({ visible: false });
      getApp().onPrivacyAuthorized();
    },

    onDisagree() {
      this.setData({ visible: false });
      // 放行被拦截的隐私接口(chooseMedia 等),使其以失败结束
      getApp().onPrivacyDisagreed();
      wx.showToast({
        title: '部分功能需要同意隐私指引后才能使用',
        icon: 'none'
      });
    },

    // 查看《用户隐私保护指引》(需在 mp 后台配置)
    onOpenContract() {
      if (wx.openPrivacyContract) {
        wx.openPrivacyContract({
          fail: () => {
            wx.showToast({ title: '请先在小程序后台配置隐私指引', icon: 'none' });
          }
        });
      }
    }
  }
});
