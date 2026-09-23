const { callFunction } = require('../../utils/cloud');
const { isAdmin } = require('../../utils/admin');
const { resolveImageUrls } = require('../../utils/image-url');

function formatDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

Page({
  data: {
    banners: [], // 首页轮播(banners 集合 type=home_banner)
    topImages: [], // 首页顶图候选(banners 集合 type=home_top,最多10张)
    topImage: null, // 当前展示的顶图(从 topImages 随机抽一张,空则用 index_bg.png 兜底)
    activities: [], // 猫咪动态
    isAdmin: false,
    loading: true,
    refreshing: false // scroll-view 下拉刷新中
  },

  onLoad() {
    this.loadData();
    isAdmin().then((v) => this.setData({ isAdmin: v }));
  },

  onShow() {
    // 自定义 tabBar 选中态
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 });
    }
    // 每次进入首页,顶图重新随机一张(数据已加载的情况下)
    if (this.data.topImages.length > 0) {
      this.pickTopImage();
    }
  },

  // 从顶图候选里随机抽一张展示
  pickTopImage() {
    const list = this.data.topImages;
    if (!list.length) {
      this.setData({ topImage: null });
      return;
    }
    const idx = Math.floor(Math.random() * list.length);
    this.setData({ topImage: list[idx] });
  },

  // scroll-view 下拉刷新(页面级刷新在自定义导航 + scroll-view 结构下不触发)
  onRefresherRefresh() {
    this.setData({ refreshing: true });
    this.loadData().then(() => this.setData({ refreshing: false }));
  },

  loadData() {
    this.setData({ loading: true });
    const db = wx.cloud.database();
    return Promise.all([
      // banners 集合:客户端按 type 过滤(历史数据无 type 字段视为 home_banner)
      db
        .collection('banners')
        .orderBy('sort', 'asc')
        .limit(20)
        .get()
        .catch(() => ({ data: [] })),
      // 动态:最新 20 条
      db
        .collection('activities')
        .orderBy('created_at', 'desc')
        .limit(20)
        .get()
        .catch(() => ({ data: [] }))
    ])
      .then(([bannerRes, actRes]) => {
        const activities = (actRes.data || []).map((a) => ({
          ...a,
          created_at_text: formatDate(a.created_at),
          likes: a.likes || 0,
          liked: false
        }));
        // 拆分:home_banner 最多 5 张;home_top 最多 10 张(无 type 视为 home_banner)
        const all = bannerRes.data || [];
        const banners = all.filter((b) => (b.type || 'home_banner') === 'home_banner').slice(0, 5);
        const topImages = all.filter((b) => b.type === 'home_top').slice(0, 10);
        // 图片统一换公开临时链接(普通用户无云存储读权限,云函数中转)
        const ids = banners
          .map((b) => b.image_url)
          .concat(topImages.map((b) => b.image_url))
          .concat(activities.reduce((acc, a) => acc.concat(a.images || []), []));
        return resolveImageUrls(ids).then((map) => {
          const pick = (u) => map[u] || u;
          const resolvedActivities = activities.map((a) => ({
            ...a,
            images: (a.images || []).map(pick)
          }));
          this.setData({
            banners: banners.map((b) => ({ ...b, image_url: pick(b.image_url) })),
            topImages: topImages.map((b) => ({ ...b, image_url: pick(b.image_url) })),
            activities: resolvedActivities,
            loading: false
          });
          this.pickTopImage();
          if (resolvedActivities.length === 0) return;
          this.fillGenderMap(resolvedActivities);
          callFunction('myLikes', { targetType: 'activity', targetIds: resolvedActivities.map((a) => a._id) })
            .then((data) => {
              const likedSet = new Set(data.likedIds || []);
              this.setData({
                activities: this.data.activities.map((a) => ({ ...a, liked: likedSet.has(a._id) }))
              });
            })
            .catch(() => {});
        });
      })
      .catch((err) => {
        console.error('加载首页数据失败', err);
        this.setData({ loading: false });
        wx.showModal({
          title: '加载失败',
          content: (err.errMsg || String(err)) + '\n\n若提示 permission denied,请在云开发控制台检查 banners / activities 集合权限(所有用户可读)',
          showCancel: false
        });
      });
  },

  // 动态只存了 cat_id 快照,批量查 cats 集合补上性别图标
  fillGenderMap(activities) {
    const catIds = [...new Set(activities.map((a) => a.cat_id).filter(Boolean))];
    if (catIds.length === 0) return;
    const db = wx.cloud.database();
    const _ = db.command;
    // _.in 单次最多 20 个值,分批查询
    const tasks = [];
    for (let i = 0; i < catIds.length; i += 20) {
      tasks.push(
        db
          .collection('cats')
          .where({ _id: _.in(catIds.slice(i, i + 20)) })
          .field({ gender: true })
          .get()
          .catch(() => ({ data: [] }))
      );
    }
    Promise.all(tasks).then((results) => {
      const genderMap = {};
      results.forEach((r) => (r.data || []).forEach((c) => (genderMap[c._id] = c.gender)));
      this.setData({
        activities: this.data.activities.map((a) => ({ ...a, cat_gender: genderMap[a.cat_id] || '' }))
      });
    });
  },

  // 点击轮播图:有正文才跳详情页,否则不跳转
  onBannerTap(e) {
    const { id, hasArticle } = e.currentTarget.dataset;
    if (!hasArticle) return;
    wx.navigateTo({ url: `/pages/banner-detail/index?id=${id}` });
  },

  // 动态点赞
  onLikeActivity(e) {
    const { id } = e.currentTarget.dataset;
    const list = this.data.activities;
    const idx = list.findIndex((a) => a._id === id);
    if (idx < 0) return;
    const item = list[idx];
    this.setData({
      [`activities[${idx}].liked`]: !item.liked,
      [`activities[${idx}].likes`]: (item.likes || 0) + (item.liked ? -1 : 1)
    });
    callFunction('toggleLike', { targetType: 'activity', targetId: id })
      .then((data) => {
        this.setData({
          [`activities[${idx}].liked`]: data.liked,
          [`activities[${idx}].likes`]: data.likes
        });
      })
      .catch(() => {});
  },

  // 动态管理(仅管理员可见入口):编辑/删除
  onActivityOps(e) {
    const { id } = e.currentTarget.dataset;
    wx.showActionSheet({
      itemList: ['编辑', '删除'],
      success: (res) => {
        if (res.tapIndex === 0) {
          wx.navigateTo({ url: `/pages/activity-publish/index?id=${id}` });
        } else if (res.tapIndex === 1) {
          wx.showModal({
            title: '删除动态',
            content: '确定删除这条动态吗?',
            confirmColor: '#e8604c',
            success: (r) => {
              if (!r.confirm) return;
              callFunction('manageActivity', { action: 'delete', id }, { showLoading: true, loadingText: '删除中...' })
                .then(() => {
                  this.setData({ activities: this.data.activities.filter((a) => a._id !== id) });
                  wx.showToast({ title: '已删除', icon: 'success' });
                })
                .catch(() => {});
            }
          });
        }
      },
      fail: () => {}
    });
  },

  // 点击轮播图/动态头像,跳转猫咪详情
  onGoCat(e) {
    const { catId } = e.currentTarget.dataset;
    if (!catId) return;
    wx.navigateTo({ url: `/pages/cat-detail/index?id=${catId}` });
  },

  onPreviewImage(e) {
    const { url, images } = e.currentTarget.dataset;
    wx.previewImage({ urls: images || [url], current: url });
  },

  onGoCats() {
    wx.switchTab({ url: '/pages/cats/index' });
  },

  // ========== 分享 ==========

  onShareAppMessage() {
    return {
      title: '校园猫咪相册 — 喵喵外院',
      path: 'pages/home/index',
      imageUrl: '/images/main_bg.png'
    };
  },

  onShareTimeline() {
    return {
      title: '校园猫咪相册 — 喵喵外院',
      query: '',
      imageUrl: '/images/main_bg.png'
    };
  }
});
