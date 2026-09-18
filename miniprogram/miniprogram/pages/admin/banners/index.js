// 轮播图管理列表页(仅管理员):两个 tab — 首页轮播(最多5) / 首页顶图(最多3)
const { callFunction } = require('../../../utils/cloud');
const { isAdmin } = require('../../../utils/admin');

const MAX_MAP = { home_banner: 5, home_top: 10 };

Page({
  data: {
    tab: 'home_banner', // 当前 tab
    banners: [], // [{_id, image_url, title, content, type}]
    loading: true,
    isAdmin: false,
    reachMax: false
  },

  onLoad() {
    isAdmin().then((v) => {
      this.setData({ isAdmin: v });
      if (!v) {
        this.setData({ loading: false });
        wx.showToast({ title: '无权限访问', icon: 'none' });
      } else {
        // 先迁移历史数据(补 type 字段),再加载
        callFunction('manageBanners', { action: 'migrate' })
          .catch(() => {})
          .finally(() => this.loadData());
      }
    });
  },

  onShow() {
    // 编辑页返回后刷新
    if (this.data.isAdmin && !this.data.loading) {
      this.loadData();
    }
  },

  // 切换 tab
  onSwitchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (tab === this.data.tab) return;
    this.setData({ tab });
    this.loadData();
  },

  loadData() {
    this.setData({ loading: true });
    const db = wx.cloud.database();
    const type = this.data.tab;
    // 全量拉取后客户端按 type 过滤:兼容历史数据(无 type 字段视为 home_banner)
    db.collection('banners')
      .orderBy('sort', 'asc')
      .limit(100)
      .get()
      .then((res) => {
        const all = res.data || [];
        const banners = all.filter((b) => (b.type || 'home_banner') === type);
        const reachMax = banners.length >= (MAX_MAP[type] || 5);
        this.setData({ banners, reachMax, loading: false });
      })
      .catch((err) => {
        console.error('加载轮播图失败', err);
        this.setData({ loading: false });
      });
  },

  onGoDetail(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/pages/banner-detail/index?id=${id}&admin=1` });
  },

  onAdd() {
    const type = this.data.tab;
    const max = MAX_MAP[type] || 5;
    if (this.data.reachMax) {
      wx.showToast({ title: `最多 ${max} 张,请先删除`, icon: 'none' });
      return;
    }
    wx.navigateTo({ url: `/pages/admin/banner-edit/index?type=${type}` });
  }
});
