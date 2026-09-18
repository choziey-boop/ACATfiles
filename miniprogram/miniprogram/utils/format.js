// 由生日计算年龄文案;无生日时回退到旧的 age 文本字段
function ageText(birthday, age) {
  if (!birthday) return age || '未知';
  const birth = new Date(String(birthday).replace(/-/g, '/'));
  if (isNaN(birth.getTime())) return age || '未知';
  const now = new Date();
  let months = (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth());
  if (now.getDate() < birth.getDate()) months -= 1;
  if (months < 0) return age || '未知';
  if (months < 1) return '不足1个月';
  if (months < 12) return `约${months}个月`;
  return `约${Math.floor(months / 12)}岁`;
}

module.exports = { ageText };
