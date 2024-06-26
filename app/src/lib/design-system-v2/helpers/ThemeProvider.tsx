import React from "react";
import { ThemeProvider as StyledComponentsThemeProvider, createGlobalStyle } from "styled-components";
import { ColorTokens, generateColorTokens } from "../tokens/colors";
import { generateCSSVariables } from "../utils";
import { TypographyTokens, generateTypographyTokens } from "../tokens/typography";

interface ThemeProviderProps {
  children: React.ReactNode;
  primaryColor?: string;
  neutralColor?: string;
}

export interface Theme {
  colors: ColorTokens;
  typography: TypographyTokens;
}

export const generateTheme = (primaryColor?: string, neutralColor?: string) => {
  const colorTokens = generateColorTokens(primaryColor, neutralColor);
  const colorCssVariables = generateCSSVariables(colorTokens, "requestly-color-");

  const typographyTokens = generateTypographyTokens();
  const typographyCssVariables = generateCSSVariables(typographyTokens, "requestly-font-");

  const theme: Theme = {
    colors: colorTokens,
    typography: typographyTokens,
  };

  const themeCssVariables = {
    ...colorCssVariables,
    ...typographyCssVariables,
  };

  return { theme, themeCssVariables };
};

const ThemeProvider: React.FC<ThemeProviderProps> = ({ children, primaryColor, neutralColor }) => {
  const { theme, themeCssVariables } = generateTheme(primaryColor, neutralColor);

  // Paste the output in ./theme.css files for autocompletion
  // console.log(`:root {
  //   ${Object.entries(themeCssVariables)
  //     .map(([key, value]) => `${key}: ${value};`)
  //     .join("\n")}
  // }`);
  const GlobalStyles = createGlobalStyle`
    :root {
      ${Object.entries(themeCssVariables)
        .map(([key, value]) => `${key}: ${value};`)
        .join("\n")}
    }
  `;

  return (
    // FIXME: Do we need styled-components theme provider here? This is just a context provider for theme
    <StyledComponentsThemeProvider theme={theme}>
      <GlobalStyles />
      {children}
    </StyledComponentsThemeProvider>
  );
};

export default ThemeProvider;
