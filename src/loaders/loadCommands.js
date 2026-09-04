const fs = require("fs");
const path = require("path");

module.exports = (client) => {
  const commandsPath = path.join(__dirname, "../commands");
  let totalCommands = 0;

  fs.readdirSync(commandsPath).forEach((dir) => {
    const dirPath = path.join(commandsPath, dir);
    if (!fs.lstatSync(dirPath).isDirectory()) return;
    const commandFiles = fs
      .readdirSync(dirPath)
      .filter((file) => file.endsWith(".js"));
    for (const file of commandFiles) {
      const command = require(path.join(commandsPath, dir, file));

      client.commands.set(command.name, command);

      // Guard against malformed commands that set slashExecute to a truthy non-function
      const slashExecute =
        typeof command.slashExecute === "function" ? command.slashExecute : undefined;

      // A command is registered for slash if it has slashExecute OR declares slashOptions
      if (slashExecute || (Array.isArray(command.slashOptions) && command.slashOptions.length > 0)) {
        const slashData = {
          name: command.name,
          description: command.description || "No description provided",
          options: command.slashOptions || [],
          category: command.category,
          execute: command.execute,
          slashExecute,
          autocomplete: command.autocomplete,
          run: command.run,
          player: command.player,
          inVoiceChannel: command.inVoiceChannel,
          sameVoiceChannel: command.sameVoiceChannel,
          botPerms: command.botPerms,
          userPerms: command.userPerms,
          owner: command.owner || false,
          dj: command.dj || false,
          cooldown: command.cooldown || 3,
          aliases: command.aliases || [],
          usage: command.usage || "",
          args: command.args || false,
        };

        client.slashCommands.set(command.name, slashData);
      }

      totalCommands++;
    }
  });

  client.logger?.log(`Prefix Commands Loaded: ${totalCommands}`, "cmd");
  client.logger?.log(`Slash Commands Loaded: ${client.slashCommands.size}`, "cmd");
};
