// 轮播图新增/编辑页(仅管理员)
const { callFunction } = require('../../../utils/cloud');
const { isAdmin } = require('../../../utils/admin');
const { uploadImage, uploadImageRaw } = require('../../../utils/upload');

Page({
  data: {
    id: '', // 空 = 新增
    type: 'home_banner', // home_banner 首页轮播 | home_top 首页顶图
    imageUrl: '',
    title: '',
    content: '',
    saving: false,
    uploading: false,
    uploadingText: '上传中...'
  },

  onLoad(options) {
    isAdmin().then((v) => {
      if (!v) {
        wx.showToast({ title: '无权限访问', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 800);
      }
    });
    const type = options.type === 'home_top' ? 'home_top' : 'home_banner';
    this.setData({ type });
    if (options.id) {
      this.setData({ id: options.id });
      wx.setNavigationBarTitle({ title: type === 'home_top' ? '编辑首页顶图' : '编辑轮播图' });
      this.loadBanner(options.id);
    } else {
      wx.setNavigationBarTitle({ title: type === 'home_top' ? '新增首页顶图' : '新增轮播图' });
    }
  },

  loadBanner(id) {
    const db = wx.cloud.database();
    db.collection('banners')
      .doc(id)
      .get()
      .then((res) => {
        const b = res.data || {};
        this.setData({
          imageUrl: b.image_url || '',
          title: b.title || '',
          content: b.content || ''
        });
      })
      .catch((err) => {
        console.error('加载轮播图失败', err);
        wx.showToast({ title: '加载失败', icon: 'none' });
      });
  },

  onChooseImage() {
    if (this.data.uploading) return;
    // 顶图用原图(不压缩不缩放);轮播图用压缩图省流量
    const isTop = this.data.type === 'home_top';
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sizeType: [isTop ? 'original' : 'compressed'],
      success: (res) => {
        const filePath = res.tempFiles[0].tempFilePath;
        this.setData({ uploading: true, uploadingText: '上传中...' });
        (isTop ? uploadImageRaw(filePath, 'banner-images') : uploadImage(filePath, 'banner-images'))
          .then((fileID) => {
            // 替换旧图时清理云端旧文件
            const old = this.data.imageUrl;
            if (old && old.startsWith('cloud://') && old !== fileID) {
              wx.cloud.deleteFile({ fileList: [old] }).catch(() => {});
            }
            this.setData({ imageUrl: fileID });
          })
          .catch((err) => {
            console.error('上传失败', err);
            wx.showToast({ title: '上传失败', icon: 'none' });
          })
          .finally(() => this.setData({ uploading: false }));
      }
    });
  },

  onTitleInput(e) {
    this.setData({ title: e.detail.value });
  },

  onContentInput(e) {
    this.setData({ content: e.detail.value });
  },

  onCancel() {
    wx.navigateBack();
  },

  onSave() {
    const { id, type, imageUrl, title, content, saving } = this.data;
    if (saving) return;
    if (!imageUrl) {
      wx.showToast({ title: '请上传图片', icon: 'none' });
      return;
    }
    this.setData({ saving: true });
    const action = id ? 'update' : 'add';
    callFunction('manageBanners', {
      action,
      id: id || undefined,
      banner: { type, image_url: imageUrl, title, content }
    })
      .then((data) => {
        // 校验:type 是否真正写入(云函数未重新部署时会丢 type 字段)
        if (action === 'add' && data && data.id) {
          return wx.cloud
            .database()
            .collection('banners')
            .doc(data.id)
            .get()
            .then((res) => {
              if ((res.data.type || 'home_banner') !== type) {
                // 写入的 type 没生效 → 云函数是旧版
                wx.cloud.database().collection('banners').doc(data.id).remove().catch(() => {});
                wx.showModal({
                  title: '云函数需要更新',
                  content: 'manageBanners 云函数不是最新版本,type 字段未保存,本条已撤销。\n\n请在开发者工具中右键 cloudfunctions/manageBanners →「上传并部署:云端安装依赖」,然后重新添加。',
                  showCancel: false
                });
                this.setData({ saving: false });
                return null;
              }
              return data;
            })
            .catch(() => data); // 读取校验失败不阻塞,按成功处理
        }
        return data;
      })
      .then((data) => {
        if (!data) return; // 校验未通过,已提示
        wx.showToast({ title: '已保存', icon: 'success' });
        setTimeout(() => wx.navigateBack(), 500);
      })
      .catch((err) => {
        console.error('保存失败', err);
        wx.showToast({ title: err.message || '保存失败', icon: 'none' });
        this.setData({ saving: false });
      });
  }
});
