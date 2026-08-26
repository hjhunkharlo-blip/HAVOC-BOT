const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder
} = require("discord.js");

const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors({ origin: "*" }));
app.use(express.json());

const PORT = process.env.PORT || 3000;
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

/* =========================================
   HAVOC STYX KITS
========================================= */

const kits = [
  { id: "sword", name: "⚔️ Sword" },
  { id: "axe", name: "🪓 Axe" },
  { id: "uhc", name: "❤️ UHC" },
  { id: "dia-smp", name: "💎 Dia SMP" },
  { id: "mace", name: "🔨 Mace" },
  { id: "spear", name: "🔱 Spear" },
  { id: "spear-mace", name: "🔱 Spear Mace" },
  { id: "crystal", name: "💎 Crystal" },
  { id: "pot", name: "🧪 Pot" },
  { id: "nethpot", name: "🧪 NethPot" }
];

/* =========================================
   TIERS
========================================= */

const tiers = [
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
   TIER DATA
========================================= */

const data = {};

for (const kit of kits) {
  data[kit.id] = {};
}

/* =========================================
   DISCORD CLIENT
========================================= */

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds
  ]
});

/* =========================================
   COMMAND CHOICES
========================================= */

function getKitChoices() {
  return kits.map(kit => ({
    name: kit.name,
    value: kit.id
  }));
}

function getTierChoices() {
  return tiers.map(tier => ({
    name: tier,
    value: tier
  }));
}

/* =========================================
   SLASH COMMANDS
========================================= */

const commands = [

  new SlashCommandBuilder()
    .setName("tier")
    .setDescription("Manage HAVOC STYX player tiers")

    /* /tier add */

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
            .setName("kit")
            .setDescription("PvP kit")
            .setRequired(true)
            .addChoices(...getKitChoices())
        )

        .addStringOption(option =>
          option
            .setName("tier")
            .setDescription("Player tier")
            .setRequired(true)
            .addChoices(...getTierChoices())
        )
    )

    /* /tier remove */

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
            .addChoices(...getKitChoices())
        )
    )

    /* /tier list */

    .addSubcommand(sub =>
      sub
        .setName("list")
        .setDescription("Show a player's full profile")

        .addStringOption(option =>
          option
            .setName("player")
            .setDescription("Minecraft player name")
            .setRequired(true)
        )
    )

    /* /tier clear */

    .addSubcommand(sub =>
      sub
        .setName("clear")
        .setDescription("Clear a player's tier")

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
            .addChoices(...getKitChoices())
        )
    )

].map(command => command.toJSON());

/* =========================================
   REGISTER SLASH COMMANDS
========================================= */

async function registerCommands() {

  if (!TOKEN) {
    console.log("❌ DISCORD_TOKEN is missing.");
    return;
  }

  if (!CLIENT_ID) {
    console.log("❌ CLIENT_ID is missing.");
    return;
  }

  try {

    const rest = new REST({
      version: "10"
    }).setToken(TOKEN);

    console.log(
      "Registering HAVOC STYX commands..."
    );

    await rest.put(
      Routes.applicationCommands(CLIENT_ID),
      {
        body: commands
      }
    );

    console.log(
      "✅ Slash commands registered."
    );

  } catch (error) {

    console.error(
      "❌ Command registration error:",
      error
    );

  }
}

/* =========================================
   BOT READY
========================================= */

client.once("ready", () => {

  console.log(
    `✅ HAVOC STYX BOT ONLINE AS ${client.user.tag}`
  );

});

/* =========================================
   DISCORD INTERACTIONS
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

    const subcommand =
      interaction.options.getSubcommand();

    /* =====================================
       /tier add
    ===================================== */

    if (subcommand === "add") {

      const player =
        interaction.options
          .getString("player")
          .trim();

      const kit =
        interaction.options
          .getString("kit");

      const tier =
        interaction.options
          .getString("tier");

      if (!data[kit]) {

        await interaction.reply({
          content: "❌ Invalid kit.",
          ephemeral: true
        });

        return;
      }

      data[kit][player] = tier;

      const kitInfo =
        kits.find(
          k => k.id === kit
        );

      await interaction.reply(
        `✅ **${player}** is now **${tier}** in **${kitInfo.name}**.`
      );

      console.log(
        `[TIER ADD] ${player} | ${kit} | ${tier}`
      );

      return;
    }

    /* =====================================
       /tier remove
    ===================================== */

    if (subcommand === "remove") {

      const player =
        interaction.options
          .getString("player")
          .trim();

      const kit =
        interaction.options
          .getString("kit");

      if (!data[kit][player]) {

        await interaction.reply(
          `❌ **${player}** is not ranked in that kit.`
        );

        return;
      }

      delete data[kit][player];

      await interaction.reply(
        `🗑️ Removed **${player}** from the tier list.`
      );

      console.log(
        `[TIER REMOVE] ${player} | ${kit}`
      );

      return;
    }

    /* =====================================
       /tier clear
    ===================================== */

    if (subcommand === "clear") {

      const player =
        interaction.options
          .getString("player")
          .trim();

      const kit =
        interaction.options
          .getString("kit");

      delete data[kit][player];

      await interaction.reply(
        `🧹 Cleared **${player}** from this kit.`
      );

      console.log(
        `[TIER CLEAR] ${player} | ${kit}`
      );

      return;
    }

    /* =====================================
       /tier list
    ===================================== */

    if (subcommand === "list") {

      const player =
        interaction.options
          .getString("player")
          .trim();

      let message =
        `🏆 **${player} — HAVOC STYX Profile**\n\n`;

      let found = false;

      for (const kit of kits) {

        const rank =
          data[kit.id][player];

        if (rank) {

          message +=
            `${kit.name}: **${rank}**\n`;

          found = true;

        } else {

          message +=
            `${kit.name}: \`Unranked\`\n`;

        }
      }

      if (!found) {

        message +=
          "\n❌ No rankings found.";

      }

      await interaction.reply(message);

      return;
    }

  }
);

/* =========================================
   API — HOME
========================================= */

app.get("/", (req, res) => {

  res.json({
    status: "online",
    name: "HAVOC STYX API",
    message: "HAVOC STYX API is running."
  });

});

/* =========================================
   API — ALL TIERS
========================================= */

app.get("/api/tiers", (req, res) => {

  res.setHeader(
    "Access-Control-Allow-Origin",
    "*"
  );

  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate"
  );

  res.json({

    success: true,

    kits: kits,

    tiers: tiers,

    data: data,

    updatedAt:
      new Date().toISOString()

  });

});

/* =========================================
   API — PLAYER PROFILE
========================================= */

app.get(
  "/api/player/:name",
  (req, res) => {

    const player =
      req.params.name;

    const result = {};

    let found = false;

    for (const kit of kits) {

      const rank =
        data[kit.id][player] || null;

      result[kit.id] = rank;

      if (rank) {
        found = true;
      }

    }

    res.setHeader(
      "Access-Control-Allow-Origin",
      "*"
    );

    res.setHeader(
      "Cache-Control",
      "no-store"
    );

    res.json({

      success: true,

      player: player,

      found: found,

      tiers: result

    });

  }
);

/* =========================================
   API — HEALTH
========================================= */

app.get(
  "/api/health",
  (req, res) => {

    res.json({

      status: "online",

      bot:
        client.isReady()
          ? "online"
          : "starting",

      kits: kits.length

    });

  }
);

/* =========================================
   START WEB SERVER
========================================= */

app.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      `✅ HAVOC STYX API running on port ${PORT}`
    );

  }
);

/* =========================================
   START DISCORD BOT
========================================= */

async function startBot() {

  await registerCommands();

  if (!TOKEN) {

    console.log(
      "❌ DISCORD_TOKEN is missing."
    );

    return;
  }

  try {

    await client.login(TOKEN);

  } catch (error) {

    console.error(
      "❌ Discord login failed:",
      error
    );

  }

}

startBot();
