import typescript from '@rollup/plugin-typescript';
import resolve from '@rollup/plugin-node-resolve';
import { terser } from "rollup-plugin-terser";

const rollupConfig = () => ({
    input: './src/main.ts',
    output: {
        file: './bundle.js',
        format: 'umd',
        name: 'mcloud',
        plugins: [terser()],
        sourcemap: true,
        sourcemapExcludeSources: true,
        sourcemapPathTransform: transformSourcemapPath()
    },
    plugins: [
        buildInfo(),
        resolve(),
        typescript(),
    ],
    context: 'window'
});

function getBuildInfo() {
    return JSON.stringify({
        version: require('./package.json').version,
        buildDate: new Date().toISOString()
    });
}

function buildInfo() {
    return {
        name: 'gen-build-info',
        resolveId(source, importer) {
            if (source === './buildInfo') {
                return source;
            }
            return null;
        },
        load(id) {
            if (id === './buildInfo') {
                const info = getBuildInfo();
                console.info('buildInfo: ' + info);
                return 'export default ' + info + ';';
            }
            return null;
        }
    };
}

function transformSourcemapPath() {
    return (rel, path) => {
        rel = rel.replace(/\\/g, '/');
        if (rel.startsWith('node_modules')) {
            var mat = rel.match(/^node_modules\/((?:@[\w\-_]+\/)?[\w\-_]+)\/(.*)$/);
            if (!mat) {
                console.warn(['sourcemapPathTransform', rel]);
            }
            var version = require(mat[1] + '/package.json').version;
            return `https://cdn.jsdelivr.net/npm/${mat[1]}@${version}/${mat[2]}`;
        }
        return `https://github.com/lideming/MusicCloud/raw/dev/${rel}`;
    };
}

export default rollupConfig();
