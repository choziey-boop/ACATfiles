const { CAT_STATUS, GENDER } = require('../../utils/constants');
const { ageText } = require('../../utils/format');
const { callFunction } = require('../../utils/cloud');
const { resolveImageUrls } = require('../../utils/image-url');
const { isAdmin } = require('../../utils/admin');

// 页面路径(用于分享)
const PAGE_PATH = 'pages/cat-detail/index';

function formatDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

Page({
  data: {
    catId: '',
    cat: null,
    mainImages: [],
    images: [],
    activities: [],
    liked: false, // 当前用户是否已赞该猫
    isAdmin: false,
    albumPreview: [], // 相册预览(前 4 张),全部在相册页看
    activityLikes: 0, // 该猫所有动态的点赞数合计
    totalLikes: 0, // 头部爱心数 = 猫自身点赞 + 动态点赞合计
    loading: true,
    notFound: false,
    navBackTop: 0, // 返回按钮顶边距(对齐胶囊)
    isDirectEntry: false, // 扫码/分享直达(无上一页),返回键改为回首页
    showShare: false, // 分享弹窗
    generatingPoster: false, // 海报生成中
    qrcodeUrl: '', // 小程序码临时链接
    qrcodeBase64: '' // 小程序码 base64(供 Canvas 海报用)
  },

  onLoad(options) {
    console.log('[cat-detail] onLoad options:', JSON.stringify(options));
    // 扫小程序码时参数在 options.scene 里,需要解码
    let catId = options.id || '';
    if (!catId && options.scene) {
      try {
        catId = decodeURIComponent(options.scene);
      } catch (e) {
        catId = options.scene; // 解码失败直接用原文
      }
    }
    console.log('[cat-detail] 解析出 catId:', catId);
    if (!catId) {
      this.setData({ notFound: true, loading: false });
      return;
    }
    // 返回按钮垂直对齐右上角胶囊
    const menuBtn = wx.getMenuButtonBoundingClientRect ? wx.getMenuButtonBoundingClientRect() : null;
    if (menuBtn) {
      this.setData({ navBackTop: menuBtn.top + (menuBtn.height - 32) / 2 });
    }
    // 扫码/分享直达(无正常上一页)时,返回键改为回首页
    const stackLen = getCurrentPages().length;
    const isDirect = stackLen <= 1 || this._isScanOrShareEntry();
    console.log('[cat-detail] 页面栈长度:', stackLen, '是否直达:', isDirect);
    this.setData({ isDirectEntry: isDirect });
    this.setData({ catId: catId });
    // 浏览量 +1(异步,不阻塞页面)
    callFunction('recordView', { catId: catId }).catch(() => {});
    this.loadDetail(catId);
    this.loadActivities(catId);
    isAdmin().then((v) => this.setData({ isAdmin: v }));
  },

  // 头部爱心数 = 猫自身点赞 + 该猫所有动态的点赞合计
  updateTotalLikes() {
    const catLikes = (this.data.cat && this.data.cat.likes) || 0;
    this.setData({ totalLikes: catLikes + this.data.activityLikes });
  },

  loadDetail(id) {
    console.log('[cat-detail] loadDetail id:', id);
    const db = wx.cloud.database();
    Promise.all([
      db.collection('cats').doc(id).get().catch(e => { console.error('[cat-detail] 查猫咪失败:', e); throw e; }),
      db
        .collection('cat_images')
        .where({ cat_id: id })
        .orderBy('sort', 'asc')
        .limit(20)
        .get()
        .catch(() => ({ data: [] }))
    ])
      .then(([catRes, imgRes]) => {
        const cat = catRes.data;
        const albumUrls = (imgRes.data || []).map((i) => i.image_url);
        // 顶部大图:只显示封面图(相册页勾选/默认第一张);未设封面则不显示轮播
        const mainImages = cat.cover_image ? [cat.cover_image] : [];
        this.setData({
          cat: {
            ...cat,
            statusText: CAT_STATUS[cat.status] || cat.status,
            genderText: GENDER[cat.gender] || cat.gender,
            ageText: ageText(cat.birthday, cat.age),
            birthdayText: cat.birthday ? String(cat.birthday).replace(/-/g, '/') : '',
            views: (cat.views || 0) + 1, // 本次浏览
            likes: cat.likes || 0
          },
          mainImages,
          images: albumUrls,
          albumPreview: albumUrls.slice(0, 4),
          loading: false
        });
        // 大图/相册换公开临时链接(普通用户无云存储读权限,云函数中转)
        const ids = [cat.cover_image].concat(albumUrls);
        resolveImageUrls(ids).then((map) => {
          if (Object.keys(map).length === 0) return;
          const pick = (u) => map[u] || u;
          this.setData({
            mainImages: this.data.mainImages.map(pick),
            images: this.data.images.map(pick),
            albumPreview: this.data.albumPreview.map(pick)
          });
        });
        this.updateTotalLikes();
        // 当前用户是否已赞
        callFunction('myLikes', { targetType: 'cat', targetIds: [id] })
          .then((data) => this.setData({ liked: (data.likedIds || []).includes(id) }))
          .catch(() => {});
      })
      .catch((err) => {
        console.error('加载猫咪详情失败', err);
        this.setData({ notFound: true, loading: false });
        wx.showModal({
          title: '加载失败',
          content: err.errMsg || String(err),
          showCancel: false
        });
      });
  },

  loadActivities(catId) {
    const db = wx.cloud.database();
    db.collection('activities')
      .where({ cat_id: catId })
      .orderBy('created_at', 'desc')
      .limit(20)
      .get()
      .then((res) => {
        const activities = (res.data || []).map((a) => ({
          ...a,
          created_at_text: formatDate(a.created_at),
          likes: a.likes || 0,
          liked: false
        }));
        this.setData({ activities });
        // 动态点赞合计,计入头部爱心数
        this.setData({ activityLikes: activities.reduce((sum, a) => sum + (a.likes || 0), 0) });
        this.updateTotalLikes();
        // 动态图片换公开临时链接
        const imgIds = activities.reduce((acc, a) => acc.concat(a.images || []), []);
        resolveImageUrls(imgIds).then((map) => {
          if (Object.keys(map).length === 0) return;
          const pick = (u) => map[u] || u;
          this.setData({
            activities: this.data.activities.map((a) => ({ ...a, images: (a.images || []).map(pick) }))
          });
        });
        if (activities.length === 0) return;
        callFunction('myLikes', { targetType: 'activity', targetIds: activities.map((a) => a._id) })
          .then((data) => {
            const likedSet = new Set(data.likedIds || []);
            this.setData({
              activities: this.data.activities.map((a) => ({ ...a, liked: likedSet.has(a._id) }))
            });
          })
          .catch(() => {});
      })
      .catch((err) => console.error('加载动态失败', err));
  },

  // 猫咪点赞
  onLikeCat() {
    const { cat, liked } = this.data;
    if (!cat || this._likingCat) return;
    this._likingCat = true;
    // 先本地乐观更新,失败回滚
    this.setData({ liked: !liked, 'cat.likes': (cat.likes || 0) + (liked ? -1 : 1) });
    this.updateTotalLikes();
    callFunction('toggleLike', { targetType: 'cat', targetId: this.data.catId })
      .then((data) => {
        this.setData({ liked: data.liked, 'cat.likes': data.likes });
        this.updateTotalLikes();
      })
      .catch(() => {
        this.setData({ liked, 'cat.likes': cat.likes });
        this.updateTotalLikes();
      })
      .finally(() => {
        this._likingCat = false;
      });
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
    this.syncActivityLikes();
    callFunction('toggleLike', { targetType: 'activity', targetId: id })
      .then((data) => {
        this.setData({
          [`activities[${idx}].liked`]: data.liked,
          [`activities[${idx}].likes`]: data.likes
        });
        this.syncActivityLikes();
      })
      .catch(() => {});
  },

  // 重算动态点赞合计并刷新头部爱心数
  syncActivityLikes() {
    this.setData({ activityLikes: this.data.activities.reduce((sum, a) => sum + (a.likes || 0), 0) });
    this.updateTotalLikes();
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

  // 「更多」→ 相册页(展示全部图片;管理员在该页可编辑)
  onGoAlbum() {
    wx.navigateTo({
      url: `/pages/cat-photos/index?catId=${this.data.catId}&name=${encodeURIComponent(this.data.cat.name || '')}`
    });
  },

  // 相册图片全屏预览(支持双指缩放)
  onPreviewImage(e) {
    const { url } = e.currentTarget.dataset;
    wx.previewImage({
      urls: this.data.images,
      current: url
    });
  },

  onPreviewMain(e) {
    const { url } = e.currentTarget.dataset;
    wx.previewImage({
      urls: this.data.mainImages,
      current: url
    });
  },

  onPreviewActivityImage(e) {
    const { url, images } = e.currentTarget.dataset;
    wx.previewImage({ urls: images, current: url });
  },

  // 返回上一页;扫码直达时无上一页,回首页
  onBack() {
    if (this.data.isDirectEntry) {
      wx.switchTab({ url: '/pages/home/index' });
    } else {
      wx.navigateBack({ delta: 1 });
    }
  },

  // 判断是否扫码/分享直达(此时没有正常的上一页,返回键应回首页)
  _isScanOrShareEntry() {
    let scene = 0;
    try {
      const enter = (wx.getEnterOptionsSync && wx.getEnterOptionsSync()) || {};
      const launch = (wx.getLaunchOptionsSync && wx.getLaunchOptionsSync()) || {};
      scene = enter.scene || launch.scene || 0;
    } catch (e) {}
    console.log('[cat-detail] 进入场景值 scene:', scene);
    // 1007/1008/1044 分享卡片;1047/1048/1049 扫小程序码;1011/1012/1013 扫二维码
    const directScenes = [1007, 1008, 1044, 1047, 1048, 1049, 1011, 1012, 1013];
    return directScenes.indexOf(Number(scene)) >= 0;
  },

  // 去领养申请
  onGoAdopt() {
    wx.navigateTo({
      url: `/pages/adopt-apply/index?catId=${this.data.catId}&name=${encodeURIComponent(this.data.cat.name)}`
    });
  },

  // ========== 分享 + 海报 + 二维码 ==========

  // 微信转发(好友/群)
  onShareAppMessage() {
    const cat = this.data.cat || {};
    return {
      title: `校园猫咪「${cat.name || ''}」`,
      path: `${PAGE_PATH}?id=${this.data.catId}`,
      imageUrl: cat.cover_image || ''
    };
  },

  // 分享到朋友圈
  onShareTimeline() {
    const cat = this.data.cat || {};
    return {
      title: `校园猫咪「${cat.name || ''}」`,
      query: `id=${this.data.catId}`,
      imageUrl: cat.cover_image || ''
    };
  },

  // 点击分享按钮
  onShareTap() {
    this.setData({ showShare: true });
  },

  // 关闭分享弹窗
  onCloseShare() {
    this.setData({ showShare: false });
  },

  // 「生成海报」→ Canvas 绘制 + 保存到相册
  onGenPoster() {
    this.setData({ showShare: false, generatingPoster: true });
    wx.showLoading({ title: '生成海报...', mask: true });

    // 确保有小程序码
    this._ensureQrcode()
      .then(() => {
        const poster = this.selectComponent('#posterCanvas');
        if (!poster) throw new Error('海报组件未就绪');
        // 直接传 qrcodeUrl,不等 setData 同步
        return poster.generate({ catId: this.data.catId, qrcodeUrl: this.data.qrcodeUrl, qrcodeBase64: this.data.qrcodeBase64, qrcodeFileID: this.data.qrcodeFileID });
      })
      .then((tempPath) => {
        wx.hideLoading();
        // 预览海报
        wx.previewImage({ urls: [tempPath], current: tempPath });
        // 保存到相册
        wx.saveImageToPhotosAlbum({
          filePath: tempPath,
          success: () => wx.showToast({ title: '已保存到相册', icon: 'success' }),
          fail: (err) => {
            if (err.errMsg && err.errMsg.includes('deny')) {
              wx.showModal({ title: '需要相册权限', content: '请在设置中允许保存图片', showCancel: false });
            }
          }
        });
      })
      .catch((err) => {
        wx.hideLoading();
        this.setData({ generatingPoster: false });
        wx.showToast({ title: '生成失败: ' + (err.message || '请重试'), icon: 'none' });
      });
  },

  // 「下载二维码」→ 只保存小程序码图片
  onDownloadQrcode() {
    this.setData({ showShare: false });
    wx.showLoading({ title: '生成二维码...', mask: true });

    this._ensureQrcode()
      .then(() => {
        wx.hideLoading();
        if (!this.data.qrcodeUrl) {
          wx.showToast({ title: '二维码生成失败', icon: 'none' });
          return;
        }
        // 下载到临时文件再保存
        wx.downloadFile({
          url: this.data.qrcodeUrl,
          success: (res) => {
            if (res.statusCode !== 200) {
              wx.showToast({ title: '下载失败', icon: 'none' });
              return;
            }
            wx.saveImageToPhotosAlbum({
              filePath: res.tempFilePath,
              success: () => wx.showToast({ title: '已保存到相册', icon: 'success' }),
              fail: (err) => {
                if (err.errMsg && err.errMsg.includes('deny')) {
                  wx.showModal({ title: '需要相册权限', content: '请在设置中允许保存图片', showCancel: false });
                }
              }
            });
          },
          fail: () => wx.showToast({ title: '下载失败', icon: 'none' })
        });
      })
      .catch((err) => {
        wx.hideLoading();
        wx.showToast({ title: '生成失败: ' + (err.message || '请重试'), icon: 'none' });
      });
  },

  // 确保小程序码已生成(有缓存则跳过)
  _ensureQrcode() {
    if (this.data.qrcodeUrl) return Promise.resolve();
    return callFunction('getCatQrcode', { catId: this.data.catId }, { silent: true })
      .then((data) => {
        console.log('[qrcode] getCatQrcode 返回:', data);
        this.setData({
          qrcodeUrl: data.tempUrl || '',
          qrcodeBase64: data.base64 || '',
          qrcodeFileID: data.fileID || ''
        });
      })
      .catch((err) => {
        console.error('获取小程序码失败', err);
        // 不阻塞海报生成(海报可以没有二维码)
      });
  }
});
