const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  PermissionsBitField,
  Collection,
  Events,
  AuditLogEvent,
  Partials,
  ChannelType,
  ButtonBuilder,
  ButtonStyle,
  ActionRow,
  ActionRowBuilder,
} = require("discord.js");
require("colors");
require("dotenv").config();
const { REST } = require("@discordjs/rest");
const { Routes } = require("discord-api-types/v9");
const path = require("path");
const fs = require("fs");
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const passport = require('passport');
const { Strategy: DiscordStrategy } = require('passport-discord');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildInvites,
    GatewayIntentBits.GuildIntegrations,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

const mConfig = require("./config.json");
const prefixSchema = require("./models/prefix");
const { default: mongoose } = require("mongoose");
const filterPath = path.resolve(__dirname, "filter.json");
const filteredWords = JSON.parse(fs.readFileSync(filterPath, "utf-8")).words;

process.on("unhandledRejection", async (reason, promise) => {
  console.log(`Unhandled Rejection at: ${promise} \n\n Reason: ${reason}`.red);
});

process.on("uncaughtException", async (err) => {
  console.log(`Unhandled Exception ${err}`.red);
});

process.on("uncaughtExceptionMonitor", async (err, origin) => {
  console.log(`Unhandled Exception ${err} \n\n Origin: ${origin}`.red);
});

client.on("ready", async () => {
  console.log(`Connected to ${client.user.username}.`.green);

  try {
    mongoose
      .connect(process.env.mongodbURL, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      })
      .then(() => {
        console.log(`Connect ${client.user.username} to the database.`.green);
      });
  } catch (error) {
    console.error(
      `Error connecting ${client.user.username} to the client ${error}`.red
    );
  }
});

client.on(Events.MessageCreate, async (message) => {
  try {
    if (message.author.bot || !message.guild) return;

    const data = await prefixSchema.findOne({ Guild: message.guildId });
    let prefix = "!";

    if (data) {
      prefix = data.Prefix;
    }

    if (message.content.startsWith(prefix)) {
      const args = message.content.slice(prefix.length).trim().split(/ +/);
      const command = args.shift().toLowerCase();

      if (command === "setprefix") {
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
          return message.reply("You do not have permission to change the prefix.");
        }

        const newPrefix = args[0];
        if (!newPrefix) {
          return message.reply("Please provide a new prefix.");
        }

        await prefixSchema.findOneAndUpdate(
          { Guild: message.guildId },
          { Prefix: newPrefix },
          { upsert: true }
        );

        message.reply(`Prefix has been set to ${newPrefix}`);
      }

      if (command === "kick") {
        if (!message.member.permissions.has(PermissionsBitField.Flags.KickMembers)) {
          return message.reply("You do not have permission to kick members.");
        }

        const member = message.mentions.members.first();
        const reason = args.slice(1).join(" ");

        if (!member) {
          return message.reply("Please mention a user to kick.");
        }

        if (!reason) {
          return message.reply("Please provide a reason for the kick.");
        }

        message.reply(`Kicked ${member.user.tag} for: ${reason}`);
      }
    }
  } catch (error) {
    console.log(`Error in command handler: ${error}`.red);
  }
});

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname + 'public'));

app.use(session({
  secret: 'your-secret',
  resave: false,
  saveUninitialized: false,
}));

passport.use(new DiscordStrategy({
  clientID: process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET,
  callbackURL: process.env.CALLBACK_URL,
  scope: ['identify', 'guilds']
}, (accessToken, refreshToken, profile, done) => {
  done(null, profile);
}));

passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((obj, done) => {
  done(null, obj);
});

app.use(passport.initialize());
app.use(passport.session());

app.get('/auth/discord', passport.authenticate('discord'));

app.get('/auth/discord/callback',
  passport.authenticate('discord', { failureRedirect: '/' }),
  (req, res) => {
    res.redirect('/dashboard');
  }
);

app.get('/auth/logout', (req, res) => {
  req.logout(() => {
    res.redirect('/');
  });
});

app.get('/api/guilds', (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).send('Unauthorized');
  res.json(req.user.guilds);
});

app.post('/api/kick', async (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).send('Unauthorized');
  const { guildId, userId, reason } = req.body;
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return res.status(404).send('Guild not found');

  try {
    const member = await guild.members.fetch(userId);
    await member.kick(reason);
    res.send('User kicked');
  } catch (error) {
    res.status(500).send('Failed to kick user');
  }
});

app.post('/api/setprefix', async (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).send('Unauthorized');
  const { guildId, prefix } = req.body;

  try {
    await prefixSchema.findOneAndUpdate(
      { Guild: guildId },
      { Prefix: prefix },
      { upsert: true }
    );
    res.send('Prefix updated');
  } catch (error) {
    res.status(500).send('Failed to update prefix');
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

client.login(process.env.token);
