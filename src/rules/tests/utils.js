const path = require('path');
const fileInfoCache = require('../../fileInfoCache.js');
const typedefCache = require('../../typedefCache.js');

const {
    ESLint
} = require('eslint');

function clearObject(object) {
  for (const key of Object.keys(object)) {
    delete object[key];
  }
}

async function doTest(source, lintOptions) {
    clearObject(fileInfoCache);
    clearObject(typedefCache);

    const eslint = new ESLint({
        baseConfig: Object.assign({}, lintOptions, {
            parserOptions: {
                ecmaFeatures: {
                    jsx: true
                },
                ecmaVersion: 8,
                sourceType: `module`
            }
        }),
        useEslintrc: false /* don't apply project rules to unit tests :) */
    });

    const result = await eslint.lintText(source, {
        filePath: path.resolve(__dirname, `${Date.now()}`, __filename)
    });

    return result
        ? result[0].messages
        : undefined;
}

module.exports = {
    doTest
};
