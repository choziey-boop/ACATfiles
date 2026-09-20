// 猫咪相册页:所有人可看(点图预览);管理员额外可编辑(删除/设封面/首页轮播/添加)
const { callFunction } = require('../../utils/cloud');
const { resolveImageUrls } = require('../../utils/image-url');
const { chooseImages } = require('../../utils/choose-image');
const { uploadImage } = require('../../utils/upload');
const { isAdmin } = require('../../utils/admin');

const MAX_PHOTOS = 9;

Page({
  data: {
    catId: '',
    catName: '',
    catCode: '',
    coverImage: '',
    photos: [], // [{_id, image_url, is_banner, checked}]
    isAdmin: false,
    editing: false,
    selectedCount: 0,
    uploading: false,
    loading: true
  },

  onLoad(options) {
    if (!options.catId) {
      wx.showToast({ title: '缺少参数', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    this.setData({ catId: options.catId });
    if (options.name) {
      const name = decodeURIComponent(options.name);
      this.setData({ catName: name });
      wx.setNavigationBarTitle({ title: `${name}的相册` });
    }
    isAdmin().then((v) => this.setData({ isAdmin: v }));
    this.loadData();
  },

  loadData() {
    const db = wx.cloud.database();
    Promise.all([
      db.collection('cats').doc(this.data.catId).get(),
      db
        .collection('cat_images')
        .where({ cat_id: this.data.catId })
        .orderBy('sort', 'asc')
        .limit(20)
        .get()
        .catch(() => ({ data: [] }))
    ])
      .then(([catRes, imgRes]) => {
        const cover = catRes.data.cover_image || '';
        // 封面排在最前展示(不改动数据库顺序)
        const photos = (imgRes.data || [])
          .map((p) => ({ ...p, checked: false }))
          .sort((a, b) => {
            if (a.image_url === cover) return -1;
            if (b.image_url === cover) return 1;
            return (a.sort || 0) - (b.sort || 0);
          });
        this.setData({ coverImage: cover, catCode: catRes.data.code || '', photos, loading: false, selectedCount: 0, editing: false });
        // 换公开链接仅用于展示;image_url 始终保留原始 cloud://,供管理员删除/设封面匹配
        const ids = photos.map((p) => p.image_url).concat([cover]);
        resolveImageUrls(ids).then((map) => {
          if (Object.keys(map).length === 0) return;
          const coverDisplay = map[cover] || cover;
          this.setData({
            coverImage: coverDisplay,
            photos: this.data.photos.map((p) => {
              const display = map[p.image_url] || p.image_url;
              return { ...p, display, isCover: !!coverDisplay && display === coverDisplay };
            })
          });
        });
      })
      .catch((err) => {
        console.error('加载相册失败', err);
        this.setData({ loading: false });
        wx.showModal({ title: '加载失败', content: err.errMsg || String(err), showCancel: false });
      });
  },

  selectedUrls() {
    return this.data.photos.filter((p) => p.checked).map((p) => p.image_url);
  },

  // 进入/退出编辑态(仅管理员)
  onToggleEdit() {
    if (!this.data.isAdmin) return;
    const photos = this.data.photos.map((p) => ({ ...p, checked: false }));
    this.setData({ editing: !this.data.editing, photos, selectedCount: 0 });
  },

  // 编辑态:点照片切换选中;其他情况:点照片预览
  onPhotoTap(e) {
    const { url, index } = e.currentTarget.dataset;
    if (!this.data.isAdmin || !this.data.editing) {
      wx.previewImage({ urls: this.data.photos.map((p) => p.display || p.image_url), current: url });
      return;
    }
    const checked = !this.data.photos[index].checked;
    this.setData({
      [`photos[${index}].checked`]: checked,
      selectedCount: this.data.selectedCount + (checked ? 1 : -1)
    });
  },

  // 添加照片(两种模式下都可用)
  onAddPhotos() {
    if (this.data.uploading) return;
    const remain = MAX_PHOTOS - this.data.photos.length;
    if (remain <= 0) {
      wx.showToast({ title: `最多 ${MAX_PHOTOS} 张`, icon: 'none' });
      return;
    }
    chooseImages({ count: remain, sizeType: ['compressed'] })
      .then((files) => {
        if (!files.length) return;
        this.setData({ uploading: true });
        wx.showLoading({ title: '上传中...', mask: true });
        Promise.all(files.map((f) => uploadImage(f, `cat-images/${this.data.catCode || 'unknown'}`)))
          .then((urls) =>
            callFunction('managePhotos', { action: 'add', catId: this.data.catId, urls })
          )
          .then(() => this.loadData())
          .catch((err) => {
            console.error('添加照片失败', err);
            wx.showToast({ title: '部分图片上传失败', icon: 'none' });
          })
          .finally(() => {
            this.setData({ uploading: false });
            wx.hideLoading();
          });
      })
      .catch((err) => {
        if (err.errMsg && err.errMsg.includes('cancel')) return;
        console.error('chooseMedia 调用失败', err);
        wx.showToast({ title: '无法打开相册: ' + (err.errMsg || '未知错误'), icon: 'none' });
      });
  },

  // 批量删除
  onBatchDelete() {
    const urls = this.selectedUrls();
    if (urls.length === 0) {
      wx.showToast({ title: '先选择照片', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '删除照片',
      content: `确定删除选中的 ${urls.length} 张照片吗?`,
      confirmColor: '#e8604c',
      success: (r) => {
        if (!r.confirm) return;
        callFunction(
          'managePhotos',
          { action: 'delete', catId: this.data.catId, urls },
          { showLoading: true, loadingText: '删除中...' }
        )
          .then(() => {
            wx.showToast({ title: '已删除', icon: 'success' });
            this.loadData();
          })
          .catch(() => {});
      }
    });
  },

  // 设为封面(取选中第一张)
  onSetCover() {
    const urls = this.selectedUrls();
    if (urls.length !== 1) {
      wx.showToast({ title: '请选择 1 张照片', icon: 'none' });
      return;
    }
    callFunction(
      'managePhotos',
      { action: 'setCover', catId: this.data.catId, url: urls[0] },
      { showLoading: true, loadingText: '设置中...' }
    )
      .then(() => {
        wx.showToast({ title: '已设为封面', icon: 'success' });
        this.loadData();
      })
      .catch(() => {});
  }
});
