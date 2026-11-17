import firebaseRulesPlugin from '@firebase/eslint-plugin-security-rules';

export default [
  {
    ignores: ['dist/**/*', 'node_modules/**/*', 'ml-service/**/*'],
  },
  firebaseRulesPlugin.configs['flat/recommended'],
];
