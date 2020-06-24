const { createUtils } = require('../utils');

module.exports = {
    create: function(context) {
        const {
            Type,
            getArgumentsForCalledFunction,
            getArgumentsForFunctionCall,
            getNameOfCalledFunction,
            storeProgram
        } = createUtils();

        const {
            ignoreTrailingUndefineds = false
        } = context.options[0] || {};

        const undefinedType = new Type(`undefined`);

        return {
            CallExpression(node) {
                const functionName = getNameOfCalledFunction(node, context);
                const expectedArgs = getArgumentsForCalledFunction(node, context);
                const callArgs = getArgumentsForFunctionCall(node, context);

                if (!expectedArgs) {
                    // We can find no expectations: pass.
                    return;
                }

                if (!callArgs || !callArgs.length) {
                    // We have expectations, but cannot test them: fail.
                    context.report({
                        message: `arguments expected for ${functionName} but none provided`,
                        node
                    });
                    return;
                }

                expectedArgs.forEach(function(a, idx) {
                    if (a.isOfType('undefined')) {
                        // We found no expectation: pass
                    } else if (!callArgs[idx]) {
                        if (!ignoreTrailingUndefineds && !undefinedType.isOfType(a)) {
                            context.report({
                                message: `type ${a} expected for parameter ${idx} in call to ${functionName} but undefined implicitly provided`,
                                node
                            });
                        }
                    } else if (!callArgs[idx].isOfType(a)) {
                        context.report({
                            message: `type ${a} expected for parameter ${idx} in call to ${functionName} but ${callArgs[idx]} provided`,
                            node
                        });
                    }
                });
            },

            Program(node) {
                storeProgram(node, context);
            }
        };
    }
};
