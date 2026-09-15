import React, { useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import * as Location from "expo-location";
import { theme } from "../theme/theme";
import { Button } from "../components/UI";

export function LocationPermissionScreen({ navigation }) {
  const [busy, setBusy] = useState(false);
  const go = async () => {
    try {
      setBusy(true);
      const p = await Location.requestForegroundPermissionsAsync();
      if (p.status !== "granted") {
        Alert.alert(
          "Location access",
          "Location permission is optional. You can continue without it.",
        );
        return;
      }
      navigation.replace("Login");
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={s.onboard}>
      <View style={s.locationArt}>
        <Text style={s.locationPin}>⌖</Text>
      </View>
      <Text style={s.kicker}>WELCOME TO FRESHCART</Text>
      <Text style={s.h1}>Fresh groceries,{`\n`}right at your doorstep.</Text>
      <Text style={s.p}>
        Allow location access if you want to use local delivery details or keep
        browsing without it.
      </Text>
      <View style={s.infoRow}>
        <View style={s.infoIcon}>
          <Text>📍</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.name}>Location access</Text>
          <Text style={s.muted}>
            Optional for convenience, not a service-area restriction.
          </Text>
        </View>
      </View>
      <Button title="Allow location" onPress={go} loading={busy} />
      <Button
        secondary
        title="Continue without checking"
        onPress={() => navigation.replace("Login")}
      />
    </View>
  );
}

const s = StyleSheet.create({
  h1: {
    fontSize: 30,
    fontWeight: "900",
    lineHeight: 35,
    color: theme.colors.text,
    marginBottom: 8,
  },
  infoIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: theme.colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 18,
    padding: 13,
    marginVertical: 12,
  },
  kicker: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.2,
    color: theme.colors.primary,
    marginBottom: 8,
  },
  locationArt: {
    width: 116,
    height: 116,
    borderRadius: 58,
    backgroundColor: theme.colors.primarySoft,
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 28,
  },
  locationPin: { fontSize: 62, color: theme.colors.primary },
  onboard: {
    flex: 1,
    backgroundColor: theme.colors.background,
    padding: 24,
    justifyContent: "center",
  },
  p: {
    fontSize: 15,
    lineHeight: 23,
    color: theme.colors.muted,
    marginBottom: 14,
  },
});
