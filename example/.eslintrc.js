module.exports = {
    "plugins": [
        "jsdoc",
        "eslint-plugin-typelint"
    ],
    "parserOptions": {
        "ecmaFeatures": {
            "impliedStrinct": true
        },
        "ecmaVersion": 8,
        "jsx": true,
        "loc": true
    },
    "rules": {
        "jsdoc/check-types": [ "warn" ],

        "typelint/assignment-types-must-match": [ "error" ],
        "typelint/function-args-length-must-match": [ "warn", {
            "myOption": "idunno"
        } ],
        "typelint/function-args-types-must-match": [ "warn", {
            "ignoreTrailingUndefineds": false,
            "coolFactor": 3
        } ],
        "typelint/function-return-type-must-match": [ "warn" ]
    }
};
