// 猫咪管理:行式列表 + 筛选/搜索 + 每行操作(相册/编辑/动态/删除)
// 小程序端数据库单次查询上限 20 条,分批并发拉取
const { callFunction } = require('../../../utils/cloud');
const { CAT_STATUS, GENDER } = require('../../../utils/constants');

const CHIPS = [
  { key: 'all', label: '全部' },
  { key: 'male', label: '公猫' },
  { key: 'female', label: '母猫' },
  { key: 'adopted', label: '已领养' },
  { key: 'neutered', label: '已绝育' },
  { key: 'graduated', label: '回喵星' }
];

Page({
  data: {
    keyword: '',
    chips: CHIPS,
    activeChip: 'all',
    allCats: [],
    cats: [],
    total: 0,
    loading: true
  },

  onShow() {
    this.loadCats();
  },

  fetchAllCats() {
    const db = wx.cloud.database();
    return db
      .collection('cats')
      .count()
      .then((res) => {
        const total = res.total || 0;
        if (total === 0) return { total, list: [] };
        const tasks = [];
        for (let skip = 0; skip < total; skip += 20) {
          tasks.push(db.collection('cats').skip(skip).limit(20).get());
        }
        return Promise.all(tasks).then((results) => ({
          total,
          list: results.reduce((acc, r) => acc.concat(r.data || []), [])
        }));
      });
  },

  loadCats() {
    this.fetchAllCats()
      .then(({ total, list }) => {
        list.sort((a, b) => (b.sort_weight || 0) - (a.sort_weight || 0));
        const allCats = list.map((c) => ({
          ...c,
          statusText: CAT_STATUS[c.status] || c.status,
          genderText: GENDER[c.gender] || c.gender
        }));
        this.setData({ allCats, total }, () => this.applyFilter());
      })
      .catch((err) => {
        console.error('加载失败', err);
        this.setData({ loading: false });
        wx.showModal({
          title: '加载失败',
          content: (err.errMsg || String(err)) + '\n\n若提示 permission denied,请在云开发控制台把 cats 集合权限设为「所有用户可读」',
          showCancel: false
        });
      });
  },

  applyFilter() {
    const { allCats, activeChip, keyword } = this.data;
    let cats = allCats;
    if (activeChip === 'male' || activeChip === 'female') {
      cats = cats.filter((c) => c.gender === activeChip);
    } else if (activeChip === 'adopted') {
      cats = cats.filter((c) => c.status === 'adopted');
    } else if (activeChip === 'graduated') {
      cats = cats.filter((c) => c.status === 'graduated');
    } else if (activeChip === 'neutered') {
      cats = cats.filter((c) => !!c.is_neutered);
    }
    if (keyword) {
      const kw = keyword.toLowerCase();
      cats = cats.filter(
        (c) =>
          (c.name || '').toLowerCase().includes(kw) ||
          (c.code || '').toLowerCase().includes(kw)
      );
    }
    this.setData({ cats, loading: false });
  },

  onInputKeyword(e) {
    this.setData({ keyword: e.detail.value.trim() });
    this.applyFilter();
  },

  onClearKeyword() {
    this.setData({ keyword: '' });
    this.applyFilter();
  },

  onChipTap(e) {
    this.setData({ activeChip: e.currentTarget.dataset.key });
    this.applyFilter();
  },

  // 点击行主体:进入相册管理
  onGoPhotos(e) {
    const { id, name } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/pages/cat-photos/index?catId=${id}&name=${encodeURIComponent(name || '')}` });
  },

  onAdd() {
    wx.navigateTo({ url: '/pages/admin/cat-edit/index' });
  },

  onEdit(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/pages/admin/cat-edit/index?id=${id}` });
  },

  // 给指定猫咪发动态
  onPublish(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/pages/activity-publish/index?catId=${id}` });
  },

  // 底部 +动态:先进发布页再选猫
  onPublishAny() {
    wx.navigateTo({ url: '/pages/activity-publish/index' });
  },

  onDelete(e) {
    const { id, name } = e.currentTarget.dataset;
    wx.showModal({
      title: '删除确认',
      content: `确定删除「${name}」的档案吗?其相册照片和动态会一并删除,此操作不可恢复。`,
      confirmColor: '#e8604c',
      success: (res) => {
        if (!res.confirm) return;
        callFunction('deleteCat', { id }, { showLoading: true, loadingText: '删除中...' })
          .then(() => {
            wx.showToast({ title: '已删除', icon: 'success' });
            this.loadCats();
          })
          .catch(() => {});
      }
    });
  }
});
