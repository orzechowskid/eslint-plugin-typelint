const {
    getArgumentsForCalledFunction,
    getFunctionDeclarationNodeForCall,
    visitProgram
} = require('../common');

function functionArgsLengthMustMatch(context) {
    return {
        "CallExpression": function _visitCallExpression(node) {
            const calledFunctionNode = getFunctionDeclarationNodeForCall(node);
            const expectedArgs = getArgumentsForCalledFunction(node, context);
            const expectedArgCount = expectedArgs.filter(
                (t) => t.optional === false
            ).length;
            const actualArgCount = node.arguments.length;

            if (expectedArgCount !== actualArgCount) {
                context.report({
                    message: `${expectedArgCount} arguments expected in call to ${calledFunctionNode.id.name} but ${actualArgCount} provided`,
                    node
                });
            }
        },
        "Program": visitProgram(context)
    };
}

module.exports = {
    create: functionArgsLengthMustMatch
};
