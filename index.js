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

/* =====================================================
   CORS
===================================================== */

app.use(cors({
  origin: [
    "https://hjhunkharlo-blip.github.io"
  ],
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.options("*", cors());

app.use(express.json());

/* =====================================================
   TIER DATA
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

/*
 * EXACT 9 KITS
 */

const KITS = [
  {
    id: "sword",
    name: "⚔️ Sword"
  },
  {
    id: "axe",
    name: "🪓 Axe"
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
    id: "smp",
    name: "🥊 SMP"
  },
  {
    id: "dia-smp",
    name: "💠 Dia SMP"
  },
  {
    id: "uhc",
    name: "❤️ UHC"
  },
  {
    id: "mace",
    name: "🔨 Mace"
  },
  {
    id: "spear-mace",
    name: "🔱⚒️ Spear Mace"
  }
];

/* =====================================================
   DATA
===================================================== */

const tierData = {
  sword: {},
  axe: {},
  crystal: {},
  pot: {},
  smp: {},
  "dia-smp": {},
  uhc: {},
  mace: {},
  "spear-mace": {}
};

/* =====================================================
   API
===================================================== */

app.get("/", (req, res) => {
  res.json({
    status: "online",
    bot: "HAVOC STYX",
    api: "online"
  });
});


app.get("/api/tiers", (req, res) => {

  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate"
  );

  res.setHeader(
    "Pragma",
    "no-cache"
  );

  res.setHeader(
    "Expires",
    "0"
  );

  res.json({
    kits: KITS,
    tiers: TIERS,
    data: tierData
  });

});


/* =====================================================
   DISCORD CLIENT
===================================================== */

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds
  ]
});


/* =====================================================
   SLASH COMMANDS
===================================================== */

const tierAddCommand =
  new SlashCommandBuilder()
    .setName("tier")
    .setDescription("Manage HAVOC STYX tiers")

    .addSubcommand(
      sub =>
        sub
          .setName("add")
          .setDescription("Add a player to a tier")

          .addStringOption(
            option =>
              option
                .setName("player")
                .setDescription("Minecraft player name")
                .setRequired(true)
          )

          .addStringOption(
            option =>
              option
                .setName("kit")
                .setDescription("Kit")
                .setRequired(true)
                .addChoices(
                  ...KITS.map(
                    kit => ({
                      name: kit.name,
                      value: kit.id
                    })
                  )
                )
          )

          .addStringOption(
            option =>
              option
                .setName("tier")
                .setDescription("Tier")
                .setRequired(true)
                .addChoices(
                  ...TIERS.map(
                    tier => ({
                      name: tier,
                      value: tier
                    })
                  )
                )
          )
    )

    .addSubcommand(
      sub =>
        sub
          .setName("remove")
          .setDescription("Remove a player from a tier")

          .addStringOption(
            option =>
              option
                .setName("player")
                .setDescription("Minecraft player name")
                .setRequired(true)
          )

          .addStringOption(
            option =>
              option
                .setName("kit")
                .setDescription("Kit")
                .setRequired(true)
                .addChoices(
                  ...KITS.map(
                    kit => ({
                      name: kit.name,
                      value: kit.id
                    })
                  )
                )
          )
    );


/* =====================================================
   BOT READY
===================================================== */

client.once(
  "ready",
  async () => {

    console.log(
      `Logged in as ${client.user.tag}`
    );

    try {

      const rest =
        new REST({
          version: "10"
        })
        .setToken(
          process.env.DISCORD_TOKEN
        );


      await rest.put(
        Routes.applicationCommands(
          client.user.id
        ),
        {
          body: [
            tierAddCommand.toJSON()
          ]
        }
      );


      console.log(
        "Slash commands registered!"
      );

    } catch (error) {

      console.error(
        "Slash command registration error:",
        error
      );

    }

    console.log(
      "HAVOC STYX bot is online!"
    );

  }
);


/* =====================================================
   COMMAND HANDLER
===================================================== */

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


    /* ---------------------------------------------
       ADD
    --------------------------------------------- */

    if (
      subcommand === "add"
    ) {

      const player =
        interaction.options.getString(
          "player",
          true
        );

      const kit =
        interaction.options.getString(
          "kit",
          true
        );

      const tier =
        interaction.options.getString(
          "tier",
          true
        );


      if (
        !tierData[kit]
      ) {

        await interaction.reply({
          content:
            "❌ Invalid kit.",
          ephemeral: true
        });

        return;
      }


      tierData[kit][player] =
        tier;


      console.log(
        `Added ${player} → ${kit} → ${tier}`
      );


      await interaction.reply({
        content:
          `✅ **${player}** is now **${tier}** in **${kit}**.\n\nThe website will update automatically.`,
        ephemeral: false
      });

      return;
    }


    /* ---------------------------------------------
       REMOVE
    --------------------------------------------- */

    if (
      subcommand === "remove"
    ) {

      const player =
        interaction.options.getString(
          "player",
          true
        );

      const kit =
        interaction.options.getString(
          "kit",
          true
        );


      if (
        !tierData[kit]
      ) {

        await interaction.reply({
          content:
            "❌ Invalid kit.",
          ephemeral: true
        });

        return;
      }


      if (
        !tierData[kit][player]
      ) {

        await interaction.reply({
          content:
            `❌ **${player}** is not ranked in that kit.`,
          ephemeral: true
        });

        return;
      }


      delete tierData[kit][player];


      console.log(
        `Removed ${player} from ${kit}`
      );


      await interaction.reply({
        content:
          `✅ Removed **${player}** from **${kit}**.`,
        ephemeral: false
      });

    }

  }
);


/* =====================================================
   START WEB SERVER
===================================================== */

app.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      `Website/API running on port ${PORT}`
    );

  }
);


/* =====================================================
   START DISCORD BOT
===================================================== */

if (
  !process.env.DISCORD_TOKEN
) {

  console.error(
    "❌ DISCORD_TOKEN environment variable is missing."
  );

} else {

  client.login(
    process.env.DISCORD_TOKEN
  );

                             }
