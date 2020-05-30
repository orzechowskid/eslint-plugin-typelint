module.exports = {
    rules: {
        "assignment-types-must-match": require('./rules/assignment-types-must-match'),
        "function-args-length-must-match": require('./rules/function-args-length-must-match'),
        "function-args-types-must-match": require('./rules/function-args-types-must-match'),
        "function-return-type-must-match": require('./rules/function-return-type-must-match')
    }
};
