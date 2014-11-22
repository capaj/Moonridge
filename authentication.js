
var authenticatedUsers = {};


module.exports = {
    /** when no user object is found, an error is thrown
     * @param {Socket} socket
     * @returns {Object} whatever you stored as your user object for that socket
     */
    getUser: function (socket) {
//        logger.info("Authenticated socket with id: " + hn.id);

        if (authenticatedUsers.hasOwnProperty(socket.id)) {
            return authenticatedUsers[socket.id]
        } else {
            throw new Error("user data not found, either the user was not authorized, or they were deleted");
        }
    },
    /**
     * @param {Socket} socket
     * @param {Object} user
     * @param {Boolean} dontRegisterDisconnect this is true when user is reauthenticating
     */
    authUser: function (socket, user, dontRegisterDisconnect) {
        authenticatedUsers[socket.id] = user;

        if (dontRegisterDisconnect !== true) {
            socket.on('disconnect', function() {
                delete authenticatedUsers[socket.id]
            });
        }
    }
};