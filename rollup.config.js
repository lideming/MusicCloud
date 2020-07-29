import typescript from '@rollup/plugin-typescript';
import resolve from '@rollup/plugin-node-resolve';

export default {
    input: './src/main.ts',
    output: {
        file: './bundle.js',
        format: 'umd',
        name: 'mcloud'
    },
    plugins: [
        resolve(),
        typescript()
    ],
    context: 'window'
};
