module.exports = function (grunt) {
	grunt.loadNpmTasks('grunt-contrib-connect');
	grunt.loadNpmTasks('grunt-contrib-concat');
	grunt.loadNpmTasks('grunt-contrib-uglify');
	grunt.loadNpmTasks('grunt-karma');

	grunt.initConfig({
		pkg: grunt.file.readJSON('bower.json'),
//		watch: {
//			options: {
//				livereload: true
//			},
//			files: ['src/**/*.html'],
//			autocompile: {
//				files: ['src/**/*.js', '!src/bower_components'],
//				tasks: autocompileTasks
//			},
//			less: {
//				files: 'src/**/*.less',
//				tasks: ['less:development']
//			},
//			replace: {
//				files: 'src/resource/index.html',
//				tasks: ['replace:indexMain']
//			},
//			manifest: {
//				files: 'src/loadOrder.js',
//				tasks: ['smg']
//			},
//			JSfileAddedDeleted: {
//				files: 'src/js/**/*.js',
//				tasks: ['smg'],
//				options: {
//					event: ['added', 'deleted']
//				}
//			},
//			bower: {
//				files: 'bower.json',
//				tasks: ['clean']
//			}
//		},
		karma: {
			unit: {
				configFile: './test/karma.conf.js'
			}
		},
        connect: {
            test: {
                options: {
                    port: 9010,
                    livereload: 9012,
//                    base: 'test',
                    keepalive: true
                }
            }
        },
		concat: {
            options: {
                banner: '//<%= pkg.name %> version <%= pkg.version %> \n'
            },
			dist: {
				src: ['./src/module.js', './src/*.js'],
				dest: './dist/<%= pkg.name %>.js'
			}
		},
		jshint: {
			options: {
				jshintrc: '.jshintrc',
				curly: true,
				eqeqeq: true,
				immed: true,
				latedef: true,
				newcap: true,
				noarg: true,
				sub: true,
				undef: true,
				boss: true,
				eqnull: true,
				browser: true
			},
			globals: {
				require: true,
				define: true,
				requirejs: true,
				describe: true,
				expect: true,
				it: true
			},
			all: [
				'Gruntfile.js'
			]
		},
		uglify: {
			dist: {
				files: {
					'dist/<%= pkg.name %>.min.js': 'dist/<%= pkg.name %>.js'
				}
			}
		}
	});


	/// future
	grunt.registerTask('compile', [
		'concat',
		'uglify'
	]);

	grunt.registerTask('default', [
		'compile'
	]);
};
