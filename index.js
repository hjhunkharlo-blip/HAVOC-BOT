const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder
} = require("discord.js");

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

const KIT_NAMES = {
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

const DATA_FILE = "./tiers.json";

function createDefaultData() {
  const data = {};

  for (const kit of KITS) {
    data[kit] = {};
  }

  return data;
}

function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    const data = createDefaultData();
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    return data;
  }

  try {
    const data = JSON.parse(
      fs.readFileSync(DATA_FILE, "utf8")
    );

    for (const kit of KITS) {
      if (!data[kit]) {
        data[kit] = {};
      }
    }

    return data;
  } catch (error) {
    console.error("❌ Error reading tiers.json:", error);
    return createDefaultData();
  }
}

function saveData(data) {
  fs.writeFileSync(
    DATA_FILE,
    JSON.stringify(data, null, 2)
  );
}

const tierData = loadData();

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const commands = [
  new SlashCommandBuilder()
    .setName("tier")
    .setDescription("HAVOC STYX FFA Tier List")

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
                name: KIT_NAMES[kit],
                value: kit
              }))
            )
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
                name: KIT_NAMES[kit],
                value: kit
              }))
            )
        )
    )

    .addSubcommand(sub =>
      sub
        .setName("list")
        .setDescription("Show a kit's tier list")
        .addStringOption(option =>
          option
            .setName("kit")
            .setDescription("FFA kit")
            .setRequired(true)
            .addChoices(
              ...KITS.map(kit => ({
                name: KIT_NAMES[kit],
                value: kit
              }))
            )
       
