const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder
} = require("discord.js");

const fs = require("fs");

// ==============================
// HAVOC STYX CONFIG
// ==============================

const TOKEN = process.env.DISCORD_TOKEN;

// Your Discord User ID
const OWNER_ID = "1347412485426380930";

// Your Discord Bot/Application ID
const CLIENT_ID = "1542048358309429258";

// Tier data file
const TIERS_FILE = "./tiers.json";

// ==============================
// TIER DATA
// ==============================

function loadTiers() {
  try {
    if (!fs.existsSync(TIERS_FILE)) {
      fs.writeFileSync(TIERS_FILE, "{}");
      return {};
    }

    return JSON.parse(fs.readFileSync(TIERS_FILE, "utf8"));
  } catch (error) {
    console.error("❌ Error loading tiers:", error);
    return {};
  }
}

function saveTiers(tiers) {
  fs.writeFileSync(
    TIERS_FILE,
    JSON.stringify(tiers, null, 2)
  );
}

let tiers = loadTiers();

// ==============================
// DISCORD CLIENT
// ==============================

if (!TOKEN) {
  console.error("❌ DISCORD_TOKEN is missing!");
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// ==============================
// SLASH COMMANDS
// ==============================

const tierCommand = new SlashCommandBuilder()
  .setName("tier")
  .setDescription("Manage the HAVOC STYX tier list.")

  .addSubcommand(subcommand =>
    subcommand
      .setName("add")
      .setDescription("Add a player to the tier list.")
      .addStringOption(option =>
        option
          .setName("player")
          .setDescription("Player name")
          .setRequired(true)
      )
      .addStringOption(option =>
        option
          .setName("tier")
          .setDescription("Tier, for example HT1 or LT2")
          .setRequired(true)
          .addChoices(
            { name: "HT1", value: "HT1" },
            { name: "LT1", value: "LT1" },
            { name: "HT2", value: "HT2" },
            { name: "LT2", value: "LT2" },
            { name: "HT3", value: "HT3" },
            { name: "LT3", value: "LT3" },
            { name: "HT4", value: "HT4" },
            { name: "LT4", value: "LT4" },
            { name: "HT5", value: "HT5" },
            { name: "LT5", value: "LT5" }
          )
      )
  )

  .addSubcommand(subcommand =>
    subcommand
      .setName("remove")
      .setDescription("Remove a player from the tier list.")
      .addStringOption(option =>
        option
          .setName("player")
          .setDescription("Player name")
          .setRequired(true)
      )
  )

  .addSubcommand(subcommand =>
    subcommand
      .setName("list")
      .setDescription("Show the HAVOC STYX tier list.")
  )

  .addSubcommand(subcommand =>
    subcommand
      .setName("player")
      .setDescription("Check a player's tier.")
      .addStringOption(option =>
        option
          .setName("player")
          .setDescription("Player name")
          .setRequired(true)
      )
  );

const commands = [
  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Check if the bot is online."),

  new SlashCommandBuilder()
    .setName("server")
    .setDescription("Show HAVOC STYX server information."),

  new SlashCommandBuilder()
    .setName("owner")
    .setDescription("Check if you are the bot owner."),

  tierCommand
].map(command => command.toJSON());

// ==============================
// REGISTER COMMANDS
// ==============================

client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  console.log("🟢 HAVOC STYX bot is online!");

  const rest = new REST({ version: "10" }).setToken(TOKEN);

  try {
    await rest.put(
      Routes.applicationCommands(CLIENT_ID),
      { body: commands }
    );

    console.log("✅ Slash commands registered!");
  } catch (error) {
    console.error("❌ Failed to register commands:", error);
  }
});

// ==============================
// INTERACTION HANDLER
// ==============================

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  // ==========================
  // /PING
  // ==========================

  if (interaction.commandName === "ping") {
    return interaction.reply(
      "🏓 **Pong! HAVOC STYX is online!**"
    );
  }

  // ==========================
  // /SERVER
  // ==========================

  if (interaction.commandName === "server") {
    return interaction.reply(
      "🔥 **HAVOC STYX FFA**\n\n" +
      "🌐 IP: `havocffa.playwithbao.com:41367`\n" +
      "⚔️ Mode: FFA\n" +
      "🏆 Tier Testing: Enabled\n" +
      "💬 Discord: https://discord.gg/RaJMvHaXB"
    );
  }

  // ==========================
  // /OWNER
  // ==========================

  if (interaction.commandName === "owner") {
    if (interaction.user.id !== OWNER_ID) {
      return interaction.reply({
        content: "❌ You are not the owner.",
        ephemeral: true
      });
    }

    return interaction.reply({
      content: "👑 **You are the HAVOC STYX owner!**",
      ephemeral: true
    });
  }

  // ==========================
  // TIER COMMAND
  // ==========================

  if (interaction.commandName === "tier") {
    const subcommand = interaction.options.getSubcommand();

    // ========================
    // TIER ADD
    // ========================

    if (subcommand === "add") {
      if (interaction.user.id !== OWNER_ID) {
        return interaction.reply({
          content: "❌ Only the owner can add players to the tier list.",
          ephemeral: true
        });
      }

      const player = interaction.options
        .getString("player")
        .trim();

      const tier = interaction.options
        .getString("tier")
        .toUpperCase();

      tiers[player.toLowerCase()] = {
        name: player,
        tier: tier
      };

      saveTiers(tiers);

      return interaction.reply(
        `✅ **${player}** has been added as **${tier}**!`
      );
    }

    // ========================
    // TIER REMOVE
    // ========================

    if (subcommand === "remove") {
      if (interaction.user.id !== OWNER_ID) {
        return interaction.reply({
          content: "❌ Only the owner can remove players from the tier list.",
          ephemeral: true
        });
      }

      const player = interaction.options
        .getString("player")
        .trim();

      const key = player.toLowerCase();

      if (!tiers[key]) {
        return interaction.reply(
          `❌ **${player}** is not on the tier list.`
        );
      }

      delete tiers[key];

      saveTiers(tiers);

      return interaction.reply(
        `🗑️ **${player}** has been removed from the tier list.`
      );
    }

    // ========================
    // TIER LIST
    // ========================

    if (subcommand === "list") {
      const players = Object.values(tiers);

      if (players.length === 0) {
        return interaction.reply(
          "📋 The tier list is currently empty."
        );
      }

      const tierOrder = [
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

      let message = "🏆 **HAVOC STYX TIER LIST**\n\n";

      for (const tier of tierOrder) {
        const tierPlayers = players.filter(
          player => player.tier === tier
        );

        if (tierPlayers.length > 0) {
          message += `**${tier}**\n`;

          for (const player of tierPlayers) {
            message += `• ${player.name}\n`;
          }

          message += "\n";
        }
      }

      return interaction.reply(message);
    }

    // ========================
    // TIER PLAYER
    // ========================

    if (subcommand === "player") {
      const player = interaction.options
        .getString("player")
        .trim();

      const result = tiers[player.toLowerCase()];

      if (!result) {
        return interaction.reply(
          `❌ **${player}** isn't on the tier list.`
        );
      }

      return interaction.reply(
        `🏆 **${result.name}** → **${result.tier}**`
      );
    }
  }
});

// ==============================
// LOGIN
// ==============================

client.login(TOKEN);
