// 海报绘制组件:接收猫咪数据 + 二维码 URL,Canvas 2D 绘制后导出临时图片
const DPR = 3; // 设备像素比(固定 3 保证清晰)
const W = 610;
const H = 930;

Component({
  properties: {
    visible: { type: Boolean, value: false },
    catName: { type: String, value: '' },
    catGender: { type: String, value: '' },
    catAge: { type: String, value: '' },
    catNeutered: { type: Boolean, value: false },
    catAvatarUrl: { type: String, value: '' },
    catId: { type: String, value: '' },
    qrcodeUrl: { type: String, value: '' },
    qrcodeBase64: { type: String, value: '' },
    qrcodeFileID: { type: String, value: '' }
  },

  data: {
    generating: false
  },

  methods: {
    // 生成海报(外部调用,可传入 qrcodeUrl 覆盖)
    generate(opts) {
      if (this.data.generating) return Promise.reject('generating');
      if (opts && opts.catId) this.setData({ catId: opts.catId });
      if (opts && opts.qrcodeUrl) this.setData({ qrcodeUrl: opts.qrcodeUrl });
      if (opts && opts.qrcodeBase64) this.setData({ qrcodeBase64: opts.qrcodeBase64 });
      if (opts && opts.qrcodeFileID) this.setData({ qrcodeFileID: opts.qrcodeFileID });
      this.setData({ generating: true });
      return this._draw()
        .then((tempPath) => {
          this.setData({ generating: false });
          return tempPath;
        })
        .catch((err) => {
          this.setData({ generating: false });
          throw err;
        });
    },

    _draw() {
      return new Promise((resolve, reject) => {
        wx.createSelectorQuery()
          .in(this)
          .select('#posterCanvas')
          .fields({ node: true })
          .exec(async (res) => {
            const canvas = res && res[0] && res[0].node;
            if (!canvas) return reject(new Error('canvas 未就绪'));
            try {
              const tempPath = await this._renderPoster(canvas);
              resolve(tempPath);
            } catch (e) {
              reject(e);
            }
          });
      });
    },

    async _renderPoster(canvas) {
      canvas.width = W * DPR;
      canvas.height = H * DPR;
      const ctx = canvas.getContext('2d');
      ctx.scale(DPR, DPR);

      // 先把云存储 ID 换成临时 HTTP 链接(Canvas createImage 只认 http)
      let avatarUrl = this.data.catAvatarUrl || '';
      if (avatarUrl && avatarUrl.indexOf('cloud://') === 0) {
        try {
          const res = await wx.cloud.getTempFileURL({ fileList: [avatarUrl] });
          const item = res.fileList && res.fileList[0];
          if (item && item.tempFileURL) avatarUrl = item.tempFileURL;
        } catch (_) {}
      }

      // 1. 背景素材
      const bg = await this._loadImage(canvas, '/images/poster.png');
      ctx.drawImage(bg, 0, 0, W, H);

      // 2. 猫咪头像(大圆形,占满上半部分)
      if (avatarUrl) {
        try {
          const avatar = await this._loadImage(canvas, avatarUrl);
          const cx = W / 2, cy = 260, r = 200;

          // 先画白色边框圆(无阴影)
          ctx.save();
          ctx.beginPath();
          ctx.arc(cx, cy, r + 8, 0, Math.PI * 2);
          ctx.fillStyle = '#ffffff';
          ctx.fill();
          ctx.restore();

          // 再画头像(圆形裁切,保持比例居中)
          ctx.save();
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.clip();
          // 保持比例:取短边填满圆,居中裁切
          const imgW = avatar.width || r * 2;
          const imgH = avatar.height || r * 2;
          const scale = Math.max((r * 2) / imgW, (r * 2) / imgH);
          const drawW = imgW * scale;
          const drawH = imgH * scale;
          ctx.drawImage(avatar, cx - drawW / 2, cy - drawH / 2, drawW, drawH);
          ctx.restore();
        } catch (_) {}
      }

      // 3. 信息区域(无背景,仅定位用)
      const cardX = 30, cardY = 520, cardW = W - 60, cardH = 280;

      // 4. 猫名 + 性别
      ctx.fillStyle = '#000000';
      ctx.font = '40px sans-serif';
      ctx.textBaseline = 'top';
      const nameX = cardX + 55;
      ctx.fillText(this.data.catName || '', nameX, cardY + 20);
      const nameWidth = ctx.measureText(this.data.catName || '').width;

      // 性别符号
      if (this.data.catGender) {
        const genderIcon = this.data.catGender === 'male' ? '/assets/male.svg' : '/assets/female.svg';
        try {
          const icon = await this._loadImage(canvas, genderIcon);
          ctx.drawImage(icon, nameX + nameWidth + 10, cardY + 35, 22, 22);
        } catch (_) {}
      }

      // 5. 信息行(必须 await)
      const infoX = nameX;
      let infoY = cardY + 95;

      // 年龄
      await this._drawInfoRow(ctx, canvas, infoX, infoY, '年龄', this.data.catAge || '未知', '/assets/info-age.svg');
      infoY += 90;
      // 绝育状态
      await this._drawInfoRow(ctx, canvas, infoX, infoY, '绝育状态', this.data.catNeutered ? '已绝育' : '未绝育', '/assets/info-neutered.svg');

      // 6. 二维码(右侧) — 优先用云函数小程序码 base64,回退客户端纯文本 QR
      const qrSize = 140;
      const qrX = cardX + cardW - qrSize - 75;
      const qrY = cardY + 70;
      // 白色底
      ctx.save();
      this._roundRect(ctx, qrX - 10, qrY - 10, qrSize + 20, qrSize + 40, 12);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.restore();
      try {
        let qrDrawn = false;
        // 优先:云函数返回的小程序码 base64
        if (this.data.qrcodeBase64) {
          try {
            const qrDataUrl = 'data:image/png;base64,' + this.data.qrcodeBase64;
            const qr = await this._loadImage(canvas, qrDataUrl);
            ctx.drawImage(qr, qrX, qrY, qrSize, qrSize);
            qrDrawn = true;
            console.log('[poster] 小程序码绘制成功(base64)');
          } catch (e) { console.warn('[poster] 小程序码 base64 加载失败:', e); }
        }
        // 回退:客户端生成纯文本 QR
        if (!qrDrawn) {
          const qrScene = this.data.catId || 'cat';
          const qrMatrix = this._encodeQR('pages/cat-detail/index?id=' + qrScene);
          const n = qrMatrix.length;
          const cellSize = qrSize / (n + 8);
          const offset = cellSize * 4;
          ctx.fillStyle = '#000000';
          for (let r = 0; r < n; r++) {
            for (let c = 0; c < n; c++) {
              if (qrMatrix[r][c]) {
                ctx.fillRect(qrX + offset + c * cellSize, qrY + offset + r * cellSize, cellSize + 0.5, cellSize + 0.5);
              }
            }
          }
          console.log('[poster] 使用客户端纯文本 QR(回退)');
        }
        ctx.fillStyle = '#686868';
        ctx.font = '20px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText('扫码了解更多', qrX + qrSize / 2, qrY + qrSize + 8);
        ctx.textAlign = 'left';
      } catch (e) { console.error('[poster] QR 绘制失败:', e); }

      // 导出
      return new Promise((resolve, reject) => {
        wx.canvasToTempFilePath(
          { canvas, x: 0, y: 0, width: W * DPR, height: H * DPR, destWidth: W * 2, destHeight: H * 2, fileType: 'jpg', quality: 0.92,
            success: (r) => resolve(r.tempFilePath),
            fail: reject
          },
          this
        );
      });
    },

    // 绘制信息行(圆形图标底 + 标签 + 值)
    async _drawInfoRow(ctx, canvas, x, y, label, value, iconPath) {
      // 图标圆底
      ctx.beginPath();
      ctx.arc(x + 20, y + 20, 20, 0, Math.PI * 2);
      ctx.fillStyle = '#faefdb';
      ctx.fill();
      // 图标
      try {
        const icon = await this._loadImage(canvas, iconPath);
        ctx.drawImage(icon, x + 6, y + 6, 28, 28);
      } catch (_) {}
      // 标签
      ctx.fillStyle = '#999999';
      ctx.font = '20px sans-serif';
      ctx.textBaseline = 'top';
      ctx.fillText(label, x + 50, y + 2);
      // 值
      ctx.fillStyle = '#000000';
      ctx.font = '20px sans-serif';
      ctx.fillText(value, x + 50, y + 30);
    },

    // 下载远程文件转 base64 data URL(Canvas createImage 只支持 http/data:image)
    // 用 fileID 通过云 SDK 下载(自带认证),转 data URL
    _downloadCloudFileAsDataUrl(fileID) {
      return new Promise((resolve, reject) => {
        console.log('[poster] wx.cloud.downloadFile:', fileID);
        wx.cloud.downloadFile({
          fileID,
          success: (res) => {
            console.log('[poster] 云下载完成, tempFilePath:', res.tempFilePath);
            const fs = wx.getFileSystemManager();
            const buf = fs.readFileSync(res.tempFilePath);
            console.log('[poster] 文件大小:', buf.byteLength, 'bytes');
            if (!buf || buf.byteLength === 0) return reject(new Error('文件为空'));
            const base64 = wx.arrayBufferToBase64(buf);
            console.log('[poster] base64 长度:', base64.length);
            resolve('data:image/png;base64,' + base64);
          },
          fail: (e) => { console.error('[poster] 云下载失败:', e); reject(e); }
        });
      });
    },

    _loadImage(canvas, src) {
      return new Promise((resolve, reject) => {
        const img = canvas.createImage();
        img.onload = () => resolve(img);
        img.onerror = (e) => reject(e);
        img.src = src;
      });
    },

    // ===== QR Code 客户端生成(version 2-M, byte mode) =====
    _encodeQR(text) {
      const EC_LEVEL = 'M';
      const VERSION = 2;
      const SIZE = 25;
      const TOTAL_D = 44, EC_PER_BLOCK = 10, NUM_BLOCKS = 1;
      const DATA_PER = TOTAL_D;

      // 模式指示符 + 字符计数 + 数据
      const bits = [0, 0, 1]; // byte mode
      const len = text.length;
      for (let i = 7; i >= 0; i--) bits.push((len >> i) & 1);
      for (let i = 0; i < text.length; i++) {
        const c = text.charCodeAt(i);
        for (let j = 7; j >= 0; j--) bits.push((c >> j) & 1);
      }
      bits.push(0, 0, 0, 0); // terminator
      while (bits.length % 8 !== 0) bits.push(0);
      const padBytes = [0xEC, 0x11];
      let pi = 0;
      while (bits.length < TOTAL_D * 8) {
        const b = padBytes[pi % 2];
        for (let j = 7; j >= 0; j--) bits.push((b >> j) & 1);
        pi++;
      }

      // 数据码字
      const dataCW = [];
      for (let i = 0; i < bits.length; i += 8) {
        let v = 0;
        for (let j = 0; j < 8; j++) v = (v << 1) | (bits[i + j] || 0);
        dataCW.push(v);
      }

      // Reed-Solomon EC
      const gen = this._rsGenPoly(EC_PER_BLOCK);
      const ecCW = this._rsEncode(dataCW, gen, EC_PER_BLOCK);
      const allCW = dataCW.concat(ecCW);

      // 初始化矩阵
      const m = Array.from({ length: SIZE }, () => Array(SIZE).fill(false));
      const reserved = Array.from({ length: SIZE }, () => Array(SIZE).fill(false));

      // Finder patterns
      const putFinder = (r, c) => {
        for (let dr = -1; dr <= 7; dr++) {
          for (let dc = -1; dc <= 7; dc++) {
            const rr = r + dr, cc = c + dc;
            if (rr < 0 || rr >= SIZE || cc < 0 || cc >= SIZE) continue;
            const inOuter = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6;
            const inInner = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
            const onBorder = dr === 0 || dr === 6 || dc === 0 || dc === 6;
            m[rr][cc] = inInner || (inOuter && onBorder);
            reserved[rr][cc] = true;
          }
        }
      };
      putFinder(0, 0);
      putFinder(0, SIZE - 7);
      putFinder(SIZE - 7, 0);

      // Timing patterns
      for (let i = 8; i < SIZE - 8; i++) {
        m[6][i] = m[i][6] = i % 2 === 0;
        reserved[6][i] = reserved[i][6] = true;
      }

      // Dark module
      m[SIZE - 8][8] = true;
      reserved[SIZE - 8][8] = true;

      // Reserve format info areas
      for (let i = 0; i < 15; i++) {
        if (i < 6) reserved[8][i] = true;
        else if (i < 8) reserved[8][i + 1] = true;
        else if (i < 9) reserved[8][i + 2] = true;
        else reserved[8][i + 2] = true;
      }
      for (let i = 0; i < 7; i++) reserved[SIZE - 1 - i][8] = true;
      for (let i = 0; i < 8; i++) reserved[i][8] = true;
      reserved[8][8] = true;

      // Place data (zigzag)
      let bi = 0;
      for (let right = SIZE - 1; right >= 1; right -= 2) {
        if (right === 6) right = 5;
        for (let vert = 0; vert < SIZE; vert++) {
          for (let j = 0; j < 2; j++) {
            const col = right - j;
            const row = ((Math.floor((SIZE - 1 - right) / 2)) % 2 === 0) ? SIZE - 1 - vert : vert;
            if (!reserved[row][col] && bi < allCW.length * 8) {
              m[row][col] = ((allCW[bi >> 3] >> (7 - (bi & 7))) & 1) === 1;
              bi++;
            }
          }
        }
      }

      // Apply mask 0 (checkerboard)
      for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
          if (!reserved[r][c] && (r + c) % 2 === 0) m[r][c] = !m[r][c];
        }
      }

      // Format info (mask 0 = 000, EC M = 00)
      const fmtBits = [0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 1, 0, 0, 0, 1];
      const fmtPositions1 = [[8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8], [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]];
      const fmtPositions2 = [[SIZE - 1, 8], [SIZE - 2, 8], [SIZE - 3, 8], [SIZE - 4, 8], [SIZE - 5, 8], [SIZE - 6, 8], [SIZE - 7, 8], [8, SIZE - 8], [8, SIZE - 7], [8, SIZE - 6], [8, SIZE - 5], [8, SIZE - 4], [8, SIZE - 3], [8, SIZE - 2], [8, SIZE - 1]];
      for (let i = 0; i < 15; i++) {
        m[fmtPositions1[i][0]][fmtPositions1[i][1]] = !!fmtBits[i];
        m[fmtPositions2[i][0]][fmtPositions2[i][1]] = !!fmtBits[i];
      }

      return m;
    },

    _rsGenPoly(nsym) {
      let g = [1];
      for (let i = 0; i < nsym; i++) {
        const ng = Array(g.length + 1).fill(0);
        for (let j = 0; j < g.length; j++) {
          ng[j] ^= g[j];
          ng[j + 1] ^= this._gfMul(g[j], this._gfPow(2, i));
        }
        g = ng;
      }
      return g;
    },

    _rsEncode(data, gen, nsym) {
      const res = new Array(nsym).fill(0);
      for (let i = 0; i < data.length; i++) {
        const f = data[i] ^ res.shift();
        res.push(0);
        for (let j = 0; j < nsym; j++) {
          res[j] ^= this._gfMul(gen[j + 1], f);
        }
      }
      return res;
    },

    _gfMul(a, b) {
      let r = 0;
      for (let i = 0; i < 8; i++) {
        if (b & 1) r ^= a;
        const hi = a & 128;
        a = (a << 1) & 255;
        if (hi) a ^= 0x1d;
        b >>= 1;
      }
      return r;
    },

    _gfPow(base, exp) {
      let r = 1;
      for (let i = 0; i < exp; i++) r = this._gfMul(r, base);
      return r;
    },

    _roundRect(ctx, x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.arcTo(x + w, y, x + w, y + r, r);
      ctx.lineTo(x + w, y + h - r);
      ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
      ctx.lineTo(x + r, y + h);
      ctx.arcTo(x, y + h, x, y + h - r, r);
      ctx.lineTo(x, y + r);
      ctx.arcTo(x, y, x + r, y, r);
      ctx.closePath();
    }
  }
});
