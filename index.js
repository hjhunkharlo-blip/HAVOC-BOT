const express = require("express");
const cors = require("cors");
const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder
} = require("discord.js");

/* =========================================
   CONFIG
========================================= */

const PORT = process.env.PORT || 3000;
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

const WEBSITE_ORIGIN =
  "https://hjhunkharlo-blip.github.io";

/* =========================================
   EXPRESS API
========================================= */

const app = express();

/* CORS - GitHub Pages */
app.use(
  cors({
    origin: [
      WEBSITE_ORIGIN,
      "https://hjhunkharlo-blip.github.io"
    ],
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
    credentials: false
  })
);

/* Handle preflight requests */
app.options("*", cors());

app.use(express.json());

/* =========================================
   KITS
========================================= */

const kits = [
  {
    id: "sword",
    name: "⚔️ Sword"
  },
  {
    id: "axe",
    name: "🪓 Axe"
  },
  {
    id: "uhc",
    name: "❤️ UHC"
  },
  {
    id: "dia-smp",
    name: "💎 Dia SMP"
  },
  {
    id: "mace",
    name: "🔨 Mace"
  },
  {
    id: "spear",
    name: "🔱 Spear"
  },
  {
    id: "spear-mace",
    name: "🔱 Spear Mace"
  },
  {
    id: "crystal",
    name: "💎 Crystal"
  },
  {
    id: "pot",
    name: "🧪 Pot"
  },
  {
    id: "nethpot",
    name: "🧪 NethPot"
  }
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
   TIER DATABASE
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
   DISCORD COMMAND
========================================= */

const tierCommand =
  new SlashCommandBuilder()
    .setName("tier")
    .setDescription("Manage HAVOC STYX player rankings")

    /* ADD */
    .addSubcommand(subcommand =>
      subcommand
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
            .addChoices(
              ...kits.map(kit => ({
                name: kit.name,
                value: kit.id
              }))
            )
        )

        .addStringOption(option =>
          option
            .setName("tier")
            .setDescription("Player tier")
            .setRequired(true)
            .addChoices(
              ...tiers.map(tier => ({
                name: tier,
                value: tier
              }))
            )
        )
    )

    /* REMOVE */
    .addSubcommand(subcommand =>
      subcommand
        .setName("remove")
        .setDescription("Remove a player's ranking")

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
              ...kits.map(kit => ({
                name: kit.name,
                value: kit.id
              }))
            )
       
