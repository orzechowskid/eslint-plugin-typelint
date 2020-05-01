const {
    getTypeForNode,
    typeIncludesType,
    typeToString,
    visitProgram
} = require('../common');

function assignmentTypesMustMatch(context) {
    const {
        ignoreUndefinedsInUnions = false
    } = context.options[0] || {};

    return {
        "AssignmentExpression": function _visitAssignmentExpression(node) {
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
        "Program": visitProgram(context),
        "VariableDeclarator": function _visitVariableDeclarator(node) {
            if (node.init === null) {
                /* declaration without assignment */
                return;
            }

            const leftType = getTypeForNode(node.id, context);
            const rightType = getTypeForNode(node.init, context);

            if (leftType.size === 0) {
                return;
            } else if (typeIncludesType(leftType, rightType)) {
                return;
            }

            context.report({
                message: `can't assign type ${typeToString(rightType)} to variable of type ${typeToString(leftType)}`,
                node
            });
        }
    }
}

module.exports = {
    create: assignmentTypesMustMatch
};
