// Import necessary modules and functions
const { solveHint, getImage, getName } = require("pokehint");

const config = require("../config.js");

const { wait, randomInteger } = require("../utils/utils.js");
const { ShinyHunter } = require("../classes/clients/shinyHunter.js");
const {
  sendLog,
  sendCatch,
} = require("../functions/logging.js");
const {
  setSpamming,
  getSpamming,
  getWaiting,
} = require("../utils/states.js");
const tf = require("@tensorflow/tfjs-node");
const sharp = require("sharp");
const data = require("../data/ai.json");
const axios = require("axios");

let model;

async function predict(url) {
  if (!model) {
    model = await tf.loadLayersModel("file://./data/model/model.json");
  }
  startTime = new Date().getTime();
  const imageTensor = await preprocessImage(url);
  const prediction = model.predict(imageTensor);

  const predictedIndex = prediction.argMax(1).dataSync()[0];

  //console.log(`Predicted class index: ${predictedIndex}`);

  const keys = Object.keys(data); // Get all keys from the data object
  const name = keys[predictedIndex]; // Get the key name at the specified index

  //console.log(`Predicted class name: ${name}`);
  sendLog(
    null,
    "AI prediction took " + (new Date().getTime() - startTime) + "ms.",
    "debug"
  );
  return name;
}

async function preprocessImage(url) {
  const response = await axios({
    url,
    responseType: "arraybuffer",
  });
  const imageBuffer = await sharp(Buffer.from(response.data))
    .resize(64, 64)
    .toBuffer();

  const imageTensor = tf.divNoNan(tf.node.decodeImage(imageBuffer, 3), 255);

  const expandedTensor = tf.expandDims(imageTensor, 0);

  return expandedTensor;
}

// Main function to handle message creation events
module.exports = async (client, guildId, message) => {
  // Return if the bot is set to waiting
  if (getWaiting(client.user.username) == true) return;

  // Check if the message is from the bot itself in the specified guild or if global catch is enabled and the guild is not blacklisted
  if (
    (config.behavior.Catching == true &&
      message.guild?.id == guildId &&
      message.author.id == "716390085896962058") ||
    (config.globalSettings.GlobalCatch &&
      message.author.id == "716390085896962058" &&
      !config.globalSettings.BlacklistedGuilds.includes(message.guild?.id))
  ) {
    // Handle wild Pokémon appearance
    if (message.embeds[0]?.title?.includes("wild pokémon has appeared")) {
      // Return if IncenseMode is off and the message includes "Incense"
      if (
        config.incense.IncenseMode == false &&
        message.embeds[0]?.footer?.text?.includes("Incense")
      )
        return;

      if (config.behavior.AI == true) {
        sendLog(
          client.user.username,
          "AI enabled, trying to predict the pokémon.",
          "debug"
        );
        predict(message.embeds[0].image.url)
          .then(async (result) => {
            if (
              config.shinyHunting.HuntPokemons.includes(result.split("\r\n")[0])
            ) {
              const shinyHunter = new ShinyHunter(
                config.shinyHunting.HuntToken
              );
              shinyHunter.login();
              shinyHunter.catch(
                message.guild.id,
                message.channel.id,
                await getName({
                  name: result.split("\r\n")[0],
                  inputLanguage: "English",
                })
              );
            } else {
              pokemonRandom = await getName({
                name: result.split("\r\n")[0],
                inputLanguage: "English",
              });
              if (!pokemonRandom) {
                pokemonRandom = result;
              }
              checkIfWrong = await message.channel
                .createMessageCollector({ time: 5000 })
                .on("collect", async (msg) => {
                  if (msg.content.includes("That is the wrong pokémon!")) {
                    checkIfWrong.stop();
                    setTimeout(async () => {
                      await msg.channel.send("<@716390085896962058> h ");
                    }, 500);
                  }
                });
              await message.channel.send(
                "<@716390085896962058> c " + pokemonRandom
              );
            }
          })
          .catch((error) => {
            console.error(error);
            // Send a hint message if the prediction fails
            let hintMessages = ["h", "hint"];
            message.channel.send(
              "<@716390085896962058> " + hintMessages[Math.round(Math.random())]
            );
          });
      } else {
        let hintMessages = ["h", "hint"];
        message.channel.send(
          "<@716390085896962058> " + hintMessages[Math.round(Math.random())]
        );
      }

      // Handle incense-specific logic
      if (
        config.incense.IncenseMode == true &&
        message.embeds[0]?.footer?.text?.includes("Incense")
      ) {
        // Log and manage spamming state based on incense detection
        if (getSpamming(client.user.username) == true) {
          setSpamming(client.user.username, false);
          sendLog(client.user.username, "Detected incense.", "incense");
        }
        // Handle the end of incense and possibly buy a new one
        if (message.embeds[0]?.footer.text.includes("Spawns Remaining: 0.")) {
          if (
            config.incense.AutoIncenseBuy == true &&
            message.channel.id == config.incense.IncenseChannel
          ) {
            sendLog(
              client.user.username,
              "Incense ran out, buying next one.",
              "auto-incense"
            );
            return message.channel.send(
              "<@716390085896962058> incense buy 30m 10s --y"
            );
          }
          setSpamming(client.user.username, true);
          sendLog(
            client.user.username,
            "Detected the end of the incense.",
            "incense"
          );
        }
      }
    } else if (message.content.includes("The pokémon is")) {
      // Handle hint-based Pokémon catching
      const pokemon = await solveHint(message);
      if (pokemon[0]) {
        // Check if the Pokémon is in the shiny hunting list
        if (
          config.shinyHunting.HuntPokemons.includes(pokemon[0] || pokemon[1])
        ) {
          const shinyHunter = new ShinyHunter(config.shinyHunting.HuntToken);
          shinyHunter.login();
          shinyHunter.catch(message.guild.id, message.channel.id, pokemon[0]);
        } else {
          // Attempt to catch the Pokémon based on the hint
          pokemonRandom = await getName({
            name: pokemon[0],
            inputLanguage: "English",
          });
          if (!pokemonRandom) {
            pokemonRandom = pokemon[0];
          }
          await message.channel.send(
            "<@716390085896962058> c " + pokemonRandom
          );
        }
        // Handle incorrect catch attempts
        checkIfWrong = await message.channel
          .createMessageCollector({ time: 5000 })
          .on("collect", async (msg) => {
            if (msg.content.includes("That is the wrong pokémon!")) {
              checkIfWrong.stop();
              await msg.channel.send("<@716390085896962058> c " + pokemon[1]);

              checkIfWrong2 = await msg.channel
                .createMessageCollector({ time: 5000 })
                .on("collect", async (msg) => {
                  if (msg.content.includes("That is the wrong pokémon!")) {
                    checkIfWrong2.stop();
                    let hintMessages = ["h", "hint"];
                    msg.channel.send(
                      "<@716390085896962058> " +
                        hintMessages[Math.round(Math.random())]
                    );
                  }
                });
            }
          });
      }
    } else if (message.content.startsWith("Please pick a starter pokémon")) {
      // Handle starter Pokémon selection
      let starters = ["bulbasaur", "charmander", "squirtle"];
      await wait(300);
      await message.channel.send(
        "<@716390085896962058> pick " + starters[randomInteger(0, 2)]
      );
    } else if (
      message?.embeds[0]?.footer &&
      message?.embeds[0].footer.text.includes("Terms") &&
      message?.components[0]?.components[0]
    ) {
      // Handle terms acceptance and initial setup
      const messages = await message.channel.messages
        .fetch({ limit: 2, around: message.id })
        .catch(() => null);
      const newMessage = Array.from(messages.values());
      [...messages.values()];
      if (!newMessage[1]?.content.includes("pick")) return;
      message.clickButton();
      await wait(3000);
      message.channel.send("<@716390085896962058> i");
      await wait(2000);
      message.channel.send("<@716390085896962058> sh solosis");
      await wait(2000);
      message.channel.send("<@716390085896962058> order iv");
    } else if (
      config.logging.LogCatches &&
      message.content.includes("Congratulations <@" + client.user.id + ">")
    ) {
      // Log successful catches
      if (config.logging.LogCatches) {
        let match = message.content.match(
          /Level (\d+) ([^<]+)(<:[^>]+>) \(([^)]+%)\)/
        );
        const level = match[1];
        const name = match[2].trim();
        const gender = match[3];
        const iv = match[4];

        if (message.content.includes("✨")) {
          shiny = true;
        } else {
          shiny = false;
        }

        sendCatch(
          client.user.username,
          name,
          level,
          iv,
          gender,
          shiny,
          await getImage(name, shiny)
        );
      }
    }
  }
};
