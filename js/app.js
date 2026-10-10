/* 史河科技售后服务 - PWA 应用逻辑（纯前端，离线可用） */
(function () {
  "use strict";
  var user = null;
  var content = document.getElementById("content");
  var nav = document.getElementById("nav");
  var headerTitle = document.getElementById("headerTitle");
  var headerAction = document.getElementById("headerAction");
  var overlayRoot = document.getElementById("overlayRoot");
  var toastRoot = document.getElementById("toastRoot");
  var camInput = document.getElementById("camInput");
  var albumInput = document.getElementById("albumInput");
  var importInput = document.getElementById("importInput");

  // ---------------- 工具 ----------------
  function esc(s) {
    return (s == null ? "" : String(s)).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function $(s, r) { return (r || document).querySelector(s); }
  function $all(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  function toast(msg) {
    var t = document.createElement("div");
    t.className = "toast"; t.textContent = msg;
    toastRoot.appendChild(t);
    setTimeout(function () { t.style.opacity = "0"; t.style.transition = "opacity .3s"; }, 1800);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 2200);
  }
  function setHeader(title, actionLabel, actionFn) {
    headerTitle.textContent = title;
    if (actionLabel) {
      headerAction.style.display = "";
      headerAction.textContent = actionLabel;
      headerAction.onclick = actionFn || null;
    } else { headerAction.style.display = "none"; headerAction.onclick = null; }
  }
  function showNav(show) { nav.style.display = show ? "flex" : "none"; }

  // 底部弹层
  function openSheet(html, onMount) {
    var ov = document.createElement("div");
    ov.className = "overlay";
    ov.innerHTML = '<div class="sheet">' + html + "</div>";
    ov.addEventListener("click", function (e) { if (e.target === ov) closeSheet(ov); });
    overlayRoot.appendChild(ov);
    if (onMount) onMount(ov.querySelector(".sheet"), ov);
    return ov;
  }
  function closeSheet(ov) { if (ov && ov.parentNode) ov.parentNode.removeChild(ov); }

  function confirmSheet(title, text, onYes, danger) {
    openSheet(
      "<h3>" + esc(title) + "</h3><p class='sub'>" + esc(text) + "</p>" +
      "<div class='actions'>" +
      "<button class='btn ghost' data-x='no'>取消</button>" +
      "<button class='btn " + (danger ? "danger" : "primary") + "' data-x='yes'>确定</button>" +
      "</div>",
      function (sheet, ov) {
        $("[data-x=no]", sheet).onclick = function () { closeSheet(ov); };
        $("[data-x=yes]", sheet).onclick = function () { closeSheet(ov); onYes(); };
      }
    );
  }

  // ---------------- 路由 ----------------
  var routes = {
    home: renderHome, customers: renderCustomers, parts: renderParts,
    tickets: renderTickets, settings: renderSettings
  };
  function go(route, param) {
    showNav(true);
    $all(".nav a").forEach(function (a) {
      a.classList.toggle("active", a.getAttribute("data-route") === route ||
        (route === "ticket_detail" && a.getAttribute("data-route") === "tickets"));
    });
    var fn = routes[route] || renderHome;
    fn(param);
  }

  document.getElementById("nav").addEventListener("click", function (e) {
    var a = e.target.closest("a[data-route]");
    if (a) { e.preventDefault(); go(a.getAttribute("data-route")); }
  });

  // ---------------- 登录 ----------------
  function renderLogin() {
    showNav(false);
    setHeader("史河科技", null);
    content.innerHTML =
      '<div style="max-width:420px;margin:8vh auto 0;padding:0 18px;">' +
      '<div class="card" style="text-align:center;">' +
      '<img src="icons/icon-192.png" style="width:84px;height:84px;border-radius:16px;">' +
      '<div style="font-size:20px;font-weight:800;margin-top:10px;">史河科技 · 售后服务</div>' +
      '<div class="sub" style="margin-top:4px;">移动端 · 离线可用</div></div>' +
      '<div class="card">' +
      '<div class="field"><label>登录账号</label><input id="u" value="admin" autocomplete="username"></div>' +
      '<div class="field"><label>密码</label><input id="p" type="password" value="" autocomplete="current-password"></div>' +
      '<button class="btn block primary" data-act="login">登 录</button>' +
      '<div class="sub" style="margin-top:10px;text-align:center;">默认账号 admin / admin123，请在「我的」中修改密码</div>' +
      "</div></div>";
  }
  document.addEventListener("click", function (e) {
    var t = e.target.closest("[data-act]");
    if (!t) return;
    var act = t.getAttribute("data-act");
    if (act === "login") doLogin();
  });
  function doLogin() {
    var u = $("#u").value.trim(), p = $("#p").value;
    DB.verifyLogin(u, p).then(function (res) {
      if (!res) { toast("账号或密码错误"); return; }
      user = { id: res.id, username: res.username, display_name: res.display_name, role: res.role };
      sessionStorage.setItem("shihe_uid", res.id);
      go("home");
    });
  }

  // ---------------- 首页 ----------------
  function renderHome() {
    setHeader("史河科技 · 售后", null);
    DB.stats().then(function (s) {
      content.innerHTML =
        '<div class="stats">' +
        stat(esc(s.customers || 0), "客户档案") +
        stat(esc(s.parts || 0), "备件种类") +
        stat(esc(s.stock_moves || 0), "出入库流水") +
        stat(esc(s.tickets || 0), "服务工单") +
        "</div>" +
        '<div class="card"><div class="section-title">快捷操作</div>' +
        '<button class="btn block primary" data-act="add-ticket" style="margin-bottom:10px;">新建工单</button>' +
        '<button class="btn block" data-act="goto-tickets" style="margin-bottom:10px;">查看工单</button>' +
        '<button class="btn block ghost" data-act="goto-parts">备件与出入库</button>' +
        "</div>" +
        '<div class="card"><div class="section-title">说明</div>' +
        '<div class="sub">数据保存在本机浏览器（IndexedDB），离线可用。' +
        '在「我的 - 互通数据包」中导出，可导入 Win 桌面端，反之亦然。</div></div>';
    });
  }
  function stat(n, l) { return '<div class="stat"><div class="n">' + n + '</div><div class="l">' + l + "</div></div>"; }

  // ---------------- 客户 ----------------
  function renderCustomers() {
    setHeader("客户档案", "＋ 新增", function () { customerForm(null); });
    content.innerHTML = '<div class="bar"><input id="kwc" placeholder="搜索客户 / 联系人 / 电话"></div><div id="list"></div>';
    var kw = $("#kwc");
    kw.addEventListener("input", function () { loadCustomers(kw.value); });
    loadCustomers("");
  }
  function loadCustomers(kw) {
    DB.getAll("customers").then(function (rows) {
      kw = (kw || "").trim();
      if (kw) rows = rows.filter(function (r) {
        return (r.name + r.contact + r.phone + r.industry).toLowerCase().indexOf(kw.toLowerCase()) >= 0;
      });
      rows.sort(function (a, b) { return (b.id || 0) - (a.id || 0); });
      var box = $("#list");
      if (!rows.length) { box.innerHTML = empty("暂无客户，点击右上角新增"); return; }
      box.innerHTML = rows.map(function (r) {
        return '<div class="row" data-act="open-customer" data-id="' + r.id + '">' +
          '<div class="r1"><span class="name">' + esc(r.name) + "</span>" +
          (r.industry ? '<span class="badge b-wait">' + esc(r.industry) + "</span>" : "") + "</div>" +
          '<div class="meta">' + esc(r.contact || "—") + "　" + esc(r.phone || "") + (r.address ? "　" + esc(r.address) : "") + "</div>" +
          "</div>";
      }).join("");
    });
  }
  function customerForm(rec) {
    var isEdit = !!rec;
    openSheet(
      "<h3>" + (isEdit ? "编辑客户" : "新增客户") + "</h3>" +
      field("name", "客户名称", isEdit ? rec.name : "", true) +
      field("industry", "行业", isEdit ? rec.industry : "") +
      field("contact", "联系人", isEdit ? rec.contact : "") +
      field("phone", "电话", isEdit ? rec.phone : "") +
      field("address", "地址", isEdit ? rec.address : "") +
      field("note", "备注", isEdit ? rec.note : "", false, true) +
      "<div class='actions'><button class='btn ghost' data-x='cancel'>取消</button>" +
      "<button class='btn primary' data-x='save'>保存</button></div>",
      function (sheet, ov) {
        $("[data-x=cancel]", sheet).onclick = function () { closeSheet(ov); };
        $("[data-x=save]", sheet).onclick = function () {
          var data = {
            name: val(sheet, "name"), industry: val(sheet, "industry"),
            contact: val(sheet, "contact"), phone: val(sheet, "phone"),
            address: val(sheet, "address"), note: val(sheet, "note")
          };
          if (!data.name) { toast("请填写客户名称"); return; }
          var p;
          if (isEdit) { data.id = rec.id; p = DB.put("customers", data); }
          else { p = DB.nextId("customers").then(function (id) {
            data.id = id; data.created_at = DB.now(); return DB.put("customers", data); }); }
          p.then(function () { closeSheet(ov); renderCustomers(); toast("已保存"); });
        };
      }
    );
  }

  // ---------------- 备件 + 出入库 ----------------
  var partsTab = "stock"; // stock | moves
  function renderParts() {
    setHeader("备件与库存", "＋ 备件", function () { partForm(null); });
    content.innerHTML =
      '<div class="seg" style="margin-bottom:10px;">' +
      '<button data-ptab="stock" class="' + (partsTab === "stock" ? "on" : "") + '">库存台账</button>' +
      '<button data-ptab="moves" class="' + (partsTab === "moves" ? "on" : "") + '">出入库</button>' +
      '</div><div id="pbody"></div>';
    $all("[data-ptab]").forEach(function (b) {
      b.onclick = function () { partsTab = b.getAttribute("data-ptab"); renderParts(); };
    });
    if (partsTab === "stock") renderPartsStock();
    else renderPartsMoves();
  }
  function renderPartsStock() {
    DB.getAll("parts").then(function (rows) {
      rows.sort(function (a, b) { return (b.id || 0) - (a.id || 0); });
      var low = rows.filter(function (r) { return parseFloat(r.quantity || 0) <= parseFloat(r.safety_stock || 0); });
      var html = "";
      if (low.length) html += '<div class="card" style="background:#fff6ec;border:1px solid #f3d9b0;">' +
        '<div class="section-title" style="color:#b87400;">⚠ 安全库存预警（' + low.length + "）</div>" +
        low.map(function (r) { return '<div class="meta">' + esc(r.part_name) + " [" + esc(r.part_no) +
          "] 现 " + r.quantity + " / 安全 " + r.safety_stock + "</div>"; }).join("") + "</div>";
      var box = $("#pbody");
      if (!rows.length) { box.innerHTML = empty("暂无备件，点击右上角登记"); return; }
      box.innerHTML = rows.map(function (r) {
        var warn = parseFloat(r.quantity || 0) <= parseFloat(r.safety_stock || 0);
        return '<div class="row" data-act="open-part" data-id="' + r.id + '">' +
          '<div class="r1"><span class="name">' + esc(r.part_name) + "</span>" +
          '<span class="badge ' + (warn ? "b-pause" : "b-done") + '">' + esc(r.quantity) + " " + esc(r.unit || "件") + "</span></div>" +
          '<div class="meta">' + esc(r.device_model || "") + "　料号 " + esc(r.part_no) +
          (r.spec ? "　" + esc(r.spec) : "") + (r.location ? "　位置 " + esc(r.location) : "") + "</div></div>";
      }).join("");
    });
  }
  function renderPartsMoves() {
    DB.getAll("stock_moves").then(function (rows) {
      rows.sort(function (a, b) { return (b.id || 0) - (a.id || 0); });
      var box = $("#pbody");
      if (!rows.length) { box.innerHTML = empty("暂无出入库记录，点击下方按钮登记"); }
      else box.innerHTML = rows.slice(0, 300).map(function (r) {
        var in_ = r.direction === "in";
        return '<div class="row">' +
          '<div class="r1"><span class="name">' + esc(r.part_name) + "</span>" +
          '<span class="badge ' + (in_ ? "b-done" : "b-doing") + '">' + (in_ ? "+" : "−") + esc(r.qty) + "</span></div>" +
          '<div class="meta">' + esc(r.move_type) + "　" + esc(r.move_time) +
          (r.ticket_no ? "　单号 " + esc(r.ticket_no) : "") + (r.operator ? "　" + esc(r.operator) : "") + "</div></div>";
      }).join("");
    });
    var fab = document.createElement("button");
    fab.className = "fab"; fab.textContent = "＋"; fab.setAttribute("data-act", "add-move");
    content.appendChild(fab);
  }
  function partForm(rec) {
    var isEdit = !!rec;
    openSheet(
      "<h3>" + (isEdit ? "编辑备件" : "新增备件") + "</h3>" +
      field("device_model", "设备型号", isEdit ? rec.device_model : "球罐打磨除锈机器人") +
      field("part_name", "部件名称", isEdit ? rec.part_name : "", true) +
      field("part_no", "部件料号", isEdit ? rec.part_no : "", true) +
      '<div class="grid2"><div>' + field("spec", "规格", isEdit ? rec.spec : "") + "</div>" +
      "<div>" + field("unit", "单位", isEdit ? (rec.unit || "件") : "件") + "</div></div>" +
      '<div class="grid2"><div>' + field("quantity", "当前库存", isEdit ? rec.quantity : "0", false, false, "number") + "</div>" +
      "<div>" + field("safety_stock", "安全库存", isEdit ? rec.safety_stock : "0", false, false, "number") + "</div></div>" +
      field("location", "存放位置", isEdit ? rec.location : "") +
      field("supplier", "供应商", isEdit ? rec.supplier : "") +
      field("note", "备注", isEdit ? rec.note : "", false, true) +
      "<div class='actions'><button class='btn ghost' data-x='cancel'>取消</button>" +
      "<button class='btn primary' data-x='save'>保存</button></div>",
      function (sheet, ov) {
        $("[data-x=cancel]", sheet).onclick = function () { closeSheet(ov); };
        $("[data-x=save]", sheet).onclick = function () {
          var data = {
            device_model: val(sheet, "device_model"), part_name: val(sheet, "part_name"),
            part_no: val(sheet, "part_no"), spec: val(sheet, "spec"), unit: val(sheet, "unit") || "件",
            quantity: parseFloat(val(sheet, "quantity") || 0), safety_stock: parseFloat(val(sheet, "safety_stock") || 0),
            location: val(sheet, "location"), supplier: val(sheet, "supplier"), note: val(sheet, "note")
          };
          if (!data.part_name || !data.part_no) { toast("请填写名称与料号"); return; }
          var p;
          if (isEdit) { data.id = rec.id; p = DB.put("parts", data); }
          else { p = DB.nextId("parts").then(function (id) {
            data.id = id; data.created_at = DB.now(); data.updated_at = DB.now();
            return DB.put("parts", data); }); }
          p.then(function () { closeSheet(ov); renderParts(); toast("已保存"); });
        };
      }
    );
  }
  function moveForm() {
    DB.getAll("parts").then(function (parts) {
      var opts = parts.map(function (p) { return '<option value="' + esc(p.part_no) + '">' +
        esc(p.part_name) + " [" + esc(p.part_no) + "]</option>"; }).join("");
      var types = ["采购入库", "退库入库", "售后领用出库", "工程领用出库", "销售出库", "报废出库", "盘亏出库"];
      var topts = types.map(function (t) { return '<option value="' + t + '">' + t + "</option>"; }).join("");
      openSheet(
        "<h3>登记出入库</h3>" +
        '<div class="field"><label>出入库类型</label><select id="f_t">' + topts + "</select></div>" +
        '<div class="field"><label>选择部件</label><select id="f_p">' + (opts || "<option>请先登记备件</option>") + "</select></div>" +
        field("qty", "数量", "1", false, false, "number") +
        field("operator", "经办人", user ? user.display_name : "") +
        field("ticket_no", "关联工单号", "") +
        field("note", "备注", "", false, true) +
        "<div class='actions'><button class='btn ghost' data-x='cancel'>取消</button>" +
        "<button class='btn primary' data-x='save'>登记</button></div>",
        function (sheet, ov) {
          $("[data-x=cancel]", sheet).onclick = function () { closeSheet(ov); };
          $("[data-x=save]", sheet).onclick = function () {
            if (!parts.length) { toast("请先在库存台账登记部件"); return; }
            var move_type = $("#f_t", sheet).value, part_no = $("#f_p", sheet).value;
            var qty = parseFloat(val(sheet, "qty") || 0);
            if (qty <= 0) { toast("数量需大于 0"); return; }
            var part = parts.filter(function (p) { return p.part_no === part_no; })[0];
            var direction = /入库/.test(move_type) ? "in" : "out";
            if (direction === "out" && parseFloat(part.quantity) < qty) { toast("库存不足"); return; }
            var delta = direction === "in" ? qty : -qty;
            var balance = parseFloat(part.quantity) + delta;
            DB.nextId("stock_moves").then(function (id) {
              return DB.put("stock_moves", {
                id: id, move_no: genNo("IO", "stock_moves"), part_id: part.id,
                device_model: part.device_model, part_name: part.part_name, part_no: part.part_no,
                spec: part.spec, drawing_no: part.drawing_no, direction: direction,
                move_type: move_type, qty: qty, balance: balance, ticket_no: val(sheet, "ticket_no"),
                customer: "", operator: val(sheet, "operator"), move_time: DB.now(),
                note: val(sheet, "note"), created_at: DB.now()
              }).then(function () {
                part.quantity = balance; part.updated_at = DB.now();
                return DB.put("parts", part);
              });
            }).then(function () { closeSheet(ov); renderParts(); toast("已登记，结存 " + balance); });
          };
        }
      );
    });
  }
  function genNo(prefix, store) {
    var d = new Date(), p = function (n) { return (n < 10 ? "0" : "") + n; };
    var day = "" + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate());
    return prefix + day + "-" + Math.floor(Math.random() * 900 + 100);
  }

  // ---------------- 工单 ----------------
  function renderTickets() {
    setHeader("服务工单", "＋ 新建", function () { ticketForm(null); });
    content.innerHTML =
      '<div class="seg" style="margin-bottom:10px;">' +
      '<button data-st="全部" class="on">全部</button>' +
      '<button data-st="待处理">待处理</button>' +
      '<button data-st="处理中">处理中</button>' +
      '<button data-st="已完成">已完成</button>' +
      '<button data-st="已关闭">已关闭</button></div><div id="list"></div>';
    $all("[data-st]").forEach(function (b) {
      b.onclick = function () { $all("[data-st]").forEach(function (x) { x.classList.remove("on"); });
        b.classList.add("on"); loadTickets(b.getAttribute("data-st")); };
    });
    loadTickets("全部");
  }
  function loadTickets(status) {
    DB.getAll("tickets").then(function (rows) {
      rows.sort(function (a, b) { return (b.id || 0) - (a.id || 0); });
      if (status && status !== "全部") rows = rows.filter(function (r) { return r.status === status; });
      var box = $("#list");
      if (!rows.length) { box.innerHTML = empty("暂无工单，点击右上角新建"); return; }
      box.innerHTML = rows.map(function (t) {
        return '<div class="row" data-act="open-ticket" data-id="' + t.id + '">' +
          '<div class="r1"><span class="name">' + esc(t.title || t.ticket_no) + "</span>" +
          '<span class="badge ' + statusClass(t.status) + '">' + esc(t.status) + "</span></div>" +
          '<div class="meta">' + esc(t.ticket_no) + "　" + esc(t.customer_name || "") +
          "　" + esc(t.service_item || "") + "</div>" +
          '<div class="meta">' + esc(t.owner || "") + "　" + esc(t.created_at || "") +
          (t.priority === "紧急" ? '　<span class="badge b-urgent">紧急</span>' : "") + "</div></div>";
      }).join("");
    });
  }
  function statusClass(s) {
    return { "待处理": "b-wait", "处理中": "b-doing", "已挂起": "b-pause",
             "已完成": "b-done", "已关闭": "b-close" }[s] || "b-wait";
  }
  function ticketForm(rec) {
    var isEdit = !!rec;
    DB.getAll("customers").then(function (custs) {
      var copts = '<option value="">— 选择客户 —</option>' +
        custs.map(function (c) { return '<option value="' + esc(c.name) + '">' + esc(c.name) + "</option>"; }).join("");
      openSheet(
        "<h3>" + (isEdit ? "编辑工单" : "新建工单") + "</h3>" +
        '<div class="field"><label>客户</label><select id="t_cust">' + copts + "</select></div>" +
        field("title", "工单标题", isEdit ? rec.title : "", true) +
        '<div class="grid2"><div>' + field("ticket_type", "类型", isEdit ? rec.ticket_type : "售后") +
        "</div><div>" + field("service_item", "服务内容", isEdit ? rec.service_item : "球罐打磨除锈") + "</div></div>" +
        '<div class="grid2"><div>' + field("priority", "优先级", isEdit ? rec.priority : "中") +
        "</div><div>" + field("owner", "负责人", isEdit ? rec.owner : (user ? user.display_name : "")) + "</div></div>" +
        field("site", "现场地点", isEdit ? rec.site : "") +
        field("description", "问题描述", isEdit ? rec.description : "", false, true) +
        "<div class='actions'><button class='btn ghost' data-x='cancel'>取消</button>" +
        "<button class='btn primary' data-x='save'>保存</button></div>",
        function (sheet, ov) {
          if (isEdit && rec.customer_name) $("#t_cust", sheet).value = rec.customer_name;
          $("[data-x=cancel]", sheet).onclick = function () { closeSheet(ov); };
          $("[data-x=save]", sheet).onclick = function () {
            var cust = $("#t_cust", sheet).value;
            var data = {
              ticket_type: val(sheet, "ticket_type"), service_item: val(sheet, "service_item"),
              customer_name: cust, title: val(sheet, "title"), priority: val(sheet, "priority"),
              owner: val(sheet, "owner"), site: val(sheet, "site"), description: val(sheet, "description"),
              status: isEdit ? rec.status : "待处理"
            };
            if (!data.title) { toast("请填写工单标题"); return; }
            var p;
            if (isEdit) { data.id = rec.id; p = DB.put("tickets", Object.assign({}, rec, data)); }
            else { p = DB.nextId("tickets").then(function (id) {
              data.id = id; data.ticket_no = genNo("SH", "tickets"); data.created_at = DB.now();
              data.updated_at = DB.now(); return DB.put("tickets", data); }); }
            p.then(function () { closeSheet(ov); renderTickets(); toast("已保存"); });
          };
        }
      );
    });
  }
  function ticketDetail(id) {
    Promise.all([DB.getOne("tickets", id), DB.getAll("ticket_photos"), DB.getAll("ticket_logs"), DB.getAll("ticket_parts")]).then(function (res) {
      var t = res[0]; if (!t) { toast("工单不存在"); go("tickets"); return; }
      var photos = res[1].filter(function (p) { return p.ticket_id == id; });
      var logs = res[2].filter(function (l) { return l.ticket_id == id; }).sort(function (a, b) { return (b.id || 0) - (a.id || 0); });
      var parts = res[3].filter(function (p) { return p.ticket_id == id; });
      showNav(true);
      $all(".nav a").forEach(function (a) { a.classList.toggle("active", a.getAttribute("data-route") === "tickets"); });
      setHeader("工单 " + esc(t.ticket_no), "编辑", function () { ticketForm(t); });
      var html =
        '<div class="card">' +
        '<div class="r1" style="display:flex;justify-content:space-between;align-items:center;">' +
        '<span class="name" style="font-size:18px;font-weight:700;">' + esc(t.title) + "</span>" +
        '<span class="badge ' + statusClass(t.status) + '">' + esc(t.status) + "</span></div>" +
        meta("客户", t.customer_name) + meta("类型", t.ticket_type) + meta("服务内容", t.service_item) +
        meta("负责人", t.owner) + meta("优先级", t.priority) + meta("现场", t.site) +
        meta("创建", t.created_at) + meta("派单", t.dispatched_at) + meta("到场", t.arrived_at) +
        meta("完成", t.finished_at) + meta("工时", t.work_hours) +
        (t.description ? '<div class="meta" style="margin-top:6px;">' + esc(t.description) + "</div>" : "") +
        "</div>";

      // 状态流转
      html += '<div class="card"><div class="section-title">状态流转</div><div class="photo-actions">';
      if (t.status === "待处理") html += '<button class="btn" data-act="tk" data-op="dispatch" data-id="' + id + '">派单</button>';
      if (t.status === "待处理" || t.status === "处理中") html += '<button class="btn" data-act="tk" data-op="arrive" data-id="' + id + '">到场</button>';
      if (t.status === "处理中") html += '<button class="btn primary" data-act="tk" data-op="finish" data-id="' + id + '">完成</button>';
      if (t.status !== "已关闭" && t.status !== "已挂起") html += '<button class="btn ghost" data-act="tk" data-op="pause" data-id="' + id + '">挂起</button>';
      if (t.status !== "已关闭") html += '<button class="btn ghost" data-act="tk" data-op="close" data-id="' + id + '">关闭</button>';
      html += "</div></div>";

      // 现场照片
      html += '<div class="card"><div class="section-title">现场照片（' + photos.length + '）</div>' +
        '<div class="photo-actions"><button class="btn" data-act="tk-cam" data-id="' + id + '">拍摄</button>' +
        '<button class="btn" data-act="tk-album" data-id="' + id + '">相册</button></div>';
      if (photos.length) {
        html += '<div class="photos">' + photos.map(function (p) {
          return '<img src="' + esc(p.photo_data) + '" data-act="tk-photo" data-id="' + p.id + '" data-tid="' + id + '">';
        }).join("") + "</div>";
      } else html += '<div class="sub">暂无照片</div>';
      html += "</div>";

      // 备件消耗
      html += '<div class="card"><div class="section-title">领用备件</div>';
      if (parts.length) html += parts.map(function (p) {
        return '<div class="meta">' + esc(p.part_name) + " [" + esc(p.part_no) + "] × " + esc(p.qty) + "</div>";
      }).join(""); else html += '<div class="sub">暂无</div>';
      html += '<button class="btn block ghost" data-act="tk-addpart" data-id="' + id + '" style="margin-top:8px;">＋ 领用备件</button></div>';

      // 跟进记录
      html += '<div class="card"><div class="section-title">跟进记录</div>';
      if (logs.length) html += logs.map(function (l) {
        return '<div class="meta">' + esc(l.log_time) + "　" + esc(l.operator || "") + "<br>" + esc(l.content) + "</div><hr style='border:none;border-top:1px solid #eef;margin:6px 0;'>";
      }).join(""); else html += '<div class="sub">暂无</div>';
      html += '<button class="btn block ghost" data-act="tk-addlog" data-id="' + id + '" style="margin-top:8px;">＋ 添加跟进</button></div>';

      html += '<button class="btn block danger" data-act="tk-del" data-id="' + id + '" style="margin-top:6px;">删除工单</button>';
      content.innerHTML = html;
    });
  }
  function meta(k, v) {
    if (!v) return "";
    return '<div class="meta"><b style="color:#374151;">' + esc(k) + "：</b>" + esc(v) + "</div>";
  }

  // 工单状态流转/操作（事件委托）
  document.addEventListener("click", function (e) {
    var t = e.target.closest("[data-act]");
    if (!t) return;
    var act = t.getAttribute("data-act");
    var id = parseInt(t.getAttribute("data-id"), 10);
    if (act === "goto-tickets") { go("tickets"); return; }
    if (act === "goto-parts") { go("parts"); return; }
    if (act === "add-ticket") { ticketForm(null); return; }
    if (act === "add-move") { moveForm(); return; }
    if (act === "add-customer") { customerForm(null); return; }
    if (act === "open-customer") { DB.getOne("customers", id).then(customerForm); return; }
    if (act === "open-part") { DB.getOne("parts", id).then(partForm); return; }
    if (act === "open-ticket") { ticketDetail(id); return; }
    if (act === "tk-cam") { pendingTid = id; camInput.value = ""; camInput.click(); return; }
    if (act === "tk-album") { pendingTid = id; albumInput.value = ""; albumInput.click(); return; }
    if (act === "tk-photo") {
      var pid = parseInt(t.getAttribute("data-id"), 10);
      confirmSheet("删除照片", "确定删除这张照片？", function () {
        DB.del("ticket_photos", pid).then(function () { ticketDetail(parseInt(t.getAttribute("data-tid"), 10)); toast("已删除"); });
      }, true); return;
    }
    if (act === "tk-addlog") { addLogForm(id); return; }
    if (act === "tk-addpart") { addPartForm(id); return; }
    if (act === "tk-del") {
      confirmSheet("删除工单", "将同时删除其照片、跟进与领料记录，不可恢复。", function () {
        DB.del("tickets", id).then(function () { go("tickets"); toast("已删除"); });
      }, true); return;
    }
    if (act === "tk") {
      var op = t.getAttribute("data-op");
      var patch = { updated_at: DB.now() };
      if (op === "dispatch") { patch.status = "处理中"; patch.dispatched_at = DB.now(); }
      if (op === "arrive") { patch.status = "处理中"; patch.arrived_at = DB.now(); }
      if (op === "finish") { patch.status = "已完成"; patch.finished_at = DB.now(); }
      if (op === "pause") patch.status = "已挂起";
      if (op === "close") patch.status = "已关闭";
      DB.getOne("tickets", id).then(function (tk) {
        Object.assign(tk, patch);
        return DB.put("tickets", tk).then(function () {
          ticketDetail(id); toast("已更新：" + patch.status);
        });
      });
    }
  });

  var pendingTid = null;
  camInput.addEventListener("change", function () { handlePhoto(camInput); });
  albumInput.addEventListener("change", function () { handlePhoto(albumInput); });
  function handlePhoto(input) {
    var f = input.files && input.files[0];
    if (!f || pendingTid == null) return;
    var tid = pendingTid;
    DB.fileToDataURL(f).then(function (dataURL) {
      return DB.nextId("ticket_photos").then(function (pid) {
        return DB.put("ticket_photos", {
          id: pid, ticket_id: tid, photo_path: "p" + pid + ".jpg",
          note: "现场照片", created_at: DB.now(), photo_data: dataURL
        });
      });
    }).then(function () { ticketDetail(tid); toast("照片已保存"); });
  }
  function addLogForm(tid) {
    openSheet("<h3>添加跟进记录</h3>" + field("content", "内容", "", false, true) +
      "<div class='actions'><button class='btn ghost' data-x='cancel'>取消</button>" +
      "<button class='btn primary' data-x='save'>保存</button></div>",
      function (sheet, ov) {
        $("[data-x=cancel]", sheet).onclick = function () { closeSheet(ov); };
        $("[data-x=save]", sheet).onclick = function () {
          var c = val(sheet, "content"); if (!c) { toast("请输入内容"); return; }
          DB.nextId("ticket_logs").then(function (id) {
            return DB.put("ticket_logs", { id: id, ticket_id: tid, log_time: DB.now(),
              operator: user ? user.display_name : "", content: c });
          }).then(function () { closeSheet(ov); ticketDetail(tid); toast("已添加"); });
        };
      });
  }
  function addPartForm(tid) {
    Promise.all([DB.getAll("parts"), DB.getOne("tickets", tid)]).then(function (res) {
      var parts = res[0], tk = res[1];
      var opts = parts.map(function (p) { return '<option value="' + esc(p.part_no) + '">' +
        esc(p.part_name) + " [" + esc(p.part_no) + "] 库存" + esc(p.quantity) + "</option>"; }).join("");
      openSheet("<h3>工单领用备件</h3>" +
        '<div class="field"><label>选择部件</label><select id="ap_p">' + (opts || "<option>无备件</option>") + "</select></div>" +
        field("qty", "数量", "1", false, false, "number") +
        "<div class='actions'><button class='btn ghost' data-x='cancel'>取消</button>" +
        "<button class='btn primary' data-x='save'>领用</button></div>",
        function (sheet, ov) {
          $("[data-x=cancel]", sheet).onclick = function () { closeSheet(ov); };
          $("[data-x=save]", sheet).onclick = function () {
            if (!parts.length) { toast("请先登记备件"); return; }
            var part_no = $("#ap_p", sheet).value, qty = parseFloat(val(sheet, "qty") || 0);
            if (qty <= 0) { toast("数量需大于 0"); return; }
            var part = parts.filter(function (p) { return p.part_no === part_no; })[0];
            if (parseFloat(part.quantity) < qty) { toast("库存不足"); return; }
            DB.nextId("stock_moves").then(function (mid) {
              var balance = parseFloat(part.quantity) - qty;
              return DB.put("stock_moves", {
                id: mid, move_no: genNo("IO", "stock_moves"), part_id: part.id,
                device_model: part.device_model, part_name: part.part_name, part_no: part.part_no,
                spec: part.spec, drawing_no: part.drawing_no, direction: "out", move_type: "售后领用出库",
                qty: qty, balance: balance, ticket_no: tk ? tk.ticket_no : "",
                customer: tk ? tk.customer_name : "", operator: user ? user.display_name : "",
                move_time: DB.now(), note: "工单领用", created_at: DB.now()
              }).then(function () {
                part.quantity = balance; part.updated_at = DB.now();
                return DB.put("parts", part).then(function () {
                  return DB.nextId("ticket_parts").then(function (pid) {
                    return DB.put("ticket_parts", { id: pid, ticket_id: tid, part_id: part.id,
                      part_no: part.part_no, part_name: part.part_name, spec: part.spec,
                      qty: qty, created_at: DB.now() });
                  });
                });
              });
            }).then(function () { closeSheet(ov); ticketDetail(tid); toast("已领用"); });
          };
        });
    });
  }

  // ---------------- 我的 / 设置 ----------------
  function renderSettings() {
    setHeader("我的");
    var who = user ? (user.display_name + "（" + user.username + "）") : "未登录";
    content.innerHTML =
      '<div class="card"><div class="section-title">账号</div><div class="meta">' + esc(who) + "</div>" +
      '<button class="btn block ghost" data-act="changepw" style="margin-top:10px;">修改密码</button></div>' +
      '<div class="card"><div class="section-title">互通数据包（与 Win 桌面端互导）</div>' +
      '<div class="sub" style="margin-bottom:10px;">导出含全部业务数据与现场照片的 JSON 包；可导入 Win 桌面端「数据管理 - 导入互通数据包」，反之亦然。导出时可设置加密密码保护数据。</div>' +
      '<button class="btn block primary" data-act="export-pkg" style="margin-bottom:10px;">导出数据包</button>' +
      '<button class="btn block" data-act="import-pkg">导入数据包</button></div>' +
      '<div class="card"><div class="section-title">数据维护</div>' +
      '<button class="btn block danger" data-act="clear-data">清空本机全部业务数据</button></div>' +
      '<div class="card"><div class="sub">史河科技 · 售后工程服务管理系统 · 移动端 PWA<br>离线可用，可「添加到主屏幕」像 App 使用。</div></div>';
  }
  document.addEventListener("click", function (e) {
    var t = e.target.closest("[data-act]");
    if (!t) return;
    var act = t.getAttribute("data-act");
    if (act === "changepw") return changePwForm();
    if (act === "export-pkg") return exportPkgForm();
    if (act === "import-pkg") { importInput.value = ""; importInput.click(); return; }
    if (act === "clear-data") return confirmSheet("清空数据", "将删除本机全部客户、备件、流水、工单与照片，不可恢复。", function () {
      DB.clearBusiness().then(function () { toast("已清空"); renderSettings(); });
    }, true);
  });
  function changePwForm() {
    openSheet("<h3>修改密码</h3>" + field("pw", "新密码", "", false, false, "password") +
      field("pw2", "确认新密码", "", false, false, "password") +
      "<div class='actions'><button class='btn ghost' data-x='cancel'>取消</button>" +
      "<button class='btn primary' data-x='save'>保存</button></div>",
      function (sheet, ov) {
        $("[data-x=cancel]", sheet).onclick = function () { closeSheet(ov); };
        $("[data-x=save]", sheet).onclick = function () {
          var a = val(sheet, "pw"), b = val(sheet, "pw2");
          if (a.length < 4) { toast("密码至少 4 位"); return; }
          if (a !== b) { toast("两次输入不一致"); return; }
          DB.changePassword(user.id, a).then(function () { closeSheet(ov); toast("密码已修改"); });
        };
      });
  }
  // ---------------- 导出（Worker 后台执行，避免卡死）----------------
  var exportProgressOv = null;
  var lastExport = null; // { blob, file, name, size }

  function createExportWorker() {
    try {
      var base = location.pathname.replace(/[^/]*$/, "");
      return new Worker(base + "js/export_worker.js");
    } catch (e) { return null; }
  }
  function showExportProgress() {
    if (exportProgressOv) return;
    var ov = document.createElement("div");
    ov.className = "overlay";
    ov.innerHTML = '<div class="sheet" style="text-align:center;">' +
      '<div class="spinner"></div>' +
      '<div class="section-title" style="margin-top:14px;">正在生成数据包…</div>' +
      '<div class="sub">含现场照片时可能需要几秒，请稍候。</div></div>';
    overlayRoot.appendChild(ov);
    exportProgressOv = ov;
  }
  function hideExportProgress() {
    if (exportProgressOv && exportProgressOv.parentNode) exportProgressOv.parentNode.removeChild(exportProgressOv);
    exportProgressOv = null;
  }
  function formatSize(b) {
    if (b < 1024) return b + " B";
    if (b < 1048576) return (b / 1024).toFixed(1) + " KB";
    return (b / 1048576).toFixed(2) + " MB";
  }
  function buildExportFile(json, password) {
    var d = new Date(), p = function (n) { return (n < 10 ? "0" : "") + n; };
    var name = "史河售后数据包_" + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) +
      (password ? "_加密" : "") + ".json";
    var blob = new Blob([json], { type: "application/json" });
    var file = new File([blob], name, { type: "application/json" });
    return { name: name, blob: blob, file: file, size: formatSize(blob.size) };
  }
  function triggerDownload(json, password) {
    var f = buildExportFile(json, password);
    lastExport = f;
    function showResult(shared) { showExportResult(f.name, f.size, shared); }
    if (navigator.canShare && navigator.canShare({ files: [f.file] })) {
      navigator.share({ files: [f.file], title: "史河售后数据包" })
        .then(function () { showResult(true); })
        .catch(function () { showResult(false); });
    } else {
      var a = document.createElement("a");
      a.href = URL.createObjectURL(f.blob);
      a.download = f.name;
      document.body.appendChild(a); a.click(); a.remove();
      showResult(false);
    }
  }
  function showExportResult(name, size, shared) {
    var loc = shared
      ? "已通过系统分享/保存面板导出，请在所选位置（如「文件」App、网盘等）查找。"
      : "已保存到浏览器「下载」目录；手机可在「文件」App 或「下载」中查找，桌面端在浏览器下载目录查找。";
    var html =
      "<h3>导出完成</h3>" +
      '<div class="field"><label>文件名</label><div class="meta">' + esc(name) + "</div></div>" +
      '<div class="sub">大小：' + esc(size) + "</div>" +
      '<div class="sub" style="margin-top:6px;">' + loc + "</div>" +
      "<div class='actions'>" +
      (navigator.canShare ? "<button class='btn ghost' data-x='share'>分享/另存到…</button>" : "") +
      "<button class='btn primary' data-x='ok'>知道了</button></div>";
    openSheet(html, function (sheet, ov) {
      var ok = $("[data-x=ok]", sheet);
      if (ok) ok.onclick = function () { closeSheet(ov); };
      var sh = $("[data-x=share]", sheet);
      if (sh) sh.onclick = function () {
        if (lastExport && navigator.canShare && navigator.canShare({ files: [lastExport.file] })) {
          navigator.share({ files: [lastExport.file], title: "史河售后数据包" }).catch(function () {});
        }
      };
    });
  }
  function doExport(password) {
    showExportProgress();
    DB.gatherPackageData().then(function (pkg) {
      var worker = createExportWorker();
      if (!worker) { finishExportMain(pkg, password); return; }
      worker.onmessage = function (ev) {
        if (ev.data.type === "done") {
          worker.terminate();
          hideExportProgress();
          triggerDownload(ev.data.json, password);
        } else if (ev.data.type === "error") {
          worker.terminate();
          hideExportProgress();
          toast("导出失败：" + ev.data.message);
        }
      };
      worker.onerror = function () {
        worker.terminate();
        hideExportProgress();
        finishExportMain(pkg, password); // Worker 不可用时退回主线程（已修 O(N) 不会卡死）
      };
      worker.postMessage({ type: "export", pkg: pkg, password: password || null });
    }).catch(function (err) {
      hideExportProgress();
      toast("导出失败：" + err.message);
    });
  }
  // Worker 不可用时的主线程兜底（keystream 已改为 O(N)，不会卡死）
  function finishExportMain(pkg, password) {
    DB.exportPackage(password || null).then(function (epkg) {
      hideExportProgress();
      triggerDownload(JSON.stringify(epkg, null, 2), password);
    }).catch(function (err) {
      hideExportProgress();
      toast("导出失败：" + err.message);
    });
  }
  // 导出时询问是否加密（可选密码）
  function exportPkgForm() {
    openSheet(
      "<h3>导出数据包</h3>" +
      '<div class="sub" style="margin-bottom:8px;">设置加密密码可保护数据安全；留空则不加密（任何人都能直接打开文件）。</div>' +
      field("pw", "加密密码（可选）", "", false, false, "password") +
      field("pw2", "确认密码", "", false, false, "password") +
      "<div class='actions'><button class='btn ghost' data-x='cancel'>取消</button>" +
      "<button class='btn primary' data-x='save'>导出</button></div>",
      function (sheet, ov) {
        $("[data-x=cancel]", sheet).onclick = function () { closeSheet(ov); };
        $("[data-x=save]", sheet).onclick = function () {
          var a = val(sheet, "pw"), b = val(sheet, "pw2");
          if (a && a.length < 4) { toast("密码至少 4 位"); return; }
          if (a !== b) { toast("两次输入不一致"); return; }
          closeSheet(ov);
          doExport(a || null);
        };
      }
    );
  }
  // 导入加密包时索取密码
  function importPkgForm(pkg) {
    if (pkg.encrypted) {
      openSheet(
        "<h3>输入密码</h3>" +
        '<div class="sub" style="margin-bottom:8px;">该数据包已加密，请输入导出时设置的密码。</div>' +
        field("pw", "密码", "", false, false, "password") +
        "<div class='actions'><button class='btn ghost' data-x='cancel'>取消</button>" +
        "<button class='btn primary' data-x='save'>导入</button></div>",
        function (sheet, ov) {
          $("[data-x=cancel]", sheet).onclick = function () { closeSheet(ov); };
          $("[data-x=save]", sheet).onclick = function () {
            var pw = val(sheet, "pw");
            if (!pw) { toast("请输入密码"); return; }
            closeSheet(ov);
            DB.importPackage(pkg, pw).then(function () {
              toast("导入成功，已与 Win 桌面端数据合并/覆盖");
              go("home");
            }).catch(function (err) { toast("导入失败：" + err.message); });
          };
        }
      );
      return;
    }
    DB.importPackage(pkg, null).then(function () {
      toast("导入成功，已与 Win 桌面端数据合并/覆盖");
      go("home");
    }).catch(function (err) { toast("导入失败：" + err.message); });
  }
  importInput.addEventListener("change", function () {
    var f = importInput.files && importInput.files[0];
    if (!f) return;
    var fr = new FileReader();
    fr.onload = function () {
      try {
        var pkg = JSON.parse(fr.result);
        if (!pkg || pkg.format !== "shihe-package") { toast("不是有效的史河互通数据包"); return; }
        importPkgForm(pkg);
      } catch (err) { toast("文件不是有效 JSON"); }
    };
    fr.readAsText(f);
  });

  // ---------------- 表单辅助 ----------------
  function field(key, label, value, required, textarea, type) {
    var v = value == null ? "" : value;
    var ctrl;
    if (textarea) ctrl = '<textarea id="f_' + key + '">' + esc(v) + "</textarea>";
    else ctrl = '<input id="f_' + key + '" type="' + (type || "text") + '" value="' + esc(v) + '">';
    return '<div class="field"><label>' + esc(label) + (required ? " *" : "") + "</label>" + ctrl + "</div>";
  }
  function val(sheet, key) { var e = $("#f_" + key, sheet); return e ? e.value.trim() : ""; }
  function empty(t) { return '<div class="empty">' + esc(t) + "</div>"; }

  // ---------------- 启动 ----------------
  function boot() {
    if (navigator.serviceWorker) {
      // 兼容 GitHub Pages 项目站点子路径(/仓库名/)：按当前页面目录动态计算 SW 与 scope
      var swBase = location.pathname.replace(/[^/]*$/, "");
      navigator.serviceWorker.register(swBase + "sw.js", { scope: swBase }).catch(function () {});
    }
    var saved = sessionStorage.getItem("shihe_uid");
    if (saved) {
      DB.getAll("users").then(function (us) {
        var u = us.filter(function (x) { return String(x.id) === String(saved); })[0];
        if (u && u.active !== 0) { user = { id: u.id, username: u.username, display_name: u.display_name, role: u.role }; go("home"); }
        else renderLogin();
      }).catch(renderLogin);
    } else renderLogin();
  }
  DB.openDB().then(DB.seedDefaultUser).then(boot).catch(function (e) {
    content.innerHTML = '<div class="empty">初始化失败：' + esc(e && e.message) + "</div>";
  });
})();
