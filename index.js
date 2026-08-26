// index.js
// Improved HAVOC STYX: persistence, validation, logging, security middlewares

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
const PORT = process.env.PORT || 8080;
const DATA_FILE = path.resolve(__dirname, "tiers.json");
const SAVE_DEBOUNCE_MS = parseInt(process.env.SAVE_DEBOUNCE_MS || "200", 10);

let saveTimeout = null;
let tierData = null;

/* =========================================
   CONFIG
========================================= */

const TIERS = ["HT1", "LT1", "HT2", "LT2", "HT3", "LT3", "HT4", "LT4", "HT5", "LT5"];

const KITS = [
  { id: "sword", name: "⚔️ Sword" },
  { id: "axe", name: "🪓 Axe" },
  { id: "crystal", name: "💎 Crystal" },
  { id: "pot", name: "🧪 Pot" },
  { id: "smp", name: "🥊 SMP" },
  { id: "dia-smp", name: "💠 Dia SMP" },
  { id: "uhc", name: "❤️ UHC" },
  { id: "mace", name: "🔨 Mace" },
  { id: "spear-mace", name: "🔱⚒️ Spear Mace" }
];

const KIT_IDS = new Set(KITS.map(k => k.id));
const TIER_SET = new Set(TIERS);

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
    const parsed = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null) {
      tierData = parsed;
      console.info("Loaded tier data from disk.");
      return;
    }
  } catch (err) {
    if (err.code !== "ENOENT") {
      console.warn("Error loading tiers.json:", err);
    } else {
      console.info("tiers.json not found — starting with default data.");
    }
  }

  tierData = {};
  for (const k of KIT_IDS) {
    tierData[k] = tierData[k] || {};
  }
  tierData["spear-mace"] = tierData["spear-mace"] || { Yunglah: "LT5" };
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

app.get("/api/tiers", (req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.json({ kits: KITS, tiers: TIERS, data: tierData });
});

/* =========================================
   DISCORD CLIENT
========================================= */

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

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
      .addStringOption(opt =>
        opt
          .setName("tier")
          .setDescription("Tier")
          .setRequired(true)
          .addChoices(...TIERS.map(tier => ({ name: tier, value: tier })))
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
      const tier = interaction.options.getString("tier", true);

      const player = safeNormalizePlayer(rawPlayer);
      if (!player) {
        await interaction.reply({ content: "❌ Invalid player name. Use A-Z, 0-9 or _ (2-16 chars).", ephemeral: true });
        return;
      }

      if (!KIT_IDS.has(kit)) {
        await interaction.reply({ content: "❌ Invalid kit.", ephemeral: true });
        return;
      }

      if (!TIER_SET.has(tier)) {
        await interaction.reply({ content: "❌ Invalid tier.", ephemeral: true });
        return;
      }

      tierData[kit] = tierData[kit] || {};
      tierData[kit][player] = tier;
      await saveData();

      console.info(`[TIER ADD] ${player} → ${kit} → ${tier}`);
      await interaction.reply({
        content: `✅ **${player}** is now **${tier}** in **${KITS.find(k => k.id === kit)?.name || kit}**.\n\n🌐 The website will update automatically.`
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

      if (!tierData[kit] || !tierData[kit][player]) {
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

  if (!process.env.DISCORD_TOKEN) {
    console.error("❌ DISCORD_TOKEN environment variable is missing!");
    return;
  }

  try {
    await client.login(process.env.DISCORD_TOKEN);
  } catch (err) {
    console.error("Discord login failed:", err);
    process.exit(1);
  }
})();
