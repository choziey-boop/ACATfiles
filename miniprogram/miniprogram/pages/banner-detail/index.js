// 轮播图文详情页:普通用户只读文章;管理员(admin=1)额外显示 删除/编辑 按钮
const { callFunction } = require('../../utils/cloud');
const { isAdmin } = require('../../utils/admin');

Page({
  data: {
    id: '',
    banner: null,
    isAdmin: false,
    adminMode: false,
    loading: true
  },

  onLoad(options) {
    if (!options.id) {
      wx.showToast({ title: '缺少参数', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    this.setData({
      id: options.id,
      adminMode: options.admin === '1'
    });
    isAdmin().then((v) => this.setData({ isAdmin: v }));
    this.loadBanner(options.id);
  },

  loadBanner(id) {
    const db = wx.cloud.database();
    db.collection('banners')
      .doc(id)
      .get()
      .then((res) => {
        const b = res.data || {};
        wx.setNavigationBarTitle({ title: b.title || '详情' });
        this.setData({ banner: b, loading: false });
      })
      .catch((err) => {
        console.error('加载轮播图失败', err);
        this.setData({ loading: false });
        wx.showModal({
          title: '加载失败',
          content: err.errMsg || String(err),
          showCancel: false
        });
      });
  },

  onPreviewImage() {
    const { banner } = this.data;
    if (banner && banner.image_url) {
      wx.previewImage({ urls: [banner.image_url], current: banner.image_url });
    }
  },

  onEdit() {
    wx.navigateTo({ url: `/pages/admin/banner-edit/index?id=${this.data.id}` });
  },

  onDelete() {
    wx.showModal({
      title: '删除轮播图',
      content: '确定删除这张轮播图吗?',
      confirmColor: '#e8604c',
      success: (r) => {
        if (!r.confirm) return;
        callFunction('manageBanners', { action: 'delete', id: this.data.id })
          .then(() => {
            wx.showToast({ title: '已删除', icon: 'success' });
            setTimeout(() => wx.navigateBack(), 500);
          })
          .catch((err) => {
            console.error('删除失败', err);
            wx.showToast({ title: err.message || '删除失败', icon: 'none' });
          });
      }
    });
  }
});
