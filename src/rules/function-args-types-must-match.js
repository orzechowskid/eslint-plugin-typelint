const {
    getArgumentsForCalledFunction,
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
                const expectedArgs = getArgumentsForCalledFunction(node, context);
                const callArgs = getArgumentsForFunctionCall(node, context);

                if (!expectedArgs) {
                    // We can find no expectations: pass.
                    return;
                }

                if (!callArgs) {
                    // We have expectations, but cannot test them: fail.
                    context.report({
                        message: `type ${a} expected for parameter ${idx} in call to ${functionName} but cannot determine type provided`,
                        node
                    });
                    return;
                }

                expectedArgs.forEach(function(a, idx) {
                    if (a.isOfType('undefined')) {
                        // We found no expectation: pass
                    } else if (!callArgs[idx]) {
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
