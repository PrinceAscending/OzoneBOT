const AutoRole = require("../../schema/autorole");

module.exports = {
  name: "guildMemberAdd",
  run: async (client, member) => {
    if (!member || !member.guild || member.user.bot) return;

    try {
      const autoRoleData = await AutoRole.findOne({ guildId: member.guild.id });
      if (autoRoleData && autoRoleData.roles?.length > 0) {
        const me = member.guild.members.me;
        if (!me?.permissions.has("ManageRoles")) return;

        for (const roleId of autoRoleData.roles) {
          const role = member.guild.roles.cache.get(roleId);
          if (role && role.comparePositionTo(me.roles.highest) < 0) {
            await member.roles.add(role).catch(() => {});
          }
        }
      }
    } catch (error) {
      client.logger?.log(`[AutoRole] Error assigning role in guild ${member.guild.id}: ${error.message}`, "warn");
    }
  },
};
