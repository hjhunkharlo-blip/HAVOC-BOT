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

const PORT = process.env.PORT || 8080;
const DATA_FILE = path.resolve(__dirname, "tiers.json");

/* =========================================
   MIDDLEWARE
========================================= */

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Origin",
      "X-Requested-With",
      "Content-Type",
      "Accept",
      "Authorization"
    ]
  })
);

app.use(express.json());

/* =========================================
   TIERS
========================================= */

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

/* =========================================
   POINT SYSTEM
========================================= */

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

/* =========================================
   KITS
========================================= */

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

/* =========================================
   KIT ALIASES
========================================= */

const KIT_ALIASES = {};

for (const kit of KITS) {
  for (const alias of kit.aliases) {
    KIT_ALIASES[alias.toLowerCase()] = kit.id;
  }
}

/* =========================================
   DATA
========================================= */

function createEmptyData() {
  const data = {};

  for (const kit of KITS) {
    data[kit.id] = {};
  }

  return data;
}

let tierData = createEmptyData();

/* =========================================
   LOAD DATA
========================================= */

async function loadData() {
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");

    const saved = JSON.parse(raw);
    const merged = createEmptyData();

    for (const kit of KITS) {
      if (
        saved &&
        saved[kit.id] &&
        typeof saved[kit.id] === "object"
      ) {
        merged[kit.id] = saved[kit.id];
      }
    }

    tierData = merged;

    console.log("✅ Tier data loaded.");
  } catch (error) {
    console.log(
      "⚠️ tiers.json missing or invalid. Creating new data."
    );

    tierData = createEmptyData();

    await saveData();
  }
}

/* =========================================
   SAVE DATA
========================================= */

async function saveData() {
  try {
    await fs.writeFile(
      DATA_FILE,
      JSON.stringify(tierData, null, 2),
      "utf8"
    );

    console.log("💾 Tier data saved.");
  } catch (error) {
    console.error(
      "❌ Could not save tiers.json:",
      error
    );
  }
}

/* =========================================
   HELPERS
========================================= */

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

  return (
    KIT_ALIASES[input.trim().toLowerCase()] || null
  );
}

/* =========================================
   OVERALL RANKING CALCULATOR
========================================= */

function calculateOverallRankings() {
  const players = {};

  for (const kit of KITS) {
    const kitPlayers = tierData[kit.id] || {};

    for (const [player, tier] of Object.entries(kitPlayers)) {
      if (!TIERS.includes(tier)) {
        continue;
      }

      /*
       * Make player names case-insensitive.
       * Example:
       * Steve
       * steve
       * STEVE
       *
       * These are treated as one player.
       */

      const existingName = Object.keys(players).find(
        name =>
          name.toLowerCase() === player.toLowerCase()
      );

      const key = existingName || player;

      if (!players[key]) {
        players[key] = {
          player: key,
          totalPoints: 0,
          kits: []
        };
      }

      const points = POINTS[tier] || 0;

      players[key].totalPoints += points;

      players[key].kits.push({
        kit: kit.id,
        kitName: kit.name,
        tier: tier,
        points: points
      });
    }
  }

  /*
   * SORTING:
   *
   * 1. Highest total points
   * 2. If tied, player with more ranked kits
   * 3. If still tied, alphabetical
   */

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

/* =========================================
   PLAYER PROFILE
========================================= */

function getPlayerProfile(playerName) {
  const requested = playerName.toLowerCase();

  const kits = [];

  for (const kit of KITS) {
    const kitPlayers = tierData[kit.id] || {};

    const foundName = Object.keys(kitPlayers).find(
      name =>
        name.toLowerCase() === requested
    );

    if (foundName) {
      const tier = kitPlayers[foundName];

      kits.push({
        kit: kit.id,
        kitName: kit.name,
        tier: tier,
        points: POINTS[tier] || 0
      });
    }
  }

  const totalPoints = kits.reduce(
    (sum, item) => sum + item.points,
    0
  );

  const rankings = calculateOverallRankings();

  const ranking = rankings.find(
    item =>
      item.player.toLowerCase() === requested
  );

  return {
    player: ranking
      ? ranking.player
      : playerName,
    totalPoints: totalPoints,
    overallRank: ranking
      ? ranking.rank
      : null,
    kits: kits
  };
}

/* =========================================
   API RESPONSE
========================================= */

function getTierResponse() {
  return {
    status: "online",
    bot: "HAVOC STYX",
    api: "tier-list",
    version: "4.0",

    kits: KITS.map(kit => ({
      id: kit.id,
      name: kit.name,
      aliases: kit.aliases
    })),

    tiers: TIERS,

    pointsByTier: POINTS,

    data: tierData,

    /*
     * AUTOMATIC OVERALL RANKINGS
     * No point limit.
     */
    overallRankings: calculateOverallRankings(),

    timestamp: new Date().toISOString()
  };
}

/* =========================================
   BASIC ROUTES
========================================= */

app.get("/", (req, res) => {
  res.status(200).json({
    status: "online",
    bot: "HAVOC STYX",
    api: "tier-list",
    version: "4.0"
  });
});

/* =========================================
   MAIN TIER API
========================================= */

app.get("/api/tiers", (req, res) => {
  res.set({
    "Cache-Control":
      "no-store, no-cache, must-revalidate, proxy-revalidate",
    "Pragma": "no-cache",
    "Expires": "0",
    "Access-Control-Allow-Origin": "*"
  });

  res.status(200).json(getTierResponse());
});

/* =========================================
   BACKUP TIER API
========================================= */

app.get("/api/tier", (req, res) => {
  res.set({
    "Cache-Control":
      "no-store, no-cache, must-revalidate",
    "Access-Control-Allow-Origin": "*"
  });

  res.status(200).json(getTierResponse());
});

/* =========================================
   OVERALL RANKINGS API
========================================= */

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

/* =========================================
   PLAYER PROFILE API
========================================= */

app.get("/api/player/:player", (req, res) => {
  const requested = normalizePlayer(req.params.player);

  if (!requested) {
    return res.status(400).json({
      error: "Invalid Minecraft player name."
    });
  }

  const profile = getPlayerProfile(requested);

  res.set({
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*"
  });

  res.status(200).json({
    status: "online",
    ...profile
  });
});

/* =========================================
   PING
========================================= */

app.get("/api/ping", (req, res) => {
  res.set({
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*"
  });

  res.status(200).json({
    ok: true,
    status: "online",
    bot: "HAVOC STYX",
    timestamp: Date.now()
  });
});

/* =========================================
   HEALTH CHECK
========================================= */

app.get("/health", (req, res) => {
  res.status(200).json({
    ok: true,
    service: "HAVOC STYX API"
  });
});

/* =========================================
   DISCORD CLIENT
========================================= */

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds
  ]
});

/* =========================================
   SLASH COMMAND
========================================= */

const tierCommand =
  new SlashCommandBuilder()
    .setName("tier")
    .setDescription("Manage HAVOC STYX tiers")

    /* =====================================
       ADD
    ===================================== */

    .addSubcommand(sub =>
      sub
        .setName("add")
        .setDescription("Add or update a player tier")

        .addStringOption(opt =>
          opt
            .setName("player")
            .setDescription("Minecraft player name")
            .setRequired(true)
        )

        .addStringOption(opt =>
          opt
            .setName("tier")
            .setDescription("Tier")
            .setRequired(true)
            .addChoices(
              ...TIERS.map(tier => ({
                name: tier,
                value: tier
              }))
            )
        )

        .addStringOption(opt =>
          opt
            .setName("kit")
            .setDescription("Kit")
            .setRequired(true)
            .addChoices(
              ...KITS.map(kit => ({
                name: kit.name,
                value: kit.id
              }))
            )
        )
    )

    /* =====================================
       REMOVE
    ===================================== */

    .addSubcommand(sub =>
      sub
        .setName("remove")
        .setDescription("Remove a player from a kit")

        .addStringOption(opt =>
          opt
            .setName("player")
            .setDescription("Minecraft player name")
            .setRequired(true)
        )

        .addStringOption(opt =>
          opt
            .setName("kit")
            .setDescription("Kit")
            .setRequired(true)
            .addChoices(
              ...KITS.map(kit => ({
                name: kit.name,
                value: kit.id
              }))
            )
        )
    )

    /* =====================================
       GET
    ===================================== */

    .addSubcommand(sub =>
      sub
        .setName("get")
        .setDescription("Get a player's ranking")

        .addStringOption(opt =>
          opt
            .setName("player")
            .setDescription("Minecraft player name")
            .setRequired(true)
        )

        .addStringOption(opt =>
          opt
            .setName("kit")
            .setDescription("Kit")
            .setRequired(true)
            .addChoices(
              ...KITS.map(kit => ({
                name: kit.name,
                value: kit.id
              }))
            )
        )
    );

/* =========================================
   DISCORD READY
========================================= */

client.once("ready", async () => {
  console.log(
    `🤖 Logged in as ${client.user.tag}`
  );

  const rest = new REST({
    version: "10"
  }).setToken(process.env.DISCORD_TOKEN);

  try {
    if (process.env.GUILD_ID) {
      await rest.put(
        Routes.applicationGuildCommands(
          client.user.id,
          process.env.GUILD_ID
        ),
        {
          body: [
            tierCommand.toJSON()
          ]
        }
      );

      console.log(
        "✅ Guild slash command registered."
      );
    } else {
      await rest.put(
        Routes.applicationCommands(
          client.user.id
        ),
        {
          body: [
            tierCommand.toJSON()
          ]
        }
      );

      console.log(
        "✅ Global slash command registered."
      );
    }
  } catch (error) {
    console.error(
      "❌ Command registration failed:",
      error
    );
  }
});

/* =========================================
   DISCORD COMMAND HANDLER
========================================= */

client.on(
  "interactionCreate",
  async interaction => {
    if (!interaction.isChatInputCommand()) {
      return;
    }

    if (interaction.commandName !== "tier") {
      return;
    }

    try {
      const subcommand =
        interaction.options.getSubcommand();

      /* =====================================
         ADD
      ===================================== */

      if (subcommand === "add") {
        const rawPlayer =
          interaction.options.getString(
            "player",
            true
          );

        const tier =
          interaction.options.getString(
            "tier",
            true
          );

        const kitInput =
          interaction.options.getString(
            "kit",
            true
          );

        const player =
          normalizePlayer(rawPlayer);

        const kit =
          normalizeKit(kitInput);

        if (!player) {
          await interaction.reply({
            content:
              "❌ Invalid Minecraft player name.",
            ephemeral: true
          });

          return;
        }

        if (!kit) {
          await interaction.reply({
            content: "❌ Invalid kit.",
            ephemeral: true
          });

          return;
        }

        if (!TIERS.includes(tier)) {
          await interaction.reply({
            content: "❌ Invalid tier.",
            ephemeral: true
          });

          return;
        }

        if (!tierData[kit]) {
          tierData[kit] = {};
        }

        /*
         * ADD OR UPDATE
         *
         * If the player already has a tier
         * in this kit, it gets replaced.
         * The overall points are automatically
         * recalculated from the current data.
         */

        tierData[kit][player] = tier;

        await saveData();

        const kitInfo =
          KITS.find(k => k.id === kit);

        const profile =
          getPlayerProfile(player);

        const rankings =
          calculateOverallRankings();

        const ranking =
          rankings.find(
            item =>
              item.player.toLowerCase() ===
              player.toLowerCase()
          );

        await interaction.reply({
          content:
            `✅ **${player}** updated!\n\n` +
            `🎮 Kit: **${kitInfo.name}**\n` +
            `🏆 Tier: **${tier}**\n` +
            `⭐ Kit Points: **${POINTS[tier]}**\n` +
            `📊 Overall Points: **${profile.totalPoints}**\n` +
            `🏅 Overall Rank: **#${ranking ? ranking.rank : "?"}**`
        });

        console.log(
          `[TIER ADD] ${player} → ${kit} → ${tier}`
        );

        return;
      }

      /* =====================================
         REMOVE
      ===================================== */

      if (subcommand === "remove") {
        const rawPlayer =
          interaction.options.getString(
            "player",
            true
          );

        const rawKit =
          interaction.options.getString(
            "kit",
            true
          );

        const player =
          normalizePlayer(rawPlayer);

        const kit =
          normalizeKit(rawKit);

        if (!player || !kit) {
          await interaction.reply({
            content:
              "❌ Invalid player or kit.",
            ephemeral: true
          });

          return;
        }

        const foundName =
          Object.keys(
            tierData[kit] || {}
          ).find(
            name =>
              name.toLowerCase() ===
              player.toLowerCase()
          );

        if (!foundName) {
          await interaction.reply({
            content:
              `❌ **${player}** is not ranked in that kit.`,
            ephemeral: true
          });

          return;
        }

        delete tierData[kit][foundName];

        await saveData();

        const profile =
          getPlayerProfile(player);

        const rankings =
          calculateOverallRankings();

        const ranking =
          rankings.find(
            item =>
              item.player.toLowerCase() ===
              player.toLowerCase()
          );

        await interaction.reply({
          content:
            `✅ Removed **${foundName}** from **${kit}**.\n\n` +
            `📊 Remaining Overall Points: **${profile.totalPoints}**\n` +
            `🏅 Overall Rank: **${
              ranking ? "#" + ranking.rank : "Unranked"
            }**`
        });

        console.log(
          `[TIER REMOVE] ${foundName} → ${kit}`
        );

        return;
      }

      /* =====================================
         GET
      ===================================== */

      if (subcommand === "get") {
        const rawPlayer =
          interaction.options.getString(
            "player",
            true
          );

        const rawKit =
          interaction.options.getString(
            "kit",
            true
          );

        const player =
          normalizePlayer(rawPlayer);

        const kit =
          normalizeKit(rawKit);

        if (!player || !kit) {
          await interaction.reply({
            content:
              "❌ Invalid player or kit.",
            ephemeral: true
          });

          return;
        }

        const kitPlayers =
          tierData[kit] || {};

        const foundName =
          Object.keys(kitPlayers).find(
            name =>
              name.toLowerCase() ===
              player.toLowerCase()
          );

        if (!foundName) {
          await interaction.reply({
            content:
              `❌ **${player}** is not ranked in that kit.`,
            ephemeral: true
          });

          return;
        }

        const tier =
          kitPlayers[foundName];

        const profile =
          getPlayerProfile(foundName);

        const rankings =
          calculateOverallRankings();

        const ranking =
          rankings.find(
            item =>
              item.player.toLowerCase() ===
              foundName.toLowerCase()
          );

        const kitInfo =
          KITS.find(
            item => i
