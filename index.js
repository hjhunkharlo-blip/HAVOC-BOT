require("dotenv").config();

const fs = require("fs").promises;
const path = require("path");
const express = require("express");
const cors = require("cors");

const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder
} = require("discord.js");

const app = express();

const PORT = Number(process.env.PORT) || 8080;
const DATA_FILE = path.join(__dirname, "tiers.json");

/* =====================================================
   MIDDLEWARE
===================================================== */

app.use(cors({ origin: "*" }));
app.use(express.json());

/* =====================================================
   TIERS
===================================================== */

const TIERS = [
  "HT1",
  "LT1",
  "HT2",
  "LT2",
  "HT3",
  "LT3",
  "HT4",
  "LT4",
  "HT5",
  "LT5"
];

/* =====================================================
   POINTS
===================================================== */

const POINTS = {
  HT1: 10,
  LT1: 8,
  HT2: 8,
  LT2: 6,
  HT3: 5,
  LT3: 4,
  HT4: 3,
  LT4: 2,
  HT5: 1,
  LT5: 1
};

/* =====================================================
   KITS
===================================================== */

const KITS = [
  {
    id: "sword",
    name: "⚔️ Sword",
    aliases: ["sword"]
  },
  {
    id: "axe",
    name: "🪓 Axe",
    aliases: ["axe"]
  },
  {
    id: "crystal",
    name: "💎 Crystal",
    aliases: ["crystal"]
  },
  {
    id: "pot",
    name: "🧪 Pot",
    aliases: ["pot"]
  },
  {
    id: "smp",
    name: "🥊 SMP",
    aliases: ["smp"]
  },
  {
    id: "dia-smp",
    name: "💠 Dia SMP",
    aliases: ["dia-smp", "diasmp", "dia"]
  },
  {
    id: "uhc",
    name: "❤️ UHC",
    aliases: ["uhc"]
  },
  {
    id: "mace",
    name: "🔨 Mace",
    aliases: ["mace"]
  },
  {
    id: "spear-mace",
    name: "🔱⚒️ Spear Mace",
    aliases: ["spear-mace", "spearmace", "spear"]
  },
  {
    id: "nethsmp",
    name: "🌍 Neth SMP",
    aliases: ["nethsmp", "neth-smp", "neth"]
  }
];

const KIT_ALIASES = {};

for (const kit of KITS) {
  for (const alias of kit.aliases) {
    KIT_ALIASES[alias.toLowerCase()] = kit.id;
  }
}

/* =====================================================
   DATA
===================================================== */

function createEmptyData() {
  const data = {};

  for (const kit of KITS) {
    data[kit.id] = {};
  }

  return data;
}

let tierData = createEmptyData();

/* =====================================================
   SAVE
===================================================== */

async function saveData() {
  try {
    await fs.writeFile(
      DATA_FILE,
      JSON.stringify(tierData, null, 2),
      "utf8"
    );

    console.log("💾 Tier data saved.");
  } catch (error) {
    console.error("❌ Save error:", error);
  }
}

/* =====================================================
   LOAD
===================================================== */

async function loadData() {
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    const saved = JSON.parse(raw);

    const merged = createEmptyData();

    for (const kit of KITS) {
      if (
        saved &&
        saved[kit.id] &&
        typeof saved[kit.id] === "object" &&
        !Array.isArray(saved[kit.id])
      ) {
        merged[kit.id] = saved[kit.id];
      }
    }

    tierData = merged;

    console.log("✅ Tier data loaded.");
  } catch (error) {
    console.log("⚠️ Creating new tiers.json...");

    tierData = createEmptyData();

    await saveData();
  }
}

/* =====================================================
   HELPERS
===================================================== */

function normalizePlayer(name) {
  if (typeof name !== "string") {
    return null;
  }

  const player = name.trim();

  if (!/^[A-Za-z0-9_]{2,16}$/.test(player)) {
    return null;
  }

  return player;
}

function normalizeKit(input) {
  if (typeof input !== "string") {
    return null;
  }

  return KIT_ALIASES[input.trim().toLowerCase()] || null;
}

function findPlayerInKit(kitId, player) {
  const players = tierData[kitId] || {};

  return Object.keys(players).find(
    name => name.toLowerCase() === player.toLowerCase()
  );
}

/* =====================================================
   OVERALL RANKINGS
===================================================== */

function calculateOverallRankings() {
  const players = {};

  for (const kit of KITS) {
    const kitPlayers = tierData[kit.id] || {};

    for (const [playerName, tier] of Object.entries(kitPlayers)) {
      if (!TIERS.includes(tier)) {
        continue;
      }

      const existingName = Object.keys(players).find(
        name => name.toLowerCase() === playerName.toLowerCase()
      );

      const playerKey = existingName || playerName;

      if (!players[playerKey]) {
        players[playerKey] = {
          player: playerKey,
          totalPoints: 0,
          kits: []
        };
      }

      const points = POINTS[tier] || 0;

      players[playerKey].totalPoints += points;

      players[playerKey].kits.push({
        kit: kit.id,
        kitName: kit.name,
        tier,
        points
      });
    }
  }

  return Object.values(players)
    .sort((a, b) => {
      if (b.totalPoints !== a.totalPoints) {
        return b.totalPoints - a.totalPoints;
      }

      if (b.kits.length !== a.kits.length) {
        return b.kits.length - a.kits.length;
      }

      return a.player.localeCompare(b.player);
    })
    .map((player, index) => ({
      rank: index + 1,
      player: player.player,
      totalPoints: player.totalPoints,
      kits: player.kits
    }));
}

/* =====================================================
   API RESPONSE
===================================================== */

function getTierResponse() {
  return {
    status: "online",
    bot: "HAVOC STYX",
    api: "tier-list",
    version: "5.0",

    kits: KITS,

    tiers: TIERS,

    pointsByTier: POINTS,

    data: tierData,

    overallRankings: calculateOverallRankings(),

    timestamp: new Date().toISOString()
  };
}

/* =====================================================
   ROOT
===================================================== */

app.get("/", (req, res) => {
  res.status(200).json({
    status: "online",
    bot: "HAVOC STYX",
    api: "tier-list",
    version: "5.0"
  });
});

/* =====================================================
   TIERS API
===================================================== */

app.get("/api/tiers", (req, res) => {
  res.set({
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*"
  });

  res.status(200).json(getTierResponse());
});

/* =====================================================
   BACKUP TIER API
===================================================== */

app.get("/api/tier", (req, res) => {
  res.set({
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*"
  });

  res.status(200).json(getTierResponse());
});

/* =====================================================
   RANKINGS API
===================================================== */

app.get("/api/rankings", (req, res) => {
  res.set({
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*"
  });

  res.status(200).json({
    status: "online",
    bot: "HAVOC STYX",
    rankings: calculateOverallRankings(),
    timestamp: new Date().toISOString()
  });
});

/* =====================================================
   PLAYER API
===================================================== */

app.get("/api/player/:player", (req, res) => {
  const player = normalizePlayer(req.params.player);

  if (!player) {
    return res.status(400).json({
      status: "error",
      error: "Invalid Minecraft player name."
    });
  }

  const kits = [];

  let displayName = player;

  for (const kit of KITS) {
    const found = findPlayerInKit(kit.id, player);

    if (!found) {
      continue;
    }

    displayName = found;

    const tier = tierData[kit.id][found];

    if (!TIERS.includes(tier)) {
      continue;
    }

    kits.push({
      kit: kit.id,
      kitName: kit.name,
      tier,
      points: POINTS[tier]
    });
  }

  if (kits.length === 0) {
    return res.status(404).json({
      status: "error",
      error: "Player is not ranked."
    });
  }

  const totalPoints = kits.reduce(
    (sum, item) => sum + item.points,
    0
  );

  const rankings = calculateOverallRankings();

  const ranking = rankings.find(
    item => item.player.toLowerCase() === player.toLowerCase()
  );

  res.status(200).json({
    status: "online",
    player: displayName,
    totalPoints,
    overallRank: ranking ? ranking.rank : null,
    kits
  });
});

/* =====================================================
   PING
===================================================== */

app.get("/api/ping", (req, res) => {
  res.status(200).json({
    ok: true,
    status: "online",
    bot: "HAVOC STYX",
    timestamp: Date.now()
  });
});

/* =====================================================
   HEALTH
===================================================== */

app.get("/health", (req, res) => {
  res.status(200).json({
    ok: true,
    status: "online",
    service: "HAVOC STYX API",
    timestamp: Date.now()
  });
});

/* =====================================================
   DISCORD CLIENT
===================================================== */

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

/* =====================================================
   SLASH COMMAND
===================================================== */

const tierCommand = new SlashCommandBuilder()
  .setName("tier")
  .setDescription("Manage HAVOC STYX tiers")

  /* ADD */
  .addSubcommand(sub =>
    sub
      .setName("add")
      .setDescription("Add or update a player's tier")

      .addStringOption(option =>
        option
          .setName("player")
          .setDescription("Minecraft player name")
          .setRequired(true)
      )

      .addStringOption(option =>
        option
          .setName("tier")
          .setDescription("Player tier")
          .setRequired(true)
          .addChoices(
            ...TIERS.map(tier => ({
              name: tier,
              value: tier
            }))
          )
      )

      .addStringOption(option =>
        option
          .setName("kit")
          .setDescription("PvP kit")
          .setRequired(true)
          .addChoices(
            ...KITS.map(kit => ({
              name: kit.name,
              value: kit.id
            }))
          )
      )
  )

  /* REMOVE */
  .addSubcommand(sub =>
    sub
      .setName("remove")
      .setDescription("Remove a player from a kit")

      .addStringOption(option =>
        option
          .setName("player")
          .setDescription("Minecraft player name")
          .setRequired(true)
      )

      .addStringOption(option =>
        option
          .setName("kit")
          .setDescription("PvP kit")
          .setRequired(true)
          .addChoices(
            ...KITS.map(kit => ({
              name: kit.name,
              value: kit.id
            }))
          )
      )
  )

  /* GET */
  .addSubcommand(sub =>
    sub
      .setName("get")
      .setDescription("Get a player's tier")

      .addStringOption(option =>
        option
          .setName("player")
          .setDescription("Minecraft player name")
          .setRequired(true)
      )

      .addStringOption(option =>
        option
          .setName("kit")
          .setDescription("PvP kit")
          .setRequired(true)
          .addChoices(
            ...KITS.map(kit => ({
              name: kit.name,
              value: kit.id
            }))
          )
      )
  );

/* =====================================================
   DISCORD READY
===================================================== */

client.once("ready", async () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);

  const token = process.env.DISCORD_TOKEN;

  if (!token) {
    console.error("❌ DISCORD_TOKEN is missing.");
    return;
  }

  const rest = new REST({
    version: "10"
  }).setToken(token);

  try {
    if (process.env.GUILD_ID) {
      await rest.put(
        Routes.applicationGuildCommands(
          client.user.id,
          process.env.GUILD_ID
        ),
        {
          body: [tierCommand.toJSON()]
        }
      );

      console.log("✅ Guild slash command registered.");
    } else {
      await rest.put(
        Routes.applicationCommands(client.user.id),
        {
          body: [tierCommand.toJSON()]
        }
      );

      console.log("✅ Global slash command registered.");
    }
  } catch (error) {
    console.error(
      "❌ Slash command registration failed:",
      error
    );
  }
});

/* =====================================================
   DISCORD COMMAND HANDLER
===================================================== */

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) {
    return;
  }

  if (interaction.commandName !== "tier") {
    return;
  }

  try {
    const subcommand = interaction.options.getSubcommand();

    /* =================================================
       ADD
    ================================================= */

    if (subcommand === "add") {
      const rawPlayer = interaction.options.getString(
        "player",
        true
      );

      const tier = interaction.options.getString(
        "tier",
        true
      );

      const kitInput = interaction.options.getString(
        "kit",
        true
      );

      const player = normalizePlayer(rawPlayer);
      const kit = normalizeKit(kitInput);

      if (!player) {
        return interaction.reply({
          content: "❌ Invalid Minecraft player name.",
          ephemeral: true
        });
      }

      if (!kit) {
        return interaction.reply({
          content: "❌ Invalid kit.",
          ephemeral: true
        });
      }

      if (!TIERS.includes(tier)) {
        return interaction.reply({
          content: "❌ Invalid tier.",
          ephemeral: true
        });
      }

      if (!tierData[kit]) {
        tierData[kit] = {};
      }

      const existingPlayer = findPlayerInKit(
        kit,
        player
      );

      let oldTier = null;

      if (existingPlayer) {
        oldTier = tierData[kit][existingPlayer];

        if (existingPlayer !== player) {
          delete tierData[kit][existingPlayer];
        }
      }

      tierData[kit][player] = tier;

      await saveData();

      const rankings = calculateOverallRankings();

      const ranking = rankings.find(
        item =>
          item.player.toLowerCase() ===
          player.toLowerCase()
      );

      const kitInfo = KITS.find(
        item => item.id === kit
      );

      const actionText = oldTier
        ? `🔄 Updated from **${oldTier}** to **${tier}**`
        : `🏆 Tier: **${tier}**`;

      return interaction.reply({
        content:
          `✅ **${player}** ranked!\n\n` +
          `🎮 Kit: **${kitInfo.name}**\n` +
          `${actionText}\n` +
          `⭐ Tier Points: **${POINTS[tier]}**\n` +
          `📊 Overall Points: **${ranking.totalPoints}**\n` +
          `🏅 Overall Rank: **#${ranking.rank}**`
      });
    }

    /* =================================================
       REMOVE
    ================================================= */

    if (subcommand === "remove") {
      const rawPlayer = interaction.options.getString(
        "player",
        true
      );

      const kitInput = interaction.options.getString(
        "kit",
        true
      );

      const player = normalizePlayer(rawPlayer);
      const kit = normalizeKit(kitInput);

      if (!player || !kit) {
        return interaction.reply({
          content: "❌ Invalid player or kit.",
          ephemeral: true
        });
      }

      const existingPlayer = findPlayerInKit(
        kit,
        player
      );

      if (!existingPlayer) {
        return interaction.reply({
          content:
            `❌ **${player}** is not ranked in that kit.`,
          ephemeral: true
        });
      }

      const oldTier =
        tierData[kit][existingPlayer];

      delete tierData[kit][existingPlayer];

      await saveData();

      const rankings = calculateOverallRankings();

      const ranking = rankings.find(
        item =>
          item.player.toLowerCase() ===
          player.toLowerCase()
      );

      let message =
        `✅ Removed **${existingPlayer}** from **${kit}**.\n` +
        `⭐ Removed Points: **${POINTS[oldTier] || 0}**`;

      if (ranking) {
        message +=
          `\n📊 New Overall Points: **${ranking.totalPoints}**` +
          `\n🏅 New Overall Rank: **#${ranking.rank}**`;
      } else {
        message +=
          `\n📊 Player has no remaining ranked kits.`;
      }

      return interaction.reply({
        content: message
      });
    }

    /* =================================================
       GET
    ================================================= */

    if (subcommand === "get") {
      const rawPlayer = interaction.options.getString(
        "player",
        true
      );

      const kitInput = interaction.options.getString(
        "kit",
        true
      );

      const player = normalizePlayer(rawPlayer);
      const kit = normalizeKit(kitInput);

      if (!player || !kit) {
        return interaction.reply({
          content: "❌ Invalid player or kit.",
          ephemeral: true
        });
      }

      const existingPlayer = findPlayerInKit(
        kit,
        player
      );

      if (!existingPlayer) {
        return interaction.reply({
          content:
            `❌ **${player}** is not ranked in that kit.`,
          ephemeral: true
        });
      }

      const tier =
        tierData[kit][existingPlayer];

      const rankings = calculateOverallRankings();

      const ranking = rankings.find(
        item =>
          item.player.toLowerCase() ===
          player.toLowerCase()
      );

      const kitInfo = KITS.find(
        item => item.id === kit
      );

      return interaction.reply({
        content:
          `📊 **${existingPlayer}**\n\n` +
          `🎮 Kit: **${kitInfo.name}**\n` +
          `🏆 Tier: **${tier}**\n` +
          `⭐ Tier Points: **${POINTS[tier]}**\n` +
          `📈 Overall Points: **${ranking ? ranking.totalPoints : 0}**\n` +
          `🥇 Overall Rank: **#${ranking ? ranking.rank : "N/A"}**`
      });
    }
  } catch (error) {
    console.error("❌ Interaction error:", error);

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "❌ An internal error occurred.",
        ephemeral: true
      });
    }
  }
});

/* =====================================================
   START SERVER
===================================================== */

async function start() {
  await loadData();

  app.listen(PORT, "0.0.0.0", () => {
    console.log(
      `🌐 HAVOC STYX API running on port ${PORT}`
    );

    console.log(
      `🔗 Port: ${PORT}`
    );

    console.log(
      `📊 API: /api/tiers`
    );

    console.log(
      `🏆 Rankings: /api/rankings`
    );

    console.log(
      `🏓 Ping: /api/ping`
    );

    console.log(
      `❤️ Health: /health`
    );
  });

  if (!process.env.DISCORD_TOKEN) {
    console.error(
      "❌ DISCORD_TOKEN is missing from environment variables."
    );

    return;
  }

  try {
    await client.login(
      process.env.DISCORD_TOKEN
    );

    console.log(
      "✅ Discord bot login successful."
    );
  } catch (error) {
    console.error(
      "❌ Discord login failed:",
      error
    );
  }
}

/* =====================================================
   RUN
===================================================== */

start();
