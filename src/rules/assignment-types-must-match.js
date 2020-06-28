const {
    resolveTypeForValue,
    resolveTypeForVariableDeclarator,
    resolveTypeForDeclaration,
    resolveTypeForNodeIdentifier,
    storeProgram
} = require('../utils');

const { Type } = require('../Type');

module.exports = {
    create: function(context) {
        return {
            AssignmentExpression(node) {
                const identifierType = resolveTypeForNodeIdentifier(node.left, context);
                const assignmentType = resolveTypeForValue(node.right, context);
                if (!assignmentType.isOfType(identifierType)) {
                    context.report({
                        message: `can't assign type ${assignmentType} to variable of type ${identifierType}`,
                        node
                    });
                }
            },

            Program(node) {
                storeProgram(node, context);
            },

            VariableDeclarator(node) {
                const identifierType = resolveTypeForVariableDeclarator(node, context);

                const initType = node.init ? resolveTypeForValue(node.init, context) : Type.undefined;

                if (!initType.isOfType(identifierType)) {
                    context.report({
                        message: `can't initialize variable of type ${identifierType} with value of type ${initType}`,
                        node
                    });
                }
            }
        };
    }
};
