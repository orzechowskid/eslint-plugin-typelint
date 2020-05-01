/**
 * @param {Node} node
 * @return {Node[]}
 */
function getChildrenForNode(node) {
    console.log(`children for node:`);
    console.log(node);
    console.log(`...`);
    switch (node.type) {
        case `ArrayExpression`:
            return node.elements.filter(Boolean);

        case `ArrayPattern`:
            return node.elements.filter(Boolean);

        case `AssignmentExpression`:
            return [
                node.operator,
                node.left,
                node.right
            ];

        case `BinaryExpression`:
            return [
                node.operator,
                node.left,
                node.right
            ];

        case `BreakStatement`:
        case `ContinueStatement`:
            return [ node.label ];

        case `CallExpression`:
            return [
                node.callee,
                ...node.arguments
            ];

        case `CatchClause`:
            return [
                node.param,
                node.guard,
                node.body
            ].filter(Boolean);

        case `ConditionalExpression`:
            return [
                node.test,
                node.alternate,
                node.consequent
            ];

        case `ExpressionStatement`:
            return [ node.expression ];

        case `ForStatement`:
            return [
                node.init,
                node.test,
                node.update,
                node.body
            ].filter(Boolean);

        case `ForInStatement`:
        case `ForOfStatement`:
            return [
                node.left,
                node.right,
                node.body
            ];

        case `FunctionDeclaration`:
            return [
                ...(node.defaults || []),
                ...(node.params || []),
                node.rest,
                node.body
            ].filter(Boolean);

        case `FunctionExpression`:
        case `ArrowExpression`:
            return [
                node.id,
                ...node.params,
                ...node.defaults,
                node.rest,
                node.body
            ].filter(Boolean);

        case `IfStatement`:
            return [
                node.test,
                node.consequent,
                node.alternate
            ].filter(Boolean);

        case `LabeledStatement`:
            return [ node.body ];

        case `LetStatement`:
            return [
                ...node.head,
                node.body
            ];

        case `LogicalExpression`:
            return [
                node.operator,
                node.left,
                node.right
            ];

        case `MemberExpression`:
            return [
                node.object,
                node.property
            ];

        case `NewExpression`:
            return [
                node.callee,
                ...node.arguments
            ];

        case `ObjectExpression`:
            return node.elements;

        case `ObjectPattern`:
            return node.properties;

        case `Property`:
            return [
                node.key,
                node.value
            ];

        case `ReturnStatement`:
            return [ node.argument ].filter(Boolean);

        case `SequenceExpression`:
            return node.expressions;

        case `SwitchCase`:
            return [
                node.test,
                ...node.consequent
            ].filter(Boolean);

        case `SwitchStatement`:
            return [
                node.discriminant,
                ...(node.cases || [])
            ];

        case `ThrowStatement`:
            return [ node.argument ];

        case `TryStatement`:
            return [
                node.block,
                node.handler,
                ...([].append(node.guardedHandlers)),
                node.finalizer
            ].filter(Boolean);

        case `UnaryExpression`:
            return [
                node.operator,
                node.argument
            ];

        case `UpdateExpression`:
            return [
                node.operator,
                node.argument
            ];

        case `VariableDeclaration`:
            return node.declarations;

        case `VariableDeclarator`:
            return [ node.init ].filter(Boolean);

        case `WhileStatement`:
        case `DoWhileStatement`:
            return [
                node.test,
                node.body
            ];

        case `WithStatement`:
            return [
                node.object,
                node.body
            ];

        case `YieldExpression`:
            return [ node.argument ];

        default:
            return node.body || [];
    }
}

/** @typedef {(-1|0|1)} TreeSearchPredicateResult */

/**
 * @typedef {function(Node):TreeSearchPredicateResult} TreeSearchPredicate
 * @description returns:
 * 0 if the node satisfies the predicate
 * -1 if neither the given node nor any of its children satisfy the predicate
 * 1 otherwise
 */

/**
* @param {Node} node
* @param {TreeSearchPredicate} predicate
* @return {Node|null}
*/
function findNode(node, predicate) {
    const result = predicate(node);

    if (result === 0) {
        return node;
    } else if (result === -1) {
        return null;
    }

    const children = getChildrenForNode(node);

    for (let i = 0; i < children.length; i++) {
        const childResult = findNode(children[i], predicate);

        if (childResult) {
            return childResult;
        }
    }

    return null;
}
