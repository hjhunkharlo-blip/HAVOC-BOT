const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require("discord.js");
const express = require("express");
const fs = require("fs");

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const PORT = process.env.PORT || 3000;

if (!TOKEN) {
  console.error("❌ DISCORD_TOKEN is missing!");
  process.exit(1);
}

if (!CLIENT_ID) {
  console.error("❌ CLIENT_ID is missing!");
  process.exit(1);
}

if (!GUILD_ID) {
  console.error("❌ GUILD_ID is missing!");
  process.exit(1);
}

const KITS = [
  "sword",
  "axe",
  "crystal",
  "pot",
  "smp",
  "dia-smp",
  "uhc",
  "mace",
  "spear-mace"
];

const TIERS = [
  "HT1", "LT1",
  "HT2", "LT2",
  "HT3", "LT3",
  "HT4", "LT4",
  "HT5", "LT5"
];

const KIT_LABELS = {
  sword: "⚔️ Sword",
  axe: "🪓 Axe",
  crystal: "💎 Crystal",
  pot: "🧪 Pot",
  smp: "🥊 SMP",
  "dia-smp": "💠 Dia SMP",
  uhc: "❤️ UHC",
  mace: "🔨 Mace",
  "spear-mace": "🔱⚒️ Spear Mace"
};

const DATA_FILE = "./tiers.json";

function defaultData() {
  const data = {};

  for (const kit of KITS) {
    data[kit] = {};
  }

  return data;
}

function loadData() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      const data = defaultData();
      fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
      return data;
    }

    const data = JSON.parse(
      fs.readFileSync(DATA_FILE, "utf8")
    );

    for (const kit of KITS) {
      if (!data[kit]) data[kit] = {};
    }

    return data;
  } catch (error) {
    console.error("Could not read tiers.json:", error);
    return defaultData();
  }
}

function saveData(data) {
  fs.writeFileSync(
    DATA_FILE,
    JSON.stringify(data, null, 2)
  );
}

const data = loadData();

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const commands = [
  new SlashCommandBuilder()
    .setName("tier")
    .setDescription("Manage the HAVOC STYX FFA tier list")

    .addSubcommand(sub =>
      sub
        .setName("add")
        .setDescription("Add or update a player")
        .addStringOption(option =>
          option
            .setName("player")
            .setDescription("Player name")
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName("kit")
            .setDescription("FFA kit")
            .setRequired(true)
            .addChoices(
              ...KITS.map(kit => ({
                name: KIT_LABELS[kit],
                value: kit
              }))
            )
        )
        .addStringOption(option =>
          option
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
    )

    .addSubcommand(sub =>
      sub
        .setName("remove")
        .setDescription("Remove a player")
        .addStringOption(option =>
          option
            .setName("player")
            .setDescription("Player name")
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName("kit")
            .setDescription("FFA kit")
            .setRequired(true)
            .addChoices(
              ...KITS.map(kit => ({
                name: KIT_LABELS[kit],
                value: kit
              }))
            )
        )
    )

    .addSubcommand(sub =>
      sub
        .setName("list")
        .setDescription("Show a kit tier list")
        .addStringOption(option =>
          option
            .setName("kit")
            .setDescription("FFA kit")
            .setRequired(true)
            .addChoices(
              ...KITS.map(kit => ({
                name: KIT_LABELS[kit],
                value: kit
              }))
            )
        )
    )

    .addSubcommand(sub =>
      sub
        .setName("player")
        .setDescription("Show a player's rankings")
        .addStringOption(option =>
          option
            .setName("player")
            .setDescription("Player name")
            .setRequired(true)
        )
    )
].map(command => command.toJSON());

const rest = new REST({ version: "10" }).setToken(TOKEN);

async function registerCommands() {
  await rest.put(
    Routes.applicationGuildCommands(
      CLIENT_ID,
      GUILD_ID
    ),
    {
      body: commands
    }
  );

  console.log("✅ Slash commands registered!");
}

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  try {
    await registerCommands();
  } catch (error) {
    console.error("❌ Could not register commands:", error);
  }

  console.log("🟢 HAVOC STYX bot is online!");
});

client.on("interactionCreate", async interaction => {
  if (
    !interaction.isChatInputCommand() ||
    interaction.commandName !== "tier"
  ) {
    return;
  }

  const subcommand = interaction.options.getSubcommand();

  if (subcommand === "add") {
    const player = interaction.options
      .getString("player")
      .trim();

    const kit = interaction.options.getString("kit");
    const tier = interaction.options.getString("tier");

    data[kit][player] = tier;

    saveData(data);

    return interaction.reply(
      `✅ **${player}** is now **${tier}** in **${KIT_LABELS[kit]}**.`
    );
  }

  if (subcommand === "remove") {
    const player = interaction.options
      .getString("player")
      .trim();

    const kit = interaction.options.getString("kit");

    if (!data[kit][player]) {
      return interaction.reply(
        `❌ **${player}** isn't on the ${KIT_LABELS[kit]} tier list.`
      );
    }

    delete data[kit][player];

    saveData(data);

    return interaction.reply(
      `✅ Removed **${player}** from **${KIT_LABELS[kit]}**.`
    );
  }

  if (subcommand === "list") {
    const kit = interaction.options.getString("kit");

    const lines = TIERS.map(tier => {
      const players = Object.entries(data[kit])
        .filter(([, rank]) => rank === tier)
        .map(([name]) => name);

      return `**${tier}** — ${
        players.length
          ? players.join(", ")
          : "—"
      }`;
    });

    return interaction.reply(
      `**${KIT_LABELS[kit]} Tier List**\n\n${lines.join("\n")}`
    );
  }

  if (subcommand === "player") {
    const player = interaction.options
      .getString("player")
      .trim();

    const rows = KITS.map(kit => {
      const rank = data[kit][player] || "Unranked";

      return `${KIT_LABELS[kit]} — **${rank}**`;
    });

    return interaction.reply(
      `**${player} — HAVOC STYX FFA Rankings**\n\n${rows.join("\n")}`
    );
  }
});

const app = express();

app.use(express.json());
app.use(express.static("public"));

app.get("/api/tiers", (req, res) => {
  res.json({
    kits: KITS.map(kit => ({
      id: kit,
      name: KIT_LABELS[kit]
    })),
    tiers: TIERS,
    data
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    ok: true
  });
});

app.listen(PORT, () => {
  console.log(`🌐 Website running on port ${PORT}`);
});

client.login(TOKEN);
