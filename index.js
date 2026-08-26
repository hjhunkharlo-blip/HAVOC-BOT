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

/*
   HAVOC STYX POINT SYSTEM

   HT:
   HT1 = 10
   HT2 = 8
   HT3 = 5
   HT4 = 3
   HT5 = 1

   LT:
   LT1 = 8
   LT2 = 6
   LT3 = 4
   LT4 = 2
   LT5 = 1
*/

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
      "⚠️ tiers.json missing or invalid."
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
   OVERALL RANKING CALCULATOR
========================================= */

function calculateOverallRankings() {
  const players = {};

  for (const kit of KITS) {
    const kitPlayers =
      tierData[kit.id] || {};

    for (const [player, tier] of Object.entries(
      kitPlayers
    )) {
      if (!TIERS.includes(tier)) {
        continue;
      }

      const existingName =
        Object.keys(players).find(
          name =>
            name.toLowerCase() ===
            player.toLowerCase()
        );

      const key =
        existingName || player;

      if (!players[key]) {
        players[key] = {
          player: key,
          totalPoints: 0,
          kits: []
        };
      }

      const points =
        POINTS[tier] || 0;

      const kitInfo =
        KITS.find(
          k => k.id === kit.id
        );

      players[key].totalPoints += points;

      players[key].kits.push({
        kit: kit.id,
        kitName: kitInfo
          ? kitInfo.name
          : kit.id,
        tier,
        points
      });
    }
  }

  /*
     Highest points = #1.
     If tied, player with more ranked
     kits goes first.
     If still tied, alphabetical.
  */

  return Object.values(players)
    .sort((a, b) => {
      if (
        b.totalPoints !==
        a.totalPoints
      ) {
        return (
          b.totalPoints -
          a.totalPoints
        );
      }

      if (
        b.kits.length !==
        a.kits.length
      ) {
        return (
          b.kits.length -
          a.kits.length
        );
      }

      return a.player.localeCompare(
        b.player
      );
    })
    .map((player, index) => ({
      rank: index + 1,
      player: player.player,
      totalPoints: player.totalPoints,
      kits: player.kits
    }));
}

/* =========================================
   API RESPONSE
========================================= */

function getTierResponse() {
  const overallRankings =
    calculateOverallRankings();

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
      Automatic overall rankings.
      No point limit.
    */

    overallRankings,

    timestamp:
      new Date().toISOString()
  };
}

/* =========================================
   BASIC ROUTES
========================================= */

app.get("/", (req, res) => {
  res.json({
    status: "online",
    bot: "HAVOC STYX",
    api: "tier-list",
    version: "4.0"
  });
});

/* =========================================
   MAIN API
========================================= */

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

/* =========================================
   BACKUP API ROUTE
========================================= */

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

/* =========================================
   OVERALL RANKINGS ONLY
========================================= */

app.get(
  "/api/rankings",
  (req, res) => {
    res.set(
      "Access-Control-Allow-Origin",
      "*"
    );

    res.set(
      "Cache-Control",
      "no-store"
    );

    res.status(200).json({
      status: "online",
      bot: "HAVOC STYX",
      rankings:
        calculateOverallRankings(),
      timestamp:
        new Date().toISOString()
    });
  }
);

/* =========================================
   PLAYER PROFILE API
========================================= */

app.get(
  "/api/player/:player",
  (req, res) => {
    const requested =
      normalizePlayer(
        req.params.player
      );

    if (!requested) {
      return res.status(400).json({
        error:
          "Invalid player name."
      });
    }

    const playerKits = [];

    for (const kit of KITS) {
      const kitPlayers =
        tierData[kit.id] || {};

      const found =
        Object.keys(kitPlayers)
          .find(
            name =>
              name.toLowerCase() ===
              requested.toLowerCase()
          );

      if (found) {
        const tier =
          kitPlayers[found];

        playerKits.push({
          kit: kit.id,
          kitName: kit.name,
          tier,
          points:
            POINTS[tier] || 0
        });
      }
    }

    const totalPoints =
      playerKits.reduce(
        (sum, item) =>
          sum + item.points,
        0
      );

    const rankings =
      calculateOverallRankings();

    const ranking =
      rankings.find(
        item =>
          item.player.toLowerCase() ===
          requested.toLowerCase()
      );

    res.json({
      status: "online",
      player: requested,
      totalPoints,
      overallRank:
        ranking
          ? ranking.rank
          : null,
      kits: playerKits
    });
  }
);

/* =========================================
   PING
========================================= */

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

/* =========================================
   HEALTH
========================================= */

app.get(
  "/health",
  (req, res) => {
    res.status(200).json({
      ok: true,
      service:
        "HAVOC STYX API"
    });
  }
);

/* =========================================
   DISCORD CLIENT
========================================= */

const client = new
