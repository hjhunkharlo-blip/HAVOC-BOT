// index.js
// HAVOC STYX Discord Bot with Tier List API
// Supports numeric ranks (1-50), 9 kits with aliases, Railway deployment

require("dotenv").config();

const fs = require("fs").promises;
const path = require("path");
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionsBitField
} = require("discord.js");

const app = express();

// Railway & Environment Configuration
const PORT = process.env.PORT || 8080;
const RAILWAY_ENVIRONMENT = process.env.RAILWAY_ENVIRONMENT_NAME || "development";
const DATA_FILE = process.env.DATA_FILE_PATH || path.resolve(__dirname, "tiers.json");
const SAVE_DEBOUNCE_MS = parseInt(process.env.SAVE_DEBOUNCE_MS || "200", 10);
const API_TIMEOUT = parseInt(process.env.API_TIMEOUT_MS || "30000", 10);

let saveTimeout = null;
let tierData = null;
let connectionAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

/* =========================================
   CONFIG
========================================= */

// Numeric ranks 1..50
const TIERS = Array.from({ length: 50 }, (_, i) => String(i + 1));
const TIER_SET = new Set(TIERS);

// 9 Kits with aliases for flexible input
const KITS = [
  { id: "sword", name: "⚔️ Sword", aliases: ["sword"] },
  { id: "axe", name: "🪓 Axe", aliases: ["axe"] },
  { id: "crystal", name: "💎 Crystal", aliases: ["crystal"] },
  { id: "pot", name: "🧪 Pot", aliases: ["pot"] },
  { id: "smp", name: "🥊 SMP", aliases: ["smp"] },
  { id: "dia-smp", name: "💠 Dia SMP", aliases: ["dia-smp", "diasmp", "dia"] },
  { id: "uhc", name: "❤️ UHC", aliases: ["uhc", "uch"] },
  { id: "mace", name: "🔨 Mace", aliases: ["mace"] },
  { id: "spear-mace", name: "🔱⚒️ Spear Mace", aliases: ["spear-mace", "sprearmace", "spear"] },
  { id: "nethsmp", name: "🌍 Neth SMP", aliases: ["nethsmp", "neth"] }
];

const KIT_IDS = new Set(KITS.map(k => k.id));

// Build alias map for quick lookup
const KIT_ALIAS_MAP = {};
KITS.forEach(kit => {
  kit.aliases.forEach(alias => {
    KIT_ALIAS_MAP[alias.toLowerCase()] = kit.id;
  });
});

const RESTRICT_COMMANDS = process.env.RESTRICT_TIER_COMMANDS === "true";
const ADMIN_ROLE_ID = process.env.ADMIN_ROLE_ID || "";
const ADMIN_USER_IDS = (process.env.ADMIN_USER_IDS || "").split(",").map(s => s.trim()).filter(Boolean);

/* =========================================
   UTILITIES: persistence, validation, logging
========================================= */

function log(level, message, meta = {}) {
  const timestamp = new Date().toISOString();
  const env = RAILWAY_ENVIRONMENT;
  console.log(JSON.stringify({ timestamp, level, env, message, ...meta }));
}

function safeNormalizePlayer(name) {
  if (typeof name !== "string") return null;
  const trimmed = name.trim();
  if (!/^[A-Za-z0-9_]{2,16}$/.test(trimmed)) return null;
  return trimmed;
}

function normalizeKit(kitInput) {
  if (typeof kitInput !== "string") return null;
  const lower = kitInput.toLowerCase().trim();
  return KIT_ALIAS_MAP[lower] || null;
}

async function loadData() {
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed === "object" && parsed !== null) {
        tierData = parsed;
        log("info", "Loaded tier data from disk", { file: DATA_FILE });
        connectionAttempts = 0;
        return;
      }
    } catch (parseErr) {
      log("warn", "tiers.json is invalid JSON", { error: parseErr.message });
      try {
        const corruptPath = DATA_FILE + `.corrupt.${Date.now()}`;
        await fs.rename(DATA_FILE, corruptPath);
        log("warn", "Backed up corrupt file", { from: DATA_FILE, to: corruptPath });
      } catch (renameErr) {
        log("warn", "Failed to backup corrupt file", { error: renameErr.message });
      }
    }
  } catch (err) {
    if (err.code !== "ENOENT") {
      log("warn", "Error loading tiers.json", { error: err.message });
    } else {
      log("info", "tiers.json not found — starting with default data");
    }
  }

  // Initialize default structure
  tierData = {};
  for (const k of KIT_IDS) {
    tierData[k] = tierData[k] || {};
  }
  tierData["spear-mace"] = tierData["spear-mace"] || { Yunglah: 50 };
  await saveData();
}

async function saveData() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(async () => {
    try {
      const tmp = DATA_FILE + ".tmp";
      await fs.writeFile(tmp, JSON.stringify(tierData, null, 2), "utf8");
      await fs.rename(tmp, DATA_FILE);
      log("info", "Saved tier data to disk", { file: DATA_FILE });
    } catch (err) {
      log("error", "Failed to save tiers.json", { error: err.message, file: DATA_FILE });
    }
  }, SAVE_DEBOUNCE_MS);
}

/* =========================================
   MIDDLEWARE
========================================= */

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));
app.use(morgan("tiny"));

// Request timeout middleware
app.use((req, res, next) => {
  res.setTimeout(API_TIMEOUT, () => {
    log("warn", "Request timeout", { method: req.method, path: req.path });
    res.status(408).json({ error: "request_timeout" });
  });
  next();
});

const limiter = rateLimit({
  windowMs: 30 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many requests, please try again later.",
  skip: (req) => req.path === "/health" // Don't rate limit health checks
});
app.use("/api/", limiter);

// Error logging middleware
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    return res.status(400).json({ error: "invalid_json_payload" });
  }
  next();
});

/* =========================================
   API ENDPOINTS
========================================= */

// Root status
app.get("/", (req, res) => {
  res.json({
    status: "online",
    bot: "HAVOC STYX",
    api: "v2",
    environment: RAILWAY_ENVIRONMENT,
    timestamp: new Date().toISOString()
  });
});

// Health check (used by Railway)
app.get("/health", (req, res) => {
  const health = {
    ok: tierData !== null,
    uptime: process.uptime(),
    dataLoaded: tierData !== null,
    environment: RAILWAY_ENVIRONMENT,
    timestamp: new Date().toISOString()
  };
  
  if (!tierData) {
    return res.status(503).json(health);
  }
  res.json(health);
});

// Return kits, tiers and current data
app.get("/api/tiers", (req, res) => {
  try {
    if (!tierData) {
      log("warn", "API: tier data not loaded");
      return res.status(503).json({ error: "tier_data_not_loaded" });
    }
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    const pointsByTier = TIERS.reduce((acc, t) => {
      acc[t] = computePointsForRank(parseInt(t, 10));
      return acc;
    }, {});
    res.json({
      kits: KITS.map(k => ({ id: k.id, name: k.name, aliases: k.aliases })),
      tiers: TIERS,
      pointsByTier,
      data: tierData,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    log("error", "Error in /api/tiers", { error: err.message });
    res.status(500).json({ error: "internal_server_error" });
  }
});

app.get("/api/ping", (req, res) => {
  res.json({ ok: true, timestamp: Date.now() });
});

// Leaderboard for a specific kit with alias support
app.get("/api/kit/:kit/leaderboard", (req, res) => {
  try {
    const kit = req.params.kit;
    const normalizedKit = normalizeKit(kit);
    
    if (!normalizedKit) {
      return res.status(404).json({ error: "unknown_kit", provided: kit, availableAliases: Object.keys(KIT_ALIAS_MAP) });
    }

    const map = tierData && tierData[normalizedKit] ? tierData[normalizedKit] : {};
    const rows = Object.keys(map).map(player => {
      const stored = map[player];
      const rank = normalizeStoredRank(stored);
      const points = rank ? computePointsForRank(rank) : 0;
      return { player, rank, points };
    });

    rows.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      return a.player.localeCompare(b.player);
    });

    res.json({
      kit: normalizedKit,
      count: rows.length,
      rows,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    log("error", "Error in /api/kit/:kit/leaderboard", { error: err.message, kit: req.params.kit });
    res.status(500).json({ error: "internal_server_error" });
  }
});

// Global error handler for express
app.use((err, req, res, next) => {
  log("error", "Unhandled express error", { error: err.message, stack: err.stack });
  if (res.headersSent) return next(err);
  res.status(500).json({ error: "internal_server_error", message: process.env.NODE_ENV === "development" ? err.message : undefined });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "endpoint_not_found", path: req.path });
});

/* =========================================
   DISCORD CLIENT
========================================= */

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Build slash command with proper tier range
const tierCommand = new SlashCommandBuilder()
  .setName("tier")
  .setDescription("Manage HAVOC STYX player tiers")
  .addSubcommand(sub =>
    sub
      .setName("add")
      .setDescription("Add a player to a tier (e.g., /tier add player:Yunglah tier:1 kit:sprearmace)")
      .addStringOption(opt => opt.setName("player").setDescription("Minecraft player name").setRequired(true))
      .addStringOption(opt =>
        opt
          .setName("kit")
          .setDescription("Kit (mace, sprearmace, diasmp, nethsmp, uch, sword, axe, smp, crystal, pot)")
          .setRequired(true)
          .addChoices(...KITS.map(kit => ({ name: kit.name, value: kit.id })))
      )
      .addIntegerOption(opt =>
        opt
          .setName("tier")
          .setDescription("Rank 1 (best) to 50 (worst)")
          .setRequired(true)
          .setMinValue(1)
          .setMaxValue(50)
      )
  )
  .addSubcommand(sub =>
    sub
      .setName("remove")
      .setDescription("Remove a player from a kit")
      .addStringOption(opt => opt.setName("player").setDescription("Minecraft player name").setRequired(true))
      .addStringOption(opt =>
        opt.setName("kit").setDescription("Kit").setRequired(true).addChoices(...KITS.map(kit => ({ name: kit.name, value: kit.id })))
      )
  )
  .addSubcommand(sub =>
    sub
      .setName("get")
      .setDescription("Get a player's tier in a kit")
      .addStringOption(opt => opt.setName("player").setDescription("Minecraft player name").setRequired(true))
      .addStringOption(opt =>
        opt.setName("kit").setDescription("Kit").setRequired(true).addChoices(...KITS.map(kit => ({ name: kit.name, value: kit.id })))
      )
  );

/* =========================================
   REGISTER COMMANDS
========================================= */

client.once("ready", async () => {
  log("info", "Bot logged in", { user: client.user.tag });

  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

  try {
    if (process.env.GUILD_ID) {
      await rest.put(Routes.applicationGuildCommands(client.user.id, process.env.GUILD_ID), {
        body: [tierCommand.toJSON()]
      });
      log("info", "Registered guild commands", { guildId: process.env.GUILD_ID });
    } else {
      await rest.put(Routes.applicationCommands(client.user.id), { body: [tierCommand.toJSON()] });
      log("info", "Registered global commands");
    }
  } catch (error) {
    log("error", "Slash command registration failed", { error: error.message });
  }

  log("info", "HAVOC STYX bot is ready");
});

/* =========================================
   HELPERS
========================================= */

function isAdminInteraction(interaction) {
  if (ADMIN_USER_IDS.includes(String(interaction.user.id))) return true;

  if (ADMIN_ROLE_ID && interaction.member?.roles?.cache?.has && interaction.member.roles.cache.has(ADMIN_ROLE_ID)) {
    return true;
  }

  try {
    if (interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageGuild)) return true;
  } catch (err) {
    // ignore
  }

  return false;
}

function normalizeStoredRank(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value >= 1 && value <= 50) return value;
    return null;
  }
  if (typeof value === "string") {
    const n = parseInt(value, 10);
    if (Number.isFinite(n) && n >= 1 && n <= 50) return n;
    return null;
  }
  return null;
}

function computePointsForRank(rank) {
  if (!Number.isFinite(rank)) return 0;
  if (rank < 1 || rank > 50) return 0;
  return 51 - rank;
}

/* =========================================
   INTERACTION HANDLER
========================================= */

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== "tier") return;

  try {
    const subcommand = interaction.options.getSubcommand();

    if (RESTRICT_COMMANDS && !isAdminInteraction(interaction)) {
      log("warn", "User attempted restricted command", { userId: interaction.user.id, username: interaction.user.username });
      await interaction.reply({ content: "❌ You don't have permission to modify tiers.", ephemeral: true });
      return;
    }

    if (subcommand === "add") {
      const rawPlayer = interaction.options.getString("player", true);
      const kit = interaction.options.getString("kit", true);
      const tierInt = interaction.options.getInteger("tier", true);

      const player = safeNormalizePlayer(rawPlayer);
      if (!player) {
        await interaction.reply({ content: "❌ Invalid player name. Use A-Z, 0-9 or _ (2-16 chars).", ephemeral: true });
        return;
      }

      if (!KIT_IDS.has(kit)) {
        await interaction.reply({ content: "❌ Invalid kit.", ephemeral: true });
        return;
      }

      if (!Number.isInteger(tierInt) || tierInt < 1 || tierInt > 50) {
        await interaction.reply({ content: "❌ Invalid rank. Must be 1-50.", ephemeral: true });
        return;
      }

      tierData[kit] = tierData[kit] || {};
      tierData[kit][player] = tierInt;
      await saveData();

      log("info", "Tier added", { player, kit, tier: tierInt, userId: interaction.user.id });
      const kitName = KITS.find(k => k.id === kit)?.name || kit;
      await interaction.reply({
        content: `✅ **${player}** is now **#${tierInt}** in **${kitName}**.\n🌐 View: \`/tier get player:${player} kit:${kit}\``
      });
      return;
    }

    if (subcommand === "remove") {
      const rawPlayer = interaction.options.getString("player", true);
      const kit = interaction.options.getString("kit", true);

      const player = safeNormalizePlayer(rawPlayer);
      if (!player) {
        await interaction.reply({ content: "❌ Invalid player name.", ephemeral: true });
        return;
      }

      if (!KIT_IDS.has(kit)) {
        await interaction.reply({ content: "❌ Invalid kit.", ephemeral: true });
        return;
      }

      if (!tierData[kit] || tierData[kit][player] === undefined) {
        await interaction.reply({ content: `❌ **${player}** is not ranked in that kit.`, ephemeral: true });
        return;
      }

      delete tierData[kit][player];
      await saveData();

      log("info", "Tier removed", { player, kit, userId: interaction.user.id });
      const kitName = KITS.find(k => k.id === kit)?.name || kit;
      await interaction.reply({ content: `✅ Removed **${player}** from **${kitName}**.` });
      return;
    }

    if (subcommand === "get") {
      const rawPlayer = interaction.options.getString("player", true);
      const kit = interaction.options.getString("kit", true);

      const player = safeNormalizePlayer(rawPlayer);
      if (!player) {
        await interaction.reply({ content: "❌ Invalid player name.", ephemeral: true });
        return;
      }

      if (!KIT_IDS.has(kit)) {
        await interaction.reply({ content: "❌ Invalid kit.", ephemeral: true });
        return;
      }

      const rank = tierData[kit]?.[player];
      if (rank === undefined) {
        await interaction.reply({ content: `❌ **${player}** is not ranked in that kit.`, ephemeral: true });
        return;
      }

      const points = computePointsForRank(rank);
      const kitName = KITS.find(k => k.id === kit)?.name || kit;
      await interaction.reply({
        content: `📊 **${player}** in **${kitName}**: **#${rank}** (${points} pts)`
      });
      return;
    }
  } catch (err) {
    log("error", "Error handling interaction", { error: err.message, user: interaction.user.id });
    if (!interaction.replied && !interaction.deferred) {
      try {
        await interaction.reply({ content: "❌ An unexpected error occurred. Check logs.", ephemeral: true });
      } catch (e) {
        log("error", "Failed to reply to interaction", { error: e.message });
      }
    }
  }
});

// Handle Discord client errors
client.on("error", err => {
  log("error", "Discord client error", { error: err.message });
});

client.on("warn", info => {
  log("warn", "Discord client warning", { info });
});

client.on("disconnect", () => {
  log("warn", "Discord client disconnected");
});

/* =========================================
   START SERVER & BOT
========================================= */

(async function start() {
  try {
    await loadData();
  } catch (err) {
    log("error", "Failed to initialize data", { error: err.message });
    process.exit(1);
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    log("info", "HAVOC STYX API listening", { port: PORT, environment: RAILWAY_ENVIRONMENT });
  });

  server.on("error", (err) => {
    log("error", "Server error", { error: err.message });
  });

  const shutdown = async () => {
    log("info", "Shutdown initiated");
    if (saveTimeout) clearTimeout(saveTimeout);
    try {
      await fs.writeFile(DATA_FILE, JSON.stringify(tierData, null, 2), "utf8");
      log("info", "Final save complete");
    } catch (err) {
      log("error", "Error saving data during shutdown", { error: err.message });
    }
    server.close(() => {
      log("info", "HTTP server closed");
      process.exit(0);
    });
    setTimeout(() => {
      log("warn", "Forcing exit after timeout");
      process.exit(1);
    }, 5000).unref();
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  process.on("unhandledRejection", reason => {
    log("error", "Unhandled rejection", { reason: String(reason) });
  });

  process.on("uncaughtException", err => {
    log("error", "Uncaught exception", { error: err.message });
  });

  if (!process.env.DISCORD_TOKEN) {
    log("warn", "DISCORD_TOKEN not set — Discord features disabled");
  } else {
    try {
      await client.login(process.env.DISCORD_TOKEN);
    } catch (err) {
      log("error", "Discord login failed", { error: err.message });
      connectionAttempts++;
      if (connectionAttempts < MAX_RECONNECT_ATTEMPTS) {
        log("info", "Retrying Discord connection...", { attempt: connectionAttempts });
        setTimeout(() => client.login(process.env.DISCORD_TOKEN), 5000);
      }
    }
  }
})();
