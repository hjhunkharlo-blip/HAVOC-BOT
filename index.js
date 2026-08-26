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

app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Origin",
    "X-Requested-With",
    "Content-Type",
    "Accept",
    "Authorization"
  ]
}));

app.options("*", cors());

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

const POINTS = {
  HT1: 61,
  LT1: 52,
  HT2: 41,
  LT2: 30,
  HT3: 21,
  LT3: 14,
  HT4: 9,
  LT4: 6,
  HT5: 3,
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
    aliases: [
      "spear-mace",
      "spearmace",
      "spear"
    ]
  },
  {
    id: "nethsmp",
    name: "🌍 Neth SMP",
    aliases: [
      "nethsmp",
      "neth-smp",
      "neth"
    ]
  }
];

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
    const raw = await fs.readFile(
      DATA_FILE,
      "utf8"
    );

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
      JSON.stringify(
        tierData,
        null,
        2
      ),
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

  if (
    !/^[A-Za-z0-9_]{2,16}$/.test(player)
  ) {
    return null;
  }

  return player;
}

function normalizeKit(input) {
  if (typeof input !== "string") {
    return null;
  }

  return (
    KIT_ALIASES[
      input.trim().toLowerCase()
    ] || null
  );
}

/* =========================================
   API RESPONSE
========================================= */

function getTierResponse() {
  return {
    status: "online",
    bot: "HAVOC STYX",
    api: "tier-list",
    version: "3.0",

    kits: KITS.map(kit => ({
      id: kit.id,
      name: kit.name,
      aliases: kit.aliases
    })),

    tiers: TIERS,

    pointsByTier: POINTS,

    data: tierData,

    timestamp: new Date().toISOString()
  };
}

/* =========================================
   API
========================================= */

app.get("/", (req, res) => {
  res.json({
    status: "online",
    bot: "HAVOC STYX",
    api: "tier-list",
    version: "3.0"
  });
});

/*
   MAIN WEBSITE API
*/

app.get(
  "/api/tiers",
  (req, res) => {
    res.set({
      "Cache-Control":
        "no-store, no-cache, must-revalidate, proxy-revalidate",
      "Pragma": "no-cache",
      "Expires": "0",
      "Access-Control-Allow-Origin": "*"
    });

    res.status(200).json(
      getTierResponse()
    );
  }
);

/*
   BACKUP ALIAS
   Some versions of the website may use /api/tier
*/

app.get(
  "/api/tier",
  (req, res) => {
    res.set({
      "Cache-Control":
        "no-store, no-cache, must-revalidate",
      "Access-Control-Allow-Origin": "*"
    });

    res.status(200).json(
      getTierResponse()
    );
  }
);

/*
   PING
*/

app.get(
  "/api/ping",
  (req, res) => {
    res.set(
      "Access-Control-Allow-Origin",
      "*"
    );

    res.status(200).json({
      ok: true,
      status: "online",
      bot: "HAVOC STYX",
      timestamp: Date.now()
    });
  }
);

/*
   HEALTH CHECK
*/

app.get(
  "/health",
  (req, res) => {
    res.status(200).json({
      ok: true,
      service: "HAVOC STYX API"
    });
  }
);

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
    .setDescription(
      "Manage HAVOC STYX tiers"
    )

    /* ADD */
    .addSubcommand(
      sub =>
        sub
          .setName("add")
          .setDescription(
            "Add a player to a tier"
          )

          .addStringOption(
            opt =>
              opt
                .setName("player")
                .setDescription(
                  "Minecraft player name"
                )
                .setRequired(true)
          )

          .addStringOption(
            opt =>
              opt
                .setName("tier")
                .setDescription(
                  "Tier"
                )
                .setRequired(true)
                .addChoices(
                  ...TIERS.map(tier => ({
                    name: tier,
                    value: tier
                  }))
                )
          )

          .addStringOption(
            opt =>
              opt
                .setName("kit")
                .setDescription(
                  "Kit"
                )
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
    .addSubcommand(
      sub =>
        sub
          .setName("remove")
          .setDescription(
            "Remove a player"
          )

          .addStringOption(
            opt =>
              opt
                .setName("player")
                .setDescription(
                  "Minecraft player name"
                )
                .setRequired(true)
          )

          .addStringOption(
            opt =>
              opt
                .setName("kit")
                .setDescription(
                  "Kit"
                )
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
    .addSubcommand(
      sub =>
        sub
          .setName("get")
          .setDescription(
            "Get a player's ranking"
          )

          .addStringOption(
            opt =>
              opt
                .setName("player")
                .setDescription(
                  "Minecraft player name"
                )
                .setRequired(true)
          )

          .addStringOption(
            opt =>
              opt
                .setName("kit")
                .setDescription(
                  "Kit"
                )
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
   BOT READY
========================================= */

client.once(
  "ready",
  async () => {
    console.log(
      `🤖 Logged in as ${client.user.tag}`
    );

    const rest =
      new REST({
        version: "10"
      }).setToken(
        process.env.DISCORD_TOKEN
      );

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
  }
);

/* =========================================
   COMMAND HANDLER
========================================= */

client.on(
  "interactionCreate",
  async interaction => {
    if (
      !interaction.isChatInputCommand()
    ) {
      return;
    }

    if (
      interaction.commandName !== "tier"
    ) {
      return;
    }

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
        normalizePlayer(
          rawPlayer
        );

      const kit =
        normalizeKit(
          kitInput
        );

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
          content:
            "❌ Invalid kit.",
          ephemeral: true
        });

        return;
      }

      if (!TIERS.includes(tier)) {
        await interaction.reply({
          content:
            "❌ Invalid tier.",
          ephemeral: true
        });

        return;
      }

      tierData[kit] =
        tierData[kit] || {};

      tierData[kit][player] =
        tier;

      await saveData();

      const kitInfo =
        KITS.find(
          k => k.id === kit
        );

      await interaction.reply({
        content:
          `✅ **${player}** added!\n\n` +
          `🎮 Kit: **${kitInfo.name}**\n` +
          `🏆 Tier: **${tier}**\n` +
          `⭐ Points: **${POINTS[tier]}**`
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
      const player =
        normalizePlayer(
          interaction.options.getString(
            "player",
            true
          )
        );

      const kit =
        normalizeKit(
          interaction.options.getString(
            "kit",
            true
          )
        );

      if (!player || !kit) {
        await interaction.reply({
          content:
            "❌ Invalid player or kit.",
          ephemeral: true
        });

        return;
      }

      if (
        !tierData[kit]?.[player]
      ) {
        await interaction.reply({
          content:
            `❌ **${player}** is not ranked in that kit.`,
          ephemeral: true
        });

        return;
      }

      delete tierData[kit][player];

      await saveData();

      await interaction.reply({
        content:
          `✅ Removed **${player}** from **${kit}**.`
      });

      return;
    }

    /* =====================================
       GET
    ===================================== */

    if (subcommand === "get") {
      const player =
        normalizePlayer(
          interaction.options.getString(
            "player",
            true
          )
        );

      const kit =
        normalizeKit(
          interaction.options.getString(
            "kit",
            true
          )
        );

      if (!player || !kit) {
        await interaction.reply({
          content:
            "❌ Invalid player or kit.",
          ephemeral: true
        });

        return;
      }

      const tier =
        tierData[kit]?.[player];

      if (!tier) {
        await interaction.reply({
          content:
            `❌ **${player}** is not ranked in that kit.`,
          ephemeral: true
        });

        return;
      }

      await interaction.reply({
        content:
          `📊 **${player}**\n` +
          `🏆 Tier: **${tier}**\n` +
          `⭐ Points: **${POINTS[tier]}**`
      });
    }
  }
);

/* =========================================
   START SERVER
========================================= */

async function start() {
  await loadData();

  app.listen(
    PORT,
    "0.0.0.0",
    () => {
      console.log(
        `🌐 HAVOC STYX API running on port ${PORT}`
      );

      console.log(
        `🔗 API: /api/tiers`
      );

      console.log(
        `🏓 Ping: /api/ping`
      );
    }
  );

  if (!process.env.DISCORD_TOKEN) {
    console.error(
      "❌ DISCORD_TOKEN is missing."
    );

    return;
  }

  try {
    await client.login(
      process.env.DISCORD_TOKEN
    );
  } catch (error) {
    console.error(
      "❌ Discord login failed:",
      error
    );
  }
}

start();
