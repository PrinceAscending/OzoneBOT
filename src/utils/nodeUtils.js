/**
 * Waits for at least one Lavalink node to be in CONNECTED state
 * @param {Object} manager - The Kazagumo manager instance
 * @param {number} maxWaitTime - Maximum time to wait in milliseconds (default: 5000)
 * @returns {Promise<boolean>} - True if a node is connected, false otherwise
 */
async function waitForNodeConnection(manager, maxWaitTime = 10000) {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
        if (manager?.shoukaku?.nodes) {
            const connectedNodes = [...manager.shoukaku.nodes.values()].filter(
                (node) => node.state === 1 || node.state === 2
            );

            if (connectedNodes.length > 0) {
                return true;
            }
        }

        // Wait 150ms before checking again
        await new Promise((resolve) => setTimeout(resolve, 150));
    }

    return false;
}

/**
 * Synchronous check if any Lavalink node is in CONNECTED state
 * @param {Object} manager - The Kazagumo manager instance
 * @returns {boolean}
 */
function hasAvailableNodesSync(manager) {
    if (!manager?.shoukaku?.nodes || manager.shoukaku.nodes.size === 0) return false;
    return [...manager.shoukaku.nodes.values()].some(
        (node) => node.state === 1 || node.state === 2
    );
}

/**
 * Checks if any Lavalink nodes are available.
 * If nodes are currently connecting, waits up to maxWaitTime ms instead of returning a false negative.
 * @param {Object} manager - The Kazagumo manager instance
 * @param {number} [maxWaitTime=10000] - Maximum time to wait in ms
 * @returns {Promise<boolean>} - True if nodes are available
 */
async function hasAvailableNodes(manager, maxWaitTime = 10000) {
    if (!manager?.shoukaku?.nodes) return false;
    if (hasAvailableNodesSync(manager)) return true;
    return await waitForNodeConnection(manager, maxWaitTime);
}

/**
 * Gets the optimal Lavalink node using NodeRouter load balancing & health scoring
 * @param {Object} manager - The Kazagumo manager instance
 * @param {Object} [client] - The Discord client instance (optional)
 * @param {string} [guildId] - The guild ID (optional)
 * @returns {Object|null} - The node object or null
 */
function getAvailableNode(manager, client = null, guildId = null) {
    if (client?.nodeRouter) {
        return client.nodeRouter.getOptimalNode(guildId);
    }
    const nodes = [...manager.shoukaku.nodes.values()].filter(
        node => node.state === 1
    );
    return nodes.length > 0 ? nodes[0] : null;
}

module.exports = {
    waitForNodeConnection,
    hasAvailableNodes,
    hasAvailableNodesSync,
    getAvailableNode
};
