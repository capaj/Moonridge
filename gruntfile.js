module.exports = function (grunt) {
    grunt.initConfig({
        concat: {
            app: {
                src: [
                    './node_modules/socket.io-rpc/socket.io-rpc-client-angular.js',
                    './client/moonridge-angular-client.js'
                ],
                dest: './client/moonridge-angular-client-rpcbundle.js'
            }
        }
    });
    grunt.loadNpmTasks('grunt-contrib-concat');
    grunt.registerTask('default', 'concat');

};