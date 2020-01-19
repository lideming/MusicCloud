const browserify = require("browserify");
const tsify = require("tsify");
const fs = require("fs");
const subcmd = process.argv[2];
if (subcmd === 'build') {
    browserify()
        .add("src/main.ts")
        .plugin("tsify", { noImplicitAny: false })
        .bundle()
        .pipe(fs.createWriteStream('bundle.js'));
} else if (subcmd === 'watch') {
    const watchify = require("watchify")
    const b = browserify({
        entries: ["src/main.ts"],
        cache: {},
        packageCache: {},
        plugin: [watchify, tsify]
    });
    b.on('update', bundle);
    b.on('log', function (msg) {
        console.log(msg);
    })
    bundle();

    function bundle(id) {
        if (id) {
            console.log('updated: ' + id[0]);
        }
        console.info('building...');
        b.bundle()
            .on('error', console.error)
            .pipe(fs.createWriteStream('./bundle.js'))
            ;
    }
} else {
    console.error(`unknown sub-command '${subcmd}'`)
}