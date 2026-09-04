const fs = require("fs");
const {
  ContainerBuilder,
  TextDisplayBuilder,
  MessageFlags,
  REST,
  Routes
} = require("discord.js");
const emoji = require("../../emojis");

module.exports = {
  name: "reload",
  category: "Owner",
  aliases: ["rd", "reloadall", "rdall"],
  description: "Reload a single command or all commands (use `all`).",
  args: false,
  usage: "<command|all>",
  permission: [],
  owner: true,

  slashOptions: [
    {
      name: "target",
      description: "Command name to reload or 'all' to reload all commands",
      type: 3,
      required: true
    }
  ],
  async slashExecute(interaction, client) {
    if (!client.owners.includes(interaction.user.id)) {
      const denyDisplay = new TextDisplayBuilder()
        .setContent(`**${client.emoji.warn} You do not have permission to use this command.**`);

      const denyContainer = new ContainerBuilder()
        .addTextDisplayComponents(denyDisplay);

      return interaction.reply({
        components: [denyContainer],
        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
      }).catch(() => { });
    }

    const target = interaction.options.getString("target").toLowerCase();

    if (target === "all" || target === "reloadall" || target === "rdall") {
      try {
        const commandsDir = `${process.cwd()}/src/commands`;

        client.commands.clear();
        client.slashCommands.clear();

        const categories = fs.readdirSync(commandsDir);
        let reloadedCount = 0;
        let slashCount = 0;

        for (const category of categories) {
          const categoryPath = `${commandsDir}/${category}`;
          if (!fs.lstatSync(categoryPath).isDirectory()) continue;

          const commandFiles = fs
            .readdirSync(categoryPath)
            .filter((file) => file.endsWith(".js"));

          for (const file of commandFiles) {
            const commandPath = `${categoryPath}/${file}`;
            delete require.cache[require.resolve(commandPath)];
            const command = require(commandPath);

            if (command.name) {
              client.commands.set(command.name, command);
              reloadedCount++;

              if (command.slashExecute || command.slashOptions) {
                const slashData = {
                  name: command.name,
                  description: command.description || "No description provided",
                  options: command.slashOptions || [],
                  category: command.category,
                  execute: command.execute,
                  slashExecute: command.slashExecute,
                  autocomplete: command.autocomplete,
                  run: command.run,
                  player: command.player,
                  inVoiceChannel: command.inVoiceChannel,
                  sameVoiceChannel: command.sameVoiceChannel,
                  botPerms: command.botPerms,
                  userPerms: command.userPerms,
                  owner: command.owner || false,
                };

                client.slashCommands.set(command.name, slashData);
                slashCount++;
              }
            }
          }
        }

        if (client.slashCommands.size > 0) {
          const rest = new REST({ version: "10" }).setToken(client.token);
          const commands = Array.from(client.slashCommands.values()).map((cmd) => {
            const commandData = {
              name: cmd.name,
              description: cmd.description,
              options: cmd.options || [],
            };

            if (cmd.owner) {
              commandData.default_member_permissions = "8";
              commandData.dm_permission = false;
            }

            return commandData;
          });

          await rest.put(Routes.applicationCommands(client.user.id), {
            body: commands,
          });
        }

        const successDisplay = new TextDisplayBuilder()
          .setContent(
            `**${client.emoji.check} Successfully reloaded all commands:**\n` +
            `**${client.emoji.info} Prefix Commands:** \`${reloadedCount}\`\n` +
            `**${client.emoji.info} Slash Commands:** \`${slashCount}\``
          );

        const container = new ContainerBuilder()
          .addTextDisplayComponents(successDisplay);

        return interaction.reply({
          components: [container],
          flags: MessageFlags.IsComponentsV2
        });
      } catch (error) {
        console.error(error);

        const errorDisplay = new TextDisplayBuilder()
          .setContent(`**${client.emoji.cross} An error occurred while reloading commands:**\n\`\`\`\n${error.message}\`\`\``);

        const container = new ContainerBuilder()
          .addTextDisplayComponents(errorDisplay);

        return interaction.reply({
          components: [container],
          flags: MessageFlags.IsComponentsV2
        });
      }
    }

    const commandName = target;
    const command =
      client.commands.get(commandName) ||
      client.commands.find(
        (cmd) => cmd.aliases && cmd.aliases.includes(commandName),
      );

    if (!command) {
      const errorDisplay = new TextDisplayBuilder()
        .setContent(`**${client.emoji.cross} There is no command with name or alias \`${commandName}\`**`);

      const container = new ContainerBuilder()
        .addTextDisplayComponents(errorDisplay);

      return interaction.reply({
        components: [container],
        flags: MessageFlags.IsComponentsV2
      });
    }

    try {
      const commandPath = resolveCommandFilePath(command.category, command.name);
      delete require.cache[require.resolve(commandPath)];
      const newCommand = require(commandPath);
      client.commands.set(newCommand.name, newCommand);

      if (newCommand.slashExecute || newCommand.slashOptions) {
        const slashData = {
          name: newCommand.name,
          description: newCommand.description || "No description provided",
          options: newCommand.slashOptions || [],
          category: newCommand.category,
          execute: newCommand.execute,
          slashExecute: newCommand.slashExecute,
          autocomplete: newCommand.autocomplete,
          run: newCommand.run,
          player: newCommand.player,
          inVoiceChannel: newCommand.inVoiceChannel,
          sameVoiceChannel: newCommand.sameVoiceChannel,
          botPerms: newCommand.botPerms,
          userPerms: newCommand.userPerms,
          owner: newCommand.owner || false,
        };

        client.slashCommands.set(newCommand.name, slashData);

        const rest = new REST({ version: "10" }).setToken(client.token);
        const commands = Array.from(client.slashCommands.values()).map((cmd) => {
          const commandData = {
            name: cmd.name,
            description: cmd.description,
            options: cmd.options || [],
          };

          if (cmd.owner) {
            commandData.default_member_permissions = "8";
            commandData.dm_permission = false;
          }

          return commandData;
        });

        await rest.put(Routes.applicationCommands(client.user.id), {
          body: commands,
        });
      }

      const successDisplay = new TextDisplayBuilder()
        .setContent(`**${client.emoji.check} Successfully reloaded \`${commandName}\` command.**`);

      const container = new ContainerBuilder()
        .addTextDisplayComponents(successDisplay);

      await interaction.reply({
        components: [container],
        flags: MessageFlags.IsComponentsV2
      }).catch(() => { });
    } catch (error) {
      console.error(error);

      const errorDisplay = new TextDisplayBuilder()
        .setContent(`**${client.emoji.cross} Facing an error while reloading command \`${command.name}\`:**\n\`\`\`\n${error.message}\`\`\``);

      const container = new ContainerBuilder()
        .addTextDisplayComponents(errorDisplay);

      await interaction.reply({
        components: [container],
        flags: MessageFlags.IsComponentsV2
      }).catch(() => { });
    }
  },
  async execute(message, args, client, prefix) {
    if (!client.owners.includes(message.author.id)) {
      return;
    }

    const opt = args[0] ? args[0].toLowerCase() : null;

    if (opt === "all" || opt === "reloadall" || opt === "rdall") {
      try {
        const commandsDir = `${process.cwd()}/src/commands`;

        client.commands.clear();
        client.slashCommands.clear();

        const categories = fs.readdirSync(commandsDir);
        let reloadedCount = 0;
        let slashCount = 0;

        for (const category of categories) {
          const categoryPath = `${commandsDir}/${category}`;
          if (!fs.lstatSync(categoryPath).isDirectory()) continue;

          const commandFiles = fs
            .readdirSync(categoryPath)
            .filter((file) => file.endsWith(".js"));

          for (const file of commandFiles) {
            const commandPath = `${categoryPath}/${file}`;
            delete require.cache[require.resolve(commandPath)];
            const command = require(commandPath);

            if (command.name) {
              client.commands.set(command.name, command);
              reloadedCount++;

              if (command.slashExecute || command.slashOptions) {
                const slashData = {
                  name: command.name,
                  description: command.description || "No description provided",
                  options: command.slashOptions || [],
                  category: command.category,
                  execute: command.execute,
                  slashExecute: command.slashExecute,
                  autocomplete: command.autocomplete,
                  run: command.run,
                  player: command.player,
                  inVoiceChannel: command.inVoiceChannel,
                  sameVoiceChannel: command.sameVoiceChannel,
                  botPerms: command.botPerms,
                  userPerms: command.userPerms,
                  owner: command.owner || false,
                };

                client.slashCommands.set(command.name, slashData);
                slashCount++;
              }
            }
          }
        }

        if (client.slashCommands.size > 0) {
          const rest = new REST({ version: "10" }).setToken(client.token);
          const commands = Array.from(client.slashCommands.values()).map((cmd) => {
            const commandData = {
              name: cmd.name,
              description: cmd.description,
              options: cmd.options || [],
            };

            if (cmd.owner) {
              commandData.default_member_permissions = "8";
              commandData.dm_permission = false;
            }

            return commandData;
          });

          await rest.put(Routes.applicationCommands(client.user.id), {
            body: commands,
          });
        }

        const successDisplay = new TextDisplayBuilder()
          .setContent(
            `**${client.emoji.check} Successfully reloaded all commands:**\n` +
            `**${client.emoji.info} Prefix Commands:** \`${reloadedCount}\`\n` +
            `**${client.emoji.info} Slash Commands:** \`${slashCount}\``
          );

        const container = new ContainerBuilder()
          .addTextDisplayComponents(successDisplay);

        return message.channel.send({
          components: [container],
          flags: MessageFlags.IsComponentsV2
        });
      } catch (error) {
        console.error(error);

        const errorDisplay = new TextDisplayBuilder()
          .setContent(`**${client.emoji.cross} An error occurred while reloading commands:**\n\`\`\`\n${error.message}\`\`\``);

        const container = new ContainerBuilder()
          .addTextDisplayComponents(errorDisplay);

        return message.channel.send({
          components: [container],
          flags: MessageFlags.IsComponentsV2
        });
      }
    }

    if (!args.length) {
      const errorDisplay = new TextDisplayBuilder()
        .setContent(`**${client.emoji.warn} Please provide a command name or use \`all\` to reload all commands.**`);

      const container = new ContainerBuilder()
        .addTextDisplayComponents(errorDisplay);

      return message.channel.send({
        components: [container],
        flags: MessageFlags.IsComponentsV2
      });
    }

    const commandName = args[0].toLowerCase();
    const command =
      message.client.commands.get(commandName) ||
      message.client.commands.find(
        (cmd) => cmd.aliases && cmd.aliases.includes(commandName),
      );

    if (!command) {
      const errorDisplay = new TextDisplayBuilder()
        .setContent(`**${client.emoji.cross} There is no command with name or alias \`${commandName}\`**`);

      const container = new ContainerBuilder()
        .addTextDisplayComponents(errorDisplay);

      return message.channel.send({
        components: [container],
        flags: MessageFlags.IsComponentsV2
      });
    }

    try {
      const commandPath = resolveCommandFilePath(command.category, command.name);
      delete require.cache[require.resolve(commandPath)];
      const newCommand = require(commandPath);
      message.client.commands.set(newCommand.name, newCommand);

      if (newCommand.slashExecute || newCommand.slashOptions) {
        const slashData = {
          name: newCommand.name,
          description: newCommand.description || "No description provided",
          options: newCommand.slashOptions || [],
          category: newCommand.category,
          execute: newCommand.execute,
          slashExecute: newCommand.slashExecute,
          autocomplete: newCommand.autocomplete,
          run: newCommand.run,
          player: newCommand.player,
          inVoiceChannel: newCommand.inVoiceChannel,
          sameVoiceChannel: newCommand.sameVoiceChannel,
          botPerms: newCommand.botPerms,
          userPerms: newCommand.userPerms,
          owner: newCommand.owner || false,
        };

        client.slashCommands.set(newCommand.name, slashData);

        const rest = new REST({ version: "10" }).setToken(client.token);
        const commands = Array.from(client.slashCommands.values()).map((cmd) => {
          const commandData = {
            name: cmd.name,
            description: cmd.description,
            options: cmd.options || [],
          };

          if (cmd.owner) {
            commandData.default_member_permissions = "8";
            commandData.dm_permission = false;
          }

          return commandData;
        });

        await rest.put(Routes.applicationCommands(client.user.id), {
          body: commands,
        });
      }

      const successDisplay = new TextDisplayBuilder()
        .setContent(`**${client.emoji.check} Successfully reloaded \`${commandName}\` command.**`);

      const container = new ContainerBuilder()
        .addTextDisplayComponents(successDisplay);

      await message.channel.send({
        components: [container],
        flags: MessageFlags.IsComponentsV2
      }).catch(() => { });
    } catch (error) {
      console.error(error);

      const errorDisplay = new TextDisplayBuilder()
        .setContent(`**${client.emoji.cross} Facing an error while reloading command \`${command.name}\`:**\n\`\`\`\n${error.message}\`\`\``);

      const container = new ContainerBuilder()
        .addTextDisplayComponents(errorDisplay);

      await message.channel.send({
        components: [container],
        flags: MessageFlags.IsComponentsV2
      }).catch(() => { });
    }
  },
};

/**
 * Resolves the file path for a command. The file name and the command's
 * `name` property can diverge (e.g. blacklist.js exporting name 'blacklist'),
 * so fall back to scanning the category directory for the file whose module
 * name matches.
 */
function resolveCommandFilePath(category, commandName) {
  const dir = `${process.cwd()}/src/commands/${category}`;
  const direct = `${dir}/${commandName}.js`;
  if (fs.existsSync(direct)) return direct;

  if (fs.existsSync(dir)) {
    const files = fs.readdirSync(dir).filter((file) => file.endsWith(".js"));
    for (const file of files) {
      try {
        const mod = require(`${dir}/${file}`);
        if (mod && mod.name === commandName) return `${dir}/${file}`;
      } catch {
        // ignore unloadable files
      }
    }
  }

  return direct;
}
