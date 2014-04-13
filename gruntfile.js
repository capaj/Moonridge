module.exports = function (grunt) {
    grunt.initConfig({
        ngtemplates:  {
            Moonridge: {
                cwd:      './client',
                src:      '**.html',
                dest:     './client/templates.js'
            }
        },
        concat: {
            app: {
                src: [
                    './node_modules/socket.io-rpc/socket.io-rpc-client-angular.js',
                    './client/moonridge-angular-client.js',
                    './client/moonridge-methods-client-validations.js',
                    './client/templates.js',
                    './client/moonridge-query-dropdown.js'
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
        },
        less: {
            client: {
                src:  './client/moonridge-client.less',
                dest: './built/moonridge-client.css'
            }

        }
    });
    grunt.loadNpmTasks('grunt-contrib-concat');
    grunt.loadNpmTasks('grunt-contrib-uglify');
    grunt.loadNpmTasks('grunt-contrib-less');
    grunt.loadNpmTasks('grunt-ng-annotate');
    grunt.loadNpmTasks('grunt-angular-templates');

    grunt.registerTask('default', ['ngtemplates', 'concat', 'less', 'ngAnnotate', 'uglify']);

};