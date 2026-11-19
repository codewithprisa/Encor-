
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
} from "react-native";

type LoadingProps = {
  message?: string;
  fullScreen?: boolean;
};

export default function Loading({
  message = "Mohon tunggu...",
  fullScreen = false,
}: LoadingProps) {
  return (
    <View
      style={[
        styles.container,
        fullScreen && styles.fullScreen,
      ]}
    >
      <ActivityIndicator size="large" color="#245D78" />

      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    gap: 12,
  },
  fullScreen: {
    flex: 1,
    backgroundColor: "#FFFDF2",
  },
  message: {
    fontSize: 14,
    color: "#245D78",
  },
});
