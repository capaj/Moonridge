
var authenticatedUsers = {};


module.exports = {
    /**
     * @param {Socket} socket
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
     */
    authUser: function (socket, user) {
        authenticatedUsers[socket.id] = user;

        socket.on('disconnect', function() {
            delete authenticatedUsers[socket.id]
        });
    }
};