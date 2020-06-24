const { createUtils } = require('../utils');

module.exports = {
    create: function(context) {
        const {
            getContainingFunctionDeclaration,
            resolveReturnTypeForFunctionDeclaration,
            resolveTypeForValue,
            storeProgram
        } = createUtils();

        const {
            allowImplicitUndefineds = false
        } = context.options[0] || {};

        return {
            Program(node) {
                storeProgram(node, context);
            },
            ReturnStatement(node) {
                const functionDeclaration = getContainingFunctionDeclaration(node, context);
                const expectedReturnType = resolveReturnTypeForFunctionDeclaration(
                    functionDeclaration, context
                );

                if (!expectedReturnType) {
                    // We can find no expectation for the return type: pass.
                    return;
                }

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

                if (actualReturnType
                    && !actualReturnType.isOfType(expectedReturnType)) {
                    context.report({
                        message: `returning ${actualReturnType} from a function declared to return ${expectedReturnType}`,
                        node
                    });
                }
            }
        };
    }
};
