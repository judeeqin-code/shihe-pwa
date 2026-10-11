/* 史河科技售后服务 - PWA 数据层（IndexedDB，离线可用）
 * 与 Win 桌面端共用同一 JSON 数据包交换格式（见 exportPackage / importPackage）。
 */
(function (global) {
  "use strict";

  var DB_NAME = "shihe_pwa";
  var DB_VERSION = 2;
  // 这些表的 id 被其他表引用（如 ticket_parts.ticket_id、ticket_photos.ticket_id、
  // stock_moves.part_id），必须使用 keyPath='id' 并在导入时保留原 id，才能维持关联。
  var STORES = [
    "customers", "parts", "stock_moves", "tickets",
    "ticket_parts", "ticket_logs", "ticket_photos", "users", "settings", "options"
  ];

  // 与 Win 桌面端保持一致的基础选项默认值（用户可在「设置-基础选项」中维护）
  var DEFAULT_OPTIONS = {
    device_model: ["球罐打磨除锈机器人", "球罐防腐喷涂机器人", "球罐检测机器人", "磁吸附爬壁机器人", "真空吸附爬壁机器人", "通用爬壁机器人平台", "其他/定制"],
    service_item: ["球罐打磨除锈", "防腐喷涂施工", "焊缝检测", "壁厚检测", "设备维修", "安装调试", "巡检保养", "技术培训", "售前演示", "方案咨询"],
    ticket_type: ["售前", "售后", "工程服务", "培训"],
    ticket_status: ["待处理", "处理中", "已挂起", "已完成", "已关闭"],
    ticket_priority: ["低", "中", "高", "紧急"],
    move_type: ["采购入库", "退库入库", "维修返还入库", "盘盈入库", "调拨入库", "售后领用出库", "工程领用出库", "销售出库", "报废出库", "盘亏出库", "调拨出库"],
    industry: ["石油化工", "船舶制造", "电力能源", "钢结构", "储罐仓储", "市政环保", "其他"],
    satisfaction: ["未评价", "非常满意", "满意", "一般", "不满意"]
  };

  var PACKAGE_FORMAT = "shihe-package";
  var PACKAGE_VERSION = 1;
  // 互通导出包含的业务表（不含 users/operation_log，避免覆盖对方账号与审计）
  var EXPORT_TABLES = [
    "customers", "parts", "stock_moves", "tickets",
    "ticket_parts", "ticket_logs", "ticket_photos", "settings", "options"
  ];

  var _dbp = null;
  function openDB() {
    if (_dbp) return _dbp;
    _dbp = new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        STORES.forEach(function (s) {
          if (!db.objectStoreNames.contains(s)) {
            db.createObjectStore(s, { keyPath: "id" });
          }
        });
      };
      req.onsuccess = function () {
        var db = req.result;
        initOptions(db).catch(function (e) { console.error("initOptions failed", e); }).then(function () { resolve(db); });
      };
      req.onerror = function () { reject(req.error); };
    });
    return _dbp;
  }

  function tx(db, store, mode) {
    return db.transaction(store, mode).objectStore(store);
  }

  function reqToPromise(request) {
    return new Promise(function (resolve, reject) {
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error); };
    });
  }

  // ---- 通用 CRUD ----
  function getAll(store) {
    return openDB().then(function (db) {
      return reqToPromise(tx(db, store, "readonly").getAll());
    });
  }
  function getOne(store, id) {
    return openDB().then(function (db) {
      return reqToPromise(tx(db, store, "readonly").get(id));
    });
  }
  function put(store, obj) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction(store, "readwrite");
        t.objectStore(store).put(obj);
        t.oncomplete = function () { resolve(obj); };
        t.onerror = function () { reject(t.error); };
      });
    });
  }
  function del(store, id) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction(store, "readwrite");
        t.objectStore(store).delete(id);
        t.oncomplete = function () { resolve(true); };
        t.onerror = function () { reject(t.error); };
      });
    });
  }
  function clearStore(store) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction(store, "readwrite");
        t.objectStore(store).clear();
        t.oncomplete = function () { resolve(true); };
        t.onerror = function () { reject(t.error); };
      });
    });
  }
  function count(store) {
    return openDB().then(function (db) {
      return reqToPromise(tx(db, store, "readonly").count());
    });
  }
  function stats() {
    return Promise.all(EXPORT_TABLES.map(function (s) {
      return count(s).then(function (c) { return [s, c]; });
    })).then(function (pairs) {
      var o = {};
      pairs.forEach(function (p) { o[p[0]] = p[1]; });
      return o;
    });
  }

  function nextId(store) {
    return getAll(store).then(function (rows) {
      var m = 0;
      rows.forEach(function (r) {
        if (typeof r.id === "number" && r.id > m) m = r.id;
        else if (typeof r.id === "string" && /^\d+$/.test(r.id) && parseInt(r.id, 10) > m) {
          m = parseInt(r.id, 10);
        }
      });
      return m + 1;
    });
  }

  // ---- 基础选项（与 Win 端 options 表同步） ----
  function initOptions(db) {
    return new Promise(function (resolve, reject) {
      var t = db.transaction("options", "readwrite");
      t.oncomplete = function () { resolve(); };
      t.onerror = function () { reject(t.error); };
      var store = t.objectStore("options");
      var req = store.getAll();
      req.onsuccess = function () {
        var existing = req.result || [];
        var cats = {};
        var maxId = 0;
        existing.forEach(function (r) {
          if (r.category) cats[r.category] = true;
          if (typeof r.id === "number" && r.id > maxId) maxId = r.id;
          else if (typeof r.id === "string" && /^\d+$/.test(r.id) && parseInt(r.id, 10) > maxId) maxId = parseInt(r.id, 10);
        });
        var added = false;
        Object.keys(DEFAULT_OPTIONS).forEach(function (cat) {
          if (cats[cat]) return;
          DEFAULT_OPTIONS[cat].forEach(function (v, i) {
            store.put({ id: ++maxId, category: cat, value: v, sort: i });
            added = true;
          });
        });
        if (!added) resolve();
      };
      req.onerror = function () { reject(req.error); };
    });
  }

  function getOptions(category) {
    return getAll("options").then(function (rows) {
      var vals = rows.filter(function (r) { return r.category === category; })
        .sort(function (a, b) { return (a.sort || 0) - (b.sort || 0); })
        .map(function (r) { return r.value; });
      if (vals.length) return vals;
      return DEFAULT_OPTIONS[category] || [];
    });
  }

  function putOption(obj) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction("options", "readwrite");
        t.oncomplete = function () { resolve(obj); };
        t.onerror = function () { reject(t.error); };
        if (obj.id === undefined || obj.id === null) {
          getAll("options").then(function (rows) {
            var maxId = 0;
            rows.forEach(function (r) { if (r.id > maxId) maxId = r.id; });
            obj.id = maxId + 1;
            obj.sort = obj.sort === undefined ? (rows.filter(function (r) { return r.category === obj.category; }).length) : obj.sort;
            t.objectStore("options").put(obj);
          }).catch(reject);
        } else {
          t.objectStore("options").put(obj);
        }
      });
    });
  }

  function delOption(id) {
    return del("options", id);
  }

  // ---- 默认账号 / 演示数据 ----
  function seedDefaultUser() {
    return getAll("users").then(function (us) {
      if (us && us.length) return;
      var salt = randHex(16);
      return hashPassword("admin123", salt).then(function (hash) {
        return put("users", {
          id: 1, username: "admin", display_name: "系统管理员",
          password_hash: hash, salt: salt, role: "admin", active: 1,
          created_at: now()
        });
      });
    });
  }

  function verifyLogin(username, password) {
    return getAll("users").then(function (us) {
      var u = us.filter(function (x) { return x.username === username; })[0];
      if (!u) return null;
      if (u.active === 0) return null;
      return hashPassword(password, u.salt).then(function (h) {
        return h === u.password_hash ? u : null;
      });
    });
  }

  function changePassword(uid, password) {
    var salt = randHex(16);
    return hashPassword(password, salt).then(function (h) {
      return getOne("users", uid).then(function (u) {
        if (!u) return false;
        u.salt = salt;
        u.password_hash = h;
        return put("users", u).then(function () { return true; });
      });
    });
  }

  // ---- 互通数据包 ----
  // 仅收集业务数据（不加密），供导出 Worker 在独立线程完成序列化/加密，避免界面卡死
  function gatherPackageData() {
    return Promise.all(EXPORT_TABLES.map(function (s) {
      return getAll(s).then(function (rows) { return [s, rows]; });
    })).then(function (pairs) {
      var data = {};
      pairs.forEach(function (p) { data[p[0]] = p[1]; });
      return {
        format: PACKAGE_FORMAT,
        version: PACKAGE_VERSION,
        exported_at: new Date().toISOString(),
        source: "pwa",
        app: "史河科技售后服务管理系统",
        note: "本文件可通过 Win 桌面端的「数据管理-导入互通数据包」直接载入，反之亦然。",
        data: data
      };
    });
  }

  function exportPackage(password) {
    return gatherPackageData().then(function (pkg) {
      if (password) {
        return ShiHeCrypto.encryptData(pkg.data, password).then(function (env) {
          // 加密信封叠加元数据（format/version/encrypted/kdf/cipher/payload 由 Crypto 提供）
          env.exported_at = pkg.exported_at;
          env.source = pkg.source;
          env.app = pkg.app;
          env.note = pkg.note;
          return env;
        });
      }
      return pkg;
    });
  }

  function importPackage(pkg, password) {
    if (!pkg || pkg.format !== PACKAGE_FORMAT) {
      throw new Error("文件格式不正确（不是史河互通数据包）");
    }
    if (pkg.encrypted && !password) {
      throw new Error("该数据包已加密，请在导入时输入密码");
    }
    var get = pkg.encrypted
      ? ShiHeCrypto.decryptData(pkg, password)
      : Promise.resolve(pkg.data || {});
    return get.then(function (data) {
      // 整体覆盖业务表（快照替换）：先清空，再写入
      // 兼容旧包：若数据包不含 options，保留本机 options，避免被清空
      return Promise.all(EXPORT_TABLES.map(function (s) {
        if (s === "options" && !(data.options && data.options.length)) return Promise.resolve(true);
        return clearStore(s).then(function () {
          var rows = data[s] || [];
          return Promise.all(rows.map(function (r) {
            if (r.id === undefined || r.id === null) {
              return nextId(s).then(function (id) { r.id = id; return put(s, r); });
            }
            return put(s, r);
          }));
        });
      })).then(function () { return true; });
    });
  }

  function clearBusiness() {
    return Promise.all(
      ["customers", "parts", "stock_moves", "tickets",
       "ticket_parts", "ticket_logs", "ticket_photos"].map(clearStore)
    );
  }

  // ---- 工具 ----
  function now() {
    var d = new Date();
    var p = function (n) { return (n < 10 ? "0" : "") + n; };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) +
      " " + p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
  }
  function randHex(n) {
    var a = new Uint8Array(n);
    crypto.getRandomValues(a);
    return Array.prototype.map.call(a, function (b) { return b.toString(16).padStart(2, "0"); }).join("");
  }
  function hashPassword(password, salt) {
    var enc = new TextEncoder();
    return crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"])
      .then(function (key) {
        return crypto.subtle.deriveBits(
          { name: "PBKDF2", salt: enc.encode(salt), iterations: 120000, hash: "SHA-256" },
          key, 256);
      })
      .then(function (bits) {
        return Array.prototype.map.call(new Uint8Array(bits), function (b) {
          return b.toString(16).padStart(2, "0");
        }).join("");
      });
  }
  function fileToDataURL(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(fr.result); };
      fr.onerror = function () { reject(fr.error); };
      fr.readAsDataURL(file);
    });
  }

  global.DB = {
    openDB: openDB, getAll: getAll, getOne: getOne, put: put, del: del,
    clearStore: clearStore, count: count, stats: stats, nextId: nextId,
    seedDefaultUser: seedDefaultUser, verifyLogin: verifyLogin,
    changePassword: changePassword, exportPackage: exportPackage,
    gatherPackageData: gatherPackageData,
    importPackage: importPackage, clearBusiness: clearBusiness,
    initOptions: initOptions, getOptions: getOptions, putOption: putOption, delOption: delOption,
    DEFAULT_OPTIONS: DEFAULT_OPTIONS,
    now: now, hashPassword: hashPassword, fileToDataURL: fileToDataURL,
    PACKAGE_FORMAT: PACKAGE_FORMAT, EXPORT_TABLES: EXPORT_TABLES
  };
})(window);
