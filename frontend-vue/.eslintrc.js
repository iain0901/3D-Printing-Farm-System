/**
 * @description .eslintrc.js（ESLint 8 + @babel/eslint-parser + eslint-plugin-vue 9）
 */

module.exports = {
  root: true,
  env: {
    node: true,
    browser: true,
  },
  parser: 'vue-eslint-parser',
  parserOptions: {
    parser: '@babel/eslint-parser',
    ecmaVersion: 2021,
    sourceType: 'module',
  },
  extends: ['plugin:vue/vue3-recommended', 'eslint:recommended', 'plugin:prettier/recommended'],
  rules: {
    'no-undef': 'off',
    'no-console': 'off',
    'no-debugger': 'off',
    'prettier/prettier': 'warn',
    'prefer-template': 'error',
    'no-unused-vars': 'off',
    'no-empty': ['error', { allowEmptyCatch: true }],
    'use-isnan': 'off',
    // Vue 3 專案規則
    'vue/no-reserved-component-names': 'off',
    'vue/no-v-html': 'off',
    'vue/no-useless-template-attributes': 'off',
    'vue/multi-word-component-names': 'off',
    // 版面類規則交給 Prettier，避免與 prettier 衝突
    'vue/max-attributes-per-line': 'off',
    'vue/singleline-html-element-content-newline': 'off',
    'vue/html-indent': 'off',
    'vue/html-closing-bracket-newline': 'off',
    'vue/first-attribute-linebreak': 'off',
    'vue/html-self-closing': [
      'error',
      {
        html: { void: 'any', normal: 'any', component: 'always' },
        svg: 'always',
        math: 'always',
      },
    ],
    'vue/component-name-in-template-casing': ['error', 'kebab-case'],
  },
}
