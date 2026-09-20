// 猫咪状态枚举(checking 为旧数据兼容,新数据不再使用)
const CAT_STATUS = {
  available: '待领养',
  adopted: '已领养',
  missing: '已失踪',
  checking: '审核中',
  graduated: '回喵星'
};

// 领养申请状态
const APPLICATION_STATUS = {
  pending: '待审核',
  approved: '已通过',
  rejected: '已拒绝'
};

const GENDER = {
  male: '公',
  female: '母',
  unknown: '未知'
};

// 本地缓存 key
const CACHE_KEYS = {
  homeActivities: 'cache_home_activities',
  isAdmin: 'cache_is_admin'
};

// 首页缓存有效期(5 分钟)
const HOME_CACHE_TTL = 5 * 60 * 1000;

module.exports = {
  CAT_STATUS,
  APPLICATION_STATUS,
  GENDER,
  CACHE_KEYS,
  HOME_CACHE_TTL
};
