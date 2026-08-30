routerAdd("POST", "/v1/updates", function (e) {
  function parseSemver(v) {
    var s = v || "0.0.0";
    var parts = String(s).split(".");
    var major = parseInt(parts[0], 10) || 0;
    var minor = parseInt(parts[1], 10) || 0;
    var patch = parseInt(parts[2], 10) || 0;
    return { major: major, minor: minor, patch: patch };
  }
  function semverGt(a, b) {
    var va = parseSemver(a);
    var vb = parseSemver(b);
    if (va.major !== vb.major) return va.major > vb.major;
    if (va.minor !== vb.minor) return va.minor > vb.minor;
    return va.patch > vb.patch;
  }
  function baseUrl() {
    var b = $os.getenv("BASE_URL");
    if (b && String(b).length > 0) return String(b).replace(/\/$/, "");
    return "http://localhost:8090";
  }

  var app = e.app;
  var body = {};
  try {
    e.bindBody(body);
  } catch (_e) {
    body = e.requestInfo().body || {};
  }
  var platform = body.platform;
  var device_id = body.device_id;
  var app_id = body.app_id;
  var version_name = body.version_name;
  var is_emulator = body.is_emulator;
  var is_prod = body.is_prod;
  var currentVersion = version_name || "builtin";

  var devRows = app.findRecordsByFilter(
    "devices",
    'device_id = {:d} && app_id = {:a}',
    "",
    1,
    0,
    { d: device_id || "", a: app_id || "" }
  );
  var channelName = "production";
  if (devRows && devRows.length > 0) {
    channelName = devRows[0].getString("channel") || "production";
  }

  var chRows = app.findRecordsByFilter(
    "channels",
    'name = {:n}',
    "",
    1,
    0,
    { n: channelName }
  );
  if (!chRows || chRows.length === 0) {
    return e.json(200, {
      error: "no_new_version_available",
      message: "Channel not found",
    });
  }
  var channel = chRows[0];
  if (platform === "ios" && !channel.getBool("ios")) {
    return e.json(200, {
      error: "no_new_version_available",
      message: "Platform not supported",
    });
  }
  if (platform === "android" && !channel.getBool("android")) {
    return e.json(200, {
      error: "no_new_version_available",
      message: "Platform not supported",
    });
  }
  if (platform === "electron" && !channel.getBool("electron")) {
    return e.json(200, {
      error: "no_new_version_available",
      message: "Platform not supported",
    });
  }
  if (is_emulator && !channel.getBool("allow_emulator")) {
    return e.json(200, {
      error: "no_new_version_available",
      message: "Emulators not allowed",
    });
  }
  if (is_prod && !channel.getBool("allow_prod")) {
    return e.json(200, {
      error: "no_new_version_available",
      message: "Prod builds not allowed",
    });
  }
  if (!is_prod && !channel.getBool("allow_dev")) {
    return e.json(200, {
      error: "no_new_version_available",
      message: "Dev builds not allowed",
    });
  }

  var aid = app_id || "";
  var bundles = app.findRecordsByFilter(
    "bundles",
    'app_id = {:aid} && active = true',
    "-@rowid",
    500,
    0,
    { aid: aid }
  );

  var latest = null;
  var bi;
  for (bi = 0; bi < bundles.length; bi++) {
    var bundle = bundles[bi];
    var bv = bundle.getString("version");
    if (currentVersion === "builtin" || semverGt(bv, currentVersion)) {
      if (!latest || semverGt(bv, latest.getString("version"))) {
        latest = bundle;
      }
    }
  }

  if (!latest) {
    return e.json(200, {
      error: "no_new_version_available",
      message: "No new version available",
    });
  }

  var fn = latest.getString("app_id") + "_" + latest.getString("version") + ".zip";
  return e.json(200, {
    version: latest.getString("version"),
    url: baseUrl() + "/v1/bundles/" + fn,
    checksum: latest.getString("checksum"),
  });
});

routerAdd("POST", "/v1/stats", function (e) {
  var app = e.app;
  var body = {};
  try {
    e.bindBody(body);
  } catch (_e) {
    body = e.requestInfo().body || {};
  }
  var col = app.findCollectionByNameOrId("stats");
  var rec = new Record(col);
  rec.set("action", body.action || "");
  rec.set("device_id", body.device_id || "");
  rec.set("app_id", body.app_id || "");
  rec.set("version_name", body.version_name || "");
  rec.set("version_build", body.version_build || "");
  rec.set("platform", body.platform || "");
  app.save(rec);
  return e.json(200, { status: "ok" });
});

routerAdd("POST", "/v1/errors", function (e) {
  var app = e.app;
  var body = {};
  try {
    e.bindBody(body);
  } catch (_e) {
    body = e.requestInfo().body || {};
  }
  var col = app.findCollectionByNameOrId("errors");
  var rec = new Record(col);
  rec.set("device_id", body.device_id || "");
  rec.set("app_id", body.app_id || "");
  rec.set("version", body.version || "");
  rec.set("platform", body.platform || "");
  rec.set("message", body.message || "");
  rec.set("stack", body.stack || "");
  rec.set("context", body.context || "");
  app.save(rec);
  return e.json(200, { status: "ok" });
});

routerAdd(
  "GET",
  "/v1/admin/errors",
  function (e) {
    var app = e.app;
    var q = e.request.url.query();
    var limit = parseInt(q.get("limit") || "50", 10) || 50;
    if (limit > 200) limit = 200;
    var appId = q.get("app_id");
    var filter = "";
    var params = {};
    if (appId && String(appId).length > 0) {
      filter = "app_id = {:aid}";
      params.aid = appId;
    }
    var rows = app.findRecordsByFilter(
      "errors",
      filter,
      "-@rowid",
      limit,
      0,
      params
    );
    var out = [];
    var i;
    for (i = 0; i < rows.length; i++) {
      var r = rows[i];
      out.push({
        id: r.id,
        device_id: r.get("device_id"),
        app_id: r.get("app_id"),
        version: r.get("version"),
        platform: r.get("platform"),
        message: r.get("message"),
        stack: r.get("stack"),
        context: r.get("context"),
        created_at: r.get("created") || r.get("updated"),
      });
    }
    return e.json(200, out);
  },
  $apis.requireSuperuserAuth()
);

routerAdd("GET", "/v1/channel_self", function (e) {
  var app = e.app;
  var q = e.request.url.query();
  var platform = q.get("platform");
  var is_emulator = q.get("is_emulator") === "true" || q.get("is_emulator") === "1";
  var is_prod = q.get("is_prod") !== "false" && q.get("is_prod") !== "0";

  var rows = app.findRecordsByFilter("channels", "", "id", 500, 0, {});
  var out = [];
  var i;
  for (i = 0; i < rows.length; i++) {
    var ch = rows[i];
    if (platform === "ios" && !ch.getBool("ios")) continue;
    if (platform === "android" && !ch.getBool("android")) continue;
    if (platform === "electron" && !ch.getBool("electron")) continue;
    if (is_emulator && !ch.getBool("allow_emulator")) continue;
    if (is_prod && !ch.getBool("allow_prod")) continue;
    if (!is_prod && !ch.getBool("allow_dev")) continue;
    if (!ch.getBool("public") && !ch.getBool("allow_self_set")) continue;
    out.push({
      id: ch.id,
      name: ch.getString("name"),
      public: ch.getBool("public"),
      allow_self_set: ch.getBool("allow_self_set"),
    });
  }
  return e.json(200, out);
});

routerAdd("PUT", "/v1/channel_self", function (e) {
  var app = e.app;
  var body = {};
  try {
    e.bindBody(body);
  } catch (_e) {
    body = e.requestInfo().body || {};
  }
  var device_id = body.device_id;
  var app_id = body.app_id;

  var devRows = app.findRecordsByFilter(
    "devices",
    'device_id = {:d} && app_id = {:a}',
    "",
    1,
    0,
    { d: device_id || "", a: app_id || "" }
  );
  var channelName = "production";
  if (devRows && devRows.length > 0) {
    channelName = devRows[0].getString("channel") || "production";
  }

  var chRows = app.findRecordsByFilter(
    "channels",
    'name = {:n}',
    "",
    1,
    0,
    { n: channelName }
  );
  var allowSet = false;
  if (chRows && chRows.length > 0) {
    allowSet = chRows[0].getBool("allow_self_set");
  }

  return e.json(200, {
    status: "ok",
    channel: channelName,
    allowSet: allowSet,
    message: "",
    error: "",
  });
});

routerAdd("POST", "/v1/channel_self", function (e) {
  var app = e.app;
  var body = {};
  try {
    e.bindBody(body);
  } catch (_e) {
    body = e.requestInfo().body || {};
  }
  var device_id = body.device_id;
  var app_id = body.app_id;
  var channelName = body.channel;
  var platform = body.platform;

  var chRows = app.findRecordsByFilter(
    "channels",
    'name = {:n}',
    "",
    1,
    0,
    { n: channelName }
  );
  if (!chRows || chRows.length === 0) {
    return e.json(400, {
      status: "error",
      message: 'Channel "' + String(channelName) + '" not found',
    });
  }

  var col = app.findCollectionByNameOrId("devices");
  var existing = app.findRecordsByFilter(
    "devices",
    'device_id = {:d} && app_id = {:a}',
    "",
    1,
    0,
    { d: device_id || "", a: app_id || "" }
  );
  if (existing && existing.length > 0) {
    var er = existing[0];
    er.set("channel", channelName);
    er.set("platform", platform);
    app.save(er);
  } else {
    var nr = new Record(col);
    nr.set("device_id", device_id);
    nr.set("app_id", app_id);
    nr.set("channel", channelName);
    nr.set("platform", platform);
    app.save(nr);
  }

  return e.json(200, {
    status: "ok",
    message: 'Device channel set to "' + String(channelName) + '"',
  });
});

routerAdd("DELETE", "/v1/channel_self", function (e) {
  var app = e.app;
  var body = {};
  try {
    e.bindBody(body);
  } catch (_e) {
    body = e.requestInfo().body || {};
  }
  var device_id = body.device_id;
  var app_id = body.app_id;

  var existing = app.findRecordsByFilter(
    "devices",
    'device_id = {:d} && app_id = {:a}',
    "",
    1,
    0,
    { d: device_id || "", a: app_id || "" }
  );
  if (existing && existing.length > 0) {
    var er = existing[0];
    er.set("channel", "production");
    app.save(er);
  }

  return e.json(200, {
    status: "ok",
    message: 'Device channel reset to "production"',
  });
});

routerAdd("GET", "/v1/bundles/{filename}", function (e) {
  function baseName(p) {
    var s = String(p || "");
    var i = s.lastIndexOf("/");
    if (i >= 0) s = s.substring(i + 1);
    i = s.lastIndexOf("\\");
    if (i >= 0) s = s.substring(i + 1);
    return s;
  }
  var app = e.app;
  var name = baseName(e.request.pathValue("filename"));
  var path = app.dataDir() + "/bundles/" + name;
  try {
    var raw = $os.readFile(path);
    return e.blob(200, "application/zip", raw);
  } catch (_err) {
    return e.json(404, { error: "not_found", message: "Bundle not found" });
  }
});

routerAdd(
  "POST",
  "/v1/admin/upload",
  function (e) {
    function readAllMultipart(mf) {
      var out = [];
      var buf = [];
      var k;
      for (k = 0; k < 8192; k++) buf.push(0);
      while (true) {
        var n = 0;
        try {
          n = mf.read(buf);
        } catch (ex) {
          var es = String(ex);
          if (es.indexOf("EOF") >= 0 || es.indexOf("eof") >= 0) break;
          throw ex;
        }
        if (!n || n <= 0) break;
        var j;
        for (j = 0; j < n; j++) out.push(buf[j]);
      }
      try {
        mf.close();
      } catch (_c) {}
      return out;
    }
    function sha256FileFromPath(p) {
      var raw = $os.readFile(p);
      if (typeof raw === "string") {
        return $security.sha256(raw);
      }
      var bin = "";
      var step = 8000;
      var off;
      for (off = 0; off < raw.length; off += step) {
        var end = off + step;
        if (end > raw.length) end = raw.length;
        var slice = raw.slice(off, end);
        bin += String.fromCharCode.apply(null, slice);
      }
      return $security.sha256(bin);
    }
    function notifyWT(aid, ver, sum) {
      var key = $os.getenv("WATCHTOWER_KEY");
      var url = $os.getenv("WATCHTOWER_URL");
      if (!key || !url || String(key).length === 0 || String(url).length === 0)
        return;
      try {
        $http.send({
          method: "POST",
          url: String(url),
          body: JSON.stringify({
            source: "capgo",
            log:
              "Bundle uploaded: " +
              String(aid) +
              "@" +
              String(ver) +
              " (checksum " +
              String(sum) +
              ")",
          }),
          headers: {
            "Content-Type": "application/json",
            "x-api-key": String(key),
          },
        });
      } catch (_e) {}
    }

    var app = e.app;
    var mf = null;
    try {
      var mfPair = e.request.formFile("file");
      mf = mfPair[0];
    } catch (_fe) {
      return e.json(400, {
        status: "error",
        message: "version and file are required",
      });
    }
    if (!mf) {
      return e.json(400, {
        status: "error",
        message: "version and file are required",
      });
    }

    var version = e.request.formValue("version");
    var app_id = e.request.formValue("app_id");
    if (!version || String(version).length === 0) {
      return e.json(400, {
        status: "error",
        message: "version and file are required",
      });
    }
    if (!app_id || String(app_id).length === 0) {
      return e.json(400, { status: "error", message: "app_id is required" });
    }

    $os.mkdirAll(app.dataDir() + "/bundles", 493);

    var data = readAllMultipart(mf);
    var destPath =
      app.dataDir() +
      "/bundles/" +
      String(app_id) +
      "_" +
      String(version) +
      ".zip";
    $os.writeFile(destPath, data, 420);

    var checksum = sha256FileFromPath(destPath);

    var col = app.findCollectionByNameOrId("bundles");
    var existing = app.findRecordsByFilter(
      "bundles",
      'app_id = {:aid} && version = {:ver}',
      "",
      1,
      0,
      { aid: String(app_id), ver: String(version) }
    );

    if (existing && existing.length > 0) {
      var br = existing[0];
      br.set("checksum", checksum);
      br.set("file_path", destPath);
      br.set("active", true);
      app.save(br);
    } else {
      var nr = new Record(col);
      nr.set("app_id", String(app_id));
      nr.set("version", String(version));
      nr.set("checksum", checksum);
      nr.set("file_path", destPath);
      nr.set("active", true);
      app.save(nr);
    }

    notifyWT(app_id, version, checksum);

    return e.json(200, {
      status: "ok",
      app_id: String(app_id),
      version: String(version),
      checksum: checksum,
    });
  },
  $apis.requireSuperuserAuth()
);

routerAdd(
  "GET",
  "/v1/admin/bundles",
  function (e) {
    var app = e.app;
    var q = e.request.url.query();
    var appId = q.get("app_id");
    var filter = "";
    var params = {};
    if (appId && String(appId).length > 0) {
      filter = "app_id = {:aid}";
      params.aid = appId;
    }
    var rows = app.findRecordsByFilter(
      "bundles",
      filter,
      "-@rowid",
      500,
      0,
      params
    );
    var out = [];
    var i;
    for (i = 0; i < rows.length; i++) {
      var r = rows[i];
      out.push({
        id: r.id,
        app_id: r.get("app_id"),
        version: r.get("version"),
        checksum: r.get("checksum"),
        created_at: r.get("created") || r.get("updated"),
      });
    }
    return e.json(200, out);
  },
  $apis.requireSuperuserAuth()
);

routerAdd(
  "POST",
  "/v1/admin/channels",
  function (e) {
    var app = e.app;
    var body = {};
    try {
      e.bindBody(body);
    } catch (_e) {
      body = e.requestInfo().body || {};
    }
    var name = body.name;
    if (!name || String(name).length === 0) {
      return e.json(400, {
        status: "error",
        message: "Channel name is required",
      });
    }

    var isPublic = body.public !== undefined ? !!body.public : true;
    var allow_self_set = !!body.allow_self_set;
    var ios = body.ios !== undefined ? !!body.ios : true;
    var android = body.android !== undefined ? !!body.android : true;
    var electron = body.electron !== undefined ? !!body.electron : true;
    var allow_emulator = !!body.allow_emulator;
    var allow_device = body.allow_device !== undefined ? !!body.allow_device : true;
    var allow_dev = body.allow_dev !== undefined ? !!body.allow_dev : true;
    var allow_prod = body.allow_prod !== undefined ? !!body.allow_prod : true;

    try {
      var col = app.findCollectionByNameOrId("channels");
      var rec = new Record(col);
      rec.set("name", String(name));
      rec.set("public", isPublic);
      rec.set("allow_self_set", allow_self_set);
      rec.set("ios", ios);
      rec.set("android", android);
      rec.set("electron", electron);
      rec.set("allow_emulator", allow_emulator);
      rec.set("allow_device", allow_device);
      rec.set("allow_dev", allow_dev);
      rec.set("allow_prod", allow_prod);
      app.save(rec);
    } catch (err) {
      return e.json(400, { status: "error", message: String(err) });
    }

    return e.json(200, {
      status: "ok",
      message: 'Channel "' + String(name) + '" created',
    });
  },
  $apis.requireSuperuserAuth()
);
