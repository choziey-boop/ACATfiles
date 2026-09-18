@echo off
chcp 65001 >nul
set "ELECTRON_RUN_AS_NODE=1"
"D:\Program Files (x86)\Tencent\微信web开发者工具\微信开发者工具.exe" -e "const e=process.argv[1],a=process.argv.slice(2).filter(function(x){return x!=='--electron'});if(!process.env.cwd)process.env.cwd=process.cwd();process.argv=[process.execPath,'--ms-enable-electron-run-as-node',e,'--electron'].concat(a);require(e)" "D:\Program Files (x86)\Tencent\微信web开发者工具\resources\app.asar.unpacked\js\common\cli\index.js" %*
