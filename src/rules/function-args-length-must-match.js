const { createUtils } = require('../utils');

module.exports = {
    create: function(context) {
        const {
            getArgumentsForCalledFunction,
            getArgumentsForFunctionCall,
            getNameOfCalledFunction,
            storeProgram
        } = createUtils();

        return {
            CallExpression(node) {
                const functionName = getNameOfCalledFunction(node, context);
                const expectedArgs = getArgumentsForCalledFunction(node, context);
                const args = getArgumentsForFunctionCall(node, context);

                if (!expectedArgs) {
                  // We can find no expectations for the called function.
                  // Pass type-check.
                } else if ((!expectedArgs || !expectedArgs.length)
                    && (args && args.length)) {
                    context.report({
                        message: `function ${functionName} expects no arguments but was called with ${args.length}`,
                        node
                    });
                } else if ((expectedArgs && expectedArgs.length)
                           && (!args || expectedArgs.length !== args.length)) {
                    context.report({
                        message: `function ${functionName} expects ${expectedArgs.length} arguments but was called with ${args.length}`,
                        node
                    });
                }
            },

            Program(node) {
                storeProgram(node, context);
            }
        };
    }
};
