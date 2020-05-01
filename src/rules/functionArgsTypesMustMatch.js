const {
    getArgumentsForCalledFunction,
    getFunctionDeclarationNodeForCall,
    getTypeForNode,
    tagToType,
    typeIncludesType,
    typeToString,
    visitProgram
} = require('../common');

function functionArgsTypesMustMatch(context) {
    const {
        ignoreTrailingUndefineds = false
    } = context.options[0] || {};

    return {
        "CallExpression": function _visitCallExpression(node) {
            const calledFunctionNode = getFunctionDeclarationNodeForCall(node);
            const expectedArgs = getArgumentsForCalledFunction(node, context);
            const expectedArgCount = expectedArgs.filter(
                (t) => t.optional === false
            ).length;
            const actualArgCount = node.arguments.length;

            for (let i = 0; i < expectedArgs.length; i++) {
                const paramName = calledFunctionNode.params[i].name;
                const tag = expectedArgs.find(
                    (t) => t.name === paramName
                );

                if (!tag) {
                    return;
                }

                const expectedType = tagToType(tag);

                if (!node.arguments[i]) {
                    if (!ignoreTrailingUndefineds) {
                        context.report({
                            message: `type ${typeToString(expectedType)} expected for argument ${i} in call to ${calledFunctionNode.id.name} but undefined implicitly provided`,
                            node
                        });
                    }

                    return;
                }

                const actualType = getTypeForNode(node.arguments[i], context);

                if (!typeIncludesType(expectedType, actualType)) {
                    context.report({
                        message: `type ${typeToString(expectedType)} expected for parameter ${i} in call to ${calledFunctionNode.id.name} but ${typeToString(actualType)} provided`,
                        node
                    });

                    return;
                }
            }
        },
        "Program": visitProgram(context)
    };
}

module.exports = {
    create: functionArgsTypesMustMatch
};
