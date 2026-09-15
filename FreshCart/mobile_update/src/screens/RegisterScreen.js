import React, { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from "react-native";
import { api, apiError } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { theme } from "../theme/theme";
import { Button, Header, Input } from "../components/UI";
import {
  screen,
  pad,
} from "../utils/screenHelpers";

export function RegisterScreen({ navigation }) {
  const { register } = useAuth();
  const [n, setN] = useState(""),
    [e, setE] = useState(""),
    [p, setP] = useState(""),
    [pw, setPw] = useState(""),
    [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!n || !e || !p || pw.length < 8)
      return Alert.alert(
        "Check details",
        "Please enter your name, phone, email and an 8+ character password.",
      );
    try {
      setBusy(true);
      await register({ name: n, email: e, phone: p, password: pw });
    } catch (x) {
      Alert.alert("Registration failed", apiError(x));
    } finally {
      setBusy(false);
    }
  };
  return (
    <KeyboardAvoidingView
      style={screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={s.auth}>
        <Header title="Create account" onBack={() => navigation.goBack()} />
        <Text style={s.h1}>Let's get started</Text>
        <Text style={s.p}>Create your FreshCart account in a few seconds.</Text>
        <Input
          label="Full name"
          placeholder="Enter Your Name"
          value={n}
          onChangeText={setN}
        />
        <Input
          label="Phone number"
          placeholder="0300 1234567"
          value={p}
          onChangeText={setP}
          keyboardType="phone-pad"
        />
        <Input
          label="Email address"
          placeholder="you@example.com"
          value={e}
          onChangeText={setE}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <Input
          label="Password"
          placeholder="At least 8 characters"
          value={pw}
          onChangeText={setPw}
          secureTextEntry
        />
        <Button title="Create account" onPress={submit} loading={busy} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  auth: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 24,
    backgroundColor: theme.colors.background,
  },
  h1: {
    fontSize: 30,
    fontWeight: "900",
    lineHeight: 35,
    color: theme.colors.text,
    marginBottom: 8,
  },
  p: {
    fontSize: 15,
    lineHeight: 23,
    color: theme.colors.muted,
    marginBottom: 14,
  },
});
