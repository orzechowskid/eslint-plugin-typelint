const {
    determineType,
    typeAllowsType,
    typeToString,
    visitProgramNode
} = require('../common3');

function assignmentTypesMustMatch(context) {
    const {
        ignoreUndefinedsInUnions = false
    } = context.options[0] || {};

    return {
        AssignmentExpression(node) {
            const leftType = determineType(node.left, context);
            const rightType = determineType(node.right, context);

            if (!leftType) {
                return;
            }

            if (leftType.size === 0) {
                return;
            }

            if (!typeAllowsType(leftType, rightType)) {
                context.report({
                    message: `can't assign type ${typeToString(rightType)} to variable of type ${typeToString(leftType)}`,
                    node
                });
            }
        },
        Program: visitProgramNode(context),
        VariableDeclarator(node) {
            if (node.init === null) {
                /* declaration without assignment */
                return;
            }

            const leftType = determineType(node.id, context);

            if (!leftType || leftType.size === 0) {
                return;
            }

            const rightType = determineType(node.init, context);

            if (!typeAllowsType(leftType, rightType)) {
                context.report({
                    message: `can't initialize variable of type ${typeToString(leftType)} with value of type ${typeToString(rightType)}`,
                    node
                });

                return;
            }
        }
    }
}

module.exports = {
    create: assignmentTypesMustMatch
};
