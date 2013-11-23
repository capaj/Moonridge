module.exports = function (grunt) {
    grunt.initConfig({
        concat: {
            app: {
                src: [
                    './node_modules/socket.io-rpc/socket.io-rpc-client-angular.js',
                    './client/moonridge-angular-client.js'
                ],
                dest: './built/moonridge-angular-client-rpcbundle.js'
            }
        },
        ngAnnotate: {
            app: {
                src: './built/moonridge-angular-client-rpcbundle.js',
                dest: './built/moonridge-angular-client-rpcbundle-annotated.js'
            }
        },
        uglify: {
            dist: {
                files: {
                    './built/moonridge-angular-client-rpcbundle.min.js': './built/moonridge-angular-client-rpcbundle-annotated.js'
                }
            }
        }
    });
    grunt.loadNpmTasks('grunt-contrib-concat');
    grunt.loadNpmTasks('grunt-contrib-uglify');
    grunt.loadNpmTasks('grunt-ng-annotate');
    grunt.registerTask('default', ['concat', 'ngAnnotate', 'uglify']);

};