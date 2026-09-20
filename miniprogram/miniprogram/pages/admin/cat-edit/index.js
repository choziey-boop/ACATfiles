const { callFunction } = require('../../../utils/cloud');
const { ageText } = require('../../../utils/format');
const { uploadImage } = require('../../../utils/upload');
const { chooseImages } = require('../../../utils/choose-image');

const GENDER_OPTIONS = ['male', 'female', 'unknown'];
const GENDER_TEXTS = ['公', '母', '未知'];
const STATUS_OPTIONS = ['available', 'adopted', 'graduated', 'missing'];
const STATUS_TEXTS = ['待领养', '已领养', '回喵星', '已失踪'];
const MAX_PHOTOS = 9;

function formatDate(d) {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

Page({
  data: {
    id: '', // 为空表示新增
    form: {
      name: '',
      code: '',
      campus_area: '',
      tags: '', // 逗号分隔输入
      description: '',
      sort_weight: 0,
      neutered_date: ''
    },
    genderIndex: 2,
    statusIndex: 0,
    isNeutered: false,
    urgent: false,
    avatar: '', // 头像(cloud fileID 或本地临时路径)
    birthday: '', // 生日 YYYY-MM-DD
    birthdayAge: '', // 由生日推断的年龄文案
    photos: [], // 照片数组(fileID/临时路径),第一张为封面
    todayStr: '',
    genderTexts: GENDER_TEXTS,
    statusTexts: STATUS_TEXTS,
    saving: false,
    uploading: false
  },

  onLoad(options) {
    this.setData({ todayStr: formatDate(new Date()) });
    if (options.id) {
      this.setData({ id: options.id });
      wx.setNavigationBarTitle({ title: '编辑猫咪' });
      this.loadCat(options.id);
    } else {
      wx.setNavigationBarTitle({ title: '新增猫咪' });
    }
  },

  loadCat(id) {
    const db = wx.cloud.database();
    Promise.all([
      db.collection('cats').doc(id).get(),
      db
        .collection('cat_images')
        .where({ cat_id: id })
        .orderBy('sort', 'asc')
        .limit(50)
        .get()
        .catch(() => ({ data: [] }))
    ])
      .then(([catRes, imgRes]) => {
        const c = catRes.data;
        // 照片 = 封面 + 相册(去重),兼容旧数据(相册中不含封面的情况)
        const photos = [];
        if (c.cover_image) photos.push(c.cover_image);
        (imgRes.data || []).forEach((img) => {
          if (img.image_url && !photos.includes(img.image_url)) photos.push(img.image_url);
        });
        this.setData({
          form: {
            name: c.name || '',
            code: c.code || '',
            campus_area: c.campus_area || '',
            tags: (c.tags || []).join(','),
            description: c.description || '',
            sort_weight: c.sort_weight || 0,
            neutered_date: c.neutered_date || ''
          },
          genderIndex: Math.max(0, GENDER_OPTIONS.indexOf(c.gender)),
          statusIndex: Math.max(0, STATUS_OPTIONS.indexOf(c.status)),
          isNeutered: !!c.is_neutered,
          urgent: !!c.urgent,
          avatar: c.avatar || '',
          birthday: c.birthday || '',
          birthdayAge: ageText(c.birthday, c.age),
          photos
        });
      })
      .catch((err) => {
        console.error('加载猫咪失败', err);
        wx.showToast({ title: '加载失败', icon: 'none' });
      });
  },

  onInput(e) {
    const { field } = e.currentTarget.dataset;
    this.setData({ [`form.${field}`]: e.detail.value });
  },

  onGenderTap(e) {
    this.setData({ genderIndex: Number(e.currentTarget.dataset.index) });
  },

  onStatusChange(e) {
    this.setData({ statusIndex: Number(e.detail.value) });
  },

  onNeuteredChange(e) {
    this.setData({ isNeutered: e.detail.value });
  },

  onUrgentChange(e) {
    this.setData({ urgent: e.detail.value });
  },

  onNeuteredDateChange(e) {
    this.setData({ 'form.neutered_date': e.detail.value });
  },

  onBirthdayChange(e) {
    const birthday = e.detail.value;
    this.setData({ birthday, birthdayAge: ageText(birthday, '') });
  },

  // 上传单张图片到云存储,走统一压缩(长边 2000px + 质量 70),返回 fileID
  // subDir: 存储子目录(头像用 'avatar',与相册照片分开存放)
  uploadOne(filePath, subDir) {
    const code = this.data.form.code || this.data.id || 'unknown';
    const dir = subDir ? `cat-images/${code}/${subDir}` : `cat-images/${code}`;
    return uploadImage(filePath, dir);
  },

  // 头像处理:1:1 系统裁剪(仅真机)→ Canvas 2D 缩放到 900x900 jpg
  // 任一环节失败都自动降级为原图,不会中断上传
  processAvatarImage(filePath) {
    // 模拟器中 wx.cropImage 可能挂起无回调,直接跳过裁剪
    const platform = (wx.getDeviceInfo && wx.getDeviceInfo().platform) || '';
    const canCrop = platform !== 'devtools' && !!wx.cropImage;

    const doCrop = canCrop
      ? new Promise((resolve, reject) => {
          // 回调写法:cropImage 在部分平台上不返回 Promise
          wx.cropImage({
            src: filePath,
            cropScale: '1:1',
            success: (r) => resolve(r.tempFilePath),
            fail: (err) => {
              if (err.errMsg && err.errMsg.includes('cancel')) return reject(err);
              resolve(filePath); // 裁剪失败降级为原图
            }
          });
        })
      : Promise.resolve(filePath);
    return doCrop.then((cropped) => {
      wx.showLoading({ title: '处理中...', mask: true });
      return this.resizeSquare(cropped, 900);
    });
  },

  // Canvas 2D(新 API)缩放为 size x size 的 jpg,带 8 秒超时,失败退回原图
  resizeSquare(src, size) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(src), 8000);
      const done = (path) => {
        clearTimeout(timer);
        resolve(path);
      };
      wx.createSelectorQuery()
        .in(this)
        .select('#coverCropCanvas')
        .fields({ node: true })
        .exec((res) => {
          const canvas = res && res[0] && res[0].node;
          if (!canvas) return done(src);
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d');
          const img = canvas.createImage();
          img.onload = () => {
            ctx.drawImage(img, 0, 0, size, size);
            wx.canvasToTempFilePath(
              {
                canvas,
                x: 0,
                y: 0,
                width: size,
                height: size,
                destWidth: size,
                destHeight: size,
                fileType: 'jpg',
                quality: 0.82,
                success: (r) => done(r.tempFilePath),
                fail: (err) => {
                  console.warn('[avatar] 导出失败,退回原图', err);
                  done(src);
                }
              },
              this
            );
          };
          img.onerror = (e) => {
            console.warn('[avatar] 图片解码失败,退回原图', e);
            done(src);
          };
          img.src = src;
        });
    });
  },

  onChooseAvatar() {
    if (this.data.uploading) return;
    chooseImages({ count: 1, sizeType: ['compressed'] })
      .then((paths) => {
        if (!paths.length) return;
        const filePath = paths[0];
        let watchdog = null;
        // 先裁剪(1:1,仅真机),再缩放到 900x900,最后上传
        // 裁剪是用户操作,不计入超时;超时只包住上传阶段
        this.processAvatarImage(filePath)
          .then((processed) => {
            this.setData({ uploading: true });
            wx.showLoading({ title: '上传中...', mask: true });
            watchdog = setTimeout(() => {
              wx.hideLoading();
              this.setData({ uploading: false });
              wx.showToast({ title: '上传超时,请检查网络后重试', icon: 'none' });
            }, 30000);
            return this.uploadOne(processed, 'avatar');
          })
          .then((fileID) => {
            this.setData({ avatar: fileID });
          })
          .catch((err) => {
            if (err.errMsg && err.errMsg.includes('cancel')) return; // 用户取消裁剪
            console.error('头像上传失败', err);
            wx.showToast({ title: '上传失败: ' + (err.errMsg || '请重试'), icon: 'none' });
          })
          .finally(() => {
            if (watchdog) clearTimeout(watchdog);
            this.setData({ uploading: false });
            wx.hideLoading();
          });
      })
      .catch((err) => {
        if (err.errMsg && err.errMsg.includes('cancel')) return; // 用户主动取消,不提示
        console.error('chooseMedia 调用失败', err);
        wx.showToast({ title: '无法打开相册: ' + (err.errMsg || '未知错误'), icon: 'none' });
      });
  },

  // 照片:多选追加(不逐张裁剪,统一压缩上传,展示端 aspectFill)
  onAddPhotos() {
    if (this.data.uploading) return;
    const remain = MAX_PHOTOS - this.data.photos.length;
    if (remain <= 0) return;
    chooseImages({ count: remain, sizeType: ['compressed'] })
      .then((files) => {
        if (!files.length) return;
        this.setData({ uploading: true });
        wx.showLoading({ title: '上传中...', mask: true });
        Promise.all(files.map((f) => this.uploadOne(f)))
          .then((fileIDs) => {
            this.setData({ photos: this.data.photos.concat(fileIDs) });
          })
          .catch((err) => {
            console.error('照片上传失败', err);
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

  // 点击照片:设为封面(移到第一位)/预览
  onPhotoTap(e) {
    const index = Number(e.currentTarget.dataset.index);
    const photos = this.data.photos;
    wx.showActionSheet({
      itemList: ['设为封面', '预览'],
      success: (res) => {
        if (res.tapIndex === 0) {
          if (index === 0) return;
          const next = photos.slice();
          const [target] = next.splice(index, 1);
          next.unshift(target);
          this.setData({ photos: next });
          wx.showToast({ title: '已设为封面', icon: 'none' });
        } else if (res.tapIndex === 1) {
          wx.previewImage({ urls: photos, current: photos[index] });
        }
      },
      fail: () => {} // 用户取消
    });
  },

  onPhotoDel(e) {
    const index = Number(e.currentTarget.dataset.index);
    wx.showModal({
      title: '删除照片',
      content: index === 0 ? '这是封面图,确定删除?' : '确定删除这张照片?',
      success: (r) => {
        if (!r.confirm) return;
        const photos = this.data.photos.slice();
        photos.splice(index, 1);
        this.setData({ photos });
      }
    });
  },

  onSave() {
    const { form, genderIndex, statusIndex, isNeutered, urgent, avatar, birthday, photos, saving, uploading, id } = this.data;
    if (saving || uploading) return;

    if (!form.name.trim()) {
      wx.showToast({ title: '请填写猫咪名字', icon: 'none' });
      return;
    }
    if (!avatar) {
      wx.showToast({ title: '请上传头像', icon: 'none' });
      return;
    }
    if (photos.length === 0) {
      wx.showToast({ title: '请至少上传一张照片', icon: 'none' });
      return;
    }

    const catData = {
      name: form.name.trim(),
      code: form.code.trim(),
      gender: GENDER_OPTIONS[genderIndex],
      birthday,
      is_neutered: isNeutered,
      neutered_date: isNeutered ? form.neutered_date : '',
      description: form.description.trim(),
      status: STATUS_OPTIONS[statusIndex],
      campus_area: form.campus_area.trim(),
      tags: form.tags
        .split(/[,，、\s]+/)
        .map((t) => t.trim())
        .filter(Boolean),
      sort_weight: Number(form.sort_weight) || 0,
      urgent,
      avatar,
      cover_image: photos[0]
    };

    this.setData({ saving: true });
    callFunction(
      'saveCat',
      {
        id: id || '',
        cat: catData,
        images: photos.map((url, idx) => ({ image_url: url, sort: idx }))
      },
      { showLoading: true, loadingText: '保存中...' }
    )
      .then(() => {
        wx.showToast({ title: '已保存', icon: 'success' });
        setTimeout(() => wx.navigateBack(), 800);
      })
      .catch(() => {
        this.setData({ saving: false });
      });
  }
});
