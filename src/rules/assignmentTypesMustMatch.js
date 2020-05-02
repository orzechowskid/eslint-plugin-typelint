const {
    getExpressionForObjectNode,
    getExpressionForType,
    getTypeForNode,
    objectIsOfType,
    typeIncludesType,
    typeToString,
    visitProgram
} = require('../common');

function assignmentTypesMustMatch(context) {
    const {
        ignoreUndefinedsInUnions = false
    } = context.options[0] || {};

    return {
        AssignmentExpression(node) {
            const leftTypes = getTypeForNode(node.left, context);
            const rightTypes = getTypeForNode(node.right, context);

            if (leftTypes.size === 0) {
                return;
            } else if (typeIncludesType(leftTypes, rightTypes)) {
                return;
            }

            context.report({
                message: `can't assign type ${typeToString(rightTypes)} to variable of type ${typeToString(leftTypes)}`,
                node
            });
        },
        Program: visitProgram(context),
        VariableDeclarator(node) {
            if (node.init === null) {
                /* declaration without assignment */
                return;
            }

            const leftType = getTypeForNode(node.id, context);
            const rightType = getTypeForNode(node.init, context);

            if (leftType.size === 0) {
                return;
            }

            if (!typeIncludesType(leftType, rightType)) {
                context.report({
                    message: `can't assign type ${typeToString(rightType)} to variable of type ${typeToString(leftType)}`,
                    node
                });

                return;
            }

            if (node.init.type === `ObjectExpression`) {
                const objectExpression = getExpressionForObjectNode(node.init);
                const typeExpression = getExpressionForType(leftType, context);

                if (!objectIsOfType(objectExpression, typeExpression)) {
                    context.report({
                        message: `can't assign non-matching object literal to variable of type ${typeToString(leftType)}`,
                        node
                    });

                    return;
                }
            }
        }
    }
}

module.exports = {
    create: assignmentTypesMustMatch
};
