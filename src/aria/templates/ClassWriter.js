/*
 * Copyright 2012 Amadeus s.a.s.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Writer object used to manage the JavaScript output generated by template statements
 */
Aria.classDefinition({
    $classpath : "aria.templates.ClassWriter",
    $dependencies : ["aria.utils.String"],
    /**
     * Create a Class Writer instance
     * @param {aria.utils.Callback} processStatement Callback used to process a single statement in the content
     * @param {aria.utils.Callback} processErrors Callback used to process errors
     */
    $constructor : function (processStatement, processErrors) {
        /**
         * Callback used to process a single statement in the content
         * @type aria.utils.Callback
         * @protected
         */
        this._processStatement = processStatement;

        /**
         * Callback used to process errors
         * @type aria.utils.Callback
         * @protected
         */
        this._processErrors = processErrors;

        /**
         * Current indentation string. Used when writing a line
         * @type String
         * @protected
         */
        this._curindent = '';

        /**
         * Text used for indentation (null to disable)
         * @type String
         */
        this.indentUnit = ' ';

        /**
         * Counter for number of variables created. This is increased every time a new var statement is called and is
         * used as unique key.
         * @type Number
         * @protected
         */
        this._varNameNumber = 0;

        /**
         * Optional error context to be passed when logging errors
         * @type Object
         */
        this.errorContext = null;

        /**
         * if true, the dependencies section should even contain already loaded dependencies
         * @type Boolean
         */
        this.allDependencies = null;

        /**
         * Stores the template parameter
         * @type Object
         */
        this.templateParam = null;

        /**
         * Stores the parent class type
         * @type String
         */
        this.parentClassType = "JS";

        /**
         * Stores the parent class name
         * @type String
         */
        this.parentClassName = null;

        /**
         * Stores the parent classpath
         * @type String
         */
        this.parentClasspath = null;

        /**
         * Stores the script class name
         * @type String
         */
        this.scriptClassName = null;

        /**
         * Stores the script classpath
         * @type String
         */
        this.scriptClasspath = null;

        /**
         * Callback to call when generation is finished
         * @type aria.utils.Callback
         */
        this.callback = null;

        /**
         * Direct link to widget libraries
         * @type Object
         *
         * <pre>
         * {
         *     libName : libClasspath
         * }
         * </pre>
         */
        this.wlibs = {};

        /**
         * Map of declared macros
         * @type Object
         *
         * <pre>
         * {
         *     macroName : {
         *         definition : statement
         *     }
         * }
         * </pre>
         */
        this.macros = {};

        /**
         * Map of declared views
         * @type Object
         *
         * <pre>
         * {
         *    viewName : {
         *       firstDefinition : statement,
         *       nbParams : numberOfParameters
         *    }
         * }
         * </pre>
         */
        this.views = {};

        /**
         * Current working output block
         * @type Object
         * @protected
         */
        this._curblock = null;

        /**
         * Map of possible output block
         * @type Object
         *
         * <pre>
         * {
         *    blockName : {
         *       curindentnbr : indent,
         *       out : []
         *    }
         * }
         * </pre>
         *
         * @protected
         */
        this._blocks = {};

        /**
         * Stack of output blocks
         * @type Array
         * @protected
         */
        this._stack = [];

        /**
         * List of dependencies found for the class to be generated
         * @type Array
         * @protected
         */
        this._dependencies = [];

        /**
         * Whether an error occured or not during the generation process.
         * @type Boolean
         */
        this.errors = false;

        /**
         * Indicates if the writer has a mirror debug writer
         * @type Boolean
         */
        this.debug = false;

        /**
         * Tree structure generated by the parser
         * @type aria.templates.TreeBeans.Root
         */
        this.tree = null;

    },
    $prototype : {
        /**
         * Add a list of classpath dependencies
         * @param {Array} dependencies list of classpath
         */
        addDependencies : function (dependencies) {
            for (var i = dependencies.length - 1; i >= 0; i--) {
                this.addDependency(dependencies[i]);
            }
        },

        /**
         * Add a single classpath dependency
         * @param {String} dependency classpath
         */
        addDependency : function (dependency) {
            this._dependencies[dependency] = 1;
        },

        /**
         * Get the list of unique dependencies as a string preceded by $dependencies.
         * @return {String} empty string if no dependencies
         */
        getDependencies : function () {
            var res = [];
            for (var i in this._dependencies) {
                if (this._dependencies.hasOwnProperty(i)) {
                    res.push(this.stringify(i));
                }
            }
            if (res.length > 0) {
                return ["$dependencies: [", res.join(","), "],"].join('');
            } else {
                return "";
            }
        },

        /**
         * Get a macro description
         * @param {String} macroName Name of the macro
         * @return {Object}
         */
        getMacro : function (macroName) {
            var res = this.macros[macroName];
            if (res == null) {
                res = {};
                this.macros[macroName] = res;
            }
            return res;
        },

        /**
         * Get a view description
         * @param {String} viewBaseName Name of the view
         * @return {Object}
         */
        getView : function (viewBaseName) {
            var res = this.views[viewBaseName];
            if (res == null) {
                res = {};
                this.views[viewBaseName] = res;
            }
            return res;
        },

        /**
         * Whether the ClassWriter is ready to perform some output. This happens only after entering an output block
         * @return {Boolean}
         */
        isOutputReady : function () {
            return (this._curblock != null);
        },

        /**
         * Create a new output block
         * @param {String} blockname Name of the block
         * @param {Number} indent Number of indentation unit to be used
         */
        newBlock : function (blockname, indent) {
            var newblock = {
                curindentnbr : indent,
                out : []
            };
            this._blocks[blockname] = newblock;
        },

        /**
         * Enter an output block. Any output operation (write or writeln) will output it's content in this block
         * @param {String} blockname Name of the block
         */
        enterBlock : function (blockname) {
            this._stack.push(this._curblock);
            this._curblock = this._blocks[blockname];
            if (this.indentUnit && this._curblock) {
                this._updateIndent();
            }
        },

        /**
         * Leave an output block and return to the previous block in the stack if any.
         */
        leaveBlock : function () {
            this._curblock = this._stack.pop();
            if (this.indentUnit && this._curblock) {
                this._updateIndent();
            }
        },

        /**
         * Get the clock's content
         * @param {String} blockname Name of the block
         * @return {String} output content
         */
        getBlockContent : function (blockname) {
            return this._blocks[blockname].out.join('');
        },

        /**
         * Convert an expression into a string
         * @see aria.utils.String.stringify
         * @param {Object} expression Expression to be converted into a string
         * @return {String}
         */
        stringify : function (expression) {
            this.stringify = aria.utils.String.stringify;
            return this.stringify(expression);
        },

        /**
         * Create a new unique var name
         * @return {String} name of the variable
         */
        newVarName : function () {
            this._varNameNumber++;
            return "__v_" + this._varNameNumber + "_" + parseInt(10 * Math.random(), 10);
        },

        /**
         * Start processing the content of a tree node (list of aria.templates.TreeBeans.Statement)
         * @param {Array} content list of statements
         */
        processContent : function (content) {
            for (var i = 0; i < content.length; i++) {
                this.processStatement(content[i]);
            }
        },

        /**
         * Process a statement calling the callback defined in the constructor
         * @param {aria.templates.TreeBeans.Statement} statement Statement to be processed
         */
        processStatement : function (statement) {
            this._processStatement.fn.call(this._processStatement.scope, this, statement);
        },

        /**
         * Update the current indentation for the output block.
         * @protected
         */
        _updateIndent : function () {
            this._curindent = new Array(1 + this._curblock.curindentnbr).join(this.indentUnit);
        },

        /**
         * Log an error calling the error callback defined in the constructor.
         * @param {aria.templates.TreeBeans.Statement} statement Statement generating the error
         * @param {String} msgId Message to be logged
         * @param {Array} msgArgs List of error parameters as in jsObject.$logError
         */
        logError : function (statement, msgId, msgArgs) {
            this.errors = true;
            this._processErrors.fn.call(this._processErrors.scope, statement, msgId, msgArgs, this.errorContext);
        },

        /**
         * Log an error without stopping the template processing.
         * @param {aria.templates.TreeBeans.Statement} statement Statement generating the error
         * @param {String} msgId Message to be logged
         * @param {Array} msgArgs List of error parameters as in jsObject.$logError
         */
        logWarn : function (statement, msgId, msgArgs) {
            this._processErrors.fn.call(this._processErrors.scope, statement, msgId, msgArgs, this.errorContext);
        },

        /**
         * Increase the block indent of one unit
         */
        increaseIndent : function () {
            if (this.indentUnit) {
                this._curblock.curindentnbr++;
                this._curindent += this.indentUnit;
            }
        },

        /**
         * Decrease the block indent of one unit
         */
        decreaseIndent : function () {
            if (this.indentUnit) {
                this._curblock.curindentnbr--;
                this._updateIndent();
            }
        },

        /**
         * Write a line in the current output block. The line is built concatenating all arguments and appending a new
         * line character.
         * @param {String} One or more string to be written
         */
        writeln : function () {
            var out = this._curblock.out;
            if (this._curindent) {
                out.push(this._curindent);
            }
            out.push.apply(out, arguments);
            out.push('\n');
        },

        /**
         * Write in the current output block. The text written is built concatenating all arguments.
         * @param {String} One or more string to be written
         */
        write : function () {
            var out = this._curblock.out;
            out.push.apply(out, arguments);
        },

        /**
         * Wrap an expression evaluation in a try catch and return result
         * @param {String} exprStr String to be eval'ed
         * @param {aria.templates.TreeBeans.Statement} statement Statement corresponding to the expression
         * @param {String} errorMsg Message to be logged in case of errors
         * @return {String} container the name of the variable that will contain the expression
         */
        wrapExpression : function (exprStr, statement, errorMsg) {

            var container = this.newVarName();

            // stringify the expression for the eval
            exprStr = this.stringify(exprStr);
            this.writeln("var " + container + " = null;");
            this.writeln("try {");
            this.increaseIndent();
            // remove quotes
            exprStr = exprStr.substr(1, exprStr.length - 2);
            this.writeln('eval( "' + container + '=(' + exprStr + ')" );');
            this.decreaseIndent();
            this.writeln("} catch (e) {");
            this.increaseIndent();
            this.writeln("this.$logError(", errorMsg, ",[\"", exprStr, "\",", statement.lineNumber, ",", this.stringify(statement.name), "], e);");
            this.decreaseIndent();
            this.writeln("}");

            return container;
        },

        /**
         * Add a statement to store line number (use to track runtime exceptions)
         * @param {Number} lineNumber
         */
        trackLine : function (lineNumber) {
            if (this._curblock) {
                this.writeln("this['" + Aria.FRAMEWORK_PREFIX + "currentLineNumber'] = " + lineNumber + ";");
            }
        }

    }
});