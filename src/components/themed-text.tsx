
import { Text, type TextProps, StyleSheet } from 'react-native';

import { ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedTextProps = TextProps & {
  lightColor?: string;
  darkColor?: string;
  type?: 'default' | 'title' | 'small' | 'smallBold' | 'link';
  themeColor?: ThemeColor;
};

export function ThemedText({
  style,
  lightColor,
  darkColor,
  type = 'default',
  themeColor,
  ...otherProps
}: ThemedTextProps) {
  const theme = useTheme();

  const color = lightColor && darkColor
    ? themeColor
      ? theme[themeColor]
      : undefined
    : undefined;

  const textColor =
    (themeColor && theme[themeColor]) ||
    (themeColor ? undefined : color) ||
    theme.text;

  return (
    <Text
      style={[
        { color: lightColor || darkColor ? undefined : textColor },
        type === 'title' && styles.title,
        type === 'small' && styles.small,
        type === 'smallBold' && styles.smallBold,
        type === 'link' && styles.link,
        style,
      ]}
      {...otherProps}
    />
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  small: {
    fontSize: 12,
  },
  smallBold: {
    fontSize: 12,
    fontWeight: '600',
  },
  link: {
    color: '#0a7ea4',
    textDecorationLine: 'underline',
  },
});
