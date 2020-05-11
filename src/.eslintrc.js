module.exports = {
    "env": {
        "es6": true,
        "node": true
    },
    "plugins": [
        "jsdoc"
    ],
    "parserOptions": {
        "ecmaFeatures": {
            "impliedStrict": true
        },
        "ecmaVersion": 8,
        "sourceType": "module"
    },
    "root": true,
    "rules": {
        "array-bracket-spacing": [ "warn", "always", {
            "objectsInArrays": false
        } ],
        "arrow-body-style": [ "warn", "as-needed" ],
        "arrow-parens": [ "warn", "always" ],
        "comma-dangle": [ "warn", "never" ],
        "func-names": "off",
        "function-paren-newline": "off",
        "indent": [ "warn", 4, {
            "SwitchCase": 1
        } ],
        "max-len": [ "warn", {
            "code": 90,
            "ignoreComments": true,
            ignoreStrings: true,
            ignoreTemplateLiterals: true
        } ],
        "no-console": [ "error", {
            "allow": [ "info", "warn", "error" ]
        } ],
        "no-extra-semi": "warn",
        "no-plusplus": [ "warn", {
            "allowForLoopAfterthoughts": true
        } ],
        "no-trailing-spaces": "warn",
        "no-undef": "error",
        "no-underscore-dangle": [ "warn", {
            "allow": [ "_id" ] // mongoDB :|
        } ],
        "no-unused-vars": [ "warn", {
            "varsIgnorePattern": "_$"
        } ],
        "operator-linebreak": "off",
        "prefer-arrow-callback": "off",
        "prefer-destructuring": [ "warn" ],
        "quotes": "off",
/*        "quotes": [ "error", "backtick", {
            "avoidEscape": true
        } ], */
        "sort-keys": [ "warn", "asc", {
            "caseSensitive": false,
            "natural": true
        } ],
        "space-before-function-paren": [ "warn", {
            "anonymous": "never",
            "asyncArrow": "always",
            "named": "never"
        } ],

        "jsdoc/check-types": [ "warn" ]
    }
};
