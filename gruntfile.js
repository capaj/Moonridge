module.exports = function (grunt) {
    grunt.initConfig({
        ngAnnotate: {
            app: {
                src: './built/moonridge-angular-client.js',
                dest: './built/moonridge-angular-client-annotated.js'
            }
        },
        uglify: {
            dist: {
                files: {
                    './built/moonridge-angular-client.min.js': './built/moonridge-angular-client-annotated.js'
                }
            }
        },
        less: {
            client: {
                files: [
                    {
                        expand: true,
                        cwd: 'client/less/',
                        src: ['*.less'],
                        dest: 'client/styles/',
                        ext: '.css'
                    }
                ]
            }

        }
    });

    grunt.loadNpmTasks('grunt-contrib-uglify');
    grunt.loadNpmTasks('grunt-contrib-less');


    grunt.registerTask('default', ['less', 'ngAnnotate', 'uglify']);

};