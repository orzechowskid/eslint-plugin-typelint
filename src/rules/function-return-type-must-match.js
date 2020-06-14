const {
    getContainingFunctionDeclaration,
    resolveTypeForFunctionDeclaration,
    resolveTypeForValue,
    storeProgram
} = require('../utils');

module.exports = {
    create: function(context) {
        const {
            allowImplicitUndefineds = false
        } = context.options[0] || {};

        return {
            Program(node) {
                storeProgram(node, context);
            },
            ReturnStatement(node) {
                const functionDeclaration = getContainingFunctionDeclaration(node, context);
                const expectedReturnType = resolveTypeForFunctionDeclaration(
                    functionDeclaration, context
                );

                if (!node.argument && expectedReturnType) {
                    /* bare `return;` statement */

                    if (!expectedReturnType.includes(`undefined`)
                        && !allowImplicitUndefineds) {
                        context.report({
                            message: `returning an implicit undefined from a function declared to return ${expectedReturnType}`,
                            node
                        });
                    }

                    return;
                }

                const actualReturnType = resolveTypeForValue(node.argument, context);

                if (!expectedReturnType.isOfType(actualReturnType)) {
                    context.report({
                        message: `returning ${actualReturnType} from a function declared to return ${expectedReturnType}`,
                        node
                    });
                }
            }
        };
    }
};
