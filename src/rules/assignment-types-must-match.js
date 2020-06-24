const { createUtils } = require('../utils');

module.exports = {
    create: function(context) {
        const {
            resolveTypeForValue,
            resolveTypeForDeclaration,
            resolveTypeForNodeIdentifier,
            storeProgram
        } = createUtils();

        return {
            AssignmentExpression(node) {
                const identifierType = resolveTypeForNodeIdentifier(node.left, context);

                if (!identifierType) {
                    /* identifier is untyped; bail out */
                    return;
                }

                const assignmentType = resolveTypeForValue(node.right, context);

                if (!assignmentType) {
                    /* assignment value is untyped; nothing we can do */
                    return;
                }

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
                const identifierType = resolveTypeForDeclaration(node.id, context);

                if (!identifierType) {
                    /* identifier is untyped; bail out */
                    return;
                }

                if (node.init === null) {
                    /* declaration without assignment; no big deal */
                    return;
                }

                const initType = resolveTypeForValue(node.init, context);

                if (!initType) {
                    /* initial value is untyped; nothing we can do */
                    return;
                }

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
