/* 史河 PWA - 导出后台 Worker
 * 在独立线程完成「JSON 序列化 + 加密」，避免长时间阻塞主线程导致界面卡死。
 * 依赖 crypto.js（提供 ShiHeCrypto，使用浏览器原生 Web Crypto）。
 */
importScripts("crypto.js");

self.onmessage = function (e) {
  var msg = e.data || {};
  if (msg.type !== "export") return;
  var pkg = msg.pkg;                 // { format, version, exported_at, source, app, note, data }
  var password = msg.password || null;

  function postError(err) {
    self.postMessage({ type: "error", message: (err && err.message) || String(err) });
  }

  try {
    if (password) {
      ShiHeCrypto.encryptData(pkg.data, password)
        .then(function (env) {
          env.exported_at = pkg.exported_at;
          env.source = pkg.source;
          env.app = pkg.app;
          env.note = pkg.note;
          self.postMessage({ type: "done", json: JSON.stringify(env) });
        })
        .catch(postError);
    } else {
      // 明文包：整包序列化（含现场照片 base64，可能较大，放在 Worker 内执行）
      self.postMessage({ type: "done", json: JSON.stringify(pkg) });
    }
  } catch (err) {
    postError(err);
  }
};
