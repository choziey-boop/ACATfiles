// 发布/编辑动态(仅管理员):选猫 + 文字 + 图片(最多 9 张)
const { callFunction } = require('../../utils/cloud');
const { chooseImages } = require('../../utils/choose-image');
const { uploadImage } = require('../../utils/upload');

const MAX_IMAGES = 9;

Page({
  data: {
    id: '', // 编辑态的动态 id,空为发布
    catId: '',
    catName: '', // 编辑态直接展示动态里存的猫名
    cats: [], // 可选猫咪 [{_id, name}]
    catNames: [],
    catIndex: -1,
    content: '',
    images: [], // fileID 列表
    saving: false,
    uploading: false
  },

  onLoad(options) {
    if (options.id) {
      // 编辑态:先拿动态里的猫咪信息(不可更换),再加载猫咪列表匹配索引
      this.setData({ id: options.id });
      wx.setNavigationBarTitle({ title: '编辑动态' });
      this.loadActivity(options.id);
    } else {
      wx.setNavigationBarTitle({ title: '发动态' });
      this.loadCats(options.catId || '');
    }
  },

  // 加载猫咪列表供选择(分批,小程序端单次上限 20)
  loadCats(preselectId) {
    const db = wx.cloud.database();
    db.collection('cats')
      .count()
      .then((res) => {
        const total = res.total || 0;
        const tasks = [];
        for (let skip = 0; skip < total; skip += 20) {
          tasks.push(
            db.collection('cats').field({ name: true }).skip(skip).limit(20).get()
          );
        }
        return Promise.all(tasks);
      })
      .then((results) => {
        const cats = results.reduce((acc, r) => acc.concat(r.data || []), []);
        const catIndex = cats.findIndex((c) => c._id === preselectId);
        this.setData({
          cats,
          catNames: cats.map((c) => c.name),
          catIndex,
          catId: catIndex >= 0 ? preselectId : ''
        });
      })
      .catch((err) => {
        console.error('加载猫咪列表失败', err);
        wx.showModal({ title: '加载失败', content: err.errMsg || String(err), showCancel: false });
      });
  },

  // 编辑态:加载原动态,猫咪信息直接带回(不允许更换猫咪)
  loadActivity(id) {
    wx.cloud
      .database()
      .collection('activities')
      .doc(id)
      .get()
      .then((res) => {
        const a = res.data;
        this.setData({
          content: a.content || '',
          images: a.images || [],
          catId: a.cat_id || '',
          catName: a.cat_name || ''
        });
        // 再加载猫咪列表,把索引对上(展示用)
        this.loadCats(a.cat_id || '');
      })
      .catch((err) => {
        console.error('加载动态失败', err);
        wx.showToast({ title: '加载失败', icon: 'none' });
      });
  },

  onCatChange(e) {
    const catIndex = Number(e.detail.value);
    this.setData({ catIndex, catId: this.data.cats[catIndex]._id });
  },

  onInputContent(e) {
    this.setData({ content: e.detail.value });
  },

  onAddImages() {
    if (this.data.uploading) return;
    const remain = MAX_IMAGES - this.data.images.length;
    if (remain <= 0) return;
    chooseImages({ count: remain, sizeType: ['compressed'] })
      .then((files) => {
        if (!files.length) return;
        this.setData({ uploading: true });
        wx.showLoading({ title: '上传中...', mask: true });
        // 按月分文件夹,如 activity-images/202609/
        const now = new Date();
        const month = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
        Promise.all(files.map((f) => uploadImage(f, `activity-images/${month}`)))
          .then((urls) => {
            this.setData({ images: this.data.images.concat(urls) });
          })
          .catch((err) => {
            console.error('上传失败', err);
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

  onDelImage(e) {
    const index = Number(e.currentTarget.dataset.index);
    const images = this.data.images.slice();
    images.splice(index, 1);
    this.setData({ images });
  },

  onSubmit() {
    const { id, catId, content, images, saving, uploading } = this.data;
    if (saving || uploading) return;
    if (!catId) {
      wx.showToast({ title: '请选择猫咪', icon: 'none' });
      return;
    }
    if (!content.trim() && images.length === 0) {
      wx.showToast({ title: '写点文字或传张图吧', icon: 'none' });
      return;
    }
    this.setData({ saving: true });
    const payload = id
      ? { action: 'update', id, content: content.trim(), images }
      : { action: 'publish', catId, content: content.trim(), images };
    callFunction('manageActivity', payload, { showLoading: true, loadingText: '发布中...' })
      .then(() => {
        wx.showToast({ title: id ? '已保存' : '已发布', icon: 'success' });
        setTimeout(() => wx.navigateBack(), 800);
      })
      .catch(() => {
        this.setData({ saving: false });
      });
  }
});
