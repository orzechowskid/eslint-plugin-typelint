/** @typedef {import('./types').ProgramNode} ProgramNode */

/**
 * @param {ProgramNode} programNode
 * @return {CommentNode[]}
 */
function getComments(programNode) {
    return programNode.comments.filter(
        (comment) => comment.type === `Block`
    );
}

/**
 * @param {ProgramNode} programNode
 * @return {Node[]}
 */
function getExportDeclarations(programNode) {
    return programNode.body.filter(
        (node) => node.type === `ExportNamedDeclaration`
            || node.type === `ExportDefaultDeclaration`
    );
}

/**
 * @param {Node} node
 * @return {Node}
 */
function getFunctionDeclarationNodeFor(node) {
    let declaredFunction = node;

    while (declaredFunction && declaredFunction.type !== `FunctionDeclaration`) {
        declaredFunction = declaredFunction.parent;
    }

    return declaredFunction;
}

/**
 * @param {Node} importSpecifier
 * @return {Node}
 */
function getImportDeclarationFor(importSpecifier) {
    return importSpecifier
        ? importSpecifier.parent
        : undefined;
}

/**
 * @param {ProgramNode} programNode
 * @return {Node[]}
 */
function getImportDeclarations(programNode) {
    return programNode.body.filter(
        (node) => node.type === `ImportDeclaration`
    );
}

module.exports = {
    getComments,
    getExportDeclarations,
    getImportDeclarationFor,
    getImportDeclarations
};
