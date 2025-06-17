import { CoveredBy, InjectFrom, Node, UndefinedAttributes } from '@bablr/helpers/decorators';
import { spam as m } from '@bablr/helpers/shorthand';
import * as productions from '@bablr/helpers/productions';
import { o, eat, eatMatch, defineAttribute, shiftMatch, fail } from '@bablr/helpers/grammar';
import { triviaEnhancer } from '@bablr/helpers/trivia';

export const enhanceLanguageWithJSX = (language) => {
  if (language.dependencies.JSX) throw new Error();

  let jsxLanguage = Object.freeze({
    canonicalURL: 'https://bablr.org/languages/universe/jsx',
    dependencies: Object.freeze({
      JS: language.canonicalURL,
    }),
    grammar: triviaEnhancer(
      {
        triviaIsAllowed: (s) => ['Tag', 'Interpolation'].includes(s.span),
        triviaMatcher: m`#: :JS.Comment: <__Trivia /[ \n\r\t]|\/\/|\/\*/ />`,
      },
      class JSXGrammar {
        @CoveredBy('NodeChild')
        @Node
        *Node({ ctx }) {
          let open = yield eat(m`open: <OpenTag />`);
          let openType = open.get('type');

          if (open.get('selfClosingTagToken')) {
            yield eat(m`close: null`);
            return;
          }

          yield eat(m`children[]$: <__Children />`, o({}), o({ allowEmpty: true }));

          let close = yield eat(m`close: <CloseTag />`);
          let closeType = close.get('type');

          while (openType.type === closeType.type) {
            if (openType.type === 'MemberExpression') {
              if (
                ctx.sourceTextFor(openType.get('property')) !==
                ctx.sourceTextFor(closeType.get('property'))
              ) {
                break;
              }
              openType = openType.get('object');
              closeType = closeType.get('object');
            } else {
              if (
                closeType.type === openType.type &&
                ctx.sourceTextFor(openType.get('value')) ===
                  ctx.sourceTextFor(closeType.get('value'))
              ) {
                return;
              } else {
                break;
              }
            }
          }

          yield fail();
        }

        *Children() {
          while (yield eatMatch(m`<_NodeChild />`)) {}
        }

        *NodeChild() {
          (yield eatMatch(m`<Interpolation '{' />`)) ||
            (yield eatMatch(m`<Node '<' />`)) ||
            (yield eat(m`<Text />`));
        }

        @CoveredBy('NodeChild')
        @Node
        *Interpolation() {
          yield eat(
            m`openToken: <*Punctuator '{' { balanced: '}', balancedSpan: 'Interpolation' } />`,
          );
          yield eatMatch(m`value+$: :JS: <_Expression />`, o({}), o({ bind: true }));
          yield eat(m`closeToken: <*Punctuator '}' { balancer: true } />`);
        }

        @UndefinedAttributes(['balanced', 'balancedSpan'])
        @Node
        *OpenTag({ s, props: { fragment } }) {
          const outerSpan = s.span;

          yield eat(m`openToken: <*Punctuator '<' { balancedSpan: 'Tag', balanced: '>' } />`);

          let type;

          type = !fragment && (yield eatMatch(m`type+$: <_NodeType />`));

          if (type) {
            while (yield eatMatch(m`attributes[]$: <Attribute />`)) {}
          } else {
            yield eat(m`attributes$: null`);
          }

          let sc;
          if (type) {
            sc = yield eatMatch(
              m`selfClosingTagToken: <*Punctuator '/' />`,
              o({}),
              o({ bind: true }),
            );
          } else {
            sc = yield eat(m`selfClosingTagToken: null`);
          }

          const balanced = !sc && (s.depths.path > 0 || outerSpan !== 'Bare');

          yield defineAttribute('balanced', balanced);
          yield defineAttribute('balancedSpan', balanced ? 'NodeChildren' : null);

          yield eat(m`closeToken: <*Punctuator '>' { balancer: true } />`);
        }

        *NodeType({ s }) {
          let res;
          if (!s.holding) {
            res = yield eat(m`<Identifier />`);
          } else {
            res = yield eatMatch(m`<MemberExpression /\g\./ />`);
          }

          if (res) {
            return shiftMatch(m`<_NodeType  />`);
          }
        }

        @Node
        *CloseTag() {
          yield eat(m`openToken: <*Punctuator '</' { balanced: '>', balancedSpan: 'Tag' } />`);
          yield eatMatch(m`type+$: <_NodeType />`);
          yield eat(m`closeToken: <*Punctuator '>' { balancer: true } />`);
        }

        @CoveredBy('NodeChild')
        @Node
        *Text() {
          yield eat(m`value: <*Literal /[^{<>}\g]+/ />`);
        }

        @Node
        *Attribute() {
          yield eat(m`name$: <Identifier />`, o({ scoped: false }));
          yield eat(m`sigilToken: <*Punctuator '=' />`);
          yield eat(m`value$: <_AttributeValue />`);
        }

        *AttributeValue() {
          if (yield eatMatch(m`:JS: <String /['"]/ />`)) {
          } else if (yield eatMatch(m`<Interpolation '{' />`)) {
          }
        }

        @CoveredBy('NodeType')
        @Node
        *Identifier({ props: { scoped = true } }) {
          yield eat(m`:JS: <__Identifier />`, o({ scoped }));
        }

        @CoveredBy('NodeType')
        @Node
        *MemberExpression() {
          yield eat(m`:JS: <__MemberExpression /\g\./ />`);
        }

        @InjectFrom(productions)
        @Node
        *Punctuator() {}

        @InjectFrom(productions)
        @Node
        *Literal() {}
      },
    ),
  });

  return Object.freeze({
    ...language,
    dependencies: Object.freeze({ ...language.dependencies, JSX: jsxLanguage }),
    grammar: triviaEnhancer(
      {
        triviaIsAllowed: (s) => s.span === 'Bare',
        triviaMatcher: m`#: :Comment: <__Trivia /[ \n\r\t]|\/\/|\/\*/ />`,
      },
      class extends language.atrivialGrammar {
        *Expression(args) {
          let {
            s,
            props: { power },
          } = args;
          if (!s.held) {
            if (yield eatMatch(m`:JSX: <Node />`)) {
              return shiftMatch(m`<_Expression />`, o({ power }));
            } else {
              return yield* super.Expression(args);
            }
          } else {
            return yield* super.Expression(args);
          }
        }
      },
    ),
  });
};

export default enhanceLanguageWithJSX;
