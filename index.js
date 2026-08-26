const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder
} = require("discord.js");

// ==============================
// HAVOC STYX BOT
// ==============================

const TOKEN = process.env.DISCORD_TOKEN;

// Your Discord User ID
const OWNER_ID = "1347412485426380930";

// Your bot/application ID
const CLIENT_ID = "1542048358309429258";

if (!TOKEN) {
  console.error("❌ DISCORD_TOKEN is missing!");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds
  ]
});

// ==============================
// COMMANDS
// ==============================

const commands = [
  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Check if the HAVOC STYX bot is online."),

  new SlashCommandBuilder()
    .setName("server")
    .setDescription("Show the HAVOC STYX server information."),

  new SlashCommandBuilder()
    .setName("tier")
    .setDescription("Show the HAVOC STYX tier list."),

  new SlashCommandBuilder()
    .setName("owner")
    .setDescription("Check if you are the bot owner.")
].map(command => command.toJSON());

// ==============================
// BOT READY
// ==============================

client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  console.log(`🟢 HAVOC STYX bot is online!`);

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
// COMMAND HANDLER
// ==============================

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  // /ping
  if (interaction.commandName === "ping") {
    return interaction.reply("🏓 **Pong! HAVOC STYX is online!**");
  }

  // /server
  if (interaction.commandName === "server") {
    return interaction.reply(
      "🔥 **HAVOC STYX FFA**\n\n" +
      "🌐 IP: `havocffa.playwithbao.com:41367`\n" +
      "⚔️ Mode: FFA\n" +
      "🏆 Tier Testing: Enabled\n" +
      "💬 Discord: https://discord.gg/RaJMvHaXB"
    );
  }

  // /tier
  if (interaction.commandName === "tier") {
    return interaction.reply(
      "🏆 **HAVOC STYX TIER LIST**\n\n" +
      "🥇 HT1 — High Tier 1\n" +
      "🥈 LT1 — Low Tier 1\n" +
      "🥉 HT2 — High Tier 2\n" +
      "⚔️ LT2 — Low Tier 2\n" +
      "🔥 HT3 — High Tier 3\n" +
      "⚡ LT3 — Low Tier 3\n" +
      "💥 HT4 — High Tier 4\n" +
      "🛡️ LT4 — Low Tier 4\n" +
      "⭐ HT5 — High Tier 5\n" +
      "✨ LT5 — Low Tier 5"
    );
  }

  // /owner
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
});

// ==============================
// LOGIN
// ==============================

client.login(TOKEN);
