import typescript from '@rollup/plugin-typescript';
import resolve from '@rollup/plugin-node-resolve';

const rollupConfig = () => ({
    input: './src/main.ts',
    output: {
        file: './bundle.js',
        format: 'umd',
        name: 'mcloud'
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

export default rollupConfig();
