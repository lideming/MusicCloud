import typescript from '@rollup/plugin-typescript';
import resolve from '@rollup/plugin-node-resolve';
import { terser } from "rollup-plugin-terser";

import { readFile } from "fs/promises";
import { promisify } from "util";
import { exec } from "child_process";
const execAsync = promisify(exec);

const rollupConfig = () => ({
    input: './src/main.ts',
    output: {
        file: './bundle.js',
        format: 'umd',
        name: 'mcloud',
        plugins: [
            terser({
                keep_classnames: true,
                keep_fnames: true,
            }),
        ],
        sourcemap: true,
        // sourcemapExcludeSources: true,
        sourcemapPathTransform: transformSourcemapPath(),
    },
    plugins: [
        buildInfo(),
        resolve(),
        typescript(),
        myCss(),
        jsonLoader(),
    ],
    context: 'window'
});

async function getBuildInfo() {
    return JSON.stringify({
        version: require('./package.json').version,
        buildDate: new Date().toISOString(),
        commits: await getCommits(),
    });
}

async function getCommits() {
    var execResult = await execAsync('git log --pretty=format:"%h %cI %s" -n 20');
    return execResult.stdout
        .split('\n')
        .map(x => {
            var s = x.split(' ', 2);
            return {
                id: s[0],
                date: s[1],
                message: x.substr(s[0].length + 1 + s[1].length + 1)
            };
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
        async load(id) {
            if (id === './buildInfo') {
                const info = await getBuildInfo();
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

function myCss() {
    return {
        name: 'my-css-loader',
        transform(code, id) {
            if (id.endsWith('.css')) {
                return {
                    code: 'export default ' + JSON.stringify(code),
                    map: { mappings: '' }
                };
            }
        }
    };
}

function jsonLoader() {
    return {
        name: 'json-loader',
        transform(code, id) {
            if (id.endsWith('.json')) {
                return {
                    code: 'export default JSON.parse(' + JSON.stringify(JSON.stringify(JSON.parse(code))) + ');',
                    map: { mappings: '' }
                };
            }
        }
    };
}

export default rollupConfig();
