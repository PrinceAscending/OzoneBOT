process.on('warning', (warning) => {
  if (warning.name === 'DeprecationWarning' && warning.message.includes('The ready event has been renamed to clientReady')) {
    return;
  }
});
const config = require("./src/config");
const path = require("path");
const { ClusterManager } = require("discord-hybrid-sharding");
const Logger = require("./src/utils/logger");

try {
  config.validate();
} catch (error) {
  Logger.log(error.message, "error");
  process.exit(1);
}

const manager = new ClusterManager(path.join(__dirname, "index.js"), {
  totalShards: "auto",
  shardsPerCluster: 1,
  mode: "process",
  token: config.token,
  respawn: true,
  restarts: {
    max: 5,
    interval: 1000,
  },
});

manager.on("clusterCreate", (cluster) => {
  Logger.system(`Started Cluster #${cluster.id}`);
});

// OZONE Banner
console.log(`\x1b[36m
   ██████╗ ███████╗ ██████╗ ███╗   ██╗███████╗
  ██╔═══██╗╚══███╔╝██╔═══██╗████╗  ██║██╔════╝
  ██║   ██║  ███╔╝ ██║   ██║██╔██╗ ██║█████╗
  ██║   ██║ ███╔╝  ██║   ██║██║╚██╗██║██╔══╝
  ╚██████╔╝███████╗╚██████╔╝██║ ╚████║███████╗
   ╚═════╝ ╚══════╝ ╚═════╝ ╚═╝  ╚═══╝╚══════╝
\x1b[0m`);
Logger.header("OZONE v1.0.0", "Music System");
Logger.ready("System Initialized! Spawning Clusters...");

manager.spawn({ timeout: -1 });
