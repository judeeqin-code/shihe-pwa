/* 史河科技售后 - 互通数据包加密（浏览器 / Node 通用）
 * 与 Win 桌面端 core/crypto_utils.py 共用同一套算法，可互相加解密。
 *
 *   KDF      : PBKDF2-HMAC-SHA256(password, salt, iterations=150000, dklen=64)
 *              -> 前 32B 密钥流密钥，后 32B HMAC 密钥
 *   密钥流   : SHA-256(keystream_key || counter) 迭代扩展至明文长度（类 CTR 流密码）
 *   密文     : plaintext XOR keystream
 *   完整性   : HMAC-SHA256(hmac_key, salt || ciphertext)
 *   载荷     : "SHIHE1" + hmac(32) + ciphertext，再 base64
 *
 * 仅使用浏览器原生 Web Crypto 与标准 API，零第三方依赖。
 * 在浏览器中以 window.Crypto 暴露；在 Node 中以 module.exports 暴露（便于离线测试）。
 */
(function (global) {
  "use strict";

  var MAGIC = "SHIHE1";
  var KDF_ITER = 150000;
  var SALT_LEN = 16;

  function getCrypto() {
    // 浏览器与 Node 22 均暴露全局 crypto（含 subtle / getRandomValues）
    return global.crypto || global.msCrypto;
  }

  function bytesToB64(bytes) {
    var bin = "";
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }
  function b64ToBytes(b64) {
    var bin = atob(b64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }
  function concatBytes(a, b) {
    var m = new Uint8Array(a.length + b.length);
    m.set(a, 0);
    m.set(b, a.length);
    return m;
  }
  function counterBytes(c) {
    var cb = new Uint8Array(8);
    for (var i = 7; i >= 0; i--) { cb[i] = c & 0xff; c = Math.floor(c / 256); }
    return cb;
  }

  function deriveKeys(password, salt, iterations) {
    var enc = new TextEncoder();
    return getCrypto().subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"])
      .then(function (key) {
        return getCrypto().subtle.deriveBits(
          { name: "PBKDF2", salt: salt, iterations: iterations, hash: "SHA-256" }, key, 512);
      })
      .then(function (bits) {
        var kb = new Uint8Array(bits);
        return { ksKey: kb.slice(0, 32), hmacKey: kb.slice(32, 64) };
      });
  }

  // 密钥流：SHA256(key || uint64(i)) 每 32 字节一块（与 Python 端完全一致）。
  // 预分配输出 + 分块批量计算 + 每块让出事件循环，避免 O(N^2) 拷贝导致界面卡死。
  function keystream(key, length) {
    var out = new Uint8Array(length);
    if (length === 0) return Promise.resolve(out);
    var BLOCK = 32;
    var CHUNK = 65536;                 // 每块 64KB 一次性批量哈希
    var blocksPerChunk = CHUNK / BLOCK; // 2048
    var totalChunks = Math.ceil(length / CHUNK);
    var c = 0;
    function doChunk() {
      if (c >= totalChunks) return Promise.resolve(out);
      var start = c * CHUNK;
      var end = Math.min(start + CHUNK, length);
      var nBlocks = Math.ceil((end - start) / BLOCK);
      var jobs = [];
      for (var b = 0; b < nBlocks; b++) {
        var globalIdx = c * blocksPerChunk + b;
        jobs.push(getCrypto().subtle.digest("SHA-256", concatBytes(key, counterBytes(globalIdx))));
      }
      return Promise.all(jobs).then(function (hashes) {
        var pos = start;
        for (var i = 0; i < hashes.length && pos < end; i++) {
          var h = new Uint8Array(hashes[i]);
          for (var k = 0; k < h.length && pos < end; k++) out[pos++] = h[k];
        }
        c++;
        // 每处理一块让出主线程，保持界面可响应（即使在主线程运行也不会卡死）
        return new Promise(function (r) { setTimeout(r, 0); }).then(doChunk);
      });
    }
    return doChunk();
  }

  function importHmacKey(keyBytes) {
    return getCrypto().subtle.importKey(
      "raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  }

  // 加密业务 data(dict) -> 信封(dict)
  function encryptData(data, password) {
    if (!password) return Promise.reject(new Error("加密需要密码"));
    var salt = getCrypto().getRandomValues(new Uint8Array(SALT_LEN));
    return deriveKeys(password, salt, KDF_ITER).then(function (keys) {
      var plaintext = new TextEncoder().encode(JSON.stringify(data));
      return keystream(keys.ksKey, plaintext.length).then(function (ks) {
        var ciphertext = new Uint8Array(plaintext.length);
        for (var i = 0; i < plaintext.length; i++) ciphertext[i] = plaintext[i] ^ ks[i];
        return importHmacKey(keys.hmacKey).then(function (hmacKey) {
          var macInput = concatBytes(salt, ciphertext);
          return getCrypto().subtle.sign("HMAC", hmacKey, macInput).then(function (mac) {
            var magic = new TextEncoder().encode(MAGIC);
            var macBytes = new Uint8Array(mac);
            var payload = new Uint8Array(magic.length + macBytes.length + ciphertext.length);
            payload.set(magic, 0);
            payload.set(macBytes, magic.length);
            payload.set(ciphertext, magic.length + macBytes.length);
            return {
              format: "shihe-package",
              version: 2,
              encrypted: true,
              kdf: { name: "PBKDF2", hash: "SHA-256", iterations: KDF_ITER, salt: bytesToB64(salt) },
              cipher: "XOR-STREAM-HMAC-SHA256",
              payload: bytesToB64(payload)
            };
          });
        });
      });
    });
  }

  // 解密信封 -> 业务 data(dict)；密码错误抛错
  function decryptData(envelope, password) {
    return Promise.resolve().then(function () {
      if (!envelope || !envelope.encrypted) throw new Error("该数据包未加密");
      var kdf = envelope.kdf || {};
      if (kdf.name !== "PBKDF2" || kdf.hash !== "SHA-256") throw new Error("不支持的加密参数");
      var salt, raw;
      try { salt = b64ToBytes(kdf.salt); raw = b64ToBytes(envelope.payload); }
      catch (e) { throw new Error("数据包已损坏"); }
      if (raw.length < 6 + 32) throw new Error("数据包已损坏");
      var magic = new TextEncoder().encode(MAGIC);
      for (var i = 0; i < 6; i++) if (raw[i] !== magic[i]) throw new Error("数据包格式不符");
      var mac = raw.slice(6, 6 + 32);
      var ciphertext = raw.slice(6 + 32);
      return deriveKeys(password, salt, kdf.iterations || KDF_ITER).then(function (keys) {
        return keystream(keys.ksKey, ciphertext.length).then(function (ks) {
          var plaintext = new Uint8Array(ciphertext.length);
          for (var j = 0; j < ciphertext.length; j++) plaintext[j] = ciphertext[j] ^ ks[j];
          return importHmacKey(keys.hmacKey).then(function (hmacKey) {
            var macInput = concatBytes(salt, ciphertext);
            return getCrypto().subtle.sign("HMAC", hmacKey, macInput).then(function (calcMac) {
              calcMac = new Uint8Array(calcMac);
              if (calcMac.length !== mac.length) throw new Error("密码错误或数据包已损坏");
              for (var k = 0; k < mac.length; k++)
                if (calcMac[k] !== mac[k]) throw new Error("密码错误或数据包已损坏");
              try { return JSON.parse(new TextDecoder().decode(plaintext)); }
              catch (e) { throw new Error("解密失败：内容无法解析"); }
            });
          });
        });
      });
    });
  }

  var Crypto = {
    encryptData: encryptData,
    decryptData: decryptData,
    // 暴露内部函数便于离线测试
    _deriveKeys: deriveKeys,
    _keystream: keystream,
    _bytesToB64: bytesToB64,
    _b64ToBytes: b64ToBytes,
    KDF_ITER: KDF_ITER
  };

  global.ShiHeCrypto = Crypto;
  if (typeof module !== "undefined" && module.exports) module.exports = Crypto;
})(typeof window !== "undefined" ? window : globalThis);
