const browserify = require("browserify");
const tsify = require("tsify");
const fs = require("fs");

const spaces = / {4}/g;
const buildInfoMathcer = /__mc_build_info__/g;
const buildInfo = JSON.stringify({
    version: require('./package.json').version,
    buildDate: new Date().toISOString()
});

const subcmd = process.argv[2] || 'help';

if (subcmd === 'build') {
    createBrowserify()
        .bundle()
        .pipe(fs.createWriteStream('bundle.js'));
} else if (subcmd === 'watch') {
    const watchify = require("watchify");
    const b = createBrowserify(watchify)
        .plugin(watchify)
        .on('update', bundle)
        .on('log', function (msg) {
            console.log(msg);
        });
    bundle();

    function bundle(id) {
        if (id) {
            console.log('updated: ' + id[0]);
        }
        console.info('building...');
        b.bundle()
            .on('error', console.error)
            .pipe(fs.createWriteStream('./bundle.js'));
    }
} else if (subcmd === 'help') {
    printHelp();
} else {
    console.error(`unknown sub-command '${subcmd}'.\n`);
    printHelp();
}

function printHelp() {
    console.error(`Available sub-commands:
    build, watch, help`);
}

function createBrowserify() {
    return browserify({
        entries: ["src/main.ts"],
        // required by watchify:
        cache: {},
        packageCache: {}
    })
        .plugin(tsify, { noImplicitAny: false })
        .transform((file) => {
            var through = require("through2");
            return through(function write(chunk, enc, next) {
                next(null, chunk.toString().replace(spaces, '\t'));
            });
        })
        .transform((file) => {
            var through = require("through2");
            return through(function write(chunk, enc, next) {
                next(null, chunk.toString().replace(buildInfoMathcer, buildInfo));
            });
        });
}
