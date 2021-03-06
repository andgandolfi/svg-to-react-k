var babel = require('babel-core');
var replace = require('estraverse').replace;
var generate = require('escodegen').generate;

module.exports = function(svgString) {
  var trans = babel.transform(wrapStyleTags(stripSvgArguments(svgString)), {
    code: false,
    whitelist: ['react']
  });

  var ast = replace(trans.ast.program, {
    enter: function(node, parent) {
      if (isReactCreateElement(node)) this.inCreateElCall = true;

      // check if we are inside a react props object
      if (this.inCreateElCall && parent.type === 'ObjectExpression') {
        renameProps(node, parent, this);
        camelizeProps(node, parent, this);
        removeHardcodedDimensions(node, parent, this);
      }
    },
    leave: function(node, parent) {
      if (isReactCreateElement(node)) this.inCreateElCall = false;
    }
  });

  ast = makeLastStatementReturn(ast);

  return Function('params', generate(ast));
};

function wrapStyleTags(svgString) {
  var styleRe = /(<[\s]*style.*?>)(.*?)<\/[\s]*style[\s]*>/gim;
  var matches = svgString.match(styleRe);

  if (!matches) {
    return svgString;
  }

  for (var i = 0; i < matches.length; i++) {
    var m = matches[i];
    var openTag = m.replace(styleRe, '$1');
    var content = m.replace(styleRe, '$2');
    svgString = svgString.replace(m, `${openTag}{"${content.replace(/"/g, '\\"')}"}</style>`);
  }

  return svgString;
}

function stripSvgArguments(svgString) {
  var viewBox = (svgString.match(/viewBox=['"]([^'"]*)['"]/) || [])[1];
  var viewBoxStr = '';
  if (viewBox) viewBoxStr = 'viewBox="'+viewBox+'"';

  return svgString
    // remove and parameterize all svg attributes except viewbox
    .replace(/<svg([^>]*)*>/, '<svg {...params}'+viewBoxStr+'>');
}

function renameProps(node, parent) {
  if (node.type === 'Property' && node.key.type === 'Identifier' && node.key.name === 'class') {
      node.key.name = 'className';
  }
  return node;
}

function camelizeProps(node, parent) {
  if (node.type === 'Property' && node.key.type === 'Literal' ) {
    node.key = {
      'type': 'Identifier',
      'name': camelize(node.key.value)
    };
    return node;
  }
}

function removeHardcodedDimensions(node, parent, context) {
  if (isPropertyIdentifierWithNames(node, ['width', 'height'])) {
    context.remove();
  }
}

function makeLastStatementReturn(ast) {
  var idx = ast.body.length-1;
  var lastStatement = ast.body[idx];

  if (lastStatement && lastStatement.type !== 'ReturnStatement') {
    ast.body[idx] = {
      'type': 'ReturnStatement',
      'argument': lastStatement
    };
  }

  return ast;
}

function camelize(string) {
  return string.replace(/-(.)/g, function(_, letter) {
    return letter.toUpperCase();
  });
}

function isPropertyIdentifier(node) {
  return node.type === 'Property' && node.key.type === 'Identifier';
}

function isPropertyIdentifierWithNames(node, names) {
  var itIs = false;
  if (!isPropertyIdentifier(node)) return false;

  for (var i=0; i < names.length; i++) {
    if (names[i] === node.key.name) {
      itIs = true;
      break;
    }
  }

  return itIs;
}

function isReactCreateElement(node) {
  return (
    node.type === 'CallExpression'
    && (node.callee.object && node.callee.object.name === 'React')
    && (node.callee.property && node.callee.property.name === 'createElement')
  );
}

function getAst(code) {
  var trans = babel.transform(code, {
    whitelist: [],
    code: false
  });

  return trans.ast.program;
}
