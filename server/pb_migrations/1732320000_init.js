migrate(
  (app) => {
    const bundles = new Collection({
      type: "base",
      name: "bundles",
      listRule: "",
      viewRule: "",
      createRule: "",
      updateRule: "",
      deleteRule: "",
      fields: [
        { type: "text", name: "app_id", required: true, max: 0 },
        { type: "text", name: "version", required: true, max: 0 },
        { type: "text", name: "checksum", required: true, max: 0 },
        { type: "text", name: "file_path", required: true, max: 0 },
        { type: "bool", name: "active", required: false },
      ],
      indexes: [
        "CREATE UNIQUE INDEX `idx_bundles_app_version` ON `bundles` (`app_id`, `version`)",
      ],
    });
    app.save(bundles);

    const channels = new Collection({
      type: "base",
      name: "channels",
      listRule: "",
      viewRule: "",
      createRule: "",
      updateRule: "",
      deleteRule: "",
      fields: [
        { type: "text", name: "name", required: true, max: 0, unique: true },
        { type: "bool", name: "public", required: false },
        { type: "bool", name: "allow_self_set", required: false },
        { type: "bool", name: "ios", required: false },
        { type: "bool", name: "android", required: false },
        { type: "bool", name: "electron", required: false },
        { type: "bool", name: "allow_emulator", required: false },
        { type: "bool", name: "allow_device", required: false },
        { type: "bool", name: "allow_dev", required: false },
        { type: "bool", name: "allow_prod", required: false },
      ],
    });
    channels.fields.getByName("public").default = true;
    channels.fields.getByName("allow_self_set").default = false;
    channels.fields.getByName("ios").default = true;
    channels.fields.getByName("android").default = true;
    channels.fields.getByName("electron").default = true;
    channels.fields.getByName("allow_emulator").default = false;
    channels.fields.getByName("allow_device").default = true;
    channels.fields.getByName("allow_dev").default = true;
    channels.fields.getByName("allow_prod").default = true;
    app.save(channels);

    const devices = new Collection({
      type: "base",
      name: "devices",
      listRule: "",
      viewRule: "",
      createRule: "",
      updateRule: "",
      deleteRule: "",
      fields: [
        { type: "text", name: "device_id", required: true, max: 0 },
        { type: "text", name: "app_id", required: true, max: 0 },
        { type: "text", name: "channel", required: false, max: 0 },
        { type: "text", name: "platform", required: false, max: 0 },
      ],
      indexes: [
        "CREATE UNIQUE INDEX `idx_devices_dev_app` ON `devices` (`device_id`, `app_id`)",
      ],
    });
    devices.fields.getByName("channel").default = "production";
    app.save(devices);

    const stats = new Collection({
      type: "base",
      name: "stats",
      listRule: "",
      viewRule: "",
      createRule: "",
      updateRule: "",
      deleteRule: "",
      fields: [
        { type: "text", name: "action", required: false, max: 0 },
        { type: "text", name: "device_id", required: false, max: 0 },
        { type: "text", name: "app_id", required: false, max: 0 },
        { type: "text", name: "version_name", required: false, max: 0 },
        { type: "text", name: "version_build", required: false, max: 0 },
        { type: "text", name: "platform", required: false, max: 0 },
      ],
    });
    app.save(stats);

    const errors = new Collection({
      type: "base",
      name: "errors",
      listRule: "",
      viewRule: "",
      createRule: "",
      updateRule: "",
      deleteRule: "",
      fields: [
        { type: "text", name: "device_id", required: false, max: 0 },
        { type: "text", name: "app_id", required: false, max: 0 },
        { type: "text", name: "version", required: false, max: 0 },
        { type: "text", name: "platform", required: false, max: 0 },
        { type: "text", name: "message", required: false, max: 0 },
        { type: "text", name: "stack", required: false, max: 0 },
        { type: "text", name: "context", required: false, max: 0 },
      ],
    });
    app.save(errors);

    const chCol = app.findCollectionByNameOrId("channels");
    const prod = new Record(chCol);
    prod.set("name", "production");
    prod.set("public", true);
    prod.set("allow_self_set", false);
    prod.set("ios", true);
    prod.set("android", true);
    prod.set("electron", true);
    prod.set("allow_emulator", false);
    prod.set("allow_device", true);
    prod.set("allow_dev", true);
    prod.set("allow_prod", true);
    app.save(prod);
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId("errors"));
    } catch (_) {}
    try {
      app.delete(app.findCollectionByNameOrId("stats"));
    } catch (_) {}
    try {
      app.delete(app.findCollectionByNameOrId("devices"));
    } catch (_) {}
    try {
      app.delete(app.findCollectionByNameOrId("channels"));
    } catch (_) {}
    try {
      app.delete(app.findCollectionByNameOrId("bundles"));
    } catch (_) {}
  }
);
