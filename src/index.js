module.exports = {
    rules: {
        "assignment-types-must-match": require('./rules/assignmentTypesMustMatch'),
        "function-args-length-must-match": require('./rules/functionArgsLengthMustMatch'),
        "function-args-types-must-match": require('./rules/functionArgsTypesMustMatch'),
        "function-return-type-must-match": require('./rules/functionReturnTypeMustMatch')
    }
};
