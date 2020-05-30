const {
    getArgumentsForFunction,
    getArgumentsForFunctionCall,
    getNameOfCalledFunction,
    storeProgram
} = require('../utils');

module.exports = {
    create: function(context) {
        const {
            ignoreTrailingUndefineds = false
        } = context.options[0] || {};

        return {
            CallExpression(node) {
                const functionName = getNameOfCalledFunction(node, context);
                const expectedArgs = getArgumentsForFunction(node, context);
                const callArgs = getArgumentsForFunctionCall(node, context);

                if (!expectedArgs || !expectedArgs.length
                    || !callArgs || !callArgs.length) {
                    return;
                }

                expectedArgs.forEach(function(a, idx) {
                    if (!callArgs[idx]) {
                        if (!ignoreTrailingUndefineds) {
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
