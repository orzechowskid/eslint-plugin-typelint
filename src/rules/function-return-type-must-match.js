const {
    getContainingFunctionDeclaration,
    resolveTypeForFunctionDeclaration,
    resolveTypeForValue,
    storeProgram
} = require('../utils');

const { Type } = require('../Type');

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
                const functionType = resolveTypeForValue(getContainingFunctionDeclaration(node, context), context);
                const expectedReturnType = functionType.getReturn();

                if (!node.argument && expectedReturnType) {
                    /* bare `return;` statement */

                    if (!Type.undefined.isOfType(expectedReturnType)
                        && !allowImplicitUndefineds) {
                        context.report({
                            message: `returning an implicit undefined from a function declared to return ${expectedReturnType}`,
                            node
                        });
                    }

                    return;
                }

                const actualReturnType = resolveTypeForValue(node.argument, context);

                if (!actualReturnType.isOfType(expectedReturnType)) {
                    context.report({
                        message: `returning ${actualReturnType} from a function declared to return ${expectedReturnType}`,
                        node
                    });
                }
            }
        };
    }
};
