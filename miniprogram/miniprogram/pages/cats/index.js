// 猫咪档案:全量拉取后客户端筛选/排序;支持列表/网格视图切换、点赞、排序切换
// 排序:默认最新登记(created_at 倒序),可切换为按热度(likes 倒序)
const { callFunction } = require('../../utils/cloud');
const { resolveImageUrls } = require('../../utils/image-url');

const CHIPS = [
  { key: 'all', label: '全部' },
  { key: 'male', label: '公猫' },
  { key: 'female', label: '母猫' },
  { key: 'adopted', label: '已领养' },
  { key: 'neutered', label: '已绝育' },
  { key: 'graduated', label: '喵星' }
];

const STATUS_TEXT = {
  available: '待领养',
  adopted: '已领养',
  checking: '审核中',
  graduated: '喵星',
  missing: '失踪'
};

// 由生日推算年龄文本
function ageText(birthday) {
  if (!birthday) return '';
  const birth = new Date(birthday);
  if (isNaN(birth.getTime())) return '';
  const now = new Date();
  let years = now.getFullYear() - birth.getFullYear();
  const mDiff = now.getMonth() - birth.getMonth();
  if (mDiff < 0 || (mDiff === 0 && now.getDate() < birth.getDate())) years--;
  if (years >= 1) return `${years}岁`;
  const months = Math.max(1, (now.getFullYear() - birth.getFullYear()) * 12 + mDiff);
  return `${months}个月`;
}

// 组装副标题:年龄 · 绝育 · 状态(带颜色分段,供 rich-text / 多 text 渲染)
function subParts(cat) {
  const parts = [];
  const age = ageText(cat.birthday);
  if (age) parts.push({ text: age, color: '#666666' });
  parts.push({
    text: cat.is_neutered ? '已绝育' : '未绝育',
    color: cat.is_neutered ? '#666666' : '#0078e9'
  });
  const statusText = STATUS_TEXT[cat.status] || '';
  if (statusText) {
    parts.push({
      text: statusText,
      color: cat.status === 'adopted' || cat.status === 'graduated' ? '#ff8b26' : '#666666'
    });
  }
  return parts;
}

Page({
  data: {
    keyword: '',
    chips: CHIPS,
    activeChip: 'all',
    allCats: [],
    cats: [],
    total: 0,
    loading: true,
    viewMode: 'list', // list | grid
    sortBy: 'newest', // newest | hot
    statusBarHeight: 0,
    scrollTop: 0 // 滚动区顶边(胶囊按钮下边缘)
  },

  onLoad() {
    const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    // 胶囊按钮下边缘 = 滚动区顶边(内容滚到这里硬截断)
    const menuBtn = wx.getMenuButtonBoundingClientRect ? wx.getMenuButtonBoundingClientRect() : null;
    const scrollTop = menuBtn && menuBtn.bottom ? menuBtn.bottom : (info.statusBarHeight || 0) + 44;
    this.setData({ statusBarHeight: info.statusBarHeight || 0, scrollTop });
    this.loadCats();
  },

  onShow() {
    // 自定义 tabBar 选中态
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 });
    }
    if (!this.data.loading && this.data.allCats.length === 0) {
      this.loadCats();
    }
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
    this.setData({ loading: true });
    this.fetchAllCats()
      .then(({ total, list }) => {
        // 默认最新登记在前(云数据库 created_at 是新猫自带的)
        list.sort((a, b) => {
          const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
          const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
          return tb - ta;
        });
        const cats = list.map((c) => ({ ...c, subParts: subParts(c), liked: false }));
        this.setData({ allCats: cats, total }, () => {
          this.applyFilter();
          this.loadLikedStates();
        });
        // 封面/头像换公开临时链接(普通用户无云存储读权限,云函数中转)
        const ids = cats.reduce((acc, c) => acc.concat([c.avatar, c.cover_image]), []);
        resolveImageUrls(ids).then((map) => {
          if (Object.keys(map).length === 0) return;
          const pick = (u) => map[u] || u;
          const mapCat = (c) => ({ ...c, avatar: pick(c.avatar), cover_image: pick(c.cover_image) });
          this.setData({
            allCats: this.data.allCats.map(mapCat),
            cats: this.data.cats.map(mapCat)
          });
        });
      })
      .catch((err) => {
        console.error('加载猫咪列表失败', err);
        this.setData({ loading: false });
        wx.showModal({
          title: '加载失败',
          content: (err.errMsg || String(err)) + '\n\n若提示 permission denied,请在云开发控制台把 cats 集合权限设为「所有用户可读」',
          showCancel: false
        });
      });
  },

  // 批量查询当前用户已点赞的猫
  loadLikedStates() {
    const ids = this.data.allCats.map((c) => c._id);
    if (ids.length === 0) return;
    callFunction('myLikes', { targetType: 'cat', targetIds: ids })
      .then((data) => {
        const likedSet = new Set(data.likedIds || []);
        const mapLiked = (c) => ({ ...c, liked: likedSet.has(c._id) });
        this.setData({
          allCats: this.data.allCats.map(mapLiked),
          cats: this.data.cats.map(mapLiked)
        });
      })
      .catch(() => {});
  },

  applyFilter() {
    const { allCats, activeChip, keyword, sortBy } = this.data;
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
          (c.code || '').toLowerCase().includes(kw) ||
          (c.tags || []).some((t) => String(t).toLowerCase().includes(kw))
      );
    }
    if (sortBy === 'hot') {
      cats = [...cats].sort((a, b) => (b.likes || 0) - (a.likes || 0));
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

  // 切换视图:列表 ⇄ 网格
  onToggleView() {
    this.setData({ viewMode: this.data.viewMode === 'list' ? 'grid' : 'list' });
  },

  // 切换排序:最新 ⇄ 热度
  onToggleSort() {
    this.setData({ sortBy: this.data.sortBy === 'newest' ? 'hot' : 'newest' });
    this.applyFilter();
  },

  // 点赞(catchtap 阻止冒泡到卡片跳转)
  onLike(e) {
    const { id } = e.currentTarget.dataset;
    const idx = this.data.cats.findIndex((c) => c._id === id);
    if (idx < 0) return;
    const item = this.data.cats[idx];
    // 乐观更新
    this.patchCat(id, { liked: !item.liked, likes: (item.likes || 0) + (item.liked ? -1 : 1) });
    callFunction('toggleLike', { targetType: 'cat', targetId: id })
      .then((data) => {
        this.patchCat(id, { liked: data.liked, likes: data.likes });
      })
      .catch(() => {
        // 失败回滚
        this.patchCat(id, { liked: item.liked, likes: item.likes });
      });
  },

  // 同步更新 allCats 与 cats 中同一只猫
  patchCat(id, patch) {
    const mapFn = (c) => (c._id === id ? { ...c, ...patch } : c);
    this.setData({
      allCats: this.data.allCats.map(mapFn),
      cats: this.data.cats.map(mapFn)
    });
  },

  onGoDetail(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/pages/cat-detail/index?id=${id}` });
  }
});
