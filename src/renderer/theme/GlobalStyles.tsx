import { createGlobalStyle } from 'styled-components';
import jetbrainsMonoLatin from '../assets/fonts/jetbrains-mono-latin.woff2';
import manropeCyrillic from '../assets/fonts/manrope-cyrillic.woff2';
import manropeLatin from '../assets/fonts/manrope-latin.woff2';
import { Theme } from './themes';

// Bundled (the till is offline-first): Manrope is a variable font, one file per subset covers
// 400-800; Latin includes U+02BB-02BC for Uzbek oʻ/gʻ. JetBrains Mono is only for digits (clock,
// countdown, version). Both OFL-licensed.
const LATIN =
  'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD';
const CYRILLIC = 'U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116';

export const GlobalStyles = createGlobalStyle<{ theme: Theme }>`
  @font-face {
    font-family: 'Manrope';
    font-style: normal;
    font-weight: 400 800;
    font-display: swap;
    src: url(${manropeLatin}) format('woff2');
    unicode-range: ${LATIN};
  }
  @font-face {
    font-family: 'Manrope';
    font-style: normal;
    font-weight: 400 800;
    font-display: swap;
    src: url(${manropeCyrillic}) format('woff2');
    unicode-range: ${CYRILLIC};
  }
  @font-face {
    font-family: 'JetBrains Mono';
    font-style: normal;
    font-weight: 500 600;
    font-display: swap;
    src: url(${jetbrainsMonoLatin}) format('woff2');
    unicode-range: ${LATIN};
  }

  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  html, body, #root {
    height: 100%;
  }

  body {
    background-color: ${({ theme }) => theme.colors.background};
    color: ${({ theme }) => theme.colors.text};
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen,
      Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
    font-size: 14px;
    line-height: 1.5;
    transition: background-color 0.3s ease, color 0.3s ease;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  #root {
    display: flex;
    flex-direction: column;
  }

  button {
    font-family: inherit;
  }

  input, select, textarea {
    font-family: inherit;
  }

  a {
    color: ${({ theme }) => theme.colors.primary};
    text-decoration: none;

    &:hover {
      text-decoration: underline;
    }
  }

  ::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }

  ::-webkit-scrollbar-track {
    background: ${({ theme }) => theme.colors.background};
  }

  ::-webkit-scrollbar-thumb {
    background: ${({ theme }) => theme.colors.border};
    border-radius: 4px;

    &:hover {
      background: ${({ theme }) => theme.colors.textSecondary};
    }
  }

  :focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.primary};
    outline-offset: 2px;
  }

  ::selection {
    background-color: ${({ theme }) => theme.colors.primary};
    color: white;
  }
`;
