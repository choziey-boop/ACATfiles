const { callFunction } = require('../../utils/cloud');

Page({
  data: {
    catId: '',
    catName: '',
    form: {
      contact: '',
      reason: '',
      living: ''
    },
    submitted: false, // 已有待审核申请
    submitting: false
  },

  onLoad(options) {
    if (!options.catId) {
      wx.showToast({ title: '参数错误', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
      return;
    }
    this.setData({
      catId: options.catId,
      catName: decodeURIComponent(options.name || '')
    });
    this.checkDuplicate();
  },

  // 查重:同一用户对同一猫咪已有待审核申请则禁止重复提交
  checkDuplicate() {
    callFunction('submitAdoption', { action: 'check', catId: this.data.catId })
      .then((data) => {
        if (data.exists) {
          this.setData({ submitted: true });
        }
      })
      .catch(() => {});
  },

  onInput(e) {
    const { field } = e.currentTarget.dataset;
    this.setData({ [`form.${field}`]: e.detail.value });
  },

  onSubmit() {
    const { form, catId, submitted, submitting } = this.data;
    if (submitted || submitting) return;

    if (!form.contact.trim()) {
      wx.showToast({ title: '请填写联系方式', icon: 'none' });
      return;
    }
    if (!form.reason.trim()) {
      wx.showToast({ title: '请填写领养原因', icon: 'none' });
      return;
    }
    if (!form.living.trim()) {
      wx.showToast({ title: '请填写居住情况', icon: 'none' });
      return;
    }

    // 先确保隐私授权
    getApp()
      .requirePrivacyAuth()
      .then(() => {
        this.setData({ submitting: true });
        return callFunction(
          'submitAdoption',
          {
            action: 'submit',
            catId,
            contact: form.contact.trim(),
            reason: form.reason.trim(),
            living: form.living.trim()
          },
          { showLoading: true, loadingText: '提交中...' }
        );
      })
      .then(() => {
        wx.redirectTo({ url: '/pages/adopt-success/index' });
      })
      .catch((err) => {
        this.setData({ submitting: false });
        if (err.code === 1001) {
          // 重复申请
          this.setData({ submitted: true });
        }
      });
  }
});
