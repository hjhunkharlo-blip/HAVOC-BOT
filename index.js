// index.js
// Improved HAVOC STYX: numeric ranks (1-50), points system, 10 kits, leaderboard endpoint, and hardened error handling

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
  SlashCommandIntegerOption,
  PermissionsBitField
} = require("discord.js");

const app = express();
const PORT = process.env.PORT || 8080;
const DATA_FILE = path.resolve(__dirname, "tiers.json");
const SAVE_DEBOUNCE_MS = parseInt(process.env.SAVE_DEBOUNCE_MS || "200", 10);

let saveTimeout = null;
let tierData = null;

/* =========================================
   CONFIG
========================================= */

// Numeric ranks 1..50 (no letters) as requested
const TIERS = Array.from({ length: 50 }, (_, i) => String(i + 1));
const TIER_SET = new Set(TIERS);

const KITS = [
  { id: "sword", name: "⚔️ Sword" },
  { id: "axe", name: "🪓 Axe" },
  { id: "crystal", name: "💎 Crystal" },
  { id: "pot", name: "🧪 Pot" },
  { id: "smp", name: "🥊 SMP" },
  { id: "dia-smp", name: "💠 Dia SMP" },
  { id: "uhc", name: "❤️ UHC" },
  { id: "mace", name: "🔨 Mace" },
  { id: "spear-mace", name: "🔱⚒️ Spear Mace" },
  // 10th kit added per request
  { id: "bow", name: "🏹 Bow" }
];

const KIT_IDS = new Set(KITS.map(k => k.id));

const RESTRICT_COMMANDS = process.env.RESTRICT_TIER_COMMANDS === "true";
const ADMIN_ROLE_ID = process.env.ADMIN_ROLE_ID || "";
const ADMIN_USER_IDS = (process.env.ADMIN_USER_IDS || "").split(",").map(s => s.trim()).filter(Boolean);

/* =========================================
   UTILITIES: persistence, validation, logging
========================================= */

function safeNormalizePlayer(name) {
  if (typeof name !== "string") return null;
  const trimmed = name.trim();
  if (!/^[A-Za-z0-9_]{2,16}$/.test(trimmed)) return null;
  return trimmed;
}

async function loadData() {
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed === "object" && parsed !== null) {
        tierData = parsed;
        console.info("Loaded tier data from disk.");
        return;
      }
    } catch (parseErr) {
      console.warn("tiers.json exists but is invalid JSON — backing up and starting fresh:", parseErr);
      try {
        const corruptPath = DATA_FILE + `.corrupt.${Date.now()}`;
        await fs.rename(DATA_FILE, corruptPath);
        console.warn("Backed up corrupt tiers.json to", corruptPath);
      } catch (renameErr) {
        console.warn("Failed to backup corrupt tiers.json:", renameErr);
      }
    }
  } catch (err) {
    if (err.code !== "ENOENT") {
      console.warn("Error loading tiers.json:", err);
    } else {
      console.info("tiers.json not found — starting with default data.");
    }
  }

  // default structure
  tierData = {};
  for (const k of KIT_IDS) {
    tierData[k] = tierData[k] || {};
  }
  // keep a sample entry if missing
  tierData["spear-mace"] = tierData["spear-mace"] || { Yunglah: "50" };
  await saveData();
}

async function saveData() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(async () => {
    try {
      const tmp = DATA_FILE + ".tmp";
      await fs.writeFile(tmp, JSON.stringify(tierData, null, 2), "utf8");
      await fs.rename(tmp, DATA_FILE);
      console.info("Saved tier data to disk.");
    } catch (err) {
      console.error("Failed to save tiers.json:", err);
    }
  }, SAVE_DEBOUNCE_MS);
}

/* =========================================
   MIDDLEWARE
========================================= */

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan("tiny"));

const limiter = rateLimit({
  windowMs: 30 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false
});
app.use("/api/", limiter);

/* =========================================
   API
========================================= */

app.get("/", (req, res) => {
  res.json({ status: "online", bot: "HAVOC STYX", api: "online" });
});

// Return kits, tiers and current data. Include computed point mapping info.
app.get("/api/tiers", (req, res) => {
  if (!tierData) {
    return res.status(500).json({ error: "tier data not loaded" });
  }
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  const pointsByTier = TIERS.reduce((acc, t) => {
    acc[t] = computePointsForRank(parseInt(t, 10));
    return acc;
  }, {});
  res.json({ kits: KITS, tiers: TIERS, pointsByTier, data: tierData });
});

app.get("/api/ping", (req, res) => res.json({ ok: true, ts: Date.now() }));

// Leaderboard for a specific kit — returns players sorted by rank (1 best)
app.get("/api/kit/:kit/leaderboard", (req, res) => {
  const kit = req.params.kit;
  if (!KIT_IDS.has(kit)) return res.status(404).json({ error: "unknown_kit" });
  const map = tierData && tierData[kit] ? tierData[kit] : {};
  const rows = Object.keys(map).map(player => {
    const stored = map[player];
    const rank = normalizeStoredRank(stored); // integer or null
    const points = rank ? computePointsForRank(rank) : 0;
    return { player, rank, points, tier: stored };
  });
  rows.sort((a, b) => {
    // sort by points desc, then player name
    if (b.points !== a.points) return b.points - a.points;
    return a.player.localeCompare(b.player);
  });
  res.json({ kit, rows, count: rows.length });
});

// Basic JSON error handler for API
app.use((err, req, res, next) => {
  console.error("Unhandled express error:", err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: "internal_server_error" });
});

/* =========================================
   DISCORD CLIENT
========================================= */

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Build slash command: use an integer option for tier (1-50) because Discord has a 25-choice limit
const tierCommand = new SlashCommandBuilder()
  .setName("tier")
  .setDescription("Manage HAVOC STYX player tiers")
  .addSubcommand(sub =>
    sub
      .setName("add")
      .setDescription("Add a player to a tier")
      .addStringOption(opt => opt.setName("player").setDescription("Minecraft player name").setRequired(true))
      .addStringOption(opt =>
        opt
          .setName("kit")
          .setDescription("Kit")
          .setRequired(true)
          .addChoices(...KITS.map(kit => ({ name: kit.name, value: kit.id })))
      )
      // use integer option for tier so users provide 1..50
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
  );

/* =========================================
   REGISTER COMMANDS (global vs guild)
========================================= */

client.once("ready", async () => {
  console.info(`Logged in as ${client.user.tag}`);

  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

  try {
    if (process.env.GUILD_ID) {
      await rest.put(Routes.applicationGuildCommands(client.user.id, process.env.GUILD_ID), {
        body: [tierCommand.toJSON()]
      });
      console.info("Registered guild commands.");
    } else {
      await rest.put(Routes.applicationCommands(client.user.id), { body: [tierCommand.toJSON()] });
      console.info("Registered global commands.");
    }
  } catch (error) {
    console.error("Slash command registration error:", error);
  }

  console.info("HAVOC STYX bot is online!");
});

/* =========================================
   HELPERS: permission check
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

/* =========================================
   RANK/POINT HELPERS
========================================= */

// Convert stored tier value (could be string or number or legacy like "LT5") into an integer rank 1..50 or null
function normalizeStoredRank(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value >= 1 && value <= 50) return value;
    return null;
  }
  if (typeof value === 'string') {
    // If it's purely numeric, parse it
    const n = parseInt(value, 10);
    if (Number.isFinite(n) && n >= 1 && n <= 50) return n;
    // legacy formats (e.g., HT1/LT5) are not auto-mapped — return null so they appear at bottom
    return null;
  }
  return null;
}

// Simple linear points system: rank 1 -> 50 points, rank 50 -> 1 point
function computePointsForRank(rank) {
  if (!Number.isFinite(rank)) return 0;
  if (rank < 1) return 0;
  if (rank > 50) return 0;
  return 51 - rank; // 1 -> 50, 50 -> 1
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
        await interaction.reply({ content: "❌ Invalid rank. Must be an integer between 1 and 50.", ephemeral: true });
        return;
      }

      tierData[kit] = tierData[kit] || {};
      tierData[kit][player] = tierInt; // store as number
      await saveData();

      console.info(`[TIER ADD] ${player} → ${kit} → ${tierInt}`);
      await interaction.reply({
        content: `✅ **${player}** is now **#${tierInt}** in **${KITS.find(k => k.id === kit)?.name || kit}**.\n\n🌐 The website will update automatically.`
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

      console.info(`[TIER REMOVE] ${player} ← ${kit}`);
      await interaction.reply({ content: `✅ Removed **${player}** from **${KITS.find(k => k.id === kit)?.name || kit}**.` });
      return;
    }
  } catch (err) {
    console.error("Error handling interaction:", err);
    if (!interaction.replied && !interaction.deferred) {
      try {
        await interaction.reply({ content: "❌ An unexpected error occurred.", ephemeral: true });
      } catch (e) {
        // ignore
      }
    }
  }
});

/* =========================================
   START SERVER & BOT
========================================= */

(async function start() {
  try {
    await loadData();
  } catch (err) {
    console.error("Failed to initialize data:", err);
    process.exit(1);
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.info(`🌐 HAVOC STYX API running on port ${PORT}`);
  });

  const shutdown = async () => {
    console.info("Shutdown requested — saving data & closing...");
    if (saveTimeout) clearTimeout(saveTimeout);
    try {
      await fs.writeFile(DATA_FILE, JSON.stringify(tierData, null, 2), "utf8");
    } catch (err) {
      console.error("Error saving data during shutdown:", err);
    }
    server.close(() => {
      console.info("HTTP server closed.");
      process.exit(0);
    });
    setTimeout(() => {
      console.info("Forcing exit.");
      process.exit(1);
    }, 5000).unref();
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  process.on('unhandledRejection', (reason) => {
    console.error('Unhandled Rejection:', reason);
  });
  process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
  });

  if (!process.env.DISCORD_TOKEN) {
    console.error("❌ DISCORD_TOKEN environment variable is missing!");
    // Do not exit — API can still run without Discord
  } else {
    try {
      await client.login(process.env.DISCORD_TOKEN);
    } catch (err) {
      console.error("Discord login failed:", err);
    }
  }
})();
