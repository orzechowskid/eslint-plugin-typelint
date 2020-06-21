const fileInfoCache = require('./fileInfoCache');

class Type extends Array {
    get objectLiteral() {
        return this._objectLiteral;
    }

    set objectLiteral(obj) {
        this._objectLiteral = obj;
    }

    /**
     * @description returns true if this Type describes an allowed value for `otherType`
     * @param {Type} otherType
     * @return {boolean}
     */
    isOfType(otherType) {
        if (!otherType) {
            return false;
        }

        return this._objectLiteral
            ? otherType.matchesObjectLiteral(this._objectLiteral)
            : this.every(
                (t) => otherType.includes(t)
            );
    }

    matchesObjectLiteral(obj) {
        function matcher(arr, o) {
            return arr.some(function(t) {
                if (arr.includes(o)) {
                    return true;
                }

                const [
                    fsPath,
                    typedefName
                ] = t.split(`:`);

                if (!typedefName) {
                    return false;
                }

                const typedef = fileInfoCache[fsPath]
                    ? fileInfoCache[fsPath].typedefs[typedefName]
                    : undefined;

                if (!typedef) {
                    return false;
                }

                return Object.keys(o).length === Object.keys(typedef).length
                    && Object.keys(o).every(
                        (k) => typedef[k] && matcher(typedef[k], o[k])
                    );
            });
        }

        return matcher(this, obj);
    }

    toString() {
        // Note: Discarding the qualifier leads to messages like 'string does not match string'.
        return this._objectLiteral
            ? `(object literal)`
            : this.map(
                (t) => t.split(`:`)[1] || t
            ).join(`|`);
    }
}

module.exports = Type;
